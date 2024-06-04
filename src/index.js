require("dotenv").config()
const { PORT, DATABASE_USER, DATABASE_PASSWORD, DATABASE_HOST, DATABASE_PORT } = require("./utils/config")
const server = require("./server")
const { execSync, spawn } = require('child_process');
const ZoneService = require("./services/ZoneService")

try {
    console.log(execSync("./create_database.sh", { encoding: 'utf-8' }))
}
catch(error)
{
    console.log("Exception!!!")
    console.log(error.message)
}

const backend = spawn("./start_backend.sh")

backend.stdout.on("data", (data) => process.stdout.write(`[start_backend.sh] ${data}`))
backend.stderr.on("data", (data) => process.stderr.write(`[start_backend.sh] ${data}`))

backend.on("exit", (code, signal) => {
    if (code != 0) {
        console.error("start_backend.sh has faulted!")
    }
})

const startServer = async () => {
    const segments = await ZoneService.waysOverlappingAnyZone()

    try {
        await ZoneService.blockSegments(segments)
    } catch (error) {
        console.error(error)
    }

    server.listen(PORT, () => {
        console.log(`routing-api listening on port ${PORT}`)
    })
}

startServer()
