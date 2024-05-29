const express = require("express")
const cors = require("cors")
const indexRouter = require("./routes/index")
const apiPolygons = require('./routes/Polygons')
const DB = require('./db.js');


const server = express()

server.use(express.json());
server.use(cors())
const { db } = await DB();
server.set('db', db);
server.use(indexRouter)
server.use(apiPolygons)
module.exports = server
