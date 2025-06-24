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
      const result = await this.sql.unsafe(`
        INSERT INTO temporary_routes (
          type, name, status, tags, geom,
          length, speed, max_weight, max_height, description
        )
        VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9, $10
        )
        RETURNING
          id, type, name, status, tags, ST_AsGeoJSON(geom) as geom,
          length, speed, max_weight, max_height, description, created_at, updated_at;
      `, [
        type,
        name,
        status,
        JSON.stringify(tags),
        geom,
        length,
        speed,
        max_weight,
        max_height,
        description
      ]);
      const item = result[0];
      item.tags = JSON.parse(item.tags);
      item.geom = item.geom ? JSON.parse(item.geom) : null;
      return item;
    } catch (err) {
      throw new Error(`Failed to create temporary route: ${err.message}`);
    }
  }

  async update(id, updates, expectedUpdatedAt) {
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

    // Special handling for partial geom update
    if (Object.prototype.hasOwnProperty.call(updates, 'geom') && updates.geom) {
      try {
        let geomObj = typeof updates.geom === 'string' ? JSON.parse(updates.geom) : updates.geom;
        if (
          geomObj &&
          geomObj.type === 'LineString' &&
          Array.isArray(geomObj.coordinates) &&
          geomObj.coordinates.length === 2
        ) {
          // If any coordinate is invalid (NaN), fetch from DB and merge
          const invalids = geomObj.coordinates.map(
            c => !Array.isArray(c) || c.length !== 2 || c.some(v => typeof v !== 'number' || isNaN(v))
          );
          if (invalids.some(Boolean)) {
            // Fetch current geom from DB
            const current = await this.getById(id);
            if (current && current.geom && current.geom.type === 'LineString' && Array.isArray(current.geom.coordinates)) {
              const mergedCoords = geomObj.coordinates.map((c, i) => {
                if (!Array.isArray(c) || c.length !== 2 || c.some(v => typeof v !== 'number' || isNaN(v))) {
                  // Use DB value
                  return current.geom.coordinates[i];
                }
                return c;
              });
              geomObj.coordinates = mergedCoords;
              updates.geom = JSON.stringify(geomObj);
            }
          } else {
            // All valid, stringify if needed
            updates.geom = typeof updates.geom === 'string' ? updates.geom : JSON.stringify(geomObj);
          }
        }
      } catch (e) {
        // If parsing fails, ignore and let DB error out
      }
    }

    for (const [key, value] of Object.entries(updates)) {
      if (!allowedFields.includes(key)) continue;
      if (key === "tags") {
        setClauses.push(`${key} = $${idx++}`);
        values.push(JSON.stringify(value));
      } else if (key === "geom") {
        setClauses.push(`${key} = $${idx++}`);
        values.push(value);
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
    values.push(expectedUpdatedAt);

    const query = `
      UPDATE temporary_routes
      SET
        ${setClauses.join(",\n        ")}
      WHERE
        id = $${idx} AND ABS(EXTRACT(EPOCH FROM (updated_at - $${idx + 1}::timestamptz))) < 0.01
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

  async delete(id, expectedUpdatedAt) {
    try {
      const result = await this.sql`
        DELETE FROM
          temporary_routes
        WHERE
          id = ${id} AND ABS(EXTRACT(EPOCH FROM (updated_at - ${expectedUpdatedAt}::timestamptz))) < 0.01
        RETURNING id;
      `;
      if (!result[0]) return null;
      return result[0];
    } catch (err) {
      throw new Error(`Failed to delete temporary route: ${err.message}`);
    }
  }

  async toggleActive(id, expectedUpdatedAt) {
    try {
      const result = await this.sql`
        UPDATE
          temporary_routes
        SET
          status = NOT status,
          updated_at = NOW()
        WHERE
          id = ${id} AND ABS(EXTRACT(EPOCH FROM (updated_at - ${expectedUpdatedAt}::timestamptz))) < 0.01
        RETURNING
          id, type, name, status, tags, ST_AsGeoJSON(geom) as geom,
          length, speed, max_weight, max_height, description, created_at, updated_at;
      `;
      if (!result[0]) return null;
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
