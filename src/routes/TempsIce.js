const express = require("express");
const router = express.Router();
const MmlTileService = require("../services/MmlTileService");

const tileService = new MmlTileService();

router.get("/", async (req, res) => {
  try {
    const layers = await tileService.getAllLayers();
    res.json(layers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/matrix/:matrixSet", async (req, res) => {
  try {
    const layers = await tileService.getLayersByMatrixSet(req.params.matrixSet);
    res.json(layers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/:identifier", async (req, res) => {
  try {
    const layer = await tileService.getLayerById(req.params.identifier);
    if (!layer) {
      return res.status(404).json({ error: "Layer not found" });
    }
    res.json(layer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
