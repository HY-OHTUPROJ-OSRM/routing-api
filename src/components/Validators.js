const gjv = require("geojson-validation");

const isValidLongitude = (lng) =>
  typeof lng === "number" && lng >= -180 && lng <= 180;
const isValidLatitude = (lat) =>
  typeof lat === "number" && lat >= -90 && lat <= 90;

gjv.define("Position", (position) => {
  const errors = [];
  if (!isValidLongitude(position[0])) {
    errors.push("Longitude must be between -180 and 180.");
  }
  if (!isValidLatitude(position[1])) {
    errors.push("Latitude must be between -90 and 90.");
  }
  return errors;
});

const VALID_TYPES = ["offset", "factor", "cap", "constant", "roadblock"];

gjv.define("Feature", (feature) => {
  const errors = [];
  const props = feature.properties || {};

  if ("name" in props) {
    const fName = props.name;
    if (typeof fName !== "string" || fName.length < 1 || fName.length > 30) {
      errors.push("Name must be a string between 1 and 30 characters long.");
    }
  }

  if ("type" in props) {
    if (!VALID_TYPES.includes(props.type)) {
      errors.push("Unsupported zone type.");
    }
  }

  return errors;
});

module.exports = gjv;
