const { Router } = require("express");
const databaseConnection = require("../utils/database");
const nodelistRouter = Router();

async function getNodeList() {
  const nodes = await databaseConnection`
    SELECT
      json_agg(
        json_build_object(
          'osm_id',   osm_id,
          'name',     name,
          'coordinates', coordinates
        )
      ) AS roads
    FROM (
      SELECT
        osm_id,
        COALESCE(NULLIF(name, ''), '(unnamed)') AS name,
        json_agg(
          json_build_array(
            ST_X(ST_Transform(geom, 4326)),
            ST_Y(ST_Transform(geom, 4326))
          )
          ORDER BY (dp).path[1]
        ) AS coordinates
      FROM (
        SELECT
          osm_id,
          name,
          ST_DumpPoints(way) AS dp,
          (ST_DumpPoints(way)).geom AS geom
        FROM planet_osm_roads
      ) t
      GROUP BY osm_id, name
    ) roads;
`; 
    return nodes[0].roads;
}

nodelistRouter.get("/", async (req, res) => {

  try {
    const data = await getNodeList();
    //console.log("data", data);
    res.json({ data: data });
  } catch (error) {
    console.error("Error list all nodes:", error);
    res.status(500).json({
      message: "An error occurred while list all nodes",
      error: error.message,
    });
  }
});

module.exports = nodelistRouter;
