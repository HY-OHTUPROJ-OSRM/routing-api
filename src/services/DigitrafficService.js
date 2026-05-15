const STATIONS_URL = "https://tie.digitraffic.fi/api/tms/v1/stations";

const DATA_URL = (id) => `https://tie.digitraffic.fi/api/tms/v1/stations/${id}/data`;

const ROAD_WORKS_URL =
  "https://tie.digitraffic.fi/api/traffic-message/v1/messages?inactiveHours=0&includeAreaGeometry=false&situationType=ROAD_WORK";

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const RATE_LIMIT_TTL_MS = 60 * 1000; // back off 1 min on 429
const cache = {};

function getCached(key) {
  const entry = cache[key];
  if (entry && Date.now() - entry.ts < CACHE_TTL_MS) return entry.data;
  return null;
}

function setCached(key, data) {
  cache[key] = { ts: Date.now(), data };
}

function isRateLimited(key) {
  const entry = cache[`rl:${key}`];
  return entry && Date.now() - entry.ts < RATE_LIMIT_TTL_MS;
}

function setRateLimited(key) {
  cache[`rl:${key}`] = { ts: Date.now() };
}

class DigitrafficService {
  static async fetchStations() {
    const cached = getCached("stations");
    if (cached) return cached;
    if (isRateLimited("stations")) return [];
    const res = await fetch(STATIONS_URL, {
      headers: {
        "Accept-Encoding": "gzip", // Required by Digitraffic ?
      },
    });

    if (res.status === 429) {
      setRateLimited("stations");
      return [];
    }
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Failed to fetch stations: ${res.status}\n${text}`);
    }

    const data = await res.json();
    const result = data.features.map((station) => ({
      id: station.id,
      name: station.properties.name,
      roadNumber: station.properties.roadNumber,
      coordinates: station.geometry.coordinates,
    }));
    setCached("stations", result);
    return result;
  }

  static async fetchHelsinkiStations() {
    const all = await this.fetchStations();
    return all.filter(({ coordinates }) => {
      const [lon, lat] = coordinates;
      return lat >= 60.15 && lat <= 60.3 && lon >= 24.8 && lon <= 25.1;
    });
  }

  static async fetchVolumeForStation(stationId) {
    const res = await fetch(DATA_URL(stationId), {
      headers: {
        "Accept-Encoding": "gzip", // Add it here too
      },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Failed to fetch volume for station ${stationId}: ${res.status}\n${text}`);
    }

    return await res.json();
  }
  /**
   * Fetches and filters road work data from Digitraffic API.
   *
   * Keeps only essential fields for each road work feature:
   * - id: situationId
   * - title: from announcements[0]
   * - roadName: from primaryPoint.roadName
   * - municipality: from primaryPoint.municipality
   * - startTime, endTime: from timeAndDuration
   * - severity: from first roadWorkPhase
   * - restrictions: type, name, quantity, unit (if available)
   * - coordinates: geometry.coordinates (for mapping)
   *
   * Filters out:
   * - Raw geometry type and metadata
   * - Multiple announcements and phases (uses first only)
   * - Nested contact info, location tables, working hours, etc.
   * - Sender, versioning, and unused descriptive fields
   */
  static async fetchRoadWorks() {
    const cached = getCached("roadworks");
    if (cached) return cached;
    if (isRateLimited("roadworks")) return [];
    const res = await fetch(ROAD_WORKS_URL, {
      headers: { "Accept-Encoding": "gzip" },
    });

    if (res.status === 429) {
      setRateLimited("roadworks");
      return [];
    }
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Failed to fetch road works: ${res.status}\n${text}`);
    }

    const data = await res.json();

    const result = data.features.map((feature) => {
      const announcement = feature.properties?.announcements?.[0];
      const phase = announcement?.roadWorkPhases?.[0];

      return {
        id: feature.properties?.situationId,
        title: announcement?.title,
        roadName: phase?.locationDetails?.roadAddressLocation?.primaryPoint?.roadName,
        municipality: phase?.locationDetails?.roadAddressLocation?.primaryPoint?.municipality,
        startTime: announcement?.timeAndDuration?.startTime,
        endTime: announcement?.timeAndDuration?.endTime,
        severity: phase?.severity,
        restrictions: phase?.restrictions?.map((r) => ({
          type: r.type,
          name: r.restriction?.name,
          value: r.restriction?.quantity,
          unit: r.restriction?.unit,
        })),
        coordinates: feature.geometry?.coordinates,
      };
    });
    setCached("roadworks", result);
    return result;
  }
}

module.exports = DigitrafficService;
