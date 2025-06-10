const databaseConnection = require("../utils/database");

/**
 * Finds the nearest OSM node to the given coordinates.
 * @param {number} latitude
 * @param {number} longitude
 * @returns {Promise<{ nodeId: number, coordinates: { lat: number, lng: number }, distance: number }|null>}
 */
async function getNearestNode(latitude, longitude) {
  if (isNaN(latitude) || isNaN(longitude)) {
    throw new Error("Invalid coordinates: lat and lng must be numbers");
  }
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
  if (!nearestNodes || nearestNodes.length === 0) return null;
  const nearestNode = nearestNodes[0];
  return {
    nodeId: nearestNode.id,
    coordinates: {
      lat: nearestNode.lat / 10000000,
      lng: nearestNode.lon / 10000000
    },
    distance: parseFloat(nearestNode.distance)
  };
}

/**
 * Gets the coordinates for a given OSM node ID.
 * @param {number} nodeId
 * @returns {Promise<{ id: number, lat: number, lng: number }|null>}
 */
async function getNodeCoordinates(nodeId) {
  if (isNaN(nodeId)) {
    throw new Error("Invalid node ID");
  }
  const nodes = await databaseConnection`
    SELECT id, lat, lon 
    FROM planet_osm_nodes 
    WHERE id = ${nodeId}
  `;
  if (!nodes || nodes.length === 0) return null;
  const node = nodes[0];
  return {
    id: node.id,
    lat: node.lat / 10000000,
    lng: node.lon / 10000000
  };
}

module.exports = {
  getNearestNode,
  getNodeCoordinates,
};
