const databaseConnection = require("../utils/database");

class LimitRepository {
  static async getLimitedWaysFromDb() {
    const result = await databaseConnection`
      SELECT 
        w.id AS way_id,
        w.tags[array_position(w.tags, 'maxheight') + 1] AS maxheight,
        w.tags[array_position(w.tags, 'maxweight') + 1] AS maxweight,
        ARRAY_AGG(ARRAY[n.lon/1e7, n.lat/1e7] ORDER BY ord.idx) AS coordinates
      FROM planet_osm_ways w
      JOIN LATERAL UNNEST(w.nodes) WITH ORDINALITY AS ord(node_id, idx) ON TRUE
      JOIN planet_osm_nodes n ON n.id = ord.node_id
      WHERE (array_position(w.tags, 'maxheight') IS NOT NULL OR array_position(w.tags, 'maxweight') IS NOT NULL)
        AND w.tags IS NOT NULL
        AND w.nodes IS NOT NULL
      GROUP BY w.id, w.tags
    `;

    return result.map(row => ({
      id: row.way_id,
      coordinates: row.coordinates,
      maxheight: row.maxheight,
      maxweight: row.maxweight
    })).filter(w => w.coordinates.length >= 2);
  }
}

module.exports = LimitRepository;
