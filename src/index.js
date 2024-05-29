require("dotenv").config()
const { PORT, DATABASE_USER, DATABASE_PASSWORD, DATABASE_HOST, DATABASE_PORT } = require("./utils/config")
const server = require("./server")
const { execSync } = require('child_process');

try {
  console.log(execSync(`./create_database.sh ${DATABASE_USER} ${DATABASE_PASSWORD} ${DATABASE_HOST} ${DATABASE_PORT} ./route-data.osm`))
  console.log(execSync("./start_backend.sh ./route-data.osm"))
} catch {}

server.listen(PORT, () => {
    console.log(`routing-api listening on port ${PORT}`)
})
