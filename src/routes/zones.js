const { Router } = require("express")
const ZoneService = require("../services/ZoneService")

const zoneRouter = Router()

zoneRouter.get("/", async (req, res) => {
    const zones = await ZoneService.getZones()
    res.json(zones)
});

module.exports = zoneRouter
