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
                SELECT id, type, effect_value, name, ST_Transform(geom, 4326)
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
        let effectValue = zone.properties.effectValue

        if (effectValue === undefined) {
            effectValue = null
        }

        const result = await this.sql`
            INSERT INTO zones (type, name, effect_value, geom)
            VALUES (
                ${zone.properties.type},
                ${zone.properties.name},
                ${effectValue},
                ST_Transform(St_GeomFromGeoJSON(${JSON.stringify(zone.geometry)}), 3857)
            )
            RETURNING id;
        `
        return result[0].id
    }

    async deleteZones(ids) {
        if (!ids) return

        await this.sql`
            DELETE FROM zones WHERE id IN ${ this.sql(ids) }
        `
    }

    async getPathsOverlappingZones() {
        const result = await this.sql`
            WITH unnested_nodes AS (
                SELECT
                    ways.id AS way_id,
                    ways.tags[8] as speed,
                    unnest(array(SELECT nodes[i] FROM generate_series(array_lower(nodes, 1), array_upper(nodes, 1)) i)) AS node_id,
                    generate_series(array_lower(ways.nodes, 1), array_upper(ways.nodes, 1)) AS node_pos
                FROM
                    (
                        SELECT
                            osm_id
                        FROM planet_osm_line AS lines, zones
                        WHERE ST_Intersects(lines.way, zones.geom)
                    ) AS intersections
                INNER JOIN
                    planet_osm_ways AS ways ON intersections.osm_id = ways.id
            ),
            located_nodes AS (
                SELECT DISTINCT
                    way_id,
                    speed,
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
                way_id,
                ANY_VALUE(speed) AS speed,
                ARRAY_AGG(ARRAY[node_id, lat, lon] ORDER BY node_pos) AS nodes
            FROM
                located_nodes
            GROUP BY
                way_id;
        `

        return result.map(
            row => ({
                speed: row.speed,
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
}

module.exports = ZoneRepository
