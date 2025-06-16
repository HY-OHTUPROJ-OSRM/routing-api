const express = require("express");
const VehicleConfigService = require("../services/VehicleConfigService");

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const result = await VehicleConfigService.getVehicleConfig();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "Failed to read or parse config file" });
  }
});

module.exports = router;
