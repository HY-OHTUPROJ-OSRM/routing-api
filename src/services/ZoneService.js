const { spawn } = require("child_process")
const { open, unlink } = require("fs").promises

const ZoneRepository = require("../repositories/ZoneRepository")
const validator = require("../components/Validators")
const { makeOutputReader } = require("../utils/process_utils")
const { PROFILES_PATH } = require("../utils/config")

function binaryWriter(stream) {
    return {
        writeUInt8: (n) => {
            buffer = Buffer.alloc(1)
            buffer.writeUInt8(n)
            stream.write(buffer)
        },
        writeUInt16: (n) => {
            buffer = Buffer.alloc(2)
            buffer.writeUInt16LE(n)
            stream.write(buffer)
        },
        writeUInt64: (n) => {
            buffer = Buffer.alloc(8)
            buffer.writeBigUInt64LE(BigInt(n))
            stream.write(buffer)
        },
        writeDouble: (x) => {
            buffer = Buffer.alloc(8)
            buffer.writeDoubleLE(x)
            stream.write(buffer)
        },
        writeVertex: (x, y) => {
            buffer = Buffer.alloc(8)
            buffer.writeInt32LE(x, 0)
            buffer.writeInt32LE(y, 4)
            stream.write(buffer)
        }
    }
}

async function calculateSegmentSpeeds(
    roadblockPolygons,
    roadblockPolylines,
    speedzonePolygons,
    paths
) {
    const child = spawn("Polygonal-Intersections-CLI")
    const { writeUInt8, writeUInt16, writeUInt64, writeDouble, writeVertex } = binaryWriter(child.stdin)
    const resultSegments = new Map()

    const result = new Promise((resolve, reject) => {
        child.stdout.on("end", () => {
            for (let [key, segment] of resultSegments) {
                if (segment.currentSpeed === null) {
                    resultSegments.delete(key);
                }
            }

            resolve(resultSegments)
        })
    })

    child.stdout.on("readable", () => {
        const size = 3 * 8;

        for (let to_read = child.stdout.readableLength; to_read >= size; to_read -= size) {

            let buffer = child.stdout.read(size)
            if (buffer === null) break

            const startID = buffer.readBigUInt64LE(0x00)
            const endID   = buffer.readBigUInt64LE(0x08)
            const speed   = buffer.readDoubleLE   (0x10)

            const key = `${startID};${endID}`
            resultSegments.get(key).currentSpeed = speed
        }
    })

    /* Write intersection program input.
     * https://github.com/HY-OHTUPROJ-OSRM/osrm-project/wiki/Intersection-Algorithm */

    // Header
    writeUInt64(roadblockPolygons.length) // Roadblock polygons
    writeUInt64(0) // Chain roadblocks
    writeUInt64(speedzonePolygons.length) // Speed zone polygons
    writeUInt64(paths.length) // Paths

    // Roadblock polygons
    for (const polygon of roadblockPolygons) {
        writeUInt64(polygon.verts.length)

        for (const vert of polygon.verts) {
            writeVertex(vert[0] * 10_000_000, vert[1] * 10_000_000)
        }
    }

    // See the enum in https://github.com/HY-OHTUPROJ-OSRM/Polygonal-Intersections/blob/dev/source/algorithm/traffic.h
    const types = {offset: 0, factor: 1, cap: 2, constant: 3}

    // Speed zone polygons
    for (const polygon of speedzonePolygons) {
        writeUInt8(types[polygon.type])
        writeDouble(polygon.effectValue)
        writeUInt64(polygon.verts.length)

        for (const vert of polygon.verts) {
            writeVertex(vert[0] * 10_000_000, vert[1] * 10_000_000)
        }
    }

    // Paths
    for (const path of paths) {
        nodesMap = path.nodes

        writeUInt16(path.speed)
        writeUInt64(nodesMap.size)

        let startID = null
        let startCoords = null

        for (const [endID, endCoords] of nodesMap) {
            if (startID !== null) {
                const key = `${startID};${endID}`

                resultSegments.set(key, {
                    start: {
                        id: startID,
                        lat: startCoords.lat / 10_000_000,
                        lon: startCoords.lon / 10_000_000
                    },
                    end: {
                        id: endID,
                        lat: endCoords.lat / 10_000_000,
                        lon: endCoords.lon / 10_000_000
                    },
                    originalSpeed: Number(path.speed),
                    currentSpeed: null
                })
            }

            writeUInt64(endID)
            writeVertex(endCoords.lon, endCoords.lat)

            startID = endID
            startCoords = endCoords
        }
    }

    return result
}

// All modifications to this must be atomic at the level of JS execution!
affectedSegments = []

class ZoneService {
    constructor(repository = new ZoneRepository()) {
        this.repository = repository
    }

    static async init() {
        await new ZoneService().updateBlockedSegments()
    }

    static async getBlockedSegments() {
        return affectedSegments;
    }

    async getZones() {
        return await this.repository.getZones()
    }

    async changeZones(newZones, deletedZones) {
        for (const zone of newZones) {
            delete zone.properties.id

            await this.repository.createZone(zone)
        }

        console.log(`${newZones ? newZones.length : 0} zones created`)

        await this.repository.deleteZones(deletedZones)

        console.log(`${deletedZones ? deletedZones.length : 0} zones deleted`)

        await this.updateBlockedSegments()
    }

    async updateBlockedSegments() {
        process.stdout.write("fetching all paths overlapping zones...")
        const paths = await this.repository.getPathsOverlappingZones()
        console.log(" done")

        if (!paths.length) {
            return
        }

        process.stdout.write("fetching all current zones...")
        const zoneFC = await this.repository.getZones()
        console.log(" done")

        let roadblockPolygons = []
        let speedzonePolygons = []

        for (const feature of zoneFC.features) {
            const type = feature.properties.type
            const verts = feature.geometry.coordinates[0]
            verts.pop() // remove the duplicate vertex at the end

            if (type === "roadblock") {
                roadblockPolygons.push({verts: verts})
            } else {
                speedzonePolygons.push({
                    verts: verts,
                    type: type,
                    effectValue: feature.properties.effect_value
                })
            }
        }

        process.stdout.write("calculating segments speeds...")

        let newSegments = await calculateSegmentSpeeds(
            roadblockPolygons,
            [],
            speedzonePolygons,
            paths
        )

        console.log(" done")

        let lines = []

        // Restore the original speeds for segments that
        // were affected previously but not anymore.
        for (const segment of affectedSegments) {
            const startID = segment.start.id
            const endID   = segment.end.id

            if (!newSegments.has(`${startID};${endID}`)) {
                lines.push(`${startID},${endID},${segment.originalSpeed}`)
                lines.push(`${endID},${startID},${segment.originalSpeed}`)
            }
        }

        affectedSegments = Array.from(newSegments.values())

        // Set speeds for new segments
        for (const segment of affectedSegments) {
            const startID = segment.start.id
            const endID   = segment.end.id

            lines.push(`${startID},${endID},${segment.currentSpeed}`)
            lines.push(`${endID},${startID},${segment.currentSpeed}`)
        }

        await ZoneService.writeCSV(lines.join('\n'))
    }

    async createZones(zones) {
        this.changeZones(zones, [])
    }

    static async deleteZone(id) {
        // no-op for now
    }

    static async writeCSV(csv) {
        const filename = "/tmp/routing-api-segments.csv"
        const file = await open(filename, "w")
        await file.write(csv)
        await file.close()

        console.log("wrote CSV file")

        const contract = spawn("osrm-contract", ["--segment-speed-file", filename, "route-data.osrm"])

        contract.stdout.on("data", makeOutputReader("osrm-contract", process.stdout))
        contract.stderr.on("data", makeOutputReader("osrm-contract", process.stderr))

        return new Promise((resolve, reject) => {
            contract.on("exit", (code, signal) => {
                unlink(filename)

                if (code != 0) {
                    reject()
                    return
                }

                const datastore = spawn("osrm-datastore", ["route-data.osrm"])

                datastore.stdout.on("data", makeOutputReader("osrm-datastore", process.stdout))
                datastore.stderr.on("data", makeOutputReader("osrm-datastore", process.stderr))

                datastore.on("exit", (code, signal) => {
                    if (code != 0) {
                        reject()
                        return
                    }

                    resolve()
                })
            })
        })
    }
}

module.exports = ZoneService
