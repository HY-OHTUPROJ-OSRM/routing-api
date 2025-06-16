const databaseConnection = require("../utils/database");

class NodeRepository {
  constructor() {
    this.sql = databaseConnection;
  }

  /**
   * Finds the nearest OSM node to the given coordinates using PostGIS.
   * @param {number} latitude
   * @param {number} longitude
   * @returns {Promise<any[]>}
   */
  async findNearestNodeWithPostGIS(latitude, longitude) {
    return this.sql`
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
  }

  /**
   * Finds the nearest OSM node to the given coordinates using simple distance calculation.
   * @param {number} latitude
   * @param {number} longitude
   * @returns {Promise<any[]>}
   */
  async findNearestNodeWithSimpleDistance(latitude, longitude) {
    return this.sql`
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

  /**
   * Gets the coordinates for a given OSM node ID.
   * @param {number} nodeId
   * @returns {Promise<any[]>}
   */
  async getNodeCoordinatesById(nodeId) {
    return this.sql`
      SELECT id, lat, lon 
      FROM planet_osm_nodes 
      WHERE id = ${nodeId}
    `;
  }
}

module.exports = NodeRepository;
