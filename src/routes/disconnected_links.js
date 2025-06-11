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

async function getCounty() {
  const rows = await databaseConnection`
    SELECT code, name FROM municipalities
  `;

  const result = {};
  for (const row of rows) {
    const intCode = parseInt(row.code, 10);
    if (!isNaN(intCode)) {
      result[intCode] = row.name;
    } else {
      console.warn(`Invalid code encountered: ${row.code}`);
    }
  }
  return result;
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
  const conties = await getCounty();

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
      const startNodeName = data[1];
      const startNodeLat = parseInt(data[2]);
      const startNodeLon = parseInt(data[3]);
      const endNodeId = parseInt(data[4]);
      const endNodeName = data[5];
      const endNodeLat = parseInt(data[6]);
      const endNodeLon = parseInt(data[7]);
      const distance = parseFloat(data[8]);
      const city_code = parseInt(data[9]);

      const disconnection = {
        startNode: { id: startNodeId, way_name: startNodeName, lat: startNodeLat / 1e7, lon: startNodeLon / 1e7 },
        endNode: { id: endNodeId, way_name: endNodeName, lat: endNodeLat / 1e7, lon: endNodeLon / 1e7 },
        distance: distance,
        county: city_code,
        county_name: conties[city_code]
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
    writeUInt32(getTagValue(way.tags, "city_code", 0));
  }

  child.stdin.end();
}

disconnectedLinksRouter.post("/", async (req, res) => {
  const { minDist, maxDist, namesAreSame } = req.body;

  try {
    const nodes = await databaseConnection`
    SELECT *
    FROM disconnected_links
    WHERE distance >= ${minDist} AND distance <= ${maxDist}
    ${
      namesAreSame
        ? databaseConnection`AND start_node_name = end_node_name`
        : databaseConnection``
    }
  `;

    const data = [];
    for (let node of nodes) {
      let disconnection = {
        id: node.id,   // 🆔 
        startNode: {
          id: node.start_node,
          way_name: node.start_node_name,
          lat: node.start_node_lat,
          lon: node.start_node_lon
        },
        endNode: {
          id: node.end_node,
          way_name: node.end_node_name,
          lat: node.end_node_lat,
          lon: node.end_node_lon
        },
        distance: node.distance,
        county_name: node.county_name
      };
      data.push(disconnection);
    }

    res.json({ data: data });

  } catch (error) {
    console.error("Error fetching disconnected links:", error);
    res.status(500).json({
      message: "An error occurred while fetching disconnected links",
      error: error.message,
    });
  }
});

async function fetchDisconnectedLinks() {
  const nodes = await databaseConnection`
    SELECT * FROM disconnected_links
  `;

  if (nodes.length === 0) {
    console.log("Fetching disconnected links...");

    const timer = setInterval(() => {
      console.log("Still fetching disconnected links...");
    }, 1000);

    await new Promise(resolve => {
      getDisconnectedRoads(0.0, 60.0, false, async data => {
        const insertPromises = data.map(link => {
          return databaseConnection`
            INSERT INTO disconnected_links (
              start_node, start_node_name, start_node_lat, start_node_lon,
              end_node, end_node_name, end_node_lat, end_node_lon,
              distance, county_code, county_name
            ) VALUES (
              ${link.startNode.id}, ${link.startNode.way_name}, ${link.startNode.lat}, ${link.startNode.lon},
              ${link.endNode.id}, ${link.endNode.way_name}, ${link.endNode.lat}, ${link.endNode.lon},
              ${link.distance}, ${link.county}, ${link.county_name}
            )
          `;
        });

        await Promise.all(insertPromises);
        clearInterval(timer);
        console.log("Done fetching disconnected links.");
        resolve();
      });
    });

    return;
  }

  console.log("Disconnected links already fetched.");
}

disconnectedLinksRouter.patch("/:id", async (req, res) => {
  const discId     = Number(req.params.id);
  const { temp_road_id } = req.body;

  try {
    const result = await databaseConnection`
      UPDATE disconnected_links
      SET    temp_road_id = ${temp_road_id},
             updated_at   = NOW()
      WHERE  id = ${discId}
      RETURNING id, temp_road_id;
    `;
    console.log("RETURNING rows =", result);

    if (result.length === 0) {
      return res.status(404).json({ message: "Disconnection not found" });
    }

    res.json({ success: true, row: result[0] });
  } catch (err) {
    console.error("Error updating temp_road_id:", err);
    res.status(500).json({ message: "Failed to update", error: err.message });
  }
});

module.exports = { disconnectedLinksRouter, fetchDisconnectedLinks };