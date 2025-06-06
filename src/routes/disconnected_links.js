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

async function getDisconnectedRoads(minDistance, maxDistance, namesAreSame) {
  const nodes0 = await getNodeList();
  const nodes = {};
  for (let node of nodes0) {
    nodes[node.id] = node;
  }
  const ways = await getWayList();

  //console.log(nodes);
  //console.log(ways);

  const nodeCount = {};

  for (let way of ways) {
    const nameIndex = way.tags.indexOf('name');
    const nameValue = nameIndex !== -1 ? way.tags[nameIndex + 1] : "(unnamed)";
    way.name = nameValue;
    //if (way.nodes.length < 2) console.log("only 1");
    let startNodeId = way.nodes[0];
    let startPointNode = nodes[startNodeId];
    //startPoint = { lat: startPoint.lat, lon: startPoint.lon };
    let startPoint = startPointNode.lat + "," + startPointNode.lon;
    let endNodeId = way.nodes[way.nodes.length - 1];
    let endPointNode = nodes[endNodeId];
    //endPoint = { lat: endPoint.lat, lon: endPoint.lon };
    let endPoint = endPointNode.lat + "," + endPointNode.lon;
    //console.log(startPoint + " " + endPoint);

    let startNodeData = nodeCount[startPoint];
    if (!startNodeData) {
      startNodeData = { node: startPointNode, count: 0, way: way };
      nodeCount[startPoint] = startNodeData;
    }
    startNodeData.count += 1;

    let endNodeData = nodeCount[endPoint];
    if (!endNodeData) {
      endNodeData = { node: endPointNode, count: 0, way: way };
      nodeCount[endPoint] = endNodeData;
    }
    endNodeData.count += 1;
  }

  let res = [];

  let progress = 0;
  let total = Object.keys(nodeCount).length;
  for (let id in nodeCount) {
    let data = nodeCount[id];
    if (data.count > 1)
      continue;
    //console.log(data);

    let way0 = data.way;
    let lat0 = data.node.lat;
    let lon0 = data.node.lon;

    for (let way of ways) {
      if (way0.id == way.id) continue;
      if (namesAreSame && way0.name != way.name) continue;
      for (let id of way.nodes) {
        if (id == data.node.id) continue;
        let node = nodes[id];
        let lat1 = node.lat;
        let lon1 = node.lon;

        let distance = haversineDistance(lat0 / 1e7, lon0 / 1e7, lat1 / 1e7, lon1 / 1e7);
        if (distance < minDistance || distance > maxDistance) continue;
        console.log(distance + " " + lat0 + " " + lon0 + " " + lat1 + " " + lat1 + " " + data.node.id + " " + node.id);
        let disconnection = {
          startNode: { id: data.node.id, lat: lat0 / 1e7, lon: lon0 / 1e7 },
          endNode: { id: node.id, lat: lat1 / 1e7, lon: lon1 / 1e7 },
        };
        res.push(disconnection);
      }
    }
    ++progress;
    console.log("progress " + progress + "/" + total);
    if (progress == 400) break;
  }

  console.log(res);
  console.log("done!");

  return res;

  /*const sameNameFilter = namesAreSame
    ? databaseConnection`AND a.name = b.name`
    : databaseConnection``;

  return databaseConnection`
    WITH endpoints AS (
      SELECT osm_id,
             COALESCE(NULLIF(name, ''), '(unnamed)') AS name,
             ST_StartPoint(way) AS pt
        FROM planet_osm_roads WHERE way IS NOT NULL
      UNION ALL
      SELECT osm_id,
             COALESCE(NULLIF(name, ''), '(unnamed)'),
             ST_EndPoint(way)
        FROM planet_osm_roads WHERE way IS NOT NULL
    ),
    node_degree AS (
      SELECT pt, COUNT(*) AS deg
        FROM endpoints
       GROUP BY pt
    ),
    dead_ends AS (
      SELECT e.osm_id, e.name, e.pt
        FROM endpoints e
        JOIN node_degree d USING (pt)
       WHERE d.deg <= 1          -- node's deg ≤ 1 
    )
    SELECT
      a.osm_id                                  AS osm_id_a,
      a.name                                    AS name_a,
      b.osm_id                                  AS osm_id_b,
      b.name                                    AS name_b,
      ST_X(ST_Transform(a.pt, 4326))            AS a_lng,
      ST_Y(ST_Transform(a.pt, 4326))            AS a_lat,
      ST_X(ST_Transform(b.pt, 4326))            AS b_lng,
      ST_Y(ST_Transform(b.pt, 4326))            AS b_lat,
      ST_Distance(a.pt, b.pt)                   AS distance
      --  (voit vaihtaa ST_Distance → ST_Length(ST_MakeLine(a.pt,b.pt)))
    FROM dead_ends a
    JOIN dead_ends b
         ON a.osm_id <> b.osm_id
        AND ST_DWithin(a.pt, b.pt, ${maxDistance})
        AND ST_Distance(a.pt, b.pt) >= ${minDistance}
        ${sameNameFilter}
    WHERE NOT EXISTS (                          -- sus disconnected nodes
            SELECT 1
              FROM planet_osm_roads r
             WHERE (ST_StartPoint(r.way)=a.pt OR ST_EndPoint(r.way)=a.pt)
               AND (ST_StartPoint(r.way)=b.pt OR ST_EndPoint(r.way)=b.pt)
          )
    ORDER BY distance;
  `;
  */
}

disconnectedLinksRouter.post("/", async (req, res) => {
  const { minDist, maxDist, namesAreSame } = req.body;

  try {
    //console.log("min_dist", minDist);
    //console.log("max_dist", maxDist);
    //onsole.log("names_are_same", namesAreSame);
    const data = await getDisconnectedRoads(minDist, maxDist, namesAreSame);
    //console.log("data", data);
    res.json({ data: data });
  } catch (error) {
    console.error("Error fetching disconnected links:", error);
    res.status(500).json({
      message: "An error occurred while fetching disconnected links",
      error: error.message,
    });
  }
});

function test() {
  getDisconnectedRoads(0, 6, true);
}

function haversineDistance(lat1, lon1, lat2, lon2) {
  const toRadians = deg => deg * (Math.PI / 180);
  const R = 6371e3; // Earth radius in meters

  const φ1 = toRadians(lat1);
  const φ2 = toRadians(lat2);
  const Δφ = toRadians(lat2 - lat1);
  const Δλ = toRadians(lon2 - lon1);

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  const distance = R * c; // in meters
  return distance;
}


module.exports = { test, disconnectedLinksRouter };