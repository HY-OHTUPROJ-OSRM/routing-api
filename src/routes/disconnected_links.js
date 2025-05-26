const { Router } = require("express");
const databaseConnection = require("../utils/database");
const disconnectedLinksRouter = Router();

async function getDisconnectedRoads(minDistance, maxDistance, namesAreSame) {
  const res = await databaseConnection`
    WITH road_endpoints AS (
      SELECT
        osm_id,
        COALESCE(NULLIF(name, ''), '(unnamed)') AS name,
        ST_StartPoint(way) AS start_pt,
        ST_EndPoint(way) AS end_pt,
        way
      FROM planet_osm_roads
      WHERE way IS NOT NULL
    ),

    candidate_pairs AS (
      SELECT
        a.osm_id AS osm_id_a,
        a.name AS name_a,
        b.osm_id AS osm_id_b,
        b.name AS name_b,

        ST_Distance(ST_Transform(a.start_pt, 4326)::geography, ST_Transform(b.start_pt, 4326)::geography) AS dist_ss,
        ST_Distance(ST_Transform(a.start_pt, 4326)::geography, ST_Transform(b.end_pt, 4326)::geography) AS dist_se,
        ST_Distance(ST_Transform(a.end_pt, 4326)::geography, ST_Transform(b.start_pt, 4326)::geography) AS dist_es,
        ST_Distance(ST_Transform(a.end_pt, 4326)::geography, ST_Transform(b.end_pt, 4326)::geography) AS dist_ee,

        a.start_pt AS a_start,
        a.end_pt AS a_end,
        b.start_pt AS b_start,
        b.end_pt AS b_end

      FROM road_endpoints a
      JOIN road_endpoints b ON a.osm_id < b.osm_id
      WHERE NOT ST_Touches(a.way, b.way)
      AND a.osm_id < 10000
      AND b.osm_id < 10000
    ),

    min_distance_points AS (
      SELECT
        osm_id_a,
        name_a,
        osm_id_b,
        name_b,
        LEAST(dist_ss, dist_se, dist_es, dist_ee) AS min_endpoint_distance,

        CASE
          WHEN dist_ss = LEAST(dist_ss, dist_se, dist_es, dist_ee) THEN ST_X(ST_Transform(a_start, 4326))
          WHEN dist_se = LEAST(dist_ss, dist_se, dist_es, dist_ee) THEN ST_X(ST_Transform(a_start, 4326))
          WHEN dist_es = LEAST(dist_ss, dist_se, dist_es, dist_ee) THEN ST_X(ST_Transform(a_end, 4326))
          WHEN dist_ee = LEAST(dist_ss, dist_se, dist_es, dist_ee) THEN ST_X(ST_Transform(a_end, 4326))
        END AS a_closest_lon,

        CASE
          WHEN dist_ss = LEAST(dist_ss, dist_se, dist_es, dist_ee) THEN ST_Y(ST_Transform(a_start, 4326))
          WHEN dist_se = LEAST(dist_ss, dist_se, dist_es, dist_ee) THEN ST_Y(ST_Transform(a_start, 4326))
          WHEN dist_es = LEAST(dist_ss, dist_se, dist_es, dist_ee) THEN ST_Y(ST_Transform(a_end, 4326))
          WHEN dist_ee = LEAST(dist_ss, dist_se, dist_es, dist_ee) THEN ST_Y(ST_Transform(a_end, 4326))
        END AS a_closest_lat,

        CASE
          WHEN dist_ss = LEAST(dist_ss, dist_se, dist_es, dist_ee) THEN ST_X(ST_Transform(b_start, 4326))
          WHEN dist_se = LEAST(dist_ss, dist_se, dist_es, dist_ee) THEN ST_X(ST_Transform(b_end, 4326))
          WHEN dist_es = LEAST(dist_ss, dist_se, dist_es, dist_ee) THEN ST_X(ST_Transform(b_start, 4326))
          WHEN dist_ee = LEAST(dist_ss, dist_se, dist_es, dist_ee) THEN ST_X(ST_Transform(b_end, 4326))
        END AS b_closest_lon,

        CASE
          WHEN dist_ss = LEAST(dist_ss, dist_se, dist_es, dist_ee) THEN ST_Y(ST_Transform(b_start, 4326))
          WHEN dist_se = LEAST(dist_ss, dist_se, dist_es, dist_ee) THEN ST_Y(ST_Transform(b_end, 4326))
          WHEN dist_es = LEAST(dist_ss, dist_se, dist_es, dist_ee) THEN ST_Y(ST_Transform(b_start, 4326))
          WHEN dist_ee = LEAST(dist_ss, dist_se, dist_es, dist_ee) THEN ST_Y(ST_Transform(b_end, 4326))
        END AS b_closest_lat

      FROM candidate_pairs
    ),

    filtered_pairs AS (
      SELECT *
      FROM min_distance_points
      WHERE min_endpoint_distance BETWEEN ${minDistance} AND ${maxDistance}
        AND (
          (${namesAreSame} AND name_a = name_b)
          OR
          (NOT ${namesAreSame} AND name_a <> name_b)
        )
    )

    SELECT *
    FROM filtered_pairs
    ORDER BY min_endpoint_distance;
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
