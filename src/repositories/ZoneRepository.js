const databaseConnection = require("../utils/database")

class ZoneRepository {
    constructor() {
        this.sql = databaseConnection
        this.transactionOngoing = false
    }

    async beginTransaction() {
        if (this.transactionOngoing) {
            throw Error("Transaction already ongoing.")
        }

        this.sql = await databaseConnection.reserve()
        await this.sql`BEGIN;`

        this.transactionOngoing = true
    }

    async commitTransaction() {
        if (!this.transactionOngoing) {
            throw Error("No transaction ongoing.")
        }

        await this.sql`COMMIT;`
        await this.sql.release()

        this.sql = databaseConnection
        this.transactionOngoing = false
    }

    async rollbackTransaction() {
        if (!this.transactionOngoing) {
            throw Error("No transaction ongoing.")
        }

        await this.sql`ROLLBACK;`
        await this.sql.release()

        this.sql = databaseConnection
        this.transactionOngoing = false
    }

    async getZones() {
        const zoneResult = await this.sql`
            WITH gps_zones AS (
                SELECT id, type, name, ST_Transform(geom, 4326)
                FROM zones
            )
            SELECT json_build_object(
                'type', 'FeatureCollection',
                'features', COALESCE(json_agg(ST_AsGeoJSON(gps_zones.*)::json), '[]'::json)
            )
            FROM gps_zones;
        `
        return zoneResult[0].json_build_object
    }

    async createZone(zone) {
        const result = await this.sql`
            INSERT INTO zones (type, name, geom)
            VALUES (
                ${zone.properties.type},
                ${zone.properties.name},
                ST_Transform(St_GeomFromGeoJSON(${JSON.stringify(zone.geometry)}), 3857)
            )
            RETURNING id;
        `
        return result[0].id
    }

    async deleteZone(id) {
        await this.sql`
            DELETE FROM zones WHERE id=${id}
        `
    }

    async deleteZones(ids) {
        await this.sql`
            DELETE FROM zones WHERE id IN ${ this.sql(ids) }
        `
    }

    async getOverlappingPaths(zoneIds) {
        const result = await this.sql`
            WITH unnested_nodes AS (
                SELECT
                    intersections.zone_id,
                    ways.id AS way_id,
                    unnest(array(SELECT nodes[i] FROM generate_series(array_lower(nodes, 1), array_upper(nodes, 1)) i)) AS node_id,
                    generate_series(array_lower(ways.nodes, 1), array_upper(ways.nodes, 1)) AS node_pos
                FROM
                    (
                        SELECT
                            zones.id AS zone_id,
                            osm_id,
                            (ST_Dump(ST_Intersection(lines.way, zones.geom))).geom AS clip
                        FROM planet_osm_line AS lines, zones
                        WHERE zones.id = ANY(${zoneIds}::int[])
                    ) AS intersections
                INNER JOIN
                    planet_osm_ways AS ways ON intersections.osm_id = ways.id
                WHERE
                    ST_Dimension(intersections.clip) = 1
            ),
            located_nodes AS (
                SELECT DISTINCT
                    zone_id,
                    way_id,
                    node_pos,
                    node_id,
                    n.lat,
                    n.lon
                FROM
                    unnested_nodes
                INNER JOIN
                    planet_osm_nodes AS n ON node_id = n.id
            )
            SELECT
                zone_id,
                way_id,
                ARRAY_AGG(ARRAY[node_id, lat, lon] ORDER BY node_pos) AS nodes
            FROM
                located_nodes
            GROUP BY
                zone_id, way_id;
        `

        return result.map(
            row => ({
                zoneId: row.zone_id,
                nodes: (() => {
                    const path = new Map()

                    row.nodes.forEach(([nodeId, lat, lon]) => {
                        path.set(nodeId, { lat, lon })
                    })

                    return path
                })()
            })
        )
    }

    async getAllZones() {
        return await this.sql`
            SELECT id, ARRAY_AGG(ARRAY[ST_X(dp), ST_Y(dp)]) points
            FROM (
                SELECT id, ST_Transform((ST_DumpPoints(geom)).geom, 4326) dp
                FROM zones
            )
            GROUP BY id;
        `
    }

    async getAllZonesAndOverlappingPaths() {
        const pathsResult = await this.sql`
            SELECT w.id way_id, ARRAY_AGG(n.id) node_ids,
                ARRAY_AGG(n.lat) node_latitudes,
                ARRAY_AGG(n.lon) node_longitudes
            FROM planet_osm_nodes AS n, (
                    SELECT osm_id, (ST_Dump(ST_Intersection(l.way, z.geom))).geom clip
                    FROM planet_osm_line AS l, zones AS z
                ) AS q
            INNER JOIN planet_osm_ways AS w ON q.osm_id=w.id
            WHERE ST_Dimension(q.clip)=1 AND n.id=ANY(w.nodes)
            GROUP BY w.id;
        `

        const paths = pathsResult.map(
            row => row.node_ids.map(
                (id, i) => ({ id: id, lat: row.node_latitudes[i], lon: row.node_longitudes[i] })
            )
        )

        const zonesResult = await this.sql`
            SELECT ARRAY_AGG(ARRAY[ST_X(dp), ST_Y(dp)]) points
            FROM (
                SELECT id, ST_Transform((ST_DumpPoints(geom)).geom, 4326) dp
                FROM zones
            )
            GROUP BY id;
        `

        const zones = zonesResult.map(
            row => row.points
        )

        return { paths: paths, zones: zones }
    }
}

module.exports = ZoneRepository
