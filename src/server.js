const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const proxy = require("express-http-proxy");


const { BACKEND_URL } = require("./utils/config");
const zoneRouter = require("./routes/zones");
const segmentRouter = require("./routes/segments");
const statusRouter = require("./routes/status");
const tempRouter = require("./routes/temps");
const nodesRouter = require("./routes/nodes");
const routeRouter = require("./routes/route");
const nodelistRouter = require("./routes/nodelist");
const trafficRouter = require("./routes/traffic")
const { disconnectedLinksRouter } = require("./routes/disconnected_links");
const { parseVehicleConfig } = require("./utils/vehicle_config");


const server = express();

// Middleware
server.use(helmet());
server.use(express.json());
server.use(cors());

// Proxy routes
server.use("/tile", proxy(`${BACKEND_URL}/tile`, {
    proxyReqPathResolver: (req) => `/tile${req.url}`
}))

// API routes
server.use("/zones", zoneRouter);
server.use("/segments", segmentRouter);
server.use("/status", statusRouter);
server.use("/temps", tempRouter);
server.use("/nodes", nodesRouter); 
server.use("/route", routeRouter);
server.use("/nodelist", nodelistRouter);
server.use("/traffic", trafficRouter);
server.use("/disconnected_links", disconnectedLinksRouter);

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
