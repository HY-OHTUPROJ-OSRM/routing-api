const TempRoadRepository = require("../repositories/TempRoadRepository");
const { parseAndValidateGeom } = require("../utils/linestring_parser");

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
    return roads;
  }

  async getTempRoadById(id) {
    const road = await this.repository.getById(id);
    return road;
  }

  async createTempRoad(data) {
    try {
      if (data.geom) {
        const parsedGeom = parseAndValidateGeom(data.geom);
        if (!parsedGeom) {
          throw new Error('Invalid geometry: Only valid LineString GeoJSON geometry is supported');
        }
        data.geom = parsedGeom;
      }
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

  async updateTempRoad(id, updates, expectedUpdatedAt) {
    try {
      const existing = await this.repository.getById(id);
      if (!existing) {
        throw new Error(`Temporary road with ID ${id} does not exist`);
      }
      if (Object.prototype.hasOwnProperty.call(updates, 'geom')) {
        if (updates.geom !== null && updates.geom !== undefined) {
          const parsedGeom = parseAndValidateGeom(updates.geom, true);
          if (!parsedGeom) {
            delete updates.geom;
          } else {
            updates.geom = parsedGeom;
          }
        } else {
          updates.geom = null;
        }
      }
      const updated = await this.repository.update(id, updates, expectedUpdatedAt);
      if (!updated) {
        const err = new Error("Conflict: The resource was modified by another user.");
        err.code = "CONFLICT";
        throw err;
      }
      console.log(`Temporary road with ID ${id} updated`);
      await this.updateTempRoads();
      return updated;
    } catch (err) {
      if (err.code === "CONFLICT") throw err;
      console.error(`Failed to update temporary road with ID ${id}:`, err);
      throw err;
    }
  }

  async deleteTempRoad(id, expectedUpdatedAt) {
    try {
      const road = await this.repository.getById(id);
      if (!road) {
        throw new Error(`Temporary road with ID ${id} does not exist`);
      }
      const deleted = await this.repository.delete(id, expectedUpdatedAt);
      if (!deleted) {
        const err = new Error("Conflict: The resource was modified by another user.");
        err.code = "CONFLICT";
        throw err;
      }
      console.log(`Temporary road with ID ${id} deleted`);
      if (road.status) {
        await this.updateTempRoads();
      }
    } catch (err) {
      if (err.code === "CONFLICT") throw err;
      console.error(`Failed to delete temporary road with ID ${id}:`, err);
      throw err;
    }
  }

  async toggleTempRoadActive(id, expectedUpdatedAt) {
    try {
      const road = await this.repository.getById(id);
      if (!road) {
        throw new Error(`Temporary road with ID ${id} does not exist`);
      }
      const toggled = await this.repository.toggleActive(id, expectedUpdatedAt);
      if (!toggled) {
        const err = new Error("Conflict: The resource was modified by another user.");
        err.code = "CONFLICT";
        throw err;
      }
      console.log(`Temporary road with ID ${id} toggled to status: ${toggled.status}`);
      await this.updateTempRoads();
      return toggled;
    } catch (err) {
      if (err.code === "CONFLICT") throw err;
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
    } catch (err) {
      console.error("Failed to update temporary roads:", err);
      throw err;
    }
  }

  async batchUpdateTempRoads(newRoads, deletedRoads) {
    try {
      await Promise.all(newRoads.map(async (road) => this.createTempRoad(road)));
      console.log(`${newRoads ? newRoads.length : 0} temporary roads created`);
      // deletedRoads should be array of objects: [{ id, updated_at }]
      await Promise.all(
        (deletedRoads || []).map(({ id, updated_at }) => this.repository.delete(id, updated_at))
      );
      console.log(`${deletedRoads ? deletedRoads.length : 0} temporary roads deleted`);
      await this.updateTempRoads();
    } catch (err) {
      console.error("Failed to batch update temporary roads:", err);
      throw err;
    }
  }
}

module.exports = TempRoadService;
