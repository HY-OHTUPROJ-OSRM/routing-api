const express = require("express");
const proxy = require("express-http-proxy");
const { BACKEND_URL } = require("../utils/config");
const { isCoordinateBetween } = require("../utils/coordinate_between");
const TempRoadService = require("../services/TempRoadService");
const NodeService = require("../services/NodeService");

const router = express.Router();

// Intercept /route/v1/driving/:startCoord;:endCoord
router.use("/v1/driving/:startCoord;:endCoord", async (req, res, next) => {
  try {
    console.log("AAAAAAAAAAAAAAAAA");
    // Parse coordinates from params
    const [startLng, startLat] = req.params.startCoord.split(",").map(Number);
    const [endLng, endLat] = req.params.endCoord.split(",").map(Number);
    const start = { lat: startLat, lng: startLng };
    const end = { lat: endLat, lng: endLng };

    // Get all temp roads
    const tempRoads = await TempRoadService.getActiveTempRoads();
    const tempRoadsWithStartInBetween = [];

    for (const road of tempRoads) {
      // Convert start_node id to coordinate
      const startNodeCoord = await NodeService.getNodeCoordinates(
        road.start_node
      );
      if (!startNodeCoord) continue;
      // Check if start node is between start and end
      if (isCoordinateBetween(start, end, startNodeCoord)) {
        tempRoadsWithStartInBetween.push(road);
      }
    }

    // Attach to request for later use if needed
    req.tempRoadsWithStartInBetween = tempRoadsWithStartInBetween;
    console.log("BBBBBBBBBBBBBBBBBBB");
    console.log(
      "Temp roads with start node between:",
      tempRoadsWithStartInBetween
    );

    proxy(`${BACKEND_URL}/route`, {
      proxyReqPathResolver: (req) => req.url,
    })(req, res, next);
  } catch (err) {
    console.error("Error processing temp roads for /route:", err);
    console.log("CCCCCCCCCCCCCCCCC");
    // Fallback to proxy
    proxy(`${BACKEND_URL}/route`, {
      proxyReqPathResolver: (req) => req.url,
    })(req, res, next);
  }
});

module.exports = router;
