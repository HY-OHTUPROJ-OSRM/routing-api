const { Router } = require("express");
const StatusService = require("../services/StatusService");
const { uid } = require("uid");

const statusRouter = Router();

// Server-Sent Events endpoint for status updates
statusRouter.get("/", async (req, res) => {
  const headers = {
    "Content-Type": "text/event-stream",
    "Connection": "keep-alive",
    "Cache-Control": "no-cache",
  };

  res.writeHead(200, headers);

  // Send initial status
  res.write(`data: ${JSON.stringify(StatusService.getStatus())}\n\n`);

  const id = uid();
  StatusService.addListener(id, res);

  req.on("close", () => {
    StatusService.removeListener(id);
  });
});

module.exports = statusRouter;
