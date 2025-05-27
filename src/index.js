require("dotenv").config();

const { PORT, PROFILES_PATH, ROUTE_DATA_PATH, OSRM_BACKEND_PORT } = require("./utils/config");
const server = require("./server");
const { spawn } = require("child_process");
const ZoneService = require("./services/ZoneService");
const TempRoadService = require("./services/TempRoadService");
const {
  formatOutput,
  execSyncCustom,
  makeOutputReader,
} = require("./utils/process_utils");

// Prepare OSRM data
function prepareOsrmData() {
  execSyncCustom("create_database.sh", "./create_database.sh");
  execSyncCustom(
    "osrm-extract",
    `osrm-extract -p ${PROFILES_PATH}/car.lua ${ROUTE_DATA_PATH}`
  );
  execSyncCustom("osrm-contract", `osrm-contract ${ROUTE_DATA_PATH}`);
  execSyncCustom("osrm-datastore", `osrm-datastore ${ROUTE_DATA_PATH}`);
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
    if (
      !started &&
      output.toString().includes("running and waiting for requests")
    ) {
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

// Main execution
prepareOsrmData();
startOsrmBackend();
