const { BACKEND_URL } = require("../utils/config");
const { isCoordinateBetween } = require("../utils/coordinate_between");
const TempRoadService = require("./TempRoadService");
const fetch = require("node-fetch");
const { combineOSRMResponses } = require("../utils/route_combiner");
const turf = require("@turf/turf");
const VehicleConfigService = require("./VehicleConfigService");

class RouteService {
  static async getRouteWithTempRoads(startCoord, endCoord, originalUrl) {
    // Parse coordinates
    const [startLng, startLat] = startCoord.split(",").map(Number);
    const [endLng, endLat] = endCoord.split(",").map(Number);
    const start = { lat: startLat, lng: startLng };
    const end = { lat: endLat, lng: endLng };

    // Calculate distance between start and end (in kilometers)
    const startEndDistanceKm = turf.distance([start.lng, start.lat], [end.lng, end.lat], { units: "kilometers" });
    // Calculate leeway as 20% of route distance or 10km minimum
    const leewayKm = Math.max(0.2 * startEndDistanceKm, 10);

    // Parse exclude parameter from URL
    const urlObj = new URL(originalUrl, `http://dummy`); // dummy base for parsing
    const excludeParam = urlObj.searchParams.get("exclude");
    let excludeId = null;
    if (excludeParam && /^\d+$/.test(excludeParam)) {
      excludeId = parseInt(excludeParam, 10);
    }

    // Get vehicle class config if exclude is present
    let vehicleConfig = null;
    if (excludeId !== null) {
      try {
        vehicleConfig = await VehicleConfigService.getVehicleConfig();
      } catch (e) {
        console.error("Failed to load vehicle config:", e);
      }
    }

    // Find temp roads where both start and end nodes are between the route endpoints (with leeway)
    let tempRoads = await TempRoadService.getActiveTempRoads();

    // If exclude is set, filter out temp roads that are below the cutoff for the excluded class and all below
    if (excludeId !== null && vehicleConfig && Array.isArray(vehicleConfig.classes)) {
      // Find the excluded class and all classes with id >= excludeId
      const excludedClasses = vehicleConfig.classes.filter((c) => c.id >= excludeId);
      let minWeight = 0;
      let minHeight = 0;
      if (excludedClasses.length > 0) {
        minWeight = Math.max(...excludedClasses.map((c) => c.weight_cutoff));
        minHeight = Math.max(...excludedClasses.map((c) => c.height_cutoff));
      }
      tempRoads = tempRoads.filter((road) => {
        // Accept only if road.max_weight and road.max_height are >= minWeight/minHeight (or null means no restriction)
        const weightOk = road.max_weight == null || road.max_weight >= minWeight;
        const heightOk = road.max_height == null || road.max_height >= minHeight;
        return weightOk && heightOk;
      });
    }

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

    // Build backend URL for normal route calculation
    const pathParts = urlObj.pathname.split("/");
    const drivingIdx = pathParts.findIndex((p) => p === "driving");
    const coordsPart = pathParts[drivingIdx + 1];
    const [origStart, origEnd] = coordsPart.split(";");
    const urlNormal = `${BACKEND_URL}/route/v1/driving/${origStart};${origEnd}${urlObj.search}`;
    const normalRespPromise = fetch(urlNormal).then((r) => r.json());

    if (tempRoadsWithStartInBetween.length > 0) {
      // Parallelize temp road route calculations
      const tempRoadPromises = tempRoadsWithStartInBetween.map(async (tempRoad) => {
        const startNodeCoord = tempRoad._startCoord;
        const endNodeCoord = tempRoad._endCoord;
        const distToStartNode = turf.distance([start.lng, start.lat], [startNodeCoord.lng, startNodeCoord.lat], {
          units: "kilometers",
        });
        const distToEndNode = turf.distance([start.lng, start.lat], [endNodeCoord.lng, endNodeCoord.lat], {
          units: "kilometers",
        });
        let entryCoord, exitCoord;
        if (distToStartNode <= distToEndNode) {
          entryCoord = startNodeCoord;
          exitCoord = endNodeCoord;
        } else {
          entryCoord = endNodeCoord;
          exitCoord = startNodeCoord;
        }
        const tempEntryCoord = `${entryCoord.lng},${entryCoord.lat}`;
        const tempExitCoord = `${exitCoord.lng},${exitCoord.lat}`;
        const url1 = `${BACKEND_URL}/route/v1/driving/${origStart};${tempEntryCoord}${urlObj.search}`;
        const url2 = `${BACKEND_URL}/route/v1/driving/${tempExitCoord};${origEnd}${urlObj.search}`;
        let resp1, resp2;
        try {
          [resp1, resp2] = await Promise.all([fetch(url1).then((r) => r.json()), fetch(url2).then((r) => r.json())]);
        } catch (e) {
          console.error(`Temp road fetch failed for road id ${tempRoad.id || "unknown"}:`, e);
          return null; // skip this temp road if fetch fails
        }
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
        const combined = combineOSRMResponses(resp1, resp2, entryCoord, exitCoord, connectingRoad);
        const combinedDuration =
          combined && combined.routes && combined.routes[0] ? combined.routes[0].duration : Infinity;
        return { combined, combinedDuration };
      });

      // Wait for all temp road route calculations
      const tempRoadResults = await Promise.all(tempRoadPromises);
      let bestCombined = null;
      let bestCombinedDuration = Infinity;
      for (const result of tempRoadResults) {
        if (result && result.combined && result.combinedDuration < bestCombinedDuration) {
          bestCombined = result.combined;
          bestCombinedDuration = result.combinedDuration;
        }
      }
      const normalResp = await normalRespPromise;
      const normalDuration =
        normalResp && normalResp.routes && normalResp.routes[0] ? normalResp.routes[0].duration : Infinity;
      if (bestCombined && bestCombinedDuration < normalDuration) {
        return bestCombined;
      } else {
        return normalResp;
      }
    }
    // If no temp roads, just return the normal route
    return await normalRespPromise;
  }
}

module.exports = RouteService;
