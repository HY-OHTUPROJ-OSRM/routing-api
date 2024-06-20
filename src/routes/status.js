const { Router } = require("express");
const StatusService = require("../services/StatusService")
const { v4: uuidv4 } = require('uuid')

const statusRouter = Router()

statusRouter.get("/", async (req, res) => {
    const headers = {
        'Content-Type': 'text/event-stream',
        'Connection': 'keep-alive',
        'Cache-Control': 'no-cache'
    }

    res.writeHead(200, headers)

    res.write(`data: ${JSON.stringify(StatusService.getStatus())}\n\n`)

    const id = uuidv4()

    StatusService.addListener(id, res)

    req.on("close", () => {
        StatusService.removeListener(id)
    })
});

module.exports = statusRouter
