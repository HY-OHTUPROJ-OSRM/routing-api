const fetch = require("node-fetch");

const STATIONS_URL = "https://tie.digitraffic.fi/api/tms/v1/stations";

const DATA_URL = (id) =>
  `https://tie.digitraffic.fi/api/tms/v1/stations/${id}/data`;

const ROAD_WORKS_URL =
  "https://tie.digitraffic.fi/api/traffic-message/v1/messages?inactiveHours=0&includeAreaGeometry=false&situationType=ROAD_WORK";


class DigitrafficService {
  static async fetchStations() {
    const res = await fetch(STATIONS_URL, {
      headers: {
        "Accept-Encoding": "gzip", // Required by Digitraffic ?
      },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Failed to fetch stations: ${res.status}\n${text}`);
    }

    const data = await res.json();
    return data.features.map((station) => ({
      id: station.id,
      name: station.properties.name,
      roadNumber: station.properties.roadNumber,
      coordinates: station.geometry.coordinates,
    }));
  }

    static async fetchHelsinkiStations() {
    const all = await this.fetchStations();
    return all.filter(({ coordinates }) => {
        const [lon, lat] = coordinates;
        return (
        lat >= 60.15 && lat <= 60.30 &&
        lon >= 24.80 && lon <= 25.10
        );
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

  static async fetchRoadWorks() {
    const res = await fetch(ROAD_WORKS_URL, {
      headers: { "Accept-Encoding": "gzip" },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Failed to fetch road works: ${res.status}\n${text}`);
    }

    return await res.json();
  }

}

module.exports = DigitrafficService;
