const { Router } = require("express")
const ZoneService = require("../services/ZoneService")
const ZoneRepository = require("../repositories/ZoneRepository")
const validator = require("../components/Validators")
const databaseConnection = require("../utils/database.js")

const zoneRouter = Router()

/* An actual atomic lock should be overkill. TODO pls verify */
// const lock = new Int32Array(1)
let lockHeld = false;

function acquireZoneRouterLock() {
    // return Atomics.compareExchange(lock, 0, 0, 1) == 0
    if (lockHeld) {
        return false;
    }

    lockHeld = true;
    return true;
}

function releaseZoneRouterLock() {
    // if (Atomics.compareExchange(lock, 0, 1, 0) != 1) {
    //  throw new Error("called releaseZoneRouterLock() while lock wasn't held")
    // }
    if (!lockHeld) {
        throw new Error("called releaseZoneRouterLock() while lock wasn't help")
    }

    lockHeld = false;
}

zoneRouter.use(async (req, res, next) => {
    if (req.method == "GET") {
        req.zoneService = new ZoneService()
        next()
        return
    } else if (req.method != "POST") {
        next()
        return
    }

    if (!acquireZoneRouterLock()) {
            /* TODO set Retry-After header! */
            res.status(503).json({ message: "This resource is currently in use." })
            return
    }

    console.log("LOCK ACQUIRED !!!!!")

    res.on("finish", async () => {
            releaseZoneRouterLock()
            console.log("LOCK RELEASED !!!!!")
    })

    await databaseConnection.begin(async (sql) => {
        req.zoneService = new ZoneService(new ZoneRepository(sql))
        next()

        if (res.statusCode - res.statusCode % 100 != 200) {
            throw Error()
        }
    })
})

zoneRouter.get("/", async (req, res) => {
    try {
        const zones = await req.zoneService.getZones()
        res.json(zones)
    } catch (error) {
        res.status(500).json({ message: "An error occurred while getting zones", error: error.message })
    }
});

zoneRouter.post("/diff", async (req, res) => {
    const { added, deleted } = req.body

    try {
        await req.zoneService.changeZones(added, deleted)
        res.status(201).send()
    } catch (error) {
        res.status(400).json({ message: "An error occurred while changing zones", error: error.message })
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
