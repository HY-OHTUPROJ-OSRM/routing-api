require("dotenv").config();

const { PORT, OSRM_BACKEND_PORT } = require("./utils/config");
const server = require("./server");
const { spawn } = require("child_process");
const ZoneService = require("./services/ZoneService");
const TempRoadService = require("./services/TempRoadService");
const {
  formatOutput,
  makeOutputReader,
} = require("./utils/process_utils");
const DisconnectionsService = require("./services/DisconnectionsService");
const disconnectionsService = new DisconnectionsService();

// Prepare OSRM data
async function prepareOsrmData() {
  await require("./utils/createdatabase")();
  disconnectionsService.fetchDisconnections();
}

// Start Express server after services are initialized
async function startServer() {
  try {
    await ZoneService.init();
    await TempRoadService.init();
    server.listen(PORT, () => {
      console.log(`routing-api listening on port ${PORT}`);
    });
  } catch (error) {
    console.error(error);
  }
}

// Start OSRM backend process
function startOsrmBackend() {
  const osrm = spawn("osrm-routed", ["--shared-memory", "--algorithm", "ch", "--port", OSRM_BACKEND_PORT]);
  let started = false;

  process.on("uncaughtException", (err) => {
    osrm.kill();
    console.error(err);
    process.exit(1);
  });

  osrm.stdout.on("data", (output) => {
    process.stdout.write(formatOutput("osrm-routed", output));
    if (!started && output.toString().includes("running and waiting for requests")) {
      startServer();
      started = true;
    }
  });

  osrm.stderr.on("data", makeOutputReader("osrm-routed", process.stderr));

  osrm.on("exit", (code) => {
    if (code !== 0) {
      console.error("osrm-routed has faulted!");
      process.exit();
    }
  });
}

async function start() {
  await prepareOsrmData();
  startOsrmBackend();
}

// Main execution
start();