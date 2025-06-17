const { Router } = require("express");
const TempRoadService = require("../services/TempRoadService");

const tempsRouter = Router();
const service = new TempRoadService();

// Helper for error responses
const handleError = (res, message, error, status = 500) => {
  res.status(status).json({ message, error: error.message });
};

// List all temporary roads
tempsRouter.get("/", async (req, res) => {
  try {
    const temps = await service.getAllTempRoads();
    res.json(temps);
  } catch (error) {
    handleError(res, "Error fetching temps", error);
  }
});

// Create a new temporary road
tempsRouter.post("/", async (req, res) => {
  try {
    const newTemp = await service.createTempRoad(req.body);
    res.status(201).json(newTemp);
  } catch (error) {
    handleError(res, "Error creating temp", error);
  }
});

// Read a single temporary road
tempsRouter.get("/:id", async (req, res) => {
  try {
    const temp = await service.getTempRoadById(req.params.id);
    if (!temp) {
      return handleError(res, "Temp not found", new Error("Not found"), 404);
    }
    res.json(temp);
  } catch (error) {
    handleError(res, "Error fetching temp", error);
  }
});

// Update metadata of a temporary road
// Require updated_at for optimistic concurrency
tempsRouter.patch("/:id", async (req, res) => {
  try {
    if (!req.body.updated_at) {
      return res.status(400).json({ message: "Missing 'updated_at' for concurrency control." });
    }
    const updated = await service.updateTempRoad(req.params.id, req.body, req.body.updated_at);
    res.json(updated);
  } catch (error) {
    if (error.code === "CONFLICT") {
      return res.status(409).json({ message: "Conflict: The resource was modified by another user.", error: error.message });
    }
    handleError(res, "Error updating temp", error);
  }
});

// Delete a temporary road
tempsRouter.delete("/:id", async (req, res) => {
  try {
    await service.deleteTempRoad(req.params.id);
    res.json({ message: `Temp with id ${req.params.id} deleted` });
  } catch (error) {
    if (error.message.includes("does not exist")) {
      return handleError(res, error.message, error, 404);
    }
    handleError(res, "Error deleting temp", error);
  }
});

// Toggle active state
tempsRouter.post("/:id/toggle", async (req, res) => {
  try {
    const toggled = await service.toggleTempRoadActive(req.params.id);
    res.json(toggled);
  } catch (error) {
    if (error.message.includes("does not exist")) {
      return handleError(res, error.message, error, 404);
    }
    handleError(res, "Error toggling temp", error);
  }
});

module.exports = tempsRouter;
