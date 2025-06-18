const { execSyncCustom } = require("./process_utils");
const sql = require("./database");
const {
  DATABASE_HOST,
  DATABASE_PORT,
  DATABASE_DB,
  DATABASE_USER,
  DATABASE_PASSWORD,
  ROUTE_DATA_PATH,
} = require("./config");
const axios = require("axios");
const crypto = require('crypto');

const create_sql = `
CREATE TABLE IF NOT EXISTS zones (
    id SERIAL PRIMARY KEY,
    type TEXT,
    name TEXT,
    effect_value DOUBLE PRECISION,
    source TEXT,
    geom GEOMETRY(POLYGON, 3857) CHECK (ST_IsValid(geom)),
    updated_at TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS temporary_routes(
    id SERIAL PRIMARY KEY,
    type TEXT,
    name TEXT,
    status BOOLEAN DEFAULT true,
    tags JSONB DEFAULT '[]',
    geom GEOMETRY(LINESTRING, 3857) CHECK (ST_IsValid(geom)),
    length DOUBLE PRECISION,
    speed INTEGER,
    max_weight DOUBLE PRECISION,
    max_height DOUBLE PRECISION,
    description TEXT,
    direction INTEGER DEFAULT 2,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS municipalities (
    id SERIAL PRIMARY KEY,
    code TEXT UNIQUE,
    name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS disconnected_links (
    id SERIAL PRIMARY KEY,
    start_node INTEGER NOT NULL,
    start_node_name TEXT,
    start_node_lat DOUBLE PRECISION,
    start_node_lon DOUBLE PRECISION,
    end_node INTEGER NOT NULL,
    end_node_name TEXT,
    end_node_lat DOUBLE PRECISION,
    end_node_lon DOUBLE PRECISION,
    distance DOUBLE PRECISION,
    county_code TEXT,
    county_name TEXT,
    temp_road_id INTEGER,
    CONSTRAINT fk_temp_road
      FOREIGN KEY (temp_road_id) REFERENCES temporary_routes(id)
      ON DELETE SET NULL,
    hide_status BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_disc_links_start_node ON disconnected_links(start_node);
CREATE INDEX IF NOT EXISTS idx_disc_links_end_node   ON disconnected_links(end_node);
CREATE INDEX IF NOT EXISTS sidx_zones_geom ON zones USING GIST(geom);
`;

const drop_sql = `
DROP TABLE IF EXISTS zones, municipalities, temporary_routes, disconnected_links;
`;

async function createTable() {
  await sql`
  CREATE TABLE IF NOT EXISTS db_version (
    name TEXT PRIMARY KEY,
    version TEXT NOT NULL
  );
  `;

  const hash = crypto
    .createHash('sha256')
    .update(create_sql)
    .digest('hex')

  const res = await sql`SELECT version FROM db_version WHERE name='id';`;
  if (res.length > 0) {
    if (res[0].version !== hash) {
      console.log("Dropping old tables");
      await sql.unsafe(drop_sql);
      await sql`UPDATE db_version SET version = ${hash} WHERE name = 'id';`;
    }
  } else {
    await sql`INSERT INTO db_version (name, version) VALUES ('id', ${hash});`;
  }

  await sql.unsafe(create_sql);
}

module.exports = async function () {
  console.log("Initializing database...");

  await createTable();

  console.log("Moving route data to database...");
  execSyncCustom(
    "osm2pgsql",
    `osm2pgsql --slim -H "${DATABASE_HOST}" -P "${DATABASE_PORT}" -U "${DATABASE_USER}" "${ROUTE_DATA_PATH}"`,
    {
      env: {
        PGPASSWORD: DATABASE_PASSWORD,
      },
    });

  console.log("Checking if municipalities table is empty...");
  const [{ count }] = await sql`SELECT COUNT(*)::int FROM municipalities`;
  console.log(`Row count in municipalities table: ${count}`);
  if (count === 0) {
    console.log("Inserting municipalities data into the database...");

    const url = "https://data.stat.fi/api/classifications/v2/classifications/kunta_1_20250101/classificationItems?content=data&meta=max&lang=fi&format=json";
    const response = await axios.get(url);
    const items = response.data;

    for (const item of items) {
      const code = item.code;
      const name = item.classificationItemNames?.[0]?.name || "";

      try {
        await sql`
          INSERT INTO municipalities (code, name)
          VALUES (${code}, ${name})
          ON CONFLICT (code) DO NOTHING
        `;
      } catch (err) {
        console.error(`Failed to insert ${code} - ${name}:`, err.message);
      }
    }

    console.log("Finished inserting municipalities.");
  } else {
    console.log("Municipalities table already has data. Skipping insert.");
  }

  console.log("Extracting OSRM data...");
  execSyncCustom(
    "osrm-extract",
    `osrm-extract -p ./profiles/car.lua ${ROUTE_DATA_PATH}`
  );
  console.log("Contracting OSRM data...");
  execSyncCustom("osrm-contract", `osrm-contract ${ROUTE_DATA_PATH}`);
  console.log("Storing OSRM data...");
  execSyncCustom("osrm-datastore", `osrm-datastore ${ROUTE_DATA_PATH}`);
}