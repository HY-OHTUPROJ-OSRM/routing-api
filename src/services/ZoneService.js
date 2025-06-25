const { spawn } = require("child_process");
const { open, unlink } = require("fs").promises;

const ZoneRepository = require("../repositories/ZoneRepository");
const calculateSegmentSpeeds = require("../utils/segment_speeds");
const { makeOutputReader } = require("../utils/process_utils");
const { ROUTE_DATA_PATH } = require("../utils/config");

// All modifications to this must be atomic at the level of JS execution!

class ZoneService {
  static affectedSegments = [];

  constructor(repository = new ZoneRepository()) {
    this.repository = repository;
  }

  static async init() {
    await new ZoneService().refreshBlockedSegments();
  }

  async getBlockedSegments() {
    return ZoneService.affectedSegments;
  }

  async getZones() {
    return await this.repository.getAll();
  }

  /**
   * Handles changing zones within a transaction.
   */
  async updateZones(addedZones, deletedZones) {
    await this.repository.beginTransaction();
    try {
      // OCC: deletedZones is array of {id, updated_at}
      const deleteIds = deletedZones.map((z) => z.id);
      const deleteUpdatedAts = deletedZones.map((z) => z.updated_at);
      const deleteResult = await this.repository.deleteBatch(deleteIds, deleteUpdatedAts);
      if (!deleteResult.success) {
        const err = new Error(
          `Conflict: Zone(s) with id(s) ${deleteResult.conflictIds.join(", ")} were modified by another user.`
        );
        err.code = "CONFLICT";
        throw err;
      }
      await this._createZones(addedZones);
      await this.repository.commitTransaction();
    } catch (error) {
      await this.repository.rollbackTransaction();
      if (error.code === "CONFLICT") throw error;
      throw error;
    }
  }

  async _createZones(newZones) {
    // Avoid mutating input
    for (const zone of newZones) {
      const zoneCopy = JSON.parse(JSON.stringify(zone));
      delete zoneCopy.properties.id;
      await this.repository.create(zoneCopy);
    }

    console.log(`${newZones ? newZones.length : 0} zones created`);

    await this.refreshBlockedSegments();
  }

  async refreshBlockedSegments() {
    process.stdout.write("fetching all paths overlapping zones...");
    const paths = await this.repository.getPathsOverlappingZones();
    console.log(" done");

    process.stdout.write("fetching all current zones...");
    const zoneFC = await this.repository.getAll();
    console.log(" done");

    let roadblockPolygons = [];
    let speedzonePolygons = [];

    for (const feature of zoneFC.features) {
      const type = feature.properties.type;
      const verts = feature.geometry.coordinates[0];
      verts.pop(); // remove the duplicate vertex at the end

      if (type === "roadblock") {
        roadblockPolygons.push({ verts: verts });
      } else {
        speedzonePolygons.push({
          verts: verts,
          type: type,
          effectValue: feature.properties.effect_value,
        });
      }
    }

    process.stdout.write("calculating segments speeds...");

    let newSegments = await calculateSegmentSpeeds(roadblockPolygons, [], speedzonePolygons, paths);

    console.log(" done");

    let lines = [];

    // Restore the original speeds for segments that
    // were affected previously but not anymore.
    for (const segment of ZoneService.affectedSegments) {
      const startID = segment.start.id;
      const endID = segment.end.id;

      if (!newSegments.has(`${startID};${endID}`)) {
        lines.push(`${startID},${endID},${segment.originalSpeed}`);
        lines.push(`${endID},${startID},${segment.originalSpeed}`);
      }
    }

    ZoneService.affectedSegments = Array.from(newSegments.values());

    // Set speeds for new segments
    for (const segment of ZoneService.affectedSegments) {
      const startID = segment.start.id;
      const endID = segment.end.id;

      lines.push(`${startID},${endID},${segment.currentSpeed}`);
      lines.push(`${endID},${startID},${segment.currentSpeed}`);
    }

    await this.writeCSV(lines.join("\n"));
  }

  async createZones(zones) {
    await this.updateZones(zones, []);
  }

  async deleteZone(id, expectedUpdatedAt) {
    await this.repository.beginTransaction();
    try {
      const deleted = await this.repository.delete([parseInt(id)], expectedUpdatedAt);
      if (!deleted) {
        const err = new Error("Conflict: The resource was modified by another user.");
        err.code = "CONFLICT";
        throw err;
      }
      await this.repository.commitTransaction();
      // Update blocked segments after deletion
      await this.refreshBlockedSegments();
    } catch (error) {
      await this.repository.rollbackTransaction();
      if (error.code === "CONFLICT") throw error;
      throw error;
    }
  }

  async writeCSV(csv) {
    const filename = "/tmp/routing-api-segments.csv";
    const file = await open(filename, "w");
    await file.write(csv);
    await file.close();

    console.log("wrote CSV file");

    const contract = spawn("osrm-contract", ["--segment-speed-file", filename, ROUTE_DATA_PATH]);

    contract.stdout.on("data", makeOutputReader("osrm-contract", process.stdout));
    contract.stderr.on("data", makeOutputReader("osrm-contract", process.stderr));

    return new Promise((resolve, reject) => {
      contract.on("exit", (code, signal) => {
        unlink(filename);

        if (code != 0) {
          reject();
          return;
        }

        const datastore = spawn("osrm-datastore", [ROUTE_DATA_PATH]);

        datastore.stdout.on("data", makeOutputReader("osrm-datastore", process.stdout));
        datastore.stderr.on("data", makeOutputReader("osrm-datastore", process.stderr));

        datastore.on("exit", (code, signal) => {
          if (code != 0) {
            reject();
            return;
          }

          resolve();
        });
      });
    });
  }
}

module.exports = ZoneService;
