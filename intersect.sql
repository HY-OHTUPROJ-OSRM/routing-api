select
    osm_id,
    name,
    nodes,
    ST_AsText(clip)
from (
    select
        osm_id,
        name,
        (ST_Dump(ST_Intersection(l.way, z.geom))).geom clip
    from planet_osm_line as l, zones as z
)
inner join planet_osm_ways on osm_id=id where ST_Dimension(clip)=1;
