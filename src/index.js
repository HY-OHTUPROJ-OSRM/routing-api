require("dotenv").config()
const { PORT, DATABASE_USER, DATABASE_PASSWORD, DATABASE_HOST, DATABASE_PORT } = require("./utils/config")
const server = require("./server")
const { execSync, exec } = require('child_process');
const ZoneService = require("./services/ZoneService")

try {
    console.log(execSync("./create_database.sh", { encoding: 'utf-8' }))
    exec("./start_backend.sh")
}
catch(error)
{
    console.log("Exception!!!")
    console.log(error.message)
}

ZoneService.waysOverlappingAnyZone()
    .then(ZoneService.blockSegments)
    .then(() => {
        server.listen(PORT, () => {
            console.log(`routing-api listening on port ${PORT}`)
        })
    })
