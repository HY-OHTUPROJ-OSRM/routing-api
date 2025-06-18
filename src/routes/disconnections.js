const { Router } = require("express");
const DisconnectionsService = require("../services/DisconnectionsService");
const disconnectionsRouter = Router();
const service = new DisconnectionsService();

// List or fetch disconnected links
// POST /disconnected_links
// Body: { minDist, maxDist, namesAreSame, forceFetchAll }
disconnectionsRouter.post("/", async (req, res) => {
  const { minDist, maxDist, namesAreSame, forceFetchAll } = req.body;
  try {
    const data = await service.getLinks(minDist, maxDist, namesAreSame, forceFetchAll);
    res.json({ data });
  } catch (error) {
    console.error("Error fetching disconnected links:", error);
    res.status(500).json({
      message: "An error occurred while fetching disconnected links",
      error: error.message,
    });
  }
});

// PATCH /disconnected_links/:id
// Body: { temp_road_id, updated_at }
disconnectionsRouter.patch("/:id", async (req, res) => {
  const discId = Number(req.params.id);
  const { temp_road_id, updated_at } = req.body;
  if (!updated_at) {
    return res.status(400).json({ message: "Missing 'updated_at' for concurrency control." });
  }
  try {
    const row = await service.updateTempRoadId(discId, temp_road_id, updated_at);
    res.json({ success: true, row });
  } catch (err) {
    if (err.code === "CONFLICT") {
      return res.status(409).json({ message: "Conflict: The resource was modified by another user." });
    }
    console.error("Error updating temp_road_id:", err);
    res.status(500).json({ message: "Failed to update", error: err.message });
  }
});

// PATCH /disconnected_links/:id/hide
// Body: { updated_at }
disconnectionsRouter.patch("/:id/hide", async (req, res) => {
  const discId = Number(req.params.id);
  const { updated_at } = req.body;
  if (!updated_at) {
    return res.status(400).json({ message: "Missing 'updated_at' for concurrency control." });
  }
  try {
    const row = await service.toggleHideStatus(discId, updated_at);
    res.json({ success: true, row });
  } catch (err) {
    if (err.code === "CONFLICT") {
      return res.status(409).json({ message: "Conflict: The resource was modified by another user." });
    }
    res.status(500).json({ message: "Failed to hide/show", error: err.message });
  }
});

module.exports = disconnectionsRouter;