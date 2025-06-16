const { Router } = require("express");
const NodeService = require("../services/NodeService");
const nodeService = new NodeService();

const nodesRouter = Router();

// Get nearest node to given coordinates - MAIN FUNCTION FOR TEMP ROADS
nodesRouter.get("/nearest", async (req, res) => {
  try {
    const { lat, lng } = req.query;
    
    if (!lat || !lng) {
      return res.status(400).json({ 
        message: "Missing required parameters: lat and lng" 
      });
    }
    
    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);
    
    if (isNaN(latitude) || isNaN(longitude)) {
      return res.status(400).json({ 
        message: "Invalid coordinates: lat and lng must be numbers" 
      });
    }
    
    const result = await nodeService.getNearestNode(latitude, longitude);
    
    if (!result) {
      return res.status(404).json({ 
        message: "No nodes found in the database" 
      });
    }
    
    res.json(result);
    
  } catch (error) {
    console.error('Failed to find nearest node:', error);
    res.status(500).json({
      message: "Failed to find nearest node",
      error: error.message
    });
  }
});

// Get single node coordinates (your existing endpoint)
nodesRouter.get("/:id", async (req, res) => {
  try {
    const nodeId = parseInt(req.params.id);
    
    if (isNaN(nodeId)) {
      return res.status(400).json({ message: "Invalid node ID" });
    }
    
    const coordinates = await nodeService.getNodeCoordinates(nodeId);
    
    if (!coordinates) {
      return res.status(404).json({ 
        message: `Node ${nodeId} not found in OSM data` 
      });
    }
    
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
