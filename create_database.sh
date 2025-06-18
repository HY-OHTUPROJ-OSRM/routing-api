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

CREATE TABLE IF NOT EXISTS temporary_routes (
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
"

PGPASSWORD=$DATABASE_PASSWORD psql -h "$DATABASE_HOST" -p "$DATABASE_PORT" -U "$DATABASE_USER" -c "$create_sql"

# ALTER TABLE to add missing columns if necessary
alter_sql="
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
"
PGPASSWORD=$DATABASE_PASSWORD psql -h "$DATABASE_HOST" -p "$DATABASE_PORT" -U "$DATABASE_USER" -c "$alter_sql"

# Check if planet_osm_line table exists (osm2pgsql loaded)
table_exists=$(PGPASSWORD=$DATABASE_PASSWORD psql -h "$DATABASE_HOST" -p "$DATABASE_PORT" -U "$DATABASE_USER" -t -c \
"SELECT to_regclass('public.planet_osm_line');" | tr -d '[:space:]')

if [ -z "$table_exists" ] || [ "$table_exists" = "null" ]; then
    echo "Creating database schema with osm2pgsql..."
    PGPASSWORD=$DATABASE_PASSWORD osm2pgsql --slim -H "$DATABASE_HOST" -P "$DATABASE_PORT" -U "$DATABASE_USER" \
        "${ROUTE_DATA_PATH:-./map_data/route-data.osm.pbf}"
else
    echo "Database schema already exists. Skipping osm2pgsql."
fi

# Load municipalities data if missing
echo "Checking if municipalities table is empty..."
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
