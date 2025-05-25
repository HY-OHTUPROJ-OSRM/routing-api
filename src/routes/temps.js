const { Router } = require("express");
const TempRoadService = require("../services/TempRoadService");

const tempsRouter = Router();
const service = new TempRoadService();

// List all temporary roads
tempsRouter.get("/", async (req, res) => {
  try {
    const temps = await service.getAllTempRoads();
    res.json(temps);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching temps", error: error.message });
  }
});

// Create a new temporary road
tempsRouter.post("/", async (req, res) => {
  const data = req.body;

  try {
    const newTemp = await service.createTempRoad(data);
    res.status(201).json(newTemp);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error creating temp", error: error.message });
  }
});

// Read a single temporary road
tempsRouter.get("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const temp = await service.getTempRoadById(id);
    if (!temp) {
      return res.status(404).json({ message: "Temp not found" });
    }
    res.json(temp);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching temp", error: error.message });
  }
});

// Update metadata of a temporary road
tempsRouter.patch("/:id", async (req, res) => {
  const { id } = req.params;
  const updates = req.body;
  try {
    const updated = await service.updateTempRoad(id, updates);
    res.json(updated);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error updating temp", error: error.message });
  }
});

// Delete a temporary road
tempsRouter.delete("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    await service.deleteTempRoad(id);
    res.json({ message: `Temp with id ${id} deleted` });
  } catch (error) {
    if (error.message.includes("does not exist")) {
      res.status(404).json({ message: error.message });
    } else {
      res.status(500).json({ message: "Error deleting temp", error: error.message });
    }
  }
});

// Toggle active state
tempsRouter.post("/:id/toggle", async (req, res) => {
  const { id } = req.params;
  try {
    const toggled = await service.toggleTempRoadActive(id);
    res.json(toggled);
  } catch (error) {
    if (error.message.includes("does not exist")) {
      res.status(404).json({ message: error.message });
    } else {
      res.status(500).json({ message: "Error toggling temp", error: error.message });
    }
  }
});

module.exports = tempsRouter;
