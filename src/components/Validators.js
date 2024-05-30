const gjv = require("geojson-validation")

gjv.define("Position", (position) => {
    const errors = []

    if (position[0] < -180 || position[0] > 180) {
        errors.push("Longitude must be between -180 and 180.")
    }

    if (position[1] < -90 || position[1] > 90) {
        errors.push("Latitude must be between -90 and 90.")
    }

    return errors
})

gjv.define("Feature", (feature) => {
    const errors = []

    if (feature.properties && feature.properties.name) {
        const fName = feature.properties.name

        if (typeof fName !== 'string' || fName.length < 1 || fName.length > 30) {
            errors.push("Name must be a string between 1 and 30 characters long.")
        }
    }

    if (feature.properties && feature.properties.type) {
        const type = feature.properties.type

        if (!["roadblock"].includes(type)) {
            errors.push("Unsupported zone type.")
        }
    }

    return errors
})

module.exports = gjv;
