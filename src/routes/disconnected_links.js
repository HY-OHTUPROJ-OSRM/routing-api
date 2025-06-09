const { Router } = require("express");
const databaseConnection = require("../utils/database");
const disconnectedLinksRouter = Router();

async function getDisconnectedRoads(minDistance, maxDistance, namesAreSame) {
  const sameNameFilter = namesAreSame
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
       WHERE d.deg <= 1
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
      ST_Distance(a.pt, b.pt)                   AS distance,
      na.id                                     AS node_id_a,
      nb.id                                     AS node_id_b
    FROM dead_ends a
    JOIN dead_ends b
        ON a.osm_id <> b.osm_id
        AND ST_DWithin(a.pt, b.pt, ${maxDistance})
        AND ST_Distance(a.pt, b.pt) >= ${minDistance}
        ${sameNameFilter}
    LEFT JOIN LATERAL (
      SELECT id
      FROM planet_osm_nodes
      ORDER BY ST_Distance(
        ST_SetSRID(ST_MakePoint(lon / 10000000.0, lat / 10000000.0), 4326),
        ST_Transform(a.pt, 4326)
      )
      LIMIT 1
    ) AS na ON TRUE
    LEFT JOIN LATERAL (
      SELECT id
      FROM planet_osm_nodes
      ORDER BY ST_Distance(
        ST_SetSRID(ST_MakePoint(lon / 10000000.0, lat / 10000000.0), 4326),
        ST_Transform(b.pt, 4326)
      )
      LIMIT 1
    ) AS nb ON TRUE
    WHERE NOT EXISTS (
            SELECT 1
              FROM planet_osm_roads r
             WHERE (ST_StartPoint(r.way)=a.pt OR ST_EndPoint(r.way)=a.pt)
               AND (ST_StartPoint(r.way)=b.pt OR ST_EndPoint(r.way)=b.pt)
          )
    ORDER BY distance;
  `;
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


