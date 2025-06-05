const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const proxy = require("express-http-proxy");
const fs = require("fs");
const path = require("path");

const { BACKEND_URL } = require("./utils/config");
const zoneRouter = require("./routes/zones");
const segmentRouter = require("./routes/segments");
const statusRouter = require("./routes/status");
const tempRouter = require("./routes/temps");
const disconnectedLinksRouter = require("./routes/disconnected_links");
const nodelistRouter = require("./routes/nodelist");
const nodesRouter = require("./routes/nodes");
const { parseVehicleConfig } = require("./utils/vehicle_config");

const server = express();

// Middleware
server.use(helmet());
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
server.use("/nodelist", nodelistRouter);

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
server.use("/disconnected_links", disconnectedLinksRouter);
server.use("/nodes", nodesRouter); 

// Proxy routes
server.use("/route", proxy(`${BACKEND_URL}/route`, {
    proxyReqPathResolver: (req) => `/route${req.url}`
}));

server.use("/tile", proxy(`${BACKEND_URL}/tile`, {
    proxyReqPathResolver: (req) => `/tile${req.url}`
}));
server.use("/nodes", nodesRouter);

server.get("/vehicle-config", (req, res) => {
  parseVehicleConfig((err, result) => {
    if (err) {
      res.status(500).json({ error: "Failed to read or parse config file" });
      return;
    }
    res.json(result);
  });
});

module.exports = server;
