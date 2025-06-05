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
      // Locate the start of the 'classes' table definition
      const classesKeyIndex = data.indexOf("classes");
      if (classesKeyIndex === -1) {
        return callback(null, { classes: [] });
      }

      // Find the opening brace for the 'classes' table
      const firstBraceIndex = data.indexOf("{", classesKeyIndex);
      if (firstBraceIndex === -1) {
        return callback(null, { classes: [] });
      }

      // Find the matching closing brace for the 'classes' table
      let braceDepth = 1;
      let i = firstBraceIndex + 1;
      for (; i < data.length; i++) {
        const ch = data[i];
        if (ch === "{") {
          braceDepth++;
        } else if (ch === "}") {
          braceDepth--;
          if (braceDepth === 0) break;
        }
      }

      // Abort if the braces are unbalanced
      if (braceDepth !== 0) {
        return callback(
          new Error("Could not find matching closing brace for classes")
        );
      }

      // Extract the content inside the 'classes' table braces
      const inner = data.slice(firstBraceIndex + 1, i);

      // Split the content into individual class blocks (subtables)
      const eachBlock = Array.from(
        inner.matchAll(/{\s*([\s\S]*?)\s*}\s*,?/g)
      ).map((m) => m[1]);

      const classes = [];

      // Parse each class block for id, name, weight_cutoff, and height_cutoff
      eachBlock.forEach((blockText) => {
        const idMatch = blockText.match(/id\s*=\s*([0-9]+)/);
        const nameMatch = blockText.match(/name\s*=\s*"([^"]+)"/);
        const weightMatch = blockText.match(/weight_cutoff\s*=\s*([0-9.]+)/);
        const heightMatch = blockText.match(/height_cutoff\s*=\s*([0-9.]+)/);

        if (
          idMatch &&
          nameMatch &&
          weightMatch &&
          heightMatch
        ) {
          classes.push({
            id: Number(idMatch[1]),
            name: nameMatch[1],
            weight_cutoff: Number(weightMatch[1]),
            height_cutoff: Number(heightMatch[1]),
          });
        }
      });

      callback(null, { classes });
    } catch (parseErr) {
      callback(parseErr);
    }
  });
}

module.exports = { parseVehicleConfig };
