const express = require("express");
const proxy = require("express-http-proxy");
const { BACKEND_URL } = require("../utils/config");
const { isCoordinateBetween } = require("../utils/coordinate_between");
const TempRoadService = require("../services/TempRoadService");
const NodeService = require("../services/NodeService");
const fetch = require("node-fetch");
const { combineOSRMResponses } = require("../utils/route_combiner");
const turf = require("@turf/turf");

const router = express.Router();

// Intercept /route/v1/driving/:startCoord;:endCoord
router.use("/v1/driving/:startCoord;:endCoord", async (req, res, next) => {
  try {
    // Parse coordinates from params
    const [startLng, startLat] = req.params.startCoord.split(",").map(Number);
    const [endLng, endLat] = req.params.endCoord.split(",").map(Number);
    const start = { lat: startLat, lng: startLng };
    const end = { lat: endLat, lng: endLng };

    // Calculate distance between start and end (in kilometers)
    const startEndDistanceKm = turf.distance(
      [start.lng, start.lat],
      [end.lng, end.lat],
      { units: "kilometers" }
    );

    // Calculate leeway as 20% of route distance or 10km minimum to allow for temp road proximity
    const leewayKm = Math.max(0.2 * startEndDistanceKm, 10);

    // Find temp roads where both start and end nodes are between the route endpoints (with leeway)
    const tempRoads = await TempRoadService.getActiveTempRoads();
    const tempRoadsWithStartInBetween = [];

    for (const road of tempRoads) {
      const startNodeCoord = await NodeService.getNodeCoordinates(
        road.start_node
      );
      if (!startNodeCoord) continue;
      if (isCoordinateBetween(start, end, startNodeCoord, 50, leewayKm)) {
        const endNodeCoord = await NodeService.getNodeCoordinates(
          road.end_node
        );
        if (!endNodeCoord) continue;
        if (isCoordinateBetween(start, end, endNodeCoord, 50, leewayKm)) {
          tempRoadsWithStartInBetween.push(road);
        }
      }
    }

    req.tempRoadsWithStartInBetween = tempRoadsWithStartInBetween;

    // Build backend URL for normal route calculation
    const urlObj = new URL(req.originalUrl, `http://dummy`); // dummy base for parsing
    const pathParts = urlObj.pathname.split("/");
    const drivingIdx = pathParts.findIndex((p) => p === "driving");
    const coordsPart = pathParts[drivingIdx + 1];
    const [origStart, origEnd] = coordsPart.split(";");
    const urlNormal = `${BACKEND_URL}/route/v1/driving/${origStart};${origEnd}${urlObj.search}`;
    const normalResp = await fetch(urlNormal).then((r) => r.json());

    // If temp roads are found, attempt to build a route using the first temp road segment
    // (Currently only the first is used; extend here to support multiple temp roads if needed)
    if (tempRoadsWithStartInBetween.length > 0) {
      const tempRoad = tempRoadsWithStartInBetween[0];
      const startNodeCoord = await NodeService.getNodeCoordinates(
        tempRoad.start_node
      );
      const endNodeCoord = await NodeService.getNodeCoordinates(
        tempRoad.end_node
      );
      // Determine which temp road node is closer to the user's start coordinate
      const distToStartNode = turf.distance(
        [start.lng, start.lat],
        [startNodeCoord.lng, startNodeCoord.lat],
        { units: "kilometers" }
      );
      const distToEndNode = turf.distance(
        [start.lng, start.lat],
        [endNodeCoord.lng, endNodeCoord.lat],
        { units: "kilometers" }
      );
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
      // Fetch route segments: start->temp entry, temp exit->end
      const url1 = `${BACKEND_URL}/route/v1/driving/${origStart};${tempEntryCoord}${urlObj.search}`;
      const url2 = `${BACKEND_URL}/route/v1/driving/${tempExitCoord};${origEnd}${urlObj.search}`;
      let resp1, resp2;
      try {
        [resp1, resp2] = await Promise.all([
          fetch(url1).then((r) => r.json()),
          fetch(url2).then((r) => r.json()),
        ]);
      } catch (e) {
        console.error("Error fetching temp road segments:", e);
        // If fetching temp road segments fails, fall back to normal route
        return res.json(normalResp);
      }
      // Combine the two route segments with the temp road and compare to the normal route
      const connectingRoad = {
        distance: tempRoad.length,
        speed: tempRoad.speed,
      };
      const combined = combineOSRMResponses(
        resp1,
        resp2,
        entryCoord,
        exitCoord,
        connectingRoad
      );

      // Return the faster route (combined with temp road or normal)
      const combinedDuration =
        combined && combined.routes && combined.routes[0]
          ? combined.routes[0].duration
          : Infinity;
      const normalDuration =
        normalResp && normalResp.routes && normalResp.routes[0]
          ? normalResp.routes[0].duration
          : Infinity;
      if (combined && combinedDuration < normalDuration) {
        return res.json(combined);
      } else {
        return res.json(normalResp);
      }
    }

    // No temp roads found, just return the normal route
    return res.json(normalResp);
  } catch (err) {
    console.error("Error processing temp roads for /route:", err);
    // Fallback to proxy
    proxy(`${BACKEND_URL}`, {
      proxyReqPathResolver: (req) => req.originalUrl,
    })(req, res, next);
  }
});

module.exports = router;
