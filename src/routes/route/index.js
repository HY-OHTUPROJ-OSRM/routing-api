const { Router } = require("express")

const routeRouter = Router()

routeRouter.post(("/"), (req, res) => (
    res.send("route")
))

module.exports = routeRouter
