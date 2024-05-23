osrm-extract -p /opt/car.lua $1
osrm-contract $1
osrm-routed --algorithm ch $1 & disown
