const databaseConnection = require("../utils/database");

class TempRoadRepository {
  constructor() {
    this.sql = databaseConnection;
  }

  async getAll() {
    try {
      return await this.sql`
        SELECT
          id, type, name, status, tags, start_node, end_node,
          length, speed, description, direction, created_at, updated_at
        FROM
          temporary_routes;
      `;
    } catch (err) {
      throw new Error(`Failed to fetch all temporary routes: ${err.message}`);
    }
  }

  async getById(id) {
    try {
      const result = await this.sql`
        SELECT
          id, type, name, status, tags, start_node, end_node,
          length, speed, description, direction, created_at, updated_at
        FROM
          temporary_routes
        WHERE
          id = ${id};
      `;
      return result[0] || null;
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
      start_node,
      end_node,
      length,
      speed,
      description = null,
      direction = 2 // two-way(default)
    } = data;

    try {
      const result = await this.sql`
        INSERT INTO temporary_routes (
          type, name, status, tags, start_node, end_node,
          length, speed, description, direction
        )
        VALUES (
          ${type}, ${name}, ${status}, ${JSON.stringify(tags)},
          ${start_node}, ${end_node}, ${length}, ${speed}, ${description}, ${direction}
        )
        RETURNING
          id, type, name, status, tags, start_node, end_node,
          length, speed, description, direction, created_at, updated_at;
      `;
      return result[0];
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
      "start_node",
      "end_node",
      "length",
      "speed",
      "description",
      "direction"
    ];

    const setClauses = [];
    const values = [];
    let idx = 1;

    for (const [key, value] of Object.entries(updates)) {
      if (!allowedFields.includes(key)) continue;
      setClauses.push(`${key} = $${idx++}`);
      values.push(value);
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
        id, type, name, status, tags, start_node, end_node,
        length, speed, description, direction, created_at, updated_at;
    `;

    try {
      const result = await this.sql.unsafe(query, values);
      return result[0] || null;
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
          id, type, name, status, tags, start_node, end_node,
          length, speed, description, direction, created_at, updated_at;
      `;
      return result[0];
    } catch (err) {
      throw new Error(
        `Failed to toggle temporary route status: ${err.message}`
      );
    }
  }
}

module.exports = TempRoadRepository;
