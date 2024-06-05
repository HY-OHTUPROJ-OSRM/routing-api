const { Router } = require("express")
const ZoneService = require("../services/ZoneService")
const validator = require("../components/Validators")

const zoneRouter = Router()

zoneRouter.get("/", async (req, res) => {
    try {
        const zones = await ZoneService.getZones()
        res.json(zones)
    } catch (error) {
        res.status(500).json({ message: "An error occurred while getting zones", error: error.message })
    }
});

zoneRouter.post("/", async (req, res) => {
    const featureCollection = req.body

    try {
        const errors = validator.valid(featureCollection, true)

        if (errors.length > 0) {
            res.status(400).send(errors[0].message)
            return
        }
    } catch (error) {
        res.status(500).json({ message: "An error occurred while validating zones", error: error.message })
        return
    }

    try {
        await ZoneService.createZones(featureCollection)
    } catch (error) {
        res.status(500).json({ message: "An error occurred while creating zones", error: error.message })
        return
    }

    res.status(201).send()
})

zoneRouter.delete("/:id", async (req, res) => {
  const { id } = req.params;

  try {
    await ZoneService.deleteZone(id)

    res.status(200).json({ message: `Zone with id ${id} deleted successfully` })
  } catch (error) {
    res.status(500).json({ message: "An error occurred while deleting a zone", error: error.message })
  }
});

module.exports = zoneRouter
