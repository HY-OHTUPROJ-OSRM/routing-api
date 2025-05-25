const databaseConnection = require("../utils/database");

class TempRoadRepository {
  constructor() {
    this.sql = databaseConnection;
    this.transactionOngoing = false;
  }

  async getAll() {
    const result = await this.sql`
      SELECT id, type, name, status, tags, start_node, end_node,
      length, speed, description, created_at, updated_at
      FROM temporary_routes;
    `;
    return result;
  }

  async getById(id) {
    const result = await this.sql`
      SELECT id, type, name, status, tags, start_node, end_node,
      length, speed, description, created_at, updated_at
      FROM temporary_routes
      WHERE id = ${id};
    `;
    return result[0] || null;
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
    } = data;

    const result = await this.sql`
      INSERT INTO temporary_routes
      (type, name, status, tags, start_node, end_node,
      length, speed, description)
      VALUES
      (${type}, ${name}, ${status}, ${this.sql(tags)},
      ${start_node}, ${end_node}, ${length}, ${speed}, ${description})
      RETURNING id, type, name, status, tags, start_node, end_node,
      length, speed, description, created_at, updated_at;
    `;
    return result[0];
  }

  async update(id, updates) {
    // Build dynamic SET clause
    const fields = [];
    const values = [];
    let idx = 1;

    for (const [key, value] of Object.entries(updates)) {
      fields.push(`${key} = $${idx}`);
      values.push(value);
      idx++;
    }

    if (fields.length === 0) {
      throw new Error("No fields to update");
    }

    // Always update updated_at
    fields.push(`updated_at = NOW()`);

    const query = `
      UPDATE temporary_routes
      SET ${fields.join(", ")}
      WHERE id = $${idx}
      RETURNING id, type, name, status, tags, start_node, end_node,
        length, speed, description, created_at, updated_at;
    `;

    values.push(id);

    const result = await this.sql.unsafe(query, values);
    return result[0] || null;
  }

  async delete(id) {
    await this.sql`
      DELETE FROM temporary_routes WHERE id = ${id};
    `;
  }

  async toggleActive(id) {
    const result = await this.sql`
      UPDATE temporary_routes
      SET status = NOT status,
      updated_at = NOW()
      WHERE id = ${id}
      RETURNING id, type, name, status, tags, start_node, end_node,
      length, speed, description, created_at, updated_at;
    `;
    return result[0];
  }
}

module.exports = TempRoadRepository;
