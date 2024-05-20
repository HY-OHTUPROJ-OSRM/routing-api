const { PORT } = require("./utils/config")
const server = require("./server")

server.listen(PORT, () => {
    console.log(`routing-api listening on port ${PORT}`)
})
