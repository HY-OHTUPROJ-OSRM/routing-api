const { PORT, DATABASE_USER, DATABASE_HOST, DATABASE_PORT } = require("./utils/config")
const server = require("./server")
const { exec } = require('child_process');

const callback = (error, stdout, stderr) => {
    if (error) {
      console.error(`exec error: ${error}`)
      return
    }
    console.log(`stdout: ${stdout}`)
    console.error(`stderr: ${stderr}`)
}

exec(`./create_database.sh ${DATABASE_USER} ${DATABASE_HOST} ${DATABASE_PORT} ./route-data.osm`, callback)
exec("./start_backend.sh ./route-data.osm", callback)

server.listen(PORT, () => {
    console.log(`routing-api listening on port ${PORT}`)
})
