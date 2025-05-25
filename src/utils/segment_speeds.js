const { spawn } = require("child_process")
const binaryWriter = require("./binary_writer")

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
            const endID = buffer.readBigUInt64LE(0x08)
            const speed = buffer.readDoubleLE(0x10)

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
    const types = { offset: 0, factor: 1, cap: 2, constant: 3 }

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
module.exports = calculateSegmentSpeeds;