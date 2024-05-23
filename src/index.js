const { PORT } = require("./utils/config")
const server = require("./server")
const { exec } = require('child_process');

exec("./start_backend.sh ./route-data.osm", (error, stdout, stderr) => {
    if (error) {
      console.error(`exec error: ${error}`)
      return
    }
    console.log(`stdout: ${stdout}`)
    console.error(`stderr: ${stderr}`)
})

server.listen(PORT, () => {
    console.log(`routing-api listening on port ${PORT}`)
})
