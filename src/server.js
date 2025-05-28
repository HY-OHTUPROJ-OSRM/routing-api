const express = require("express");
const cors = require("cors");
const proxy = require("express-http-proxy");

const { BACKEND_URL } = require("./utils/config");
const zoneRouter = require("./routes/zones");
const segmentRouter = require("./routes/segments");
const statusRouter = require("./routes/status");
const tempRouter = require("./routes/temps");
const nodesRouter = require("./routes/nodes");

const server = express();

// Middleware
server.use(express.json());
server.use(cors());

// Proxy routes
const proxyRoute = (path) =>
  proxy(`${BACKEND_URL}${path}`, {
    proxyReqPathResolver: (req) => `${path}${req.url}`,
  });

server.use("/route", proxyRoute("/route"));
server.use("/tile", proxyRoute("/tile"));

// API routes
server.use("/zones", zoneRouter);
server.use("/segments", segmentRouter);
server.use("/status", statusRouter);
server.use("/temps", tempRouter);
server.use("/nodes", nodesRouter);

module.exports = server;
