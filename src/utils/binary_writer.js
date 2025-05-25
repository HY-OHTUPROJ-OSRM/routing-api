function binaryWriter(stream) {
    return {
        writeUInt8: (n) => {
            const buffer = Buffer.alloc(1)
            buffer.writeUInt8(n)
            stream.write(buffer)
        },
        writeUInt16: (n) => {
            const buffer = Buffer.alloc(2)
            buffer.writeUInt16LE(n)
            stream.write(buffer)
        },
        writeUInt64: (n) => {
            const buffer = Buffer.alloc(8)
            buffer.writeBigUInt64LE(BigInt(n))
            stream.write(buffer)
        },
        writeDouble: (x) => {
            const buffer = Buffer.alloc(8)
            buffer.writeDoubleLE(x)
            stream.write(buffer)
        },
        writeVertex: (x, y) => {
            const buffer = Buffer.alloc(8)
            buffer.writeInt32LE(x, 0)
            buffer.writeInt32LE(y, 4)
            stream.write(buffer)
        }
    }
}
module.exports = binaryWriter