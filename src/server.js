const express = require("express")
const indexRouter = require("./routes/index")

const server = express()

server.use(indexRouter)

module.exports = server
