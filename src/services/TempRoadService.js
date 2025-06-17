const { spawn } = require("child_process");
const { open, unlink } = require("fs").promises;
const TempRoadRepository = require("../repositories/TempRoadRepository");
const { makeOutputReader } = require("../utils/process_utils");
const { ROUTE_DATA_PATH } = require("../utils/config");
const NodeService = require("./NodeService");
const nodeService = new NodeService();

// (!) TEMPORARY BACKWARD COMPATIBILITY MIDDLEWARE FOR START/END NODE <-> GEOMETRY
async function legacyNodeToGeom(data) {
  // If start_node and end_node are present, convert to geom
  if (data.start_node && data.end_node && !data.geom) {
    const start = await nodeService.getNodeCoordinates(data.start_node);
    const end = await nodeService.getNodeCoordinates(data.end_node);
    if (start && end) {
      data.geom = {
        type: "LineString",
        coordinates: [
          [start.lng, start.lat],
          [end.lng, end.lat],
        ],
      };
    }
  }
  return data;
}

async function legacyGeomToNode(road) {
  // If geom exists, convert first/last coordinates to start_node/end_node
  if (
    road.geom &&
    road.geom.type === "LineString" &&
    Array.isArray(road.geom.coordinates)
  ) {
    const coords = road.geom.coordinates;
    if (coords.length >= 2) {
      const startCoord = coords[0];
      const endCoord = coords[coords.length - 1];
      // Find nearest node for each endpoint
      const startNode = await nodeService.getNearestNode(
        startCoord[1],
        startCoord[0]
      );
      const endNode = await nodeService.getNearestNode(endCoord[1], endCoord[0]);
      road.start_node = startNode ? startNode.nodeId : null;
      road.end_node = endNode ? endNode.nodeId : null;
    }
  }
  return road;
}
// (!) END TEMPORARY BACKWARD COMPATIBILITY MIDDLEWARE

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
    const roads = await this.repository.getAll();
    // (!) Add start_node/end_node to each road for front compatibility
    return Promise.all(roads.map(legacyGeomToNode));
  }

  async getTempRoadById(id) {
    const road = await this.repository.getById(id);
    return road ? legacyGeomToNode(road) : null;
  }

  async createTempRoad(data) {
    try {
      // (!) Convert start_node/end_node to geom if needed
      await legacyNodeToGeom(data);
      const newRoad = await this.repository.create(data);
      console.log(`New temporary road created with ID: ${newRoad.id}`);
      if (newRoad.status) {
        await this.updateTempRoads();
      }
      // (!) Add start_node/end_node for response
      return legacyGeomToNode(newRoad);
    } catch (err) {
      console.error("Failed to create temporary road:", err);
      throw err;
    }
  }

  async updateTempRoad(id, updates, expectedUpdatedAt) {
    try {
      const existing = await this.repository.getById(id);
      if (!existing) {
        throw new Error(`Temporary road with ID ${id} does not exist`);
      }
      // (!) Convert start_node/end_node to geom if needed
      await legacyNodeToGeom(updates);
      const updated = await this.repository.update(id, updates, expectedUpdatedAt);
      if (!updated) {
        const err = new Error("Conflict: The resource was modified by another user.");
        err.code = "CONFLICT";
        throw err;
      }
      console.log(`Temporary road with ID ${id} updated`);
      await this.updateTempRoads();
      // (!) Add start_node/end_node for response
      return legacyGeomToNode(updated);
    } catch (err) {
      if (err.code === "CONFLICT") throw err;
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
      // (!) Add start_node/end_node for response
      return legacyGeomToNode(toggled);
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
        // (!) Use geometry endpoints to get node ids for OSRM CSV
        if (
          road.geom &&
          road.geom.type === "LineString" &&
          Array.isArray(road.geom.coordinates)
        ) {
          const coords = road.geom.coordinates;
          if (coords.length >= 2) {
            const startNode = await nodeService.getNearestNode(
              coords[0][1],
              coords[0][0]
            );
            const endNode = await nodeService.getNearestNode(
              coords[coords.length - 1][1],
              coords[coords.length - 1][0]
            );
            if (startNode && endNode) {
              const speed = road.speed;
              lines.push(`${startNode.nodeId},${endNode.nodeId},${speed}`);
              lines.push(`${endNode.nodeId},${startNode.nodeId},${speed}`);
            }
          }
        }
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
      await Promise.all(
        newRoads.map(async (road) => this.createTempRoad(road))
      );
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
