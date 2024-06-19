const { Router } = require("express")
const ZoneService = require("../services/ZoneService")
const StatusService = require("../services/StatusService")
const ZoneRepository = require("../repositories/ZoneRepository")
const validator = require("../components/Validators")
const databaseConnection = require("../utils/database.js")

const zoneRouter = Router()

/* Because routes are handled in a single thread, the locking
 * mechanism does not require atomic operations or so.
 * TODO pls verify */

let lockHeld = false;

function acquireZoneRouterLock() {
	if (lockHeld) {
		return false;
	}

	lockHeld = true;
    StatusService.startJob()
	return true;
}

function releaseZoneRouterLock() {
	if (!lockHeld) {
		throw new Error("called releaseZoneRouterLock() while lock wasn't held")
	}

    StatusService.endJob()
	lockHeld = false;
}

zoneRouter.get("/", async (req, res) => {
    try {
        const zones = await (new ZoneService()).getZones()
        res.json(zones)
    } catch (error) {
        res.status(500).json({ message: "An error occurred while getting zones", error: error.message })
    }
});

zoneRouter.post("/diff", async (req, res) => {
    const { added, deleted } = req.body

    const errors = validator.valid({ type: "FeatureCollection", features: added }, true)

    if (errors.length > 0) {
        res.status(400).json({ message: "Invalid request payload.", error: errors[0] })
        return
    }

    if (!acquireZoneRouterLock()) {
        /* TODO set Retry-After header! */
        res.status(503).json({ message: "This resource is currently in use." })
        return
    }

    const repository = new ZoneRepository()
    await repository.beginTransaction()

    try {
        await (new ZoneService(repository)).changeZones(added, deleted)
        await repository.commitTransaction()
        res.status(201).send()
    } catch (error) {
        await repository.rollbackTransaction()
        res.status(500).json({ message: "An error occurred while changing zones.", error: error.message })
    } finally {
        releaseZoneRouterLock()
    }
})

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
        await req.zoneService.createZones(featureCollection)
    } catch (error) {
        res.status(500).json({ message: "An error occurred while creating zones", error: error.message })
        return
    }

    res.status(201).send()
})

zoneRouter.delete("/:id", async (req, res) => {
  const { id } = req.params;

  try {
    await req.zoneService.deleteZone(id)

    res.status(200).json({ message: `Zone with id ${id} deleted successfully` })
  } catch (error) {
    res.status(500).json({ message: "An error occurred while deleting a zone", error: error.message })
  }
});

module.exports = zoneRouter
