const DisconnectionsRepository = require("../repositories/DisconnectionsRepository");
const databaseConnection = require("../utils/database");
const path = require("path");
const { spawn } = require("child_process");

class DisconnectionsService {
  constructor(repository = new DisconnectionsRepository()) {
    this.repository = repository;
  }

  async getCounty() {
    const rows = await databaseConnection`
      SELECT code, name FROM municipalities
    `;
    const result = {};
    for (const row of rows) {
      const intCode = parseInt(row.code, 10);
      if (!isNaN(intCode)) {
        result[intCode] = row.name;
      }
    }
    return result;
  }

  getTagValue(tags, key, fallback) {
    for (let i = 0; i < tags.length; i += 2) {
      if (tags[i] === key) {
        return tags[i + 1] || fallback;
      }
    }
    return fallback;
  }

  async getNodeList() {
    return databaseConnection`SELECT * FROM planet_osm_nodes`;
  }

  async getWayList() {
    return databaseConnection`SELECT * FROM planet_osm_ways`;
  }

  async getDisconnectedRoads(minDistance, maxDistance, namesAreSame) {
    const nodes0 = await this.getNodeList();
    const ways = await this.getWayList();
    const conties = await this.getCounty();
    const exePath = path.resolve(__dirname, '../../drl/drl');
    const child = spawn(exePath);
    let buffer = "";
    return new Promise((resolve, reject) => {
      child.stdout.on('data', (data) => {
        buffer += data.toString();
      });
      child.stderr.on('data', (data) => {
        console.error(`C++ error: ${data}`);
      });
      child.on('error', (err) => {
        reject(err);
      });
      child.on('exit', (code) => {
        if (code !== 0) {
          return reject(new Error(`C++ process exited with code ${code}`));
        }
        let res = [];
        const lines = buffer.split('\n');
        for (let line of lines) {
          if (!line.trim()) continue;
          if (line.startsWith("::")) break;
          let data = line.split(',');
          if (data.length < 7) continue;
          const startNodeId = parseInt(data[0]);
          const startNodeName = data[1];
          const startNodeLat = parseInt(data[2]);
          const startNodeLon = parseInt(data[3]);
          const endNodeId = parseInt(data[4]);
          const endNodeName = data[5];
          const endNodeLat = parseInt(data[6]);
          const endNodeLon = parseInt(data[7]);
          const distance = parseFloat(data[8]);
          const city_code = parseInt(data[9]);
          const disconnection = {
            startNode: { id: startNodeId, way_name: startNodeName, lat: startNodeLat / 1e7, lon: startNodeLon / 1e7 },
            endNode: { id: endNodeId, way_name: endNodeName, lat: endNodeLat / 1e7, lon: endNodeLon / 1e7 },
            distance: distance,
            county: city_code,
            county_name: conties[city_code]
          };
          res.push(disconnection);
        }
        resolve(res);
      });
      const binaryWriter = require("../utils/binary_writer");
      const { writeUInt8, writeUInt32, writeDouble, writeString } = binaryWriter(child.stdin);
      writeDouble(minDistance);
      writeDouble(maxDistance);
      writeUInt8(namesAreSame ? 1 : 0);
      writeUInt32(nodes0.length);
      for (let node of nodes0) {
        writeUInt32(node.id);
        writeUInt32(node.lat);
        writeUInt32(node.lon);
      }
      writeUInt32(ways.length);
      for (let way of ways) {
        writeUInt32(way.id);
        writeUInt32(way.nodes.length);
        for (let id of way.nodes) {
          writeUInt32(id);
        }
        writeString(this.getTagValue(way.tags, "name", "(unnamed)"));
        writeString(this.getTagValue(way.tags, "highway", "unknown"));
        writeUInt32(this.getTagValue(way.tags, "city_code", 0));
      }
      child.stdin.end();
    });
  }

  async fetchDisconnectedLinks() {
    const nodes = await this.repository.getAllRaw();
    if (nodes.length === 0) {
      console.log("Fetching disconnected links...");
      const timer = setInterval(() => {
        console.log("Still fetching disconnected links...");
      }, 1000);
      const data = await this.getDisconnectedRoads(0.0, 60.0, false);
      await this.repository.insertMany(data);
      clearInterval(timer);
      console.log("Done fetching disconnected links.");
    } else {
      console.log("Disconnected links already fetched.");
    }
  }

  async fetchDisconnections() {
    await this.fetchDisconnectedLinks();
  }

  async getLinks(minDist, maxDist, namesAreSame, forceFetchAll) {
    if (forceFetchAll) {
      return this.getDisconnectedRoads(minDist, maxDist, namesAreSame);
    }
    const nodes = await this.repository.getAll(minDist, maxDist, namesAreSame);
    return nodes.map(node => ({
      id: node.id,
      temp_road_id: node.temp_road_id,
      hide_status: node.hide_status,
      startNode: {
        id: node.start_node,
        way_name: node.start_node_name,
        lat: node.start_node_lat,
        lon: node.start_node_lon
      },
      endNode: {
        id: node.end_node,
        way_name: node.end_node_name,
        lat: node.end_node_lat,
        lon: node.end_node_lon
      },
      distance: node.distance,
      county_name: node.county_name,
      updated_at: node.updated_at
    }));
  }

  async updateTempRoadId(id, temp_road_id, updated_at) {
    const result = await this.repository.updateTempRoadId(id, temp_road_id, updated_at);
    if (result.length === 0) {
      const err = new Error("Conflict: The resource was modified by another user.");
      err.code = "CONFLICT";
      throw err;
    }
    return result[0];
  }

  async toggleHideStatus(id, updated_at) {
    const result = await this.repository.toggleHideStatus(id, updated_at);
    if (result.length === 0) {
      const err = new Error("Conflict: The resource was modified by another user.");
      err.code = "CONFLICT";
      throw err;
    }
    return result[0];
  }
}

module.exports = DisconnectionsService;
