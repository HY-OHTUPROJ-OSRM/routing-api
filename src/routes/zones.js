const { Router } = require("express");
const ZoneService = require("../services/ZoneService");
const StatusService = require("../services/StatusService");
const validator = require("../components/Validators");

const zoneRouter = Router();
const zoneService = new ZoneService();

const handleError = (res, message, error, status = 500) => {
  res.status(status).json({ message, error: error?.message || error });
};

const validateFeatureCollection = (data, res) => {
  const errors = validator.valid(data, true);
  if (errors.length > 0) {
    handleError(res, "Invalid request payload.", errors[0], 400);
    return false;
  }
  return true;
};

zoneRouter.get("/", async (req, res) => {
  try {
    const zones = await zoneService.getZones();
    res.json(zones);
  } catch (error) {
    handleError(res, "An error occurred while getting zones", error);
  }
});

zoneRouter.post("/diff", async (req, res) => {
  const { added, deleted } = req.body;
  if (!validateFeatureCollection({ type: "FeatureCollection", features: added }, res)) return;

  // OCC: deleted must be array of {id, updated_at}
  if (!Array.isArray(deleted) || deleted.some((z) => !z.id || !z.updated_at)) {
    return res.status(400).json({
      message: "Each deleted zone must consist of an id and updated_at for concurrency control.",
    });
  }

  try {
    await zoneService.updateZones(added, deleted);
    res.status(201).send();
  } catch (error) {
    if (error.code === "CONFLICT") {
      return handleError(res, error.message, error, 409);
    }
    handleError(res, "An error occurred while changing zones.", error);
  }
});

zoneRouter.post("/", async (req, res) => {
  const featureCollection = req.body;
  if (!validateFeatureCollection(featureCollection, res)) return;

  try {
    await zoneService.createZones(featureCollection.features);
    res.status(201).send();
  } catch (error) {
    handleError(res, "An error occurred while creating zones", error);
  }
});

zoneRouter.delete("/:id", async (req, res) => {
  const { id } = req.params;
  const { updated_at } = req.body;
  if (!updated_at) {
    return res.status(400).json({ message: "Missing 'updated_at' for concurrency control." });
  }
  try {
    await zoneService.deleteZone(id, updated_at);
    res.status(200).json({ message: `Zone with id ${id} deleted successfully` });
  } catch (error) {
    if (error.code === "CONFLICT") {
      return handleError(res, "Conflict: The resource was modified by another user.", error, 409);
    }
    handleError(res, "An error occurred while deleting a zone", error);
  }
});

module.exports = zoneRouter;
