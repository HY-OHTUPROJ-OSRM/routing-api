const validatePolygon = (name, type, coordinates) => {
    // Check if the name field exists and its length is between 1 and 30
    if (!data.name || typeof data.name !== 'string' || data.name.length < 1 || data.name.length > 30) {
        return { error: "Name must be a string between 1 and 30 characters long." };
    }

    // Check if the type field is either "roadblock" or "traffic"
    if (!['roadblock', 'traffic'].includes(data.type)) {
        return { error: "Type must be either 'roadblock' or 'traffic'." };
    }

    // Check if coordinates field is an array of objects with lat and lon
    if (!Array.isArray(data.coordinates)) {
        return { error: "Coordinates must be an array." };
    }

    // Validate each coordinate
    for (let cords of data.coordinates) {
        if (typeof cords.lat !== 'number' || typeof cords.lon !== 'number') {
            return { error: "Each coordinate must have numeric lat and lon." };
        }
        coord.lat = parseFloat(coord.lat.toFixed(3));
        coord.lon = parseFloat(coord.lon.toFixed(3));
    }

    // If all validations pass, return the validated data
    return { validatedData: data };
};

module.exports = validatePolygon;