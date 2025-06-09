const { Router } = require("express");
const databaseConnection = require("../utils/database");
const disconnectedLinksRouter = Router();

async function getNodeList() {
  const nodes = await databaseConnection`
    SELECT * FROM planet_osm_nodes
  `;
  return nodes;
}

async function getWayList() {
  const ways = await databaseConnection`
    SELECT * FROM planet_osm_ways
  `;
  return ways;
}

function getTagValue(tags, key, fallback) {
  for (let i = 0; i < tags.length; i += 2) {
    if (tags[i] === key) {
      return tags[i + 1] || fallback;
    }
  }
  return fallback;
}

async function getDisconnectedRoads(minDistance, maxDistance, namesAreSame, callback) {
  const nodes0 = await getNodeList();
  const ways = await getWayList();

  const path = require('path');
  const { spawn } = require('child_process');
  const exePath = path.resolve(__dirname, '../../drl/drl');
  const child = spawn(exePath);

  let buffer = "";
  child.stdout.on('data', (data) => {
    //console.log(`C++ output: ${data}`);
    buffer += data.toString();
  });

  child.stderr.on('data', (data) => {
    console.error(`C++ error: ${data}`);
  });

  child.on('error', (err) => {
    console.error(`Failed to start C++ process: ${err}`);
  });

  child.on('exit', (code) => {
    if (code !== 0) {
      console.error(`C++ process exited with code ${code}`);
      return;
    }

    let res = [];

    const lines = buffer.split('\n');
    for (let line of lines) {
      if (!line.trim()) continue; // skip empty lines
      if (line.startsWith("::")) break;

      let data = line.split(',');
      if (data.length < 7) continue; // skip malformed lines

      const startNodeId = parseInt(data[0]);
      const startNodeLat = parseInt(data[1]);
      const startNodeLon = parseInt(data[2]);
      const endNodeId = parseInt(data[3]);
      const endNodeLat = parseInt(data[4]);
      const endNodeLon = parseInt(data[5]);
      const distance = parseFloat(data[6]);

      //console.log(`Disconnection: ${startNodeId} (${startNodeLat}, ${startNodeLon}) to ${endNodeId} (${endNodeLat}, ${endNodeLon}) with distance ${distance}`);

      const disconnection = {
        startNode: { id: startNodeId, lat: startNodeLat / 1e7, lon: startNodeLon / 1e7 },
        endNode: { id: endNodeId, lat: endNodeLat / 1e7, lon: endNodeLon / 1e7 },
        distance,
      };
      res.push(disconnection);
    }

    callback(res);
  });

  const binaryWriter = require("../utils/binary_writer");
  const { writeUInt8, writeUInt32, writeDouble, writeString } = binaryWriter(child.stdin);

  writeDouble(minDistance);
  writeDouble(maxDistance);
  writeUInt8(namesAreSame ? 1 : 0);

  writeUInt32(nodes0.length);
  for (let node of nodes0) {
    writeUInt32(node.id);
    writeUInt32(node.lat);
    writeUInt32(node.lon);
  }

  writeUInt32(ways.length);
  for (let way of ways) {
    writeUInt32(way.id);
    writeUInt32(way.nodes.length);
    for (let id of way.nodes) {
      writeUInt32(id);
    }
    writeString(getTagValue(way.tags, "name", "(unnamed)"));
  }

  child.stdin.end();
}

disconnectedLinksRouter.post("/", async (req, res) => {
  const { minDist, maxDist, namesAreSame } = req.body;

  try {
    await getDisconnectedRoads(minDist, maxDist, namesAreSame, data => {
      res.json({ data: data });
    });
  } catch (error) {
    console.error("Error fetching disconnected links:", error);
    res.status(500).json({
      message: "An error occurred while fetching disconnected links",
      error: error.message,
    });
  }
});

module.exports = { disconnectedLinksRouter };