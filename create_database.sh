#!/bin/sh
user=$1
host=$2
port=$3
input=$4

create_sql="
CREATE TABLE zones (
	id SERIAL PRIMARY KEY, geom GEOMETRY(POLYGON, 3857)
);
CREATE INDEX sidx_zones_geom ON zones USING GIST(geom);
"

osm2pgsql --slim -H "$host" -P "$port" -U "$user" "$input"
psql -h "$host" -p "$port" -U "$user" -c "$create_sql"
