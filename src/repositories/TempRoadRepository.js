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
      type, name, status = true, tags = [], start_node,
      end_node, length, speed, description = null
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
    const fields = Object.keys(updates);
    if (!fields.length) return this.getById(id);

    const setters = fields.map(key => {
      const val = updates[key];
      // wrap tags array in sql helper
      if (key === 'tags') return this.sql`${this.sql(val)} AS ${key}`;
      return this.sql`${val} AS ${key}`;
    });

    const result = await this.sql`
      UPDATE temporary_routes
      SET ${this.sql(fields)} = ${this.sql(fields.map(k => updates[k]))},
          updated_at = NOW()
      WHERE id = ${id}
      RETURNING id, type, name, status, tags, start_node, end_node,
                length, speed, description, created_at, updated_at;
    `;
    return result[0];
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
