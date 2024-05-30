const sql = require("../utils/database")

class ZoneRepository {
    static async getZones() {
        const zoneResult = await sql`
            WITH gps_zones AS (
                SELECT id, type, name, ST_Transform(geom, 4326)
                FROM zones
            )
            SELECT json_build_object(
                'type', 'FeatureCollection',
                'features', json_agg(ST_AsGeoJSON(gps_zones.*)::json)
            )
            FROM gps_zones;
        `
        return zoneResult[0].json_build_object
    }

    static async createZone(zone) {
        await sql`
            INSERT INTO zones (type, name, geom)
            VALUES (
                ${zone.properties.type},
                ${zone.properties.name},
                ST_Transform(St_GeomFromGeoJSON(${JSON.stringify(zone.geometry)}), 3857)
            )
        `
    }

    static async getOverlappingPaths(zoneIds) {
        const result = await sql`
            SELECT w.id way_id, ARRAY_AGG(n.id) node_ids,
                ARRAY_AGG(n.lat) node_latitudes,
                ARRAY_AGG(n.lon) node_longitudes
            FROM planet_osm_nodes AS n, (
                    SELECT osm_id, name, (ST_Dump(ST_Intersection(l.way, z.geom))).geom clip
                    FROM planet_osm_line AS l, zones AS z
                    WHERE z.id=ANY(${zoneIds}::int[])
                ) AS q
            INNER JOIN planet_osm_ways AS w ON q.osm_id=w.id
            WHERE ST_Dimension(q.clip)=1 AND n.id=ANY(w.nodes)
            GROUP BY w.id;
        `

        return result.map(
            row => row.node_ids.map(
                (id, i) => ({ id: id, lat: row.node_latitudes[i], lon: row.node_longitudes[i] })
            )
        )
    }
}

module.exports = ZoneRepository
