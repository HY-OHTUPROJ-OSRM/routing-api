const { spawn } = require("child_process")
const { open, unlink } = require("fs").promises

const ZoneRepository = require("../repositories/ZoneRepository")
const validator = require("../components/Validators")
const { makeOutputReader } = require("../utils/process_utils")

const blockedSegments = new Map()

function binaryWriter(stream) {
    const bufferSize = 512
    const buffer = Buffer.alloc(bufferSize)
    let numBytes = 0

    const flushIfFull = () => {
        if (numBytes >= bufferSize) {
            stream.write(buffer)
            numBytes = 0
        }
    }

    return {
        writeNumber: (n) => {
            numBytes = buffer.writeBigUInt64LE(BigInt(n), numBytes)
            flushIfFull()
        },
        writeVertex: (x, y) => {
            numBytes = buffer.writeInt32LE(x, numBytes)
            numBytes = buffer.writeInt32LE(y, numBytes)
            flushIfFull()
        },
        writeEnd: () => {
            stream.end(buffer.subarray(0, numBytes))
        }
    }
}

async function polygonalIntersections(paths, zoneGeometries) {
    const child = spawn("Polygonal-Intersections-CLI")
    const { writeNumber, writeVertex, writeEnd } = binaryWriter(child.stdin)
    const node_pairs = []
    const nodes = paths.map(path => path.nodes).reduce((merged, map) => new Map([...merged, ...map]), new Map())

    const result = new Promise((resolve, reject) => {
        child.stdout.on("end", () => {
            resolve(node_pairs)
        })
    })

    child.stdout.on("readable", () => {
        for (let to_read = child.stdout.readableLength; to_read >= 16; to_read -= 16) {
            const pair = [0, 0]

            const id0 = child.stdout.read(8).readInt32LE()
            const coord0 = nodes.get(String(id0))
            pair[0] = {
                id: id0,
                lat: coord0.lat / 10_000_000,
                lon: coord0.lon / 10_000_000
            }

            const id1 = child.stdout.read(8).readInt32LE()
            const coord1 = nodes.get(String(id1))
            pair[1] = {
                id: id1,
                lat: coord1.lat / 10_000_000,
                lon: coord1.lon / 10_000_000
            }

            node_pairs.push(pair)
        }
    })

    /* Write intersection program input.
     * https://github.com/HY-OHTUPROJ-OSRM/osrm-project/wiki/Intersection-Algorithm */

    writeNumber(zoneGeometries.length)
    writeNumber(paths.length)

    /* Polygons. */
    for (const polygon of zoneGeometries) {
        writeNumber(polygon.length)

        for (const vert of polygon) {
            writeVertex(vert[0] * 10_000_000, vert[1] * 10_000_000)
        }
    }

    /* Paths. */
    for (const path of paths) {
        nodesMap = path.nodes

        writeNumber(nodesMap.size)

        const nodes = nodesMap.entries()

        const visitedNodes = []

        for (const [id, coord] of nodes) {
            writeVertex(coord.lon, coord.lat)
            visitedNodes.push([id, coord])
        }

        for (const [id, coord] of visitedNodes) {
            writeNumber(id)
        }
    }

    writeEnd()

    return result
}

class ZoneService {
    static async init() {
        const fc = await ZoneRepository.getZones()

        for (const zone of fc.features) {
            const paths = await ZoneRepository.getOverlappingPaths([zone.properties.id])
            const overlappingSegments = await polygonalIntersections(paths, [zone.geometry.coordinates[0]])

            await ZoneService.blockSegments(zone.properties.id, overlappingSegments)
        }

        await ZoneService.updateblockedSegments()
    }

    static async getBlockedSegments() {
        const segments = new Set([])

        for (const zone of blockedSegments.values()) {
            zone.forEach((segment) => {
                segments.add(segment)
            })
        }

        return Array.from(segments)
    }

    static async getZones() {
        const zones = await ZoneRepository.getZones()
        return zones
    }

    static async changeZones(addZones, deleteZones) {
        await ZoneRepository.deleteZones(deleteZones)

        addZones.forEach((zone) => { delete zone.properties.id })

        deleteZones.forEach(id => blockedSegments.delete(Number(id)))

        const fc = {
            "type": "FeatureCollection",
            "features": addZones
        }

        await ZoneService.createZones(fc)
    }

    static async createZones(featureCollection) {
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

        await ZoneService.updateblockedSegments()
    }

    static async deleteZone(id) {
        id = Number(id)

        await ZoneRepository.deleteZone(id)

        blockedSegments.delete(id)

        await ZoneService.updateblockedSegments()
    }

    /* zoneIds:        Array of the databse ids of the zones.
     * zoneGeometries: Array of arrays of longitude-latitude
     *                 pairs representing the geometries of
     *                 the zones (SRID 4326).
     * returns:        Array of pairs of node ids
     *                 corresponding to the overlapping road
     *                 segments. */
    static async waysOverlappingZone(zoneIds, zoneGeometries) {
        const paths = await ZoneRepository.getOverlappingPaths(zoneIds)
        return await polygonalIntersections(paths, zoneGeometries)
    }

    static async waysOverlappingAnyZone() {
        const { paths, zones } = await ZoneRepository.getAllZonesAndOverlappingPaths()
        return await polygonalIntersections(paths, zones)
    }

    static async blockSegments(zoneID, segments) {
        if (!blockedSegments.has(zoneID)) {
            blockedSegments.set(zoneID, new Set())
        }

        const zoneSegments = blockedSegments.get(zoneID)

        for (const [a, b] of segments) {
            zoneSegments.add(a < b ? [a, b] : [b, a])
        }
    }

    static async updateblockedSegments() {
        let lines = []

        for (const zoneSegments of blockedSegments.values()) {
            for (const [a, b] of zoneSegments) {
                lines.push(`${a.id},${b.id},0\n${b.id},${a.id},0`)
            }
        }

        const csv = lines.join('\n')
        const filename = "segments.csv"

        /* TODO What if the file already exists? */
        const file = await open(filename, "wx")
        await file.write(csv)
        await file.close()

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
