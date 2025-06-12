#!/bin/bash
set -euo pipefail

drop_all=false
for arg in "$@"; do
  if [ "$arg" = "--drop" ]; then
    drop_all=true
    break
  fi
done

if [ "$drop_all" = true ]; then
  echo "Dropping all existing tables..."
  PGPASSWORD=$DATABASE_PASSWORD psql -h "$DATABASE_HOST" -p "$DATABASE_PORT" -U "$DATABASE_USER" <<EOSQL
DROP TABLE IF EXISTS disconnected_links CASCADE;
DROP TABLE IF EXISTS temporary_routes CASCADE;
DROP TABLE IF EXISTS zones CASCADE;
DROP TABLE IF EXISTS municipalities CASCADE;
EOSQL
fi

create_sql="
CREATE TABLE IF NOT EXISTS zones (
	id SERIAL PRIMARY KEY,
    type TEXT,
    name TEXT,
    effect_value DOUBLE PRECISION,
    source TEXT,
    geom GEOMETRY(POLYGON, 3857) CHECK (ST_IsValid(geom))
);
CREATE TABLE IF NOT EXISTS temporary_routes(
    id SERIAL PRIMARY KEY,
    type TEXT,
    name TEXT,
    status BOOLEAN DEFAULT true,
    tags JSONB DEFAULT '[]',
    start_node INTEGER,
    end_node INTEGER,
    length DOUBLE PRECISION,
    speed INTEGER,
    max_weight DOUBLE PRECISION,
    max_height DOUBLE PRECISION,
    description TEXT,
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

    start_node       INTEGER    NOT NULL,
    start_node_name  TEXT,
    start_node_lat   DOUBLE PRECISION,
    start_node_lon   DOUBLE PRECISION,

    end_node         INTEGER    NOT NULL,
    end_node_name    TEXT,
    end_node_lat     DOUBLE PRECISION,
    end_node_lon     DOUBLE PRECISION,

    distance         DOUBLE PRECISION,
    county_code      TEXT,
    county_name      TEXT,

    temp_road_id     INTEGER,
    CONSTRAINT fk_temp_road
      FOREIGN KEY (temp_road_id) REFERENCES temporary_routes(id)
      ON DELETE SET NULL,

    hide_status      BOOLEAN    NOT NULL DEFAULT FALSE,

    created_at       TIMESTAMP DEFAULT NOW(),
    updated_at       TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_disc_links_start_node ON disconnected_links(start_node);
CREATE INDEX IF NOT EXISTS idx_disc_links_end_node   ON disconnected_links(end_node);

CREATE INDEX IF NOT EXISTS idx_temp_routes_start_node ON temporary_routes(start_node);
CREATE INDEX IF NOT EXISTS idx_temp_routes_end_node ON temporary_routes(end_node);
CREATE INDEX IF NOT EXISTS sidx_zones_geom ON zones USING GIST(geom);
"

# Check if a table exists
table_exists=$(PGPASSWORD=$DATABASE_PASSWORD psql -h "$DATABASE_HOST" -p "$DATABASE_PORT" -U "$DATABASE_USER" -t -c \
"SELECT to_regclass('public.planet_osm_line');" | tr -d '[:space:]')

# If the table doesn't exist, run osm2pgsql
if [ "$table_exists" = "" ] || [ "$table_exists" = "null" ]; then
    echo "Creating database schema..."
    PGPASSWORD=$DATABASE_PASSWORD osm2pgsql --slim -H "$DATABASE_HOST" -P "$DATABASE_PORT" -U "$DATABASE_USER" \
        "${ROUTE_DATA_PATH:-./map_data/route-data.osm}"
else
    echo "Database schema already exists. Skipping osm2pgsql."
fi
echo "Creating tables and indexes..."
PGPASSWORD=$DATABASE_PASSWORD psql -h $DATABASE_HOST -p "$DATABASE_PORT" -U "$DATABASE_USER" -c "$create_sql"

echo  "Checking if municipalities table is empty..."
row_count=$(PGPASSWORD=$DATABASE_PASSWORD psql -h "$DATABASE_HOST" -p "$DATABASE_PORT" -U "$DATABASE_USER" -t -c "SELECT COUNT(*) FROM municipalities;" | tr -d '[:space:]')
echo "Row count in municipalities table: $row_count"
if [ "$row_count" -eq 0 ]; then
    echo "Inserting municipalities data into the database..."
    json=$(curl -s "https://data.stat.fi/api/classifications/v2/classifications/kunta_1_20250101/classificationItems?content=data&meta=max&lang=fi&format=json")

    echo "$json" | jq -c '.[] | {code: .code, name: .classificationItemNames[0].name}' | while read -r item; do
        code=$(echo "$item" | jq -r '.code')
        name=$(echo "$item" | jq -r '.name' | sed "s/'/''/g")
        PGPASSWORD=$DATABASE_PASSWORD psql -h "$DATABASE_HOST" -p "$DATABASE_PORT" -U "$DATABASE_USER" \
            -c "INSERT INTO municipalities (code, name) VALUES ('$code', '$name') ON CONFLICT (code) DO NOTHING;" \
            >/dev/null 2>&1
    done
fi
