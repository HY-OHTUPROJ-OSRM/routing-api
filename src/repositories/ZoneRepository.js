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
}

module.exports = ZoneRepository
