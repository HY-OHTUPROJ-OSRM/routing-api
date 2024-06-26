const proxy = require('express-http-proxy')
const express = require("express")
const cors = require("cors")

const { BACKEND_URL } = require('./utils/config')

const zoneRouter = require("./routes/zones")
const segmentRouter = require("./routes/segments")
const statusRouter = require("./routes/status")

const server = express()

server.use(express.json());
server.use(cors())

server.use("/route", proxy(`${BACKEND_URL}/route`, {
    proxyReqPathResolver: (req) => `/route${req.url}`
}))
server.use("/tile", proxy(`${BACKEND_URL}/tile`, {
    proxyReqPathResolver: (req) => `/tile${req.url}`
}))
server.use("/zones", zoneRouter)
server.use("/segments", segmentRouter)
server.use("/status", statusRouter)

module.exports = server
