const { Router } = require("express")
const ZoneService = require("../services/ZoneService")

const segmentRouter = Router()

segmentRouter.get("/", async (req, res) => {
    try {
        const zones = await ZoneService.getBlockedSegments()
        res.json(zones)
    } catch (error) {
        res.status(500).json({ message: "An error occurred while getting segments", error: error.message })
    }
});

module.exports = segmentRouter