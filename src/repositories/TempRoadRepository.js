const databaseConnection = require("../utils/database");

class TempRoadRepository {
  constructor() {
    this.sql = databaseConnection;
  }

  async getAll() {
    try {
      const result = await this.sql`
        SELECT
          id, type, name, status, tags, ST_AsGeoJSON(geom) as geom,
          length, speed, max_weight, max_height, description, created_at, updated_at
        FROM
          temporary_routes;
      `;
      return result.map(item => ({
        ...item,
        tags: JSON.parse(item.tags),
        geom: item.geom ? JSON.parse(item.geom) : null
      }));
    } catch (err) {
      throw new Error(`Failed to fetch all temporary routes: ${err.message}`);
    }
  }

  async getById(id) {
    try {
      const result = await this.sql`
        SELECT
          id, type, name, status, tags, ST_AsGeoJSON(geom) as geom,
          length, speed, max_weight, max_height, description, created_at, updated_at
        FROM
          temporary_routes
        WHERE
          id = ${id};
      `;
      if (result && result.length > 0) {
        const item = result[0];
        item.tags = JSON.parse(item.tags);
        item.geom = item.geom ? JSON.parse(item.geom) : null;
        return item;
      }
      return null;
    } catch (err) {
      throw new Error(`Failed to fetch temporary route by id: ${err.message}`);
    }
  }

  async create(data) {
    const {
      type,
      name,
      status = true,
      tags = [],
      geom,
      length,
      speed,
      max_weight = null,
      max_height = null,
      description = null,
    } = data;

    try {
      const result = await this.sql`
        INSERT INTO temporary_routes (
          type, name, status, tags, geom,
          length, speed, max_weight, max_height, description
        )
        VALUES (
          ${type}, ${name}, ${status}, ${JSON.stringify(tags)},
          ST_Transform(ST_GeomFromText(${geom}, 4326), 3857),
          ${length}, ${speed}, ${max_weight}, ${max_height}, ${description}
        )
        RETURNING
          id, type, name, status, tags, ST_AsGeoJSON(geom) as geom,
          length, speed, max_weight, max_height, description, created_at, updated_at;
      `;
      const item = result[0];
      item.tags = JSON.parse(item.tags);
      item.geom = item.geom ? JSON.parse(item.geom) : null;
      return item;
    } catch (err) {
      throw new Error(`Failed to create temporary route: ${err.message}`);
    }
  }

  async update(id, updates) {
    if (!updates || Object.keys(updates).length === 0) {
      throw new Error("No fields to update");
    }

    const allowedFields = [
      "type",
      "name",
      "status",
      "tags",
      "geom",
      "length",
      "speed",
      "max_weight",
      "max_height",
      "description",
    ];
    const setClauses = [];
    const values = [];
    let idx = 1;

    for (const [key, value] of Object.entries(updates)) {
      if (!allowedFields.includes(key)) continue;
      if (key === "tags") {
        setClauses.push(`${key} = $${idx++}`);
        values.push(JSON.stringify(value));
      } else if (key === "geom") {
        setClauses.push(`${key} = ST_SetSRID(ST_GeomFromGeoJSON($${idx++}), 3857)`);
        values.push(JSON.stringify(value));
      } else {
        setClauses.push(`${key} = $${idx++}`);
        values.push(value);
      }
    }

    if (setClauses.length === 0) {
      throw new Error("No valid fields to update");
    }

    setClauses.push(`updated_at = NOW()`);
    values.push(id);

    const query = `
      UPDATE temporary_routes
      SET
        ${setClauses.join(",\n        ")}
      WHERE
        id = $${idx}
      RETURNING
        id, type, name, status, tags, ST_AsGeoJSON(geom) as geom,
        length, speed, max_weight, max_height, description, created_at, updated_at;
    `;

    try {
      const result = await this.sql.unsafe(query, values);
      if (!result[0]) return null;
      const item = result[0];
      item.tags = JSON.parse(item.tags);
      item.geom = item.geom ? JSON.parse(item.geom) : null;
      return item;
    } catch (err) {
      throw new Error(`Failed to update temporary route: ${err.message}`);
    }
  }

  async delete(id) {
    try {
      await this.sql`
        DELETE FROM
          temporary_routes
        WHERE
          id = ${id};
      `;
    } catch (err) {
      throw new Error(`Failed to delete temporary route: ${err.message}`);
    }
  }

  async toggleActive(id) {
    try {
      const result = await this.sql`
        UPDATE
          temporary_routes
        SET
          status = NOT status,
          updated_at = NOW()
        WHERE
          id = ${id}
        RETURNING
          id, type, name, status, tags, geom,
          length, speed, max_weight, max_height, description, created_at, updated_at;
      `;
      const item = result[0];
      item.tags = JSON.parse(item.tags);
      item.geom = item.geom ? JSON.parse(item.geom) : null;
      return item;
    } catch (err) {
      throw new Error(
        `Failed to toggle temporary route status: ${err.message}`
      );
    }
  }
}

module.exports = TempRoadRepository;
