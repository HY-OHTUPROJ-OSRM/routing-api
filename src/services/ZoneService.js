const { spawn } = require("child_process")
const { open, unlink } = require("fs/promises")

const ZoneRepository = require("../repositories/ZoneRepository")
const validator = require("../components/Validators")

const blockedSegments = new Set()

class ZoneService {
    static async getZones() {
        const zones = await ZoneRepository.getZones()
        return zones
    }

    static async createZones(featureCollection) {
        const errors = validator.valid(featureCollection, true)

        if (errors.length > 0) {
            throw Error(errors[0])
        }

        featureCollection.features.forEach(async (feature) => {
            await ZoneRepository.createZone(feature)
        })
    }

    /* zoneIds:        Array of the databse ids of the zones.
     * zoneGeometries: Array of arrays of latitude-longitude
     *                 pairs representing the geometries of
     *                 the zones (SRID 4326).
     * returns:        Array of pairs of node ids
     *                 corresponding to the overlapping road
     *                 segments. */
    static async waysOverlappingZone(zoneIds, zoneGeometries) {
        const paths = await ZoneRepository.getOverlappingPaths(zoneIds)

        const inputSize = 8 * (2
                + zoneGeometries.length + zoneGeometries.flat().length
                + paths.length + 2 * paths.flat().length)
        const input = Buffer.alloc(inputSize)
        let offset = 0

        const writeCount = (n) => {
            offset = input.writeBigInt64LE(BigInt(n), offset)
        }

        const writeNodeId = writeCount

        const writeVertex = (x, y) => {
            offset = input.writeInt32LE(x, offset)
            offset = input.writeInt32LE(y, offset)
        }

        /* Construct intersection program input.
         * https://github.com/HY-OHTUPROJ-OSRM/osrm-project/wiki/Intersection-Algorithm */

        writeCount(zoneGeometries.length)
        writeCount(paths.length)

        /* Polygons */
        for (const polygon of zoneGeometries) {
            writeCount(polygon.length)

            for (const vert of polygon) {
                writeVertex(vert[0] * 10000000, vert[1] * 10000000)
            }
        }

        /* Paths. */
        for (const path of paths) {
            writeCount(path.length)

            for (const vert of path) {
                writeVertex(vert.lat, vert.lon)
            }

            for (const vert of path) {
                writeNodeId(vert.id)
            }
        }

        return new Promise((resolve, reject) => {
            const child = spawn("Polygonal-Intersections-CLI")
            const node_pairs = []

            child.stdout.on("readable", () => {
                for (let to_read = child.stdout.readableLength; to_read >= 16; to_read -= 16) {
                    const pair = [0, 0]
                    pair[0] = child.stdout.read(8).readInt32LE()
                    pair[1] = child.stdout.read(8).readInt32LE()
                    node_pairs.push(pair)
                }
            })

            child.stdout.on("end", () => {
                resolve(node_pairs)
            })

            child.stdin.end(input)
        })
    }

    static async blockSegments(segments) {
        for (const [a, b] of segments) {
            blockedSegments.add(a < b ? [a, b] : [b, a])
        }

        const csv = Array.from(blockedSegments)
            .map(([a, b]) => `${a},${b},0\n${b},${a},0`)
            .join("\n")

        const filename = "segments.csv"

        /* TODO What if the file already exists? */
        const file = await open(filename, "wx")
        await file.write(csv)
        await file.close()

        const contract = spawn("osrm-contract", ["--segment-speed-file", filename, "route-data.osrm"])

        const dump = (data) => {
        }

        contract.stdout.on("data", dump)
        contract.stderr.on("data", dump)

        return new Promise((resolve, reject) => {
            contract.on("exit", (code, signal) => {
                unlink(filename)

                if (code != 0) {
                    resolve(false)
                    return
                }

                const datastore = spawn("osrm-datastore", ["route-data.osrm"])

                datastore.stdout.on("data", dump)
                datastore.stderr.on("data", dump)

                datastore.on("exit", (code, signal) => {
                    resolve(code == 0)
                })
            })
        })
    }
}

module.exports = ZoneService
