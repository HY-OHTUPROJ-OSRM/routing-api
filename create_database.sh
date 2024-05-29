#!/bin/sh
user=$1
password=$2
host=$3
port=$4
input=$5

create_sql="
CREATE TABLE zones (
	id SERIAL PRIMARY KEY, geom GEOMETRY(POLYGON, 3857)
);
CREATE INDEX sidx_zones_geom ON zones USING GIST(geom);
"

PGPASSWORD=$password osm2pgsql --slim -H "$host" -P "$port" -U "$user" "$input"
PGPASSWORD=$password psql -h "$host" -p "$port" -U "$user" -c "$create_sql"
