const fs = require("fs");
const path = require("path");

function parseVehicleConfig(callback) {
  const configPath = path.join(
    __dirname,
    "../../profiles/vehicle_class_config.lua"
  );
  fs.readFile(configPath, "utf8", (err, data) => {
    if (err) return callback(err);

    try {
      const weightMatch = data.match(
        /weight_classes\s*=\s*{([\s\S]*?)\n\s*}\s*,/m
      );
      const heightMatch = data.match(
        /height_classes\s*=\s*{([\s\S]*?)\n\s*}\s*\n/m
      );

      const parseClasses = (str) => {
        if (!str) return [];
        return Array.from(
          str.matchAll(
            /{\s*name\s*=\s*"([^"]+)"\s*,\s*cutoff\s*=\s*([0-9.]+)\s*}/g
          )
        ).map(([, name, cutoff]) => ({
          name,
          cutoff: Number(cutoff),
        }));
      };

      const result = {
        weight_classes: weightMatch ? parseClasses(weightMatch[1]) : [],
        height_classes: heightMatch ? parseClasses(heightMatch[1]) : [],
      };

      callback(null, result);
    } catch (e) {
      callback(e);
    }
  });
}

module.exports = { parseVehicleConfig };
