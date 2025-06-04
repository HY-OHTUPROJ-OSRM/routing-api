require('dotenv').config();

const DigitrafficService = require("../src/services/DigitrafficService");
const ZoneService = require("../src/services/ZoneService");
const turf = require("@turf/turf");

async function roadworkToZone(roadwork) {
  if (!roadwork.coordinates || !Array.isArray(roadwork.coordinates) || roadwork.coordinates.length === 0) return null;

  // 1. Flatten all coordinates into a single array of [lng, lat] points
  function flattenCoords(coords) {
    if (!Array.isArray(coords)) return [];
    if (typeof coords[0] === 'number') return [coords];
    return coords.flatMap(flattenCoords);
  }
  const points = flattenCoords(roadwork.coordinates);

  let polygon = null;
  if (points.length >= 3) {
    // Try to create a convex hull
    const fc = turf.featureCollection(points.map(pt => turf.point(pt)));
    polygon = turf.convex(fc);
  }
  if (!polygon) {
    // Fallback: buffer the centroid (always works, even for 1 point)
    const fc = turf.featureCollection(points.map(pt => turf.point(pt)));
    const centroid = turf.centroid(fc);
    polygon = turf.buffer(centroid, 0.02, { units: 'kilometers' }); // ~20m buffer
  }

  // Always return a valid polygon
  if (!polygon || polygon.geometry.type !== "Polygon") return null;

  const safe = (v, fallback = null) => (v === undefined || v === null ? fallback : v);
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
      type: "roadblock",
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

async function importRoadworks() {
  try {
    const roadworks = await DigitrafficService.fetchRoadWorks();
    // Take only the first 4, no municipality filtering
    const selectedRoadworks = roadworks.slice(0, 4);

    const zones = [];
    for (const rw of selectedRoadworks) {
      // Skip if coordinates are missing or invalid
      if (!rw.coordinates || !Array.isArray(rw.coordinates) || rw.coordinates.length === 0) continue;
      const zone = await roadworkToZone(rw);
      if (zone) zones.push(zone);
    }
    if (zones.length > 0) {
      const zoneService = new ZoneService();
      await zoneService.createZones(zones);
      console.log(`Imported ${zones.length} roadwork zones.`);
    } else {
      console.log("No roadwork zones to import.");
    }
  } catch (err) {
    console.error("Error importing roadworks:", err);
  }
}

async function loop() {
  while (true) {
    await importRoadworks();
    await new Promise((resolve) => setTimeout(resolve, 5 * 60 * 1000));
  }
}

loop();
