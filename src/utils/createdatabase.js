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

alter_sql=`
DO \$\$
BEGIN
  -- temporary_routes.direction
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'temporary_routes' AND column_name = 'direction'
  ) THEN
    ALTER TABLE temporary_routes ADD COLUMN direction INTEGER DEFAULT 2;
  END IF;

  -- temporary_routes.tags
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'temporary_routes' AND column_name = 'tags'
  ) THEN
    ALTER TABLE temporary_routes ADD COLUMN tags JSONB DEFAULT '[]';
  END IF;

  -- temporary_routes.geom
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'temporary_routes' AND column_name = 'geom'
  ) THEN
    ALTER TABLE temporary_routes ADD COLUMN geom GEOMETRY(LINESTRING, 3857);
  END IF;

  -- zones.geom
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'zones' AND column_name = 'geom'
  ) THEN
    ALTER TABLE zones ADD COLUMN geom GEOMETRY(POLYGON, 3857);
  END IF;
END
\$\$;
`;

module.exports = async function () {
    console.log("Initializing database...");

    console.log("Moving route data to database...");
    execSyncCustom(
        "osm2pgsql",
        `osm2pgsql --slim -H "${DATABASE_HOST}" -P "${DATABASE_PORT}" -U "${DATABASE_USER}" "${ROUTE_DATA_PATH}"`,
        {
            env: {
                PGPASSWORD: DATABASE_PASSWORD,
            },
        });

    console.log("Creating tables if they do not exist...");
    const res = await sql.unsafe(create_sql);
    console.log("Database initialized:", res);

    const res4 = await sql.unsafe(alter_sql);
    console.log("Database altered:", res4);

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