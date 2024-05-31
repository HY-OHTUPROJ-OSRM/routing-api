osrm-extract -p /opt/car.lua "$1"
osrm-contract "$1"
osrm-datastore "$1"
osrm-routed --shared-memory --algorithm ch & disown
