const express = require("express");
const router = express.Router();
const DigitrafficVolumeService = require("../services/DigitrafficVolumeService");

router.get("/stations", async (req, res) => {
  try {
    const stations = await DigitrafficVolumeService.fetchStations();
    res.json(stations);
  } catch (err) {
    console.error("Error fetching stations:", err);
    res.status(500).json({ error: "Failed to get stations" });
  }
});

router.get("/stations/helsinki", async (req, res) => {
  try {
    const stations = await DigitrafficVolumeService.fetchHelsinkiStations();
    res.json(stations);
  } catch (err) {
    console.error("Error fetching Helsinki stations:", err);
    res.status(500).json({ error: "Failed to get Helsinki stations" });
  }
});

router.get("/stations/:id", async (req, res) => {
  try {
    const data = await DigitrafficVolumeService.fetchVolumeForStation(req.params.id);
    res.json(data);
  } catch (err) {
    console.error("Error fetching station data:", err);
    res.status(500).json({ error: "Failed to get station data" });
  }
});

module.exports = router;
