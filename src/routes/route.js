const express = require("express");
const proxy = require("express-http-proxy");
const { BACKEND_URL } = require("../utils/config");
const RouteService = require("../services/RouteService");

const router = express.Router();

// Intercept /route/v1/driving/:startCoord;:endCoord
router.use("/v1/driving/:startCoord;:endCoord", async (req, res, next) => {
  try {
    const { startCoord, endCoord } = req.params;
    const result = await RouteService.getRouteWithTempRoads(startCoord, endCoord, req.originalUrl);
    return res.json(result);
  } catch (err) {
    console.error("Error processing temp roads for /route:", err);
    // Fallback to proxy
    proxy(`${BACKEND_URL}`, {
      proxyReqPathResolver: (req) => req.originalUrl,
    })(req, res, next);
  }
});

module.exports = router;
