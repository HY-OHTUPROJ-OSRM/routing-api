const databaseConnection = require("../utils/database");

class ZoneRepository {
  constructor() {
    this.sql = databaseConnection;
    this.transactionConnection = null;
    this.transactionOngoing = false;
  }

  get activeSql() {
    return this.transactionOngoing ? this.transactionConnection : this.sql;
  }

  async beginTransaction() {
    if (this.transactionOngoing) {
      throw new Error("Transaction already ongoing.");
    }
    this.transactionConnection = await databaseConnection.reserve();
    await this.transactionConnection`BEGIN;`;
    this.transactionOngoing = true;
  }

  async commitTransaction() {
    if (!this.transactionOngoing) {
      throw new Error("No transaction ongoing.");
    }
    await this.transactionConnection`COMMIT;`;
    await this.transactionConnection.release();
    this.transactionConnection = null;
    this.transactionOngoing = false;
  }

  async rollbackTransaction() {
    if (!this.transactionOngoing) {
      throw new Error("No transaction ongoing.");
    }
    await this.transactionConnection`ROLLBACK;`;
    await this.transactionConnection.release();
    this.transactionConnection = null;
    this.transactionOngoing = false;
  }

  async getAll() {
    try {
      const zoneResult = await this.activeSql`
        WITH gps_zones AS (
          SELECT
            id, type, effect_value, name, source, ST_AsGeoJSON(geom) as geom, 
            created_at, updated_at
          FROM
            zones
        )
        SELECT
          json_build_object(
            'type', 'FeatureCollection',
            'features', COALESCE(json_agg(
              json_build_object(
                'type', 'Feature',
                'geometry', geom::json,
                'properties', json_build_object(
                  'id', id,
                  'type', type,
                  'effect_value', effect_value,
                  'name', name,
                  'source', source,
                  'created_at', created_at,
                  'updated_at', updated_at
                )
              )
            ), '[]'::json)
          ) AS geojson
        FROM
          gps_zones;
      `;
      return zoneResult[0].geojson;
    } catch (err) {
      throw new Error(`Failed to fetch zones: ${err.message}`);
    }
  }

  async create(zone) {
    try {
      const { type, name, effectValue, source } = zone.properties;
      const geometry = JSON.stringify(zone.geometry);
      const result = await this.activeSql`
        INSERT INTO zones (
          type, name, effect_value, source, geom
        )
        VALUES (
          ${type},
          ${name},
          ${effectValue ?? null},
          ${source ?? null},
          St_GeomFromGeoJSON(${geometry})
        )
        RETURNING
          id;
      `;
      return result[0].id;
    } catch (err) {
      throw new Error(`Failed to create zone: ${err.message}`);
    }
  }

  async delete(ids, expectedUpdatedAt) {
    if (!Array.isArray(ids)) return;
    const filteredIds = ids.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0);
    if (filteredIds.length === 0) return;
    if (!expectedUpdatedAt) throw new Error("Missing expectedUpdatedAt for OCC");
    try {
      // Fuzzy match: allow up to 10ms difference
      const result = await this.activeSql`
        DELETE FROM zones
        WHERE id = ANY(${filteredIds})
        AND ABS(EXTRACT(EPOCH FROM (updated_at - ${expectedUpdatedAt}::timestamptz))) < 0.01;
      `;
      return result.count > 0;
    } catch (err) {
      throw new Error(`Failed to delete zones: ${err.message}`);
    }
  }

  async deleteBatch(ids, updatedAts) {
    if (!Array.isArray(ids) || !Array.isArray(updatedAts) || ids.length !== updatedAts.length) {
      throw new Error("deleteBatch: ids and updatedAts must be arrays of same length");
    }
    if (ids.length === 0) return { success: true };
    const conflictIds = [];
    try {
      for (let i = 0; i < ids.length; i++) {
        const id = Number(ids[i]);
        const updatedAt = updatedAts[i];
        // Fuzzy match: allow up to 10ms difference
        const result = await this.activeSql`
          DELETE FROM zones WHERE id = ${id} AND ABS(EXTRACT(EPOCH FROM (updated_at - ${updatedAt}::timestamptz))) < 0.01;
        `;
        if (result.count === 0) conflictIds.push(id);
      }
      return { success: conflictIds.length === 0, conflictIds };
    } catch (err) {
      throw new Error(`Failed to batch delete zones: ${err.message}`);
    }
  }

  async getPathsOverlappingZones() {
    try {
      const result = await this.activeSql`
        WITH unnested_nodes AS (
          SELECT
            ways.id AS way_id,
            ways.tags[8] AS speed,
            unnest(array(SELECT nodes[i] FROM generate_series(array_lower(nodes, 1), array_upper(nodes, 1)) i)) AS node_id,
            generate_series(array_lower(ways.nodes, 1), array_upper(ways.nodes, 1)) AS node_pos
          FROM
            (
              SELECT
                osm_id
              FROM
                planet_osm_line AS lines, zones
              WHERE
                ST_Intersects(lines.way, ST_Transform(zones.geom, 3857))
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
      `;
      return result.map((row) => ({
        speed: row.speed,
        nodes: new Map(row.nodes.map(([nodeId, lat, lon]) => [nodeId, { lat, lon }])),
      }));
    } catch (err) {
      throw new Error(`Failed to fetch paths overlapping zones: ${err.message}`);
    }
  }
}

module.exports = ZoneRepository;
