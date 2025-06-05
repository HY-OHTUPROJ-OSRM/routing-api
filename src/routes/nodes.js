const { Router } = require("express");
const databaseConnection = require("../utils/database");

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
    
    // Try PostGIS first (more accurate)
    let nearestNodes;
    try {
      nearestNodes = await databaseConnection`
        SELECT 
          id, 
          lat, 
          lon,
          ST_Distance(
            ST_SetSRID(ST_MakePoint(lon/10000000.0, lat/10000000.0), 4326)::geography,
            ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography
          ) as distance
        FROM planet_osm_nodes 
        WHERE lat IS NOT NULL AND lon IS NOT NULL
        ORDER BY ST_Distance(
          ST_SetSRID(ST_MakePoint(lon/10000000.0, lat/10000000.0), 4326)::geography,
          ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography
        )
        LIMIT 1
      `;
    } catch (postgisError) {
      console.log('PostGIS not available, falling back to simple calculation');
      // Fallback to simple distance calculation
      nearestNodes = await databaseConnection`
        SELECT 
          id, 
          lat, 
          lon,
          SQRT(
            POW((lat/10000000.0 - ${latitude}), 2) + 
            POW((lon/10000000.0 - ${longitude}), 2)
          ) as distance
        FROM planet_osm_nodes 
        WHERE lat IS NOT NULL AND lon IS NOT NULL
        ORDER BY SQRT(
          POW((lat/10000000.0 - ${latitude}), 2) + 
          POW((lon/10000000.0 - ${longitude}), 2)
        )
        LIMIT 1
      `;
    }
    
    if (nearestNodes.length === 0) {
      return res.status(404).json({ 
        message: "No nodes found in the database" 
      });
    }
    
    const nearestNode = nearestNodes[0];
    
    const result = {
      nodeId: nearestNode.id,
      coordinates: {
        lat: nearestNode.lat / 10000000,
        lng: nearestNode.lon / 10000000
      },
      distance: parseFloat(nearestNode.distance)
    };
    
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
