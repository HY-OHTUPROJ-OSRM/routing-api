const { Router } = require("express")
const ZoneService = require("../services/ZoneService")

const zoneRouter = Router()

zoneRouter.get("/", async (req, res) => {
    const zones = await ZoneService.getZones()
    res.json(zones)
});

zoneRouter.post("/", async (req, res) => {
    const featureCollection = req.body

    try {
        await ZoneService.createZones(featureCollection)
        res.status(201).send()
    } catch (error) {
        res.status(400).send(error.message)
    }
})

module.exports = zoneRouter
