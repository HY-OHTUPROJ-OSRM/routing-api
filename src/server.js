const express = require("express")
const cors = require("cors")

const routeRouter = require("./routes/route")
const zoneRouter = require("./routes/zones")

const server = express()

server.use(express.json());
server.use(cors())

server.use("/route", routeRouter)
server.use("/zones", zoneRouter)

module.exports = server
