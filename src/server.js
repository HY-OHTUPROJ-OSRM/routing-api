const express = require("express")
const cors = require("cors")

const routeRouter = require("./routes/route")
const zoneRouter = require("./routes/zones")
const segmentRouter = require("./routes/segments")
const statusRouter = require("./routes/status")

const server = express()

server.use(express.json());
server.use(cors())

server.use("/route", routeRouter)
server.use("/zones", zoneRouter)
server.use("/segments", segmentRouter)
server.use("/status", statusRouter)

module.exports = server
