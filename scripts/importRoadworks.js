// Loads environment variables from .env file
require('dotenv').config();

const DigitrafficService = require("../src/services/DigitrafficService");
const ZoneService = require("../src/services/ZoneService");
const turf = require("@turf/turf");

/**
 * Converts a roadwork object from Digitraffic to a GeoJSON zone Feature.
 * Attempts to create a convex hull polygon from the coordinates, or buffers the centroid if not possible.
 * Adds relevant properties, including 'source: "digitraffic"' for later identification.
 */
async function roadworkToZone(roadwork) {
  if (!roadwork.coordinates || !Array.isArray(roadwork.coordinates) || roadwork.coordinates.length === 0) return null;

  // Flattens nested coordinate arrays into a single array of [lng, lat] points
  function flattenCoords(coords) {
    if (!Array.isArray(coords)) return [];
    if (typeof coords[0] === 'number') return [coords];
    return coords.flatMap(flattenCoords);
  }
  const points = flattenCoords(roadwork.coordinates);

  let polygon = null;
  if (points.length >= 3) {
    // Try to create a convex hull from the points
    const fc = turf.featureCollection(points.map(pt => turf.point(pt)));
    polygon = turf.convex(fc);
  }
  if (!polygon) {
    // Fallback: buffer the centroid (works even for a single point)
    const fc = turf.featureCollection(points.map(pt => turf.point(pt)));
    const centroid = turf.centroid(fc);
    polygon = turf.buffer(centroid, 0.02, { units: 'kilometers' }); // ~20m buffer
  }

  // Always return a valid polygon, or null if not possible
  if (!polygon || polygon.geometry.type !== "Polygon") return null;

  // Utility for safe property assignment
  const safe = (v, fallback = null) => (v === undefined || v === null ? fallback : v);
  // Maps severity string to effect value
  const severityToEffectValue = (severity) => {
    switch ((severity || "").toUpperCase()) {
      case "HIGHEST": return 0.2;
      case "HIGH": return 0.4;
      case "MODERATE": return 0.6;
      case "LOW": return 0.8;
      default: return 1.0;
    }
  };

  return {
    type: "Feature",
    properties: {
      type: "factor",
      name: safe(roadwork.roadName, safe(roadwork.title, "")),
      effectValue: severityToEffectValue(roadwork.severity),
      effect_value: severityToEffectValue(roadwork.severity),
      source: "digitraffic",
      roadwork_id: safe(roadwork.id, null),
      title: safe(roadwork.title, ""),
      roadName: safe(roadwork.roadName, ""),
      municipality: safe(roadwork.municipality, ""),
      startTime: safe(roadwork.startTime, null),
      endTime: safe(roadwork.endTime, null),
      restrictions: Array.isArray(roadwork.restrictions) ? roadwork.restrictions : [],
    },
    geometry: polygon.geometry,
  };
}

/**
 * Deletes all previously imported Digitraffic roadwork zones from the database.
 * This ensures that only the latest roadworks are present after each import cycle.
 * Returns an array of IDs to be deleted.
 */
async function getPreviousDigitrafficZoneIds() {
  const zoneService = new ZoneService();
  const allZones = await zoneService.getZones();
  return allZones.features
    .filter(z => z.properties && z.properties.source === "digitraffic")
    .map(z => z.properties.id)
    .filter(id => id !== undefined && id !== null);
}

/**
 * Fetches current roadworks from Digitraffic, converts them to zones, and imports them into the database.
 * Deletes previous Digitraffic zones in the same transaction for consistency.
 * Only the first 4 roadworks are imported for demonstration/testing purposes.
 */
async function importRoadworks() {
  try {
    const roadworks = await DigitrafficService.fetchRoadWorks();

    const zones = [];
    for (const rw of roadworks) {
      // Skip if coordinates are missing or invalid
      if (!rw.coordinates || !Array.isArray(rw.coordinates) || rw.coordinates.length === 0) continue;
      const zone = await roadworkToZone(rw);
      if (zone) zones.push(zone);
    }

    // Get IDs of previous digitraffic zones to delete
    const digitrafficZoneIds = await getPreviousDigitrafficZoneIds();
    const zoneService = new ZoneService();
    await zoneService.changeZones(zones, digitrafficZoneIds);
    console.log(`Deleted ${digitrafficZoneIds.length} previous digitraffic zones.`);
    console.log(`Imported ${zones.length} roadwork zones.`);
  } catch (err) {
    console.error("Error importing roadworks:", err);
  }
}

/**
 * Main loop: imports new Digitraffic zones and deletes previous ones in a single transaction, repeats every 5 minutes.
 */
async function loop() {
  while (true) {
    await importRoadworks();
    await new Promise((resolve) => setTimeout(resolve, 5 * 60 * 1000));
  }
}

loop();
