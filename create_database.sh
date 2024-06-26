create_sql="
CREATE TABLE IF NOT EXISTS zones (
	id SERIAL PRIMARY KEY,
        type TEXT,
        name TEXT,
        effect_value DOUBLE PRECISION,
        geom GEOMETRY(POLYGON, 3857) CHECK (ST_IsValid(geom))
);
CREATE INDEX IF NOT EXISTS sidx_zones_geom ON zones USING GIST(geom);
"

PGPASSWORD=$DATABASE_PASSWORD osm2pgsql --slim -H "$DATABASE_HOST" -P "$DATABASE_PORT" -U "$DATABASE_USER" "${ROUTE_DATA_PATH:-./route-data.osm}"
PGPASSWORD=$DATABASE_PASSWORD psql -h $DATABASE_HOST -p "$DATABASE_PORT" -U "$DATABASE_USER" -c "$create_sql"
