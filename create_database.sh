create_sql="
CREATE TABLE IF NOT EXISTS zones (
    id SERIAL PRIMARY KEY,
    type TEXT,
    name TEXT,
    effect_value DOUBLE PRECISION,
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
    description TEXT,
    direction INTEGER DEFAULT 2,  -- 2 = Two-way (default), 3 = Reverse, 4 = Forward
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_temp_routes_start_node ON temporary_routes(start_node);
CREATE INDEX IF NOT EXISTS idx_temp_routes_end_node ON temporary_routes(end_node);
CREATE INDEX IF NOT EXISTS sidx_zones_geom ON zones USING GIST(geom);
"

# Run the OSM import and schema creation
PGPASSWORD=$DATABASE_PASSWORD osm2pgsql --slim -H "$DATABASE_HOST" -P "$DATABASE_PORT" -U "$DATABASE_USER" "${ROUTE_DATA_PATH:-./map_data/route-data.osm}"
PGPASSWORD=$DATABASE_PASSWORD psql -h $DATABASE_HOST -p "$DATABASE_PORT" -U "$DATABASE_USER" -c "$create_sql"
