// Loads environment variables from .env file
require("dotenv").config();

const DigitrafficService = require("../src/services/DigitrafficService");
const ZoneService = require("../src/services/ZoneService");
const turf = require("@turf/turf");

/**
 * Converts a roadwork object from Digitraffic to an array of GeoJSON zone Features.
 * Buffers each line segment separately to ensure robustness and avoid intersecting polygons.
 * Parts from the same roadwork are labeled as "title (1)", "title (2)", etc.
 */
function severityToEffectValue(severity) {
  switch ((severity || "").toUpperCase()) {
    case "HIGHEST":
      return 0.2;
    case "HIGH":
      return 0.4;
    case "MODERATE":
      return 0.6;
    case "LOW":
      return 0.8;
    default:
      return 1.0;
  }
}

async function roadworkToZone(roadwork) {
  if (
    !roadwork.coordinates ||
    !Array.isArray(roadwork.coordinates) ||
    roadwork.coordinates.length === 0
  )
    return [];

  // Recursively extract individual lines from possibly nested arrays
  const lines = [];
  function extractLines(coords) {
    if (!Array.isArray(coords)) return;
    if (coords.length > 0 && typeof coords[0][0] === "number") {
      lines.push(coords);
    } else {
      coords.forEach(extractLines);
    }
  }
  extractLines(roadwork.coordinates);
  if (lines.length === 0) return [];

  // Utility for safe property values
  const safe = (v, fallback = null) =>
    v === undefined || v === null ? fallback : v;
  const baseProps = {
    type: "factor",
    name: safe(roadwork.title, "Roadwork"),
    effectValue: severityToEffectValue(roadwork.severity),
    effect_value: severityToEffectValue(roadwork.severity),
    source: "digitraffic",
    roadwork_id: safe(roadwork.id, null),
    roadName: safe(roadwork.roadName, ""),
    municipality: safe(roadwork.municipality, ""),
    startTime: safe(roadwork.startTime, null),
    endTime: safe(roadwork.endTime, null),
    restrictions: Array.isArray(roadwork.restrictions)
      ? roadwork.restrictions
      : [],
  };

  // Buffer each line to create polygons
  const zoneFeatures = [];
  lines.forEach((coords, idx) => {
    try {
      const line = turf.lineString(coords);
      const buf = turf.buffer(line, 0.008, { units: "kilometers" }); // 8m buffer
      if (
        buf &&
        (buf.geometry.type === "Polygon" ||
          buf.geometry.type === "MultiPolygon")
      ) {
        // Clone base props and add part-specific title
        const props = { ...baseProps };
        const baseTitle = safe(roadwork.title, "Roadwork");
        const partTitle =
          lines.length > 1 ? `${baseTitle} (${idx + 1})` : baseTitle;
        // assign both title and name so downstream consumers see the counter
        props.title = partTitle;
        props.name = partTitle;
        zoneFeatures.push({
          type: "Feature",
          properties: props,
          geometry: buf.geometry,
        });
      }
    } catch (e) {
      // ignore bad line
    }
  });

  return zoneFeatures;
}

/**
 * Deletes all previously imported Digitraffic roadwork zones from the database.
 */
async function getPreviousDigitrafficZoneIds() {
  const zoneService = new ZoneService();
  const allZones = await zoneService.getZones();
  return allZones.features
    .filter((z) => z.properties && z.properties.source === "digitraffic")
    .map((z) => z.properties.id)
    .filter((id) => id !== undefined && id !== null);
}

/**
 * Fetches current roadworks, converts them to zones, and imports into the database.
 * Handles multiple features per roadwork and deletes previous zones.
 */
async function importRoadworks() {
  try {
    let roadworks = await DigitrafficService.fetchRoadWorks();

    // Helper to flatten coordinates
    function extractAllCoords(coords, arr) {
      if (!Array.isArray(coords)) return;
      if (coords.length > 0 && typeof coords[0][0] === "number") {
        coords.forEach((c) => arr.push(c));
      } else {
        coords.forEach((c) => extractAllCoords(c, arr));
      }
    }

    // Filter roadworks to only those where all pairs of coordinates are within 3km
    roadworks = roadworks.filter(rw => {
      if (!rw.coordinates || !Array.isArray(rw.coordinates) || rw.coordinates.length === 0) return false;
      const allCoords = [];
      extractAllCoords(rw.coordinates, allCoords);
      for (let i = 0; i < allCoords.length; i++) {
        for (let j = i + 1; j < allCoords.length; j++) {
          const dist = turf.distance(
            turf.point(allCoords[i]),
            turf.point(allCoords[j]),
            { units: "kilometers" }
          );
          if (dist > 3) return false;
        }
      }
      return true;
    });

    const zones = [];
    for (const rw of roadworks) {
      if (
        !rw.coordinates ||
        !Array.isArray(rw.coordinates) ||
        rw.coordinates.length === 0
      )
        continue;

      const features = await roadworkToZone(rw);
      if (features && features.length) zones.push(...features);
    }

    const digitrafficZoneIds = await getPreviousDigitrafficZoneIds();
    const zoneService = new ZoneService();
    await zoneService.updateZones(zones, digitrafficZoneIds);
    console.log(
      `Deleted ${digitrafficZoneIds.length} previous digitraffic zones.`
    );
    console.log(`Imported ${zones.length} roadwork zones.`);
  } catch (err) {
    console.error("Error importing roadworks:", err);
  }
}

/**
 * Main loop: imports new zones every 5 minutes.
 */
async function loop() {
  while (true) {
    await importRoadworks();
    await new Promise((resolve) => setTimeout(resolve, 5 * 60 * 1000));
  }
}

loop();
