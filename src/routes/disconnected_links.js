const { Router } = require("express");
const databaseConnection = require("../utils/database");
const disconnectedLinksRouter = Router();

async function getDisconnectedRoads(minDistance, maxDistance, namesAreSame) {
  const res = await databaseConnection`
    WITH endpoints AS (
      SELECT
        osm_id,
        COALESCE(NULLIF(name, ''), '(unnamed)') AS name,
        ST_StartPoint(way) AS pt
      FROM planet_osm_roads
      WHERE way IS NOT NULL
      UNION ALL
      SELECT
        osm_id,
        COALESCE(NULLIF(name, ''), '(unnamed)') AS name,
        ST_EndPoint(way) AS pt
      FROM planet_osm_roads
      WHERE way IS NOT NULL
    )
    SELECT
      e1.osm_id AS osm_id_1,
      e1.name AS name_1,
      e2.osm_id AS osm_id_2,
      e2.name AS name_2,
      ST_X(ST_Transform(e1.pt, 4326)) AS a_lng,
      ST_Y(ST_Transform(e1.pt, 4326)) AS a_lat,
      ST_X(ST_Transform(e2.pt, 4326)) AS b_lng,
      ST_Y(ST_Transform(e2.pt, 4326)) AS b_lat,
      ST_Distance(e1.pt, e2.pt) AS distance
    FROM endpoints e1
    JOIN endpoints e2
      ON e1.osm_id <> e2.osm_id
      AND ST_Distance(e1.pt, e2.pt) BETWEEN ${minDistance} AND ${maxDistance}
      AND e1.name = e2.name
    WHERE NOT EXISTS (
      SELECT 1
      FROM planet_osm_roads r
      WHERE r.osm_id IN (e1.osm_id, e2.osm_id)
        AND (ST_StartPoint(r.way) = e1.pt OR ST_EndPoint(r.way) = e1.pt)
        AND (ST_StartPoint(r.way) = e2.pt OR ST_EndPoint(r.way) = e2.pt)
    )
    ORDER BY distance;
  `;

  return res;
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

module.exports = disconnectedLinksRouter;
