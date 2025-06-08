function binaryWriter(stream) {
  return {
    writeUInt8: (n) => {
      const buffer = Buffer.alloc(1);
      buffer.writeUInt8(n);
      stream.write(buffer);
    },
    writeUInt16: (n) => {
      const buffer = Buffer.alloc(2);
      buffer.writeUInt16LE(n);
      stream.write(buffer);
    },
    writeUInt32: (n) => {
      const buffer = Buffer.alloc(4);
      buffer.writeUInt32LE(n);
      stream.write(buffer);
    },
    writeUInt64: (n) => {
      const buffer = Buffer.alloc(8);
      buffer.writeBigUInt64LE(BigInt(n));
      stream.write(buffer);
    },
    writeDouble: (x) => {
      const buffer = Buffer.alloc(8);
      buffer.writeDoubleLE(x);
      stream.write(buffer);
    },
    writeVertex: (x, y) => {
      const buffer = Buffer.alloc(8);
      buffer.writeInt32LE(x, 0);
      buffer.writeInt32LE(y, 4);
      stream.write(buffer);
    },
    writeString: (str) => {
      const lengthBuffer = Buffer.alloc(4);
      lengthBuffer.writeUInt32LE(Buffer.byteLength(str, 'utf8'), 0);
      stream.write(lengthBuffer);
      stream.write(str, 'utf8');
    }
  };
}
module.exports = binaryWriter;
