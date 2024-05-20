const { Router } = require("express")
const routeRouter = require("./route/index")

const indexRouter = Router()

indexRouter.use("/route", routeRouter)

module.exports = indexRouter
