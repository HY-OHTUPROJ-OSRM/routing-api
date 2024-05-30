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

    static async waysOverlappingZone(zoneId, zoneVertices) {
        const paths = await ZoneRepository.getOverlappingPaths(zoneId)

        const inputSize = 8 * (3 + zoneVertices.length + paths.length + paths.flat().length * 2)
        const input = Buffer.alloc(inputSize)

        let offset = 0

        /* Construct intersection program input.
         * https://github.com/HY-OHTUPROJ-OSRM/osrm-project/wiki/Intersection-Algorithm */
        offset = input.writeBigInt64LE(BigInt(1), offset) /* Number of polygons. */
        offset = input.writeBigInt64LE(BigInt(paths.length), offset)
        offset = input.writeBigInt64LE(BigInt(zoneVertices.length), offset)

        /* Polygon vertices. */
        for (const vert of zoneVertices) {
            offset = input.writeInt32LE(vert[0], offset)
            offset = input.writeInt32LE(vert[1], offset)
        }

        /* Paths. */
        for (const path of paths) {
            offset = input.writeBigInt64LE(BigInt(path.length), offset)

            for (const vert of path) {
                offset = input.writeInt32LE(vert.lat, offset)
                offset = input.writeInt32LE(vert.lon, offset)
            }

            for (const vert of path) {
                offset = input.writeBigInt64LE(BigInt(vert.id), offset)
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
