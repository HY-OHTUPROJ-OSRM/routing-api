const { BACKEND_URL } = require("../utils/config");
const { isCoordinateBetween } = require("../utils/coordinate_between");
const TempRoadService = require("./TempRoadService");
const fetch = require("node-fetch");
const { combineOSRMResponses } = require("../utils/route_combiner");
const turf = require("@turf/turf");
const VehicleConfigService = require("./VehicleConfigService");

// Margin for temp road endpoint selection (default is 20% of route distance or 10km minimum)
// Used as leeway when checking if temp road endpoints are between start and end
const LEEWAY_KM_FACTOR = 0.2;
const LEEWAY_KM_MIN = 10;

class RouteService {
  /**
   * Helper to get the first or last coordinate from route steps
   */
  static _getStepCoord(steps, first = true) {
    if (!steps || steps.length === 0) return null;
    const step = first ? steps[0] : steps[steps.length - 1];
    if (step.geometry && step.geometry.coordinates && step.geometry.coordinates.length > 0) {
      return first ? step.geometry.coordinates[0] : step.geometry.coordinates[step.geometry.coordinates.length - 1];
    } else if (step.maneuver && step.maneuver.location) {
      return step.maneuver.location;
    }
    return null;
  }

  /**
   * Helper to calculate distance between two coordinates (arrays or objects)
   */
  static _coordDistance(coordA, coordB) {
    if (!coordA || !coordB) return null;
    // Accept [lng, lat] or {lng, lat}
    const a = Array.isArray(coordA) ? coordA : [coordA.lng, coordA.lat];
    const b = Array.isArray(coordB) ? coordB : [coordB.lng, coordB.lat];
    return turf.distance([a[0], a[1]], [b[0], b[1]], { units: "meters" });
  }

  /**
   * Calculates a route between two coordinates, optionally considering temporary roads.
   * If temporary roads are relevant, combines normal and temp road routes and selects the best option.
   * @param {string} startCoord - Start coordinate as "lng,lat"
   * @param {string} endCoord - End coordinate as "lng,lat"
   * @param {string} originalUrl - Original request URL (for query params)
   * @returns {Promise<Object>} - OSRM route response
   */
  static async getRouteWithTempRoads(startCoord, endCoord, originalUrl) {
    // Parse input coordinates
    const [startLng, startLat] = startCoord.split(",").map(Number);
    const [endLng, endLat] = endCoord.split(",").map(Number);
    const start = { lat: startLat, lng: startLng };
    const end = { lat: endLat, lng: endLng };

    // Calculate route distance and leeway (LEEWAY_KM_FACTOR of distance or LEEWAY_KM_MIN minimum)
    const startEndDistanceKm = turf.distance([start.lng, start.lat], [end.lng, end.lat], { units: "kilometers" });
    const leewayKm = Math.max(LEEWAY_KM_FACTOR * startEndDistanceKm, LEEWAY_KM_MIN);

    // Parse exclude parameter from URL (for vehicle class restrictions)
    const urlObj = new URL(originalUrl, `http://dummy`); // dummy base for parsing
    const excludeParam = urlObj.searchParams.get("exclude");
    let excludeId = null;
    if (excludeParam && /^\d+$/.test(excludeParam)) {
      excludeId = parseInt(excludeParam, 10);
    }

    // Load vehicle config if exclusion is requested
    let vehicleConfig = null;
    if (excludeId !== null) {
      try {
        vehicleConfig = await VehicleConfigService.getVehicleConfig();
      } catch (e) {
        console.error("Failed to load vehicle config:", e);
      }
    }

    // Get all active temp roads
    let tempRoads = await TempRoadService.getActiveTempRoads();

    // Filter temp roads by vehicle class restrictions if needed
    if (excludeId !== null && vehicleConfig && Array.isArray(vehicleConfig.classes)) {
      const excludedClasses = vehicleConfig.classes.filter((c) => c.id >= excludeId);
      let minWeight = 0;
      let minHeight = 0;
      if (excludedClasses.length > 0) {
        minWeight = Math.max(...excludedClasses.map((c) => c.weight_cutoff));
        minHeight = Math.max(...excludedClasses.map((c) => c.height_cutoff));
      }
      tempRoads = tempRoads.filter((road) => {
        const weightOk = road.max_weight == null || road.max_weight >= minWeight;
        const heightOk = road.max_height == null || road.max_height >= minHeight;
        return weightOk && heightOk;
      });
    }

    // Select temp roads whose endpoints are between start and end (with leeway)
    const tempRoadsWithStartInBetween = tempRoads.filter((road) => {
      if (
        !road.geom ||
        road.geom.type !== "LineString" ||
        !Array.isArray(road.geom.coordinates) ||
        road.geom.coordinates.length < 2
      ) {
        return false;
      }
      const coords = road.geom.coordinates;
      const startNodeCoord = { lng: coords[0][0], lat: coords[0][1] };
      const endNodeCoord = { lng: coords[coords.length - 1][0], lat: coords[coords.length - 1][1] };
      if (
        isCoordinateBetween(start, end, startNodeCoord, 50, leewayKm) &&
        isCoordinateBetween(start, end, endNodeCoord, 50, leewayKm)
      ) {
        road._startCoord = startNodeCoord;
        road._endCoord = endNodeCoord;
        return true;
      }
      return false;
    });

    // Prepare OSRM backend URLs
    const pathParts = urlObj.pathname.split("/");
    const drivingIdx = pathParts.findIndex((p) => p === "driving");
    const coordsPart = pathParts[drivingIdx + 1];
    const [origStart, origEnd] = coordsPart.split(";");
    const urlNormal = `${BACKEND_URL}/route/v1/driving/${origStart};${origEnd}${urlObj.search}`;
    const normalRespPromise = fetch(urlNormal).then((r) => r.json());

    if (tempRoadsWithStartInBetween.length > 0) {
      // For each temp road, try routing to both endpoints and select the best entry
      const tempRoadPromises = tempRoadsWithStartInBetween.map(async (tempRoad, idx) => {
        const coords = tempRoad.geom.coordinates;
        const endA = { lng: coords[0][0], lat: coords[0][1] };
        const endB = { lng: coords[coords.length - 1][0], lat: coords[coords.length - 1][1] };
        const tempEndCoords = [endA, endB];
        const routeResults = await Promise.all(tempEndCoords.map(async (entryCoord) => {
          const tempEntryCoordStr = `${entryCoord.lng},${entryCoord.lat}`;
          const url = `${BACKEND_URL}/route/v1/driving/${origStart};${tempEntryCoordStr}${urlObj.search}`;
          try {
            const resp = await fetch(url).then((r) => r.json());
            const steps = resp?.routes?.[0]?.legs?.[0]?.steps;
            if (!steps || steps.length === 0) return null;
            const firstCoord = RouteService._getStepCoord(steps, true);
            const lastCoord = RouteService._getStepCoord(steps, false);
            const firstCoordDist = RouteService._coordDistance(firstCoord, start);
            const lastCoordDist = RouteService._coordDistance(lastCoord, entryCoord);
            // Only accept if last route coordinate is close to the temp road endpoint
            const LAST_COORD_THRESHOLD = 0.1; // meters
            if (lastCoordDist === null || lastCoordDist > LAST_COORD_THRESHOLD) {
              return null;
            }
            let duration = resp?.routes?.[0]?.duration;
            return { entryCoord, resp, lastCoord, lastCoordDist, duration, firstCoord, firstCoordDist };
          } catch (e) {
            console.error(`[RouteService] Temp road #${idx} fetch failed for entry ${JSON.stringify(entryCoord)}:`, e);
            return null;
          }
        }));
        // Select entry with closest start, then closest end (within margin)
        const validResults = routeResults.filter(r => r && typeof r.lastCoordDist === 'number' && typeof r.firstCoordDist === 'number');
        if (validResults.length === 0) {
          return null;
        }
        let bestStartDist = Infinity;
        for (const r of validResults) {
          if (r.firstCoordDist < bestStartDist) bestStartDist = r.firstCoordDist;
        }
        const START_DIST_MARGIN = 0.5; // meters
        const bestStartCandidates = validResults.filter(r => Math.abs(r.firstCoordDist - bestStartDist) <= START_DIST_MARGIN);
        // Select the entry with the shortest duration among candidates within margin
        let chosenEntry = null;
        let minDuration = Infinity;
        for (const r of bestStartCandidates) {
          if (typeof r.duration === 'number' && r.duration < minDuration) {
            minDuration = r.duration;
            chosenEntry = r;
          }
        }
        const entryCoord = chosenEntry.entryCoord;
        // The exit is the other endpoint
        const exitCoord = (entryCoord.lng === endA.lng && entryCoord.lat === endA.lat) ? endB : endA;
        const tempEntryCoord = `${entryCoord.lng},${entryCoord.lat}`;
        const tempExitCoord = `${exitCoord.lng},${exitCoord.lat}`;
        const url2 = `${BACKEND_URL}/route/v1/driving/${tempExitCoord};${origEnd}${urlObj.search}`;
        let resp2;
        try {
          resp2 = await fetch(url2).then((r) => r.json());
        } catch (e) {
          console.error(`[RouteService] Temp road #${idx} fetch failed for exit:`, e);
          return null;
        }
        // Ensure geometry direction matches entry/exit
        let connectingGeometry = tempRoad.geom;
        if (
          connectingGeometry &&
          connectingGeometry.type === "LineString" &&
          Array.isArray(connectingGeometry.coordinates)
        ) {
          const coords = connectingGeometry.coordinates;
          if (coords.length >= 2 && (coords[0][0] !== entryCoord.lng || coords[0][1] !== entryCoord.lat)) {
            connectingGeometry = {
              type: "LineString",
              coordinates: coords.slice().reverse(),
            };
          }
        }
        const connectingRoad = {
          distance: tempRoad.length,
          speed: tempRoad.speed,
          geometry: connectingGeometry,
        };
        const combined = combineOSRMResponses(chosenEntry.resp, resp2, entryCoord, exitCoord, connectingRoad);
        const combinedDuration =
          combined && combined.routes && combined.routes[0] ? combined.routes[0].duration : Infinity;
        return { combined, combinedDuration };
      });

      // Wait for all temp road route calculations
      const tempRoadResults = await Promise.all(tempRoadPromises);
      const normalResp = await normalRespPromise;
      const allRoutes = [];
      // Add normal route
      if (normalResp && normalResp.routes && normalResp.routes[0] && normalResp.routes[0].legs && normalResp.routes[0].legs[0]) {
        const normalSteps = normalResp.routes[0].legs[0].steps;
        const normalFirstCoord = RouteService._getStepCoord(normalSteps, true);
        const normalLastCoord = RouteService._getStepCoord(normalSteps, false);
        const startDist = RouteService._coordDistance(normalFirstCoord, start);
        const endDist = RouteService._coordDistance(normalLastCoord, end);
        let duration = normalResp.routes[0].duration;
        allRoutes.push({ route: normalResp, startDist, endDist, duration });
      }
      // Add temp road routes
      for (const result of tempRoadResults) {
        if (result && result.combined && result.combined.routes && result.combined.routes[0] && result.combined.routes[0].legs && result.combined.routes[0].legs[0]) {
          const steps = result.combined.routes[0].legs[0].steps;
          const firstCoord = RouteService._getStepCoord(steps, true);
          const lastCoord = RouteService._getStepCoord(steps, false);
          const startDist = RouteService._coordDistance(firstCoord, start);
          const endDist = RouteService._coordDistance(lastCoord, end);
          let duration = result.combined.routes[0].duration;
          allRoutes.push({ route: result.combined, startDist, endDist, duration });
        }
      }
      // Find route with smallest sum of startDist + endDist
      let minSumDist = Infinity;
      for (const r of allRoutes) {
        if (typeof r.startDist === 'number' && typeof r.endDist === 'number') {
          const sumDist = r.startDist + r.endDist;
          if (sumDist < minSumDist) {
            minSumDist = sumDist;
          }
        }
      }
      // Select all routes within margin of closest start+end distance
      const CLOSE_MARGIN = 0.5; // meters
      const closeRoutes = allRoutes.filter(r => typeof r.startDist === 'number' && typeof r.endDist === 'number' && (r.startDist + r.endDist - minSumDist) <= CLOSE_MARGIN);
      // Among those, pick the one with the shortest duration
      let bestRoute = null;
      let bestDuration = Infinity;
      for (const r of closeRoutes) {
        if (typeof r.duration === 'number' && r.duration < bestDuration) {
          bestRoute = r.route;
          bestDuration = r.duration;
        }
      }
      if (bestRoute) {
        return bestRoute;
      } else if (allRoutes.length > 0) {
        // fallback: return the closest route if duration is not available
        return allRoutes[0].route;
      } else {
        // fallback: return normal route
        return normalResp;
      }
    } else {
      const normalResp = await normalRespPromise;
      return normalResp;
    }
  }
}

module.exports = RouteService;
