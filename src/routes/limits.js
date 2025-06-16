const express = require("express");
const LimitService = require("../services/LimitService");

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const data = await LimitService.getLimitedWays();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch limits" });
  }
});

module.exports = router;
