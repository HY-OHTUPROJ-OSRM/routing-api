const { spawn } = require("child_process")
const { open, unlink } = require("fs").promises

const ZoneRepository = require("../repositories/ZoneRepository")
const validator = require("../components/Validators")
const { makeOutputReader } = require("../utils/process_utils")
const { PROFILES_PATH } = require("../utils/config")

let blockedSegments = []

function binaryWriter(stream) {
    return {
        writeUInt64: (n) => {
            buffer = Buffer.alloc(8)
            buffer.writeBigUInt64LE(BigInt(n))
            stream.write(buffer)
        },
        writeUInt16: (n) => {
            buffer = Buffer.alloc(2)
            buffer.writeUInt16LE(n)
            stream.write(buffer)
        },
        writeVertex: (x, y) => {
            buffer = Buffer.alloc(8)
            buffer.writeInt32LE(x)
            buffer.writeInt32LE(y)
            stream.write(buffer)
        }
    }
}

async function calculateSegmentSpeeds(polygons, polylines, paths) {
    const child = spawn("Polygonal-Intersections-CLI")
    const { writeUInt64, writeUInt16, writeVertex } = binaryWriter(child.stdin)
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
    writeUInt64(polygons.length) // Polygon roadblocks
    writeUInt64(0) // Chain roadblocks
    writeUInt64(0) // Speed zones
    writeUInt64(paths.length) // Paths

    // Polygon roadblocks
    for (const polygon of polygons) {
        writeUInt64(polygon.length)

        for (const vert of polygon) {
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

class ZoneService {
    static async init() {
        await ZoneService.updateBlockedSegments()
    }

    static async getBlockedSegments() {
        return blockedSegments;
    }

    static async getZones() {
        return await ZoneRepository.getZones()
    }

    static async changeZones(newZones, deletedZones) {
        for (const zone of newZones) {
            delete zone.properties.id

            await ZoneRepository.createZone(zone)
        }

        console.log(`${newZones.length} zones created`)

        await ZoneRepository.deleteZones(deletedZones)

        console.log(`${deletedZones.length} zones deleted`)

        await ZoneService.updateBlockedSegments()
    }

    static async updateBlockedSegments() {
        process.stdout.write("fetching all current zones...")
        const zoneFC = await ZoneRepository.getZones()
        console.log(" done")

        process.stdout.write("fetching all paths overlapping zones...")
        const paths = await ZoneRepository.getPathsOverlappingZones()
        console.log(" done")

        let zones = []
        for (const feature of zoneFC.features) {
            zones.push(feature.geometry.coordinates[0])
        }

        // console.log("zones:")
        // console.log(zones)

        process.stdout.write("calculating segments speeds...")
        let newSegments = await calculateSegmentSpeeds(zones, [], paths)
        console.log(" done")

        let lines = []

        // Restore the original speeds for segments that
        // were affected previously but not anymore.
        for (const segment of blockedSegments) {
            const startID = segment.start.id
            const endID   = segment.end.id

            if (!newSegments.has(`${startID};${endID}`)) {
                lines.push(`${startID},${endID},${segment.originalSpeed}`)
                lines.push(`${endID},${startID},${segment.originalSpeed}`)
            }
        }

        blockedSegments = Array.from(newSegments.values())

        // Set speeds for new segments
        for (const segment of blockedSegments) {
            const startID = segment.start.id
            const endID   = segment.end.id

            lines.push(`${startID},${endID},${segment.currentSpeed}`)
            lines.push(`${endID},${startID},${segment.currentSpeed}`)
        }

        await ZoneService.writeCSV(lines.join('\n'))
    }

    static async createZones(zones) {
        changeZones(zones, [])

        /*
        const errors = validator.valid(featureCollection, true)

        if (errors.length > 0) {
            throw Error(errors[0])
        }

        const ids = []

        for (const feature of featureCollection.features) {
            ids.push(await ZoneRepository.createZone(feature))
        }

        if (ids.length == 0) {
            throw Error("No zone IDs returned")
        }

        const zoneGeometries = featureCollection.features.map(
            feature => feature.geometry.coordinates[0]
        )

        for (let i = 0; i < ids.length; ++i) {
            const overlappingSegments = await ZoneService.waysOverlappingZone([ids[i]], [zoneGeometries[i]])

            await ZoneService.blockSegments(ids[i], overlappingSegments)
        }

        await ZoneService.writeCSV()
        */
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
