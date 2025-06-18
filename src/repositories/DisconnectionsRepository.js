const databaseConnection = require("../utils/database");

class DisconnectionsRepository {
  async getAll(minDist, maxDist, namesAreSame) {
    return databaseConnection`
      SELECT *
      FROM disconnected_links
      WHERE distance >= ${minDist} AND distance <= ${maxDist}
      ${namesAreSame ? databaseConnection`AND start_node_name = end_node_name` : databaseConnection``}
    `;
  }

  async getAllRaw() {
    return databaseConnection`SELECT * FROM disconnected_links`;
  }

  async insertMany(links) {
    const insertPromises = links.map(link => {
      return databaseConnection`
        INSERT INTO disconnected_links (
          start_node, start_node_name, start_node_lat, start_node_lon,
          end_node, end_node_name, end_node_lat, end_node_lon,
          distance, county_code, county_name
        ) VALUES (
          ${link.startNode.id}, ${link.startNode.way_name}, ${link.startNode.lat}, ${link.startNode.lon},
          ${link.endNode.id}, ${link.endNode.way_name}, ${link.endNode.lat}, ${link.endNode.lon},
          ${link.distance}, ${link.county}, ${link.county_name}
        )
      `;
    });
    return Promise.all(insertPromises);
  }

  async updateTempRoadId(id, temp_road_id, updated_at) {
    return databaseConnection`
      UPDATE disconnected_links
      SET    temp_road_id = ${temp_road_id},
             updated_at   = NOW()
      WHERE  id = ${id} AND updated_at = ${updated_at}
      RETURNING id, temp_road_id;
    `;
  }

  async toggleHideStatus(id, updated_at) {
    return databaseConnection`
      UPDATE disconnected_links
      SET hide_status = NOT hide_status,
          updated_at  = NOW()
      WHERE id = ${id} AND updated_at = ${updated_at}
      RETURNING id, hide_status;
    `;
  }
}

module.exports = DisconnectionsRepository;
