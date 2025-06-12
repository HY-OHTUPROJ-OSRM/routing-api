const postgres = require("postgres");
const {
  DATABASE_HOST,
  DATABASE_PORT,
  DATABASE_DB,
  DATABASE_USER,
  DATABASE_PASSWORD,
  FORCE_SSL,
} = require("./config");

const sql = postgres({
  host: DATABASE_HOST,
  port: DATABASE_PORT,
  database: DATABASE_DB,
  user: DATABASE_USER,
  password: DATABASE_PASSWORD,
  ssl: FORCE_SSL,
});

module.exports = sql;
