const express = require("express");
const cors = require("cors");
const proxy = require("express-http-proxy");

const { BACKEND_URL } = require("./utils/config");
const zoneRouter = require("./routes/zones");
const segmentRouter = require("./routes/segments");
const statusRouter = require("./routes/status");
const tempRouter = require("./routes/temps");
const disconnectedLinksRouter = require("./routes/disconnected_links");

const server = express();

// Middleware
server.use(express.json());
server.use(cors());

server.use("/route", proxy(`${BACKEND_URL}/route`, {
    proxyReqPathResolver: (req) => `/route${req.url}`
}))
server.use("/tile", proxy(`${BACKEND_URL}/tile`, {
    proxyReqPathResolver: (req) => `/tile${req.url}`
}))
server.use("/zones", zoneRouter)
server.use("/segments", segmentRouter)
server.use("/status", statusRouter)
server.use("/disconnected_links", disconnectedLinksRouter);

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

module.exports = server;
