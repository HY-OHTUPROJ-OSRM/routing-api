const { Router } = require("express");
const ZoneService = require("../services/ZoneService");

const segmentRouter = Router();

const zoneService = new ZoneService();

// Get all blocked segments
segmentRouter.get("/", async (req, res) => {
  try {
    const segments = await zoneService.getBlockedSegments();
    res.json(segments);
  } catch (error) {
    res.status(500).json({
      message: "An error occurred while getting segments",
      error: error.message,
    });
  }
});

module.exports = segmentRouter;
