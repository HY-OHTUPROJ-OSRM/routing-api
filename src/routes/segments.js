const { Router } = require("express")
const ZoneService = require("../services/ZoneService")

const segmentRouter = Router()

segmentRouter.get("/", async (req, res) => {
    try {
        const zoneService = new ZoneService();
        const zones = await zoneService.getBlockedSegments()
        res.json(zones)
    } catch (error) {
        res.status(500).json({ message: "An error occurred while getting segments", error: error.message })
    }
});

module.exports = segmentRouter
