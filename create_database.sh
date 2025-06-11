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
        direction INTEGER DEFAULT 2,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS municipalities (
    id SERIAL PRIMARY KEY,
    code TEXT UNIQUE,
    name TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_temp_routes_start_node ON temporary_routes(start_node);
CREATE INDEX IF NOT EXISTS idx_temp_routes_end_node ON temporary_routes(end_node);
CREATE INDEX IF NOT EXISTS sidx_zones_geom ON zones USING GIST(geom);
"

PGPASSWORD=$DATABASE_PASSWORD osm2pgsql --slim -H "$DATABASE_HOST" -P "$DATABASE_PORT" -U "$DATABASE_USER" "${ROUTE_DATA_PATH:-./map_data/route-data.osm}"
PGPASSWORD=$DATABASE_PASSWORD psql -h $DATABASE_HOST -p "$DATABASE_PORT" -U "$DATABASE_USER" -c "$create_sql"

json=$(curl -s "https://data.stat.fi/api/classifications/v2/classifications/kunta_1_20250101/classificationItems?content=data&meta=max&lang=fi&format=json")

echo "$json" | jq -c '.[] | {code: .code, name: .classificationItemNames[0].name}' | while read -r item; do
    code=$(echo "$item" | jq -r '.code')
    name=$(echo "$item" | jq -r '.name' | sed "s/'/''/g")
    PGPASSWORD=$DATABASE_PASSWORD psql -h $DATABASE_HOST -p "$DATABASE_PORT" -U "$DATABASE_USER" -c "INSERT INTO municipalities (code, name) VALUES ('$code', '$name') ON CONFLICT (code) DO NOTHING;"
done
