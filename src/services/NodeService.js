const NodeRepository = require("../repositories/NodeRepository");
const nodeRepository = new NodeRepository();

class NodeService {
  constructor(repository = nodeRepository) {
    this.repository = repository;
  }

  /**
   * Finds the nearest OSM node to the given coordinates.
   * @param {number} latitude
   * @param {number} longitude
   * @returns {Promise<{ nodeId: number, coordinates: { lat: number, lng: number }, distance: number }|null>}
   */
  async getNearestNode(latitude, longitude) {
    if (isNaN(latitude) || isNaN(longitude)) {
      throw new Error("Invalid coordinates: lat and lng must be numbers");
    }
    let nearestNodes;
    try {
      nearestNodes = await this.repository.findNearestNodeWithPostGIS(latitude, longitude);
    } catch (postgisError) {
      // Fallback to simple distance calculation
      nearestNodes = await this.repository.findNearestNodeWithSimpleDistance(latitude, longitude);
    }
    if (!nearestNodes || nearestNodes.length === 0) return null;
    const nearestNode = nearestNodes[0];
    return {
      nodeId: nearestNode.id,
      coordinates: {
        lat: nearestNode.lat / 10000000,
        lng: nearestNode.lon / 10000000,
      },
      distance: parseFloat(nearestNode.distance),
    };
  }

  /**
   * Gets the coordinates for a given OSM node ID.
   * @param {number} nodeId
   * @returns {Promise<{ id: number, lat: number, lng: number }|null>}
   */
  async getNodeCoordinates(nodeId) {
    if (isNaN(nodeId)) {
      throw new Error("Invalid node ID");
    }
    const nodes = await this.repository.getNodeCoordinatesById(nodeId);
    if (!nodes || nodes.length === 0) return null;
    const node = nodes[0];
    return {
      id: node.id,
      lat: node.lat / 10000000,
      lng: node.lon / 10000000,
    };
  }
}

module.exports = NodeService;
