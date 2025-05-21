const { spawn } = require("child_process");
const { open, unlink } = require("fs").promises;

const TempRoadRepository = require("../repositories/TempRoadRepository");
const { makeOutputReader } = require("../utils/process_utils");
const { ROUTE_DATA_PATH } = require("../utils/config");

// All modifications to this must be atomic at the level of JS execution!
let activeTempRoads = [];

class TempRoadService {
  constructor(repository = new TempRoadRepository()) {
    this.repository = repository;
  }

  static async init() {
    await new TempRoadService().updateTempRoads();
  }

  static async getActiveTempRoads() {
    return activeTempRoads;
  }

  async getAllTempRoads() {
    return await this.repository.getAll();
  }

  async getTempRoadById(id) {
    return await this.repository.getById(id);
  }

  async createTempRoad(data) {
    const newRoad = await this.repository.create(data);
    console.log(`New temporary road created with ID: ${newRoad.id}`);
    
    if (newRoad.status) {
      await this.updateTempRoads();
    }
    
    return newRoad;
  }

  async updateTempRoad(id, updates) {
    const updated = await this.repository.update(id, updates);
    console.log(`Temporary road with ID ${id} updated`);
    
    await this.updateTempRoads();
    return updated;
  }

  async deleteTempRoad(id) {
    await this.repository.delete(id);
    console.log(`Temporary road with ID ${id} deleted`);
    
    await this.updateTempRoads();
  }

  async toggleTempRoadActive(id) {
    const toggled = await this.repository.toggleActive(id);
    console.log(`Temporary road with ID ${id} toggled to status: ${toggled.status}`);
    
    await this.updateTempRoads();
    return toggled;
  }

  async updateTempRoads() {
    process.stdout.write("Fetching active temporary roads...");
    const allRoads = await this.repository.getAll();
    const activeRoads = allRoads.filter(road => road.status);
    console.log(` done - found ${activeRoads.length} active roads`);

    activeTempRoads = activeRoads;

    // Generate the CSV data for OSRM
    let lines = [];

    // Process all active temporary roads
    for (const road of activeRoads) {
      const startNodeId = road.start_node;
      const endNodeId = road.end_node;
      const speed = road.speed;

      // Add bidirectional connections
      lines.push(`${startNodeId},${endNodeId},${speed}`);
      lines.push(`${endNodeId},${startNodeId},${speed}`);
    }

    if (lines.length > 0) {
      await TempRoadService.writeCSV(lines.join('\n'));
    } else {
      console.log("No active temporary roads found, skipping OSRM update");
    }
  }

  static async writeCSV(csv) {
    const filename = "/tmp/routing-api-temp-roads.csv";
    const file = await open(filename, "w");
    await file.write(csv);
    await file.close();

    console.log("Wrote temporary roads CSV file");

    const contract = spawn("osrm-contract", ["--segment-speed-file", filename, ROUTE_DATA_PATH]);

    contract.stdout.on("data", makeOutputReader("osrm-contract", process.stdout));
    contract.stderr.on("data", makeOutputReader("osrm-contract", process.stderr));

    return new Promise((resolve, reject) => {
      contract.on("exit", (code, signal) => {
        unlink(filename);

        if (code != 0) {
          reject(new Error("osrm-contract failed"));
          return;
        }

        const datastore = spawn("osrm-datastore", [ROUTE_DATA_PATH]);

        datastore.stdout.on("data", makeOutputReader("osrm-datastore", process.stdout));
        datastore.stderr.on("data", makeOutputReader("osrm-datastore", process.stderr));

        datastore.on("exit", (code, signal) => {
          if (code != 0) {
            reject(new Error("osrm-datastore failed"));
            return;
          }

          console.log("Successfully updated routing data with temporary roads");
          resolve();
        });
      });
    });
  }

  // Add batch operations if needed
  async batchUpdateTempRoads(newRoads, deletedRoadIds) {
    // Create new roads
    for (const road of newRoads) {
      await this.repository.create(road);
    }
    console.log(`${newRoads ? newRoads.length : 0} temporary roads created`);

    // Delete roads
    for (const id of deletedRoadIds) {
      await this.repository.delete(id);
    }
    console.log(`${deletedRoadIds ? deletedRoadIds.length : 0} temporary roads deleted`);

    // Update the routing data
    await this.updateTempRoads();
  }
}

module.exports = TempRoadService;