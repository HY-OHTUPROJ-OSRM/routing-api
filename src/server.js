const express = require("express")
const cors = require("cors")
const indexRouter = require("./routes/index")

const server = express()

server.use(cors())

server.use(indexRouter)

module.exports = server
