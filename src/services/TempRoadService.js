const { spawn } = require("child_process");
const { open, unlink } = require("fs").promises;

const TempRoadRepository = require("../repositories/TempRoadRepository");
const { makeOutputReader } = require("../utils/process_utils");
const { ROUTE_DATA_PATH } = require("../utils/config");

class TempRoadService {
  static activeTempRoads = [];

  constructor(repository = new TempRoadRepository()) {
    this.repository = repository;
  }

  static async init() {
    await new TempRoadService().updateTempRoads();
  }

  static async getActiveTempRoads() {
    return TempRoadService.activeTempRoads;
  }

  async getAllTempRoads() {
    return this.repository.getAll();
  }

  async getTempRoadById(id) {
    return this.repository.getById(id);
  }

  async createTempRoad(data) {
    try {
      const newRoad = await this.repository.create(data);
      console.log(`New temporary road created with ID: ${newRoad.id}`);
      if (newRoad.status) {
        await this.updateTempRoads();
      }
      return newRoad;
    } catch (err) {
      console.error("Failed to create temporary road:", err);
      throw err;
    }
  }

  async updateTempRoad(id, updates) {
    try {
      const existing = await this.repository.getById(id);
      if (!existing) {
        throw new Error(`Temporary road with ID ${id} does not exist`);
      }
      const updated = await this.repository.update(id, updates);
      console.log(`Temporary road with ID ${id} updated`);
      await this.updateTempRoads();
      return updated;
    } catch (err) {
      console.error(`Failed to update temporary road with ID ${id}:`, err);
      throw err;
    }
  }

  async deleteTempRoad(id) {
    try {
      const road = await this.repository.getById(id);
      if (!road) {
        throw new Error(`Temporary road with ID ${id} does not exist`);
      }
      await this.repository.delete(id);
      console.log(`Temporary road with ID ${id} deleted`);
      await this.updateTempRoads();
    } catch (err) {
      console.error(`Failed to delete temporary road with ID ${id}:`, err);
      throw err;
    }
  }

  async toggleTempRoadActive(id) {
    try {
      const road = await this.repository.getById(id);
      if (!road) {
        throw new Error(`Temporary road with ID ${id} does not exist`);
      }
      const toggled = await this.repository.toggleActive(id);
      console.log(
        `Temporary road with ID ${id} toggled to status: ${toggled.status}`
      );
      await this.updateTempRoads();
      return toggled;
    } catch (err) {
      console.error(`Failed to toggle temporary road with ID ${id}:`, err);
      throw err;
    }
  }

  async updateTempRoads() {
    try {
      process.stdout.write("Fetching active temporary roads...");
      const allRoads = await this.repository.getAll();
      const activeRoads = allRoads.filter((road) => road.status);
      console.log(` done - found ${activeRoads.length} active roads`);

      TempRoadService.activeTempRoads = activeRoads;

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
        await TempRoadService.writeCSV(lines.join("\n"));
      } else {
        console.log("No active temporary roads found, skipping OSRM update");
      }
    } catch (err) {
      console.error("Failed to update temporary roads:", err);
      throw err;
    }
  }

  static async writeCSV(csv) {
    const filename = "/tmp/routing-api-temp-roads.csv";
    const file = await open(filename, "w");
    await file.write(csv);
    await file.close();

    console.log("Wrote temporary roads CSV file");

    const contract = spawn("osrm-contract", [
      "--segment-speed-file",
      filename,
      ROUTE_DATA_PATH,
    ]);

    contract.stdout.on(
      "data",
      makeOutputReader("osrm-contract", process.stdout)
    );
    contract.stderr.on(
      "data",
      makeOutputReader("osrm-contract", process.stderr)
    );

    return new Promise((resolve, reject) => {
      contract.on("exit", (code, signal) => {
        unlink(filename);

        if (code != 0) {
          reject(new Error("osrm-contract failed"));
          return;
        }

        const datastore = spawn("osrm-datastore", [ROUTE_DATA_PATH]);

        datastore.stdout.on(
          "data",
          makeOutputReader("osrm-datastore", process.stdout)
        );
        datastore.stderr.on(
          "data",
          makeOutputReader("osrm-datastore", process.stderr)
        );

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

  async batchUpdateTempRoads(newRoads, deletedRoadIds) {
    try {
      await Promise.all(newRoads.map((road) => this.repository.create(road)));
      console.log(`${newRoads ? newRoads.length : 0} temporary roads created`);

      await Promise.all(deletedRoadIds.map((id) => this.repository.delete(id)));
      console.log(
        `${deletedRoadIds ? deletedRoadIds.length : 0} temporary roads deleted`
      );

      await this.updateTempRoads();
    } catch (err) {
      console.error("Failed to batch update temporary roads:", err);
      throw err;
    }
  }
}

module.exports = TempRoadService;
