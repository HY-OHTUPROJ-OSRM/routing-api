const { Router } = require("express");
const TempRoadRepository = require("../repositories/TempRoadRepository");
const validator = require("../components/Validators");

const tempsRouter = Router();
const repo = new TempRoadRepository();

// List all temporary roads
tempsRouter.get("/", async (req, res) => {
  try {
    const temps = await repo.getAll();
    res.json(temps);
  } catch (error) {
    res.status(500).json({ message: "Error fetching temps", error: error.message });
  }
});

// Create a new temporary road
tempsRouter.post("/", async (req, res) => {
  const data = req.body;
  const errors = validator.valid(data, true);
  if (errors.length) {
    return res.status(400).json({ message: "Invalid payload", error: errors[0] });
  }

  try {
    const newTemp = await repo.create(data);
    res.status(201).json(newTemp);
  } catch (error) {
    res.status(500).json({ message: "Error creating temp", error: error.message });
  }
});

// Read a single temporary road
tempsRouter.get("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const temp = await repo.getById(id);
    if (!temp) {
      return res.status(404).json({ message: "Temp not found" });
    }
    res.json(temp);
  } catch (error) {
    res.status(500).json({ message: "Error fetching temp", error: error.message });
  }
});

// Update metadata of a temporary road
tempsRouter.patch("/:id", async (req, res) => {
  const { id } = req.params;
  const updates = req.body;
  try {
    const updated = await repo.update(id, updates);
    res.json(updated);
  } catch (error) {
    res.status(500).json({ message: "Error updating temp", error: error.message });
  }
});

// Delete a temporary road
tempsRouter.delete("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    await repo.delete(id);
    res.json({ message: `Temp with id ${id} deleted` });
  } catch (error) {
    res.status(500).json({ message: "Error deleting temp", error: error.message });
  }
});

// Toggle active state
tempsRouter.post("/:id/toggle", async (req, res) => {
  const { id } = req.params;
  try {
    const toggled = await repo.toggleActive(id);
    res.json(toggled);
  } catch (error) {
    res.status(500).json({ message: "Error toggling temp", error: error.message });
  }
});

module.exports = tempsRouter;
