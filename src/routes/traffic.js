const express = require("express");
const router = express.Router();
const DigitrafficService = require("../services/DigitrafficService");

// Get all stations
router.get("/stations", async (req, res) => {
  try {
    const stations = await DigitrafficService.fetchStations();
    res.json(stations);
  } catch (err) {
    console.error("Error fetching stations:", err);
    res.status(500).json({ error: "Failed to get stations" });
  }
});

// Get only Helsinki stations
router.get("/stations/helsinki", async (req, res) => {
  try {
    const stations = await DigitrafficService.fetchHelsinkiStations();
    res.json(stations);
  } catch (err) {
    console.error("Error fetching Helsinki stations:", err);
    res.status(500).json({ error: "Failed to get Helsinki stations" });
  }
});

// Get volume data for one station by ID
router.get("/stations/:id", async (req, res) => {
  try {
    const data = await DigitrafficService.fetchVolumeForStation(req.params.id);
    res.json(data);
  } catch (err) {
    console.error("Error fetching station data:", err);
    res.status(500).json({ error: "Failed to get station data" });
  }
});

// Get current roadwork messages
router.get("/roadwork", async (req, res) => {
  try {
    const data = await DigitrafficService.fetchRoadWorks();
    res.json(data);
  } catch (err) {
    console.error("Error fetching road work data:", err);
    res.status(500).json({ error: "Failed to get road work data" });
  }
});

// Optional: Combine stations and roadwork into one response
router.get("/all", async (req, res) => {
  try {
    const [stations, roadwork] = await Promise.all([
      DigitrafficService.fetchStations(),
      DigitrafficService.fetchRoadWorks(),
    ]);
    res.json({ stations, roadwork });
  } catch (err) {
    console.error("Error fetching combined data:", err);
    res.status(500).json({ error: "Failed to get data" });
  }
});

module.exports = router;
