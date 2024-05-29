const { Router } = require("express")

const zoneRouter = Router()

zoneRouter.get("/", async (req, res) => {
    res.send("zones")
});

module.exports = zoneRouter
