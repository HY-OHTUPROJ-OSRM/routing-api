const { spawn } = require("child_process")

const ZoneRepository = require("../repositories/ZoneRepository")
const validator = require("../components/Validators")

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
                    pair[0] = child.stdout.read(8).readBigInt64LE()
                    pair[1] = child.stdout.read(8).readBigInt64LE()
                    node_pairs.push(pair)
                }
            })

            child.stdout.on("end", () => {
                resolve(node_pairs)
            })

            child.stdin.end(input)
        })
    }
}

module.exports = ZoneService
