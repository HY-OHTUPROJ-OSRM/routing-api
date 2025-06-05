const express = require("express");
const cors = require("cors");
const proxy = require("express-http-proxy");

const { BACKEND_URL } = require("./utils/config");
const zoneRouter = require("./routes/zones");
const segmentRouter = require("./routes/segments");
const statusRouter = require("./routes/status");
const tempRouter = require("./routes/temps");
const disconnectedLinksRouter = require("./routes/disconnected_links");
const nodesRouter = require("./routes/nodes");

const server = express();

// Middleware
server.use(express.json());
server.use(cors());

// API routes
server.use("/zones", zoneRouter);
server.use("/segments", segmentRouter);
server.use("/status", statusRouter);
server.use("/temps", tempRouter);
server.use("/disconnected_links", disconnectedLinksRouter);
server.use("/nodes", nodesRouter); 

// Proxy routes
server.use("/route", proxy(`${BACKEND_URL}/route`, {
    proxyReqPathResolver: (req) => `/route${req.url}`
}));

server.use("/tile", proxy(`${BACKEND_URL}/tile`, {
    proxyReqPathResolver: (req) => `/tile${req.url}`
}));

module.exports = server;
