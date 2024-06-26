require("dotenv").config()
const { PORT, PROFILES_PATH, ROUTE_DATA_PATH } = require("./utils/config")
const server = require("./server")
const { spawn } = require('child_process');
const ZoneService = require("./services/ZoneService")
const { formatOutput, execSyncCustom, makeOutputReader } = require("./utils/process_utils")

execSyncCustom("create_database.sh", "./create_database.sh")
execSyncCustom("osrm-extract",   `osrm-extract -p ${PROFILES_PATH}/car.lua ${ROUTE_DATA_PATH}`)
execSyncCustom("osrm-contract",  `osrm-contract ${ROUTE_DATA_PATH}`)
execSyncCustom("osrm-datastore", `osrm-datastore ${ROUTE_DATA_PATH}`)

const startServer = async () => {
    try {
        await ZoneService.init()
    } catch (error) {
        console.error(error)
        return
    }

    server.listen(PORT, () => {
        console.log(`routing-api listening on port ${PORT}`)
    })
}

const osrm = spawn("osrm-routed", ["--shared-memory", "--algorithm", "ch"])
var started = false;

process.on("uncaughtException", (err, origin) => {
	osrm.kill()
	console.error(err)
	process.exit(1)
})

osrm.stdout.on("data", (output) => {
    process.stdout.write(formatOutput("osrm-routed", output))

    if (!started && output.toString().includes("running and waiting for requests")) {
        startServer()
        started = true
    }
})

osrm.stderr.on("data", makeOutputReader("osrm-routed", process.stderr))

osrm.on("exit", (code, signal) => {
    if (code != 0) {
        console.error("osrm-routed has faulted!")
        process.exit()
    }
})
