// routes/nodes.js
const { Router } = require("express");
const databaseConnection = require("../utils/database");

const nodesRouter = Router();

// Get single node coordinates
nodesRouter.get("/:id", async (req, res) => {
  try {
    const nodeId = parseInt(req.params.id);
    
    if (isNaN(nodeId)) {
      return res.status(400).json({ message: "Invalid node ID" });
    }
    
    // Query coordinates from OSM nodes table
    const nodes = await databaseConnection`
      SELECT id, lat, lon 
      FROM planet_osm_nodes 
      WHERE id = ${nodeId}
    `;
    
    if (nodes.length === 0) {
      return res.status(404).json({ 
        message: `Node ${nodeId} not found in OSM data` 
      });
    }
    
    const node = nodes[0];
    
    // OSM coordinates usually need conversion (divide by 10000000)
    const coordinates = {
      id: node.id,
      lat: node.lat / 10000000,
      lng: node.lon / 10000000
    };
    
    res.json(coordinates);
    
  } catch (error) {
    console.error('Failed to get node coordinates:', error);
    res.status(500).json({
      message: "Failed to get node coordinates",
      error: error.message
    });
  }
});

module.exports = nodesRouter;