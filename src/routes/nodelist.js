const { Router } = require("express");
const databaseConnection = require("../utils/database");
const nodelistRouter = Router();

async function getNodeList() {
  const nodes = await databaseConnection`
    SELECT * FROM planet_osm_nodes
  `;
  return nodes;
}

async function getWayList() {
  const ways = await databaseConnection`
    SELECT * FROM planet_osm_ways
  `;
  return ways;
}

nodelistRouter.get("/", async (req, res) => {

  try {
    const nodes = await getNodeList();
    const ways = await getWayList();
    res.json({ nodes: nodes, ways: ways });
  } catch (error) {
    console.error("Error list all nodes:", error);
    res.status(500).json({
      message: "An error occurred while list all nodes",
      error: error.message,
    });
  }
});

module.exports = nodelistRouter;
