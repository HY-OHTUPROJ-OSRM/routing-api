osrm-extract -p /opt/car.lua "./route-data.osm"
osrm-contract "./route-data.osm"
osrm-datastore "./route-data.osm"
osrm-routed --shared-memory --algorithm ch & disown
