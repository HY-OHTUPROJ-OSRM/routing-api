const { Router } = require("express")
const ZoneService = require("../services/ZoneService")
const validator = require("../components/Validators")

const zoneRouter = Router()

zoneRouter.get("/", async (req, res) => {
    const zones = await ZoneService.getZones()
    res.json(zones)
});

zoneRouter.post("/", async (req, res) => {
    const featureCollection = req.body

    const errors = validator.valid(featureCollection, true)

    if (errors.length > 0) {
        res.status(400).send(errors[0].message)
        return
    }

    const zoneIds = await ZoneService.createZones(featureCollection)

    if (zoneIds.length == 0) {
        res.status(500).send()
        return
    }

    res.status(201).send()

    const zoneGeometries = featureCollection.features.map(
        feature => feature.geometry.coordinates
    )
    const overlappingSegments = await ZoneService.getOverlappingWays(zoneIds, zoneGeometries)

    ZoneService.blockSegments(overlappingSegments)
})

module.exports = zoneRouter
