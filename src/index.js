require("dotenv").config()
const { PORT, DATABASE_USER, DATABASE_PASSWORD, DATABASE_HOST, DATABASE_PORT } = require("./utils/config")
const server = require("./server")
const { spawn } = require('child_process');
const ZoneService = require("./services/ZoneService")
const { formatOutput, execSyncCustom, makeOutputReader } = require("./utils/process_utils")

execSyncCustom("create_database.sh", "./create_database.sh")
execSyncCustom("osrm-extract",   "osrm-extract -p /opt/car.lua ./route-data.osm")
execSyncCustom("osrm-contract",  "osrm-contract ./route-data.osm")
execSyncCustom("osrm-datastore", "osrm-datastore ./route-data.osm")

const startServer = async () => {
    const segments = await ZoneService.waysOverlappingAnyZone()

    try {
        await ZoneService.blockSegments(segments)
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
