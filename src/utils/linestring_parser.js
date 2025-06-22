function parseAndValidateGeom(geom, allowPartial = false) {
  if (!geom) return false;
  if (typeof geom === 'string') {
    try {
      geom = JSON.parse(geom);
    } catch (e) {
      return false;
    }
  }
  if (typeof geom === 'object' && geom.type && Array.isArray(geom.coordinates)) {
    if (geom.type === 'LineString' && geom.coordinates.length >= 2) {
      const validCoords = geom.coordinates.filter(
        c => Array.isArray(c) && c.length === 2 && c.every(v => typeof v === 'number' && !isNaN(v))
      );
      if (allowPartial) {
        if (validCoords.length >= 1) {
          // Allow partial: send as-is (with NaNs)
          return JSON.stringify(geom);
        }
      } else {
        if (validCoords.length >= 2) {
          return JSON.stringify({ ...geom, coordinates: validCoords });
        }
      }
      return false;
    }
    return false;
  }
  return false;
}

module.exports = { parseAndValidateGeom };
