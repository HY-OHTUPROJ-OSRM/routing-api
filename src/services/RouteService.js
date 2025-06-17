const { BACKEND_URL } = require("../utils/config");
const { isCoordinateBetween } = require("../utils/coordinate_between");
const TempRoadService = require("./TempRoadService");
const fetch = require("node-fetch");
const { combineOSRMResponses } = require("../utils/route_combiner");
const turf = require("@turf/turf");

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

    // Find temp roads where both start and end nodes are between the route endpoints (with leeway)
    const tempRoads = await TempRoadService.getActiveTempRoads();
    const tempRoadsWithStartInBetween = [];
    for (const road of tempRoads) {
      if (
        !road.geom ||
        road.geom.type !== "LineString" ||
        !Array.isArray(road.geom.coordinates) ||
        road.geom.coordinates.length < 2
      ) {
        continue;
      }
      const coords = road.geom.coordinates;
      const startNodeCoord = { lng: coords[0][0], lat: coords[0][1] };
      const endNodeCoord = {
        lng: coords[coords.length - 1][0],
        lat: coords[coords.length - 1][1],
      };
      if (isCoordinateBetween(start, end, startNodeCoord, 50, leewayKm)) {
        if (isCoordinateBetween(start, end, endNodeCoord, 50, leewayKm)) {
          road._startCoord = startNodeCoord;
          road._endCoord = endNodeCoord;
          tempRoadsWithStartInBetween.push(road);
        }
      }
    }

    // Build backend URL for normal route calculation
    const urlObj = new URL(originalUrl, `http://dummy`); // dummy base for parsing
    const pathParts = urlObj.pathname.split("/");
    const drivingIdx = pathParts.findIndex((p) => p === "driving");
    const coordsPart = pathParts[drivingIdx + 1];
    const [origStart, origEnd] = coordsPart.split(";");
    const urlNormal = `${BACKEND_URL}/route/v1/driving/${origStart};${origEnd}${urlObj.search}`;
    const normalResp = await fetch(urlNormal).then((r) => r.json());

    if (tempRoadsWithStartInBetween.length > 0) {
      const tempRoad = tempRoadsWithStartInBetween[0];
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
        return normalResp;
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
            coordinates: [...coords].reverse(),
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
      const normalDuration =
        normalResp && normalResp.routes && normalResp.routes[0] ? normalResp.routes[0].duration : Infinity;
      if (combined && combinedDuration < normalDuration) {
        return combined;
      } else {
        return normalResp;
      }
    }
    return normalResp;
  }
}

module.exports = RouteService;
