const { Router } = require("express");
const ZoneService = require("../services/ZoneService");
const StatusService = require("../services/StatusService");
const ZoneRepository = require("../repositories/ZoneRepository");
const validator = require("../components/Validators");
const databaseConnection = require("../utils/database.js");

const zoneRouter = Router();

const handleError = (res, message, error, status = 500) => {
  res.status(status).json({ message, error: error?.message || error });
};

/* Because routes are handled in a single thread, the locking
 * mechanism does not require atomic operations or so.
 * TODO pls verify */

let lockHeld = false;

function acquireZoneRouterLock() {
  if (lockHeld) return false;
  lockHeld = true;
  StatusService.startJob();
  return true;
}

function releaseZoneRouterLock() {
  if (!lockHeld)
    throw new Error("called releaseZoneRouterLock() while lock wasn't held");
  StatusService.endJob();
  lockHeld = false;
}

zoneRouter.get("/", async (req, res) => {
  try {
    const zones = await new ZoneService().getZones();
    res.json(zones);
  } catch (error) {
    handleError(res, "An error occurred while getting zones", error);
  }
});

zoneRouter.post("/diff", async (req, res) => {
  const { added, deleted } = req.body;
  const errors = validator.valid(
    { type: "FeatureCollection", features: added },
    true
  );

  if (errors.length > 0) {
    return handleError(res, "Invalid request payload.", errors[0], 400);
  }

  if (!acquireZoneRouterLock()) {
    // TODO set Retry-After header!
    return res
      .status(503)
      .json({ message: "This resource is currently in use." });
  }

  const repository = new ZoneRepository();
  await repository.beginTransaction();

  try {
    await new ZoneService(repository).changeZones(added, deleted);
    await repository.commitTransaction();
    res.status(201).send();
  } catch (error) {
    await repository.rollbackTransaction();
    handleError(res, "An error occurred while changing zones.", error);
  } finally {
    releaseZoneRouterLock();
  }
});

zoneRouter.post("/", async (req, res) => {
  const featureCollection = req.body;

  try {
    const errors = validator.valid(featureCollection, true);
    if (errors.length > 0) {
      return res.status(400).send(errors[0].message);
    }
    await req.zoneService.createZones(featureCollection);
    res.status(201).send();
  } catch (error) {
    handleError(res, "An error occurred while creating zones", error);
  }
});

zoneRouter.delete("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    await req.zoneService.deleteZone(id);
    res
      .status(200)
      .json({ message: `Zone with id ${id} deleted successfully` });
  } catch (error) {
    handleError(res, "An error occurred while deleting a zone", error);
  }
});

module.exports = zoneRouter;
