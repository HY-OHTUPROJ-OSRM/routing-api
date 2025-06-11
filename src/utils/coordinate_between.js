const turf = require("@turf/turf");

/**
 * Returns true if point C is between points A and B on a straight line segment (with optional leeway and perpendicular distance).
 *
 * - Uses vector projection to check if C projects onto AB within the segment, allowing for leeway before/after the segment.
 * - Optionally restricts C to be within a maximum perpendicular distance from AB (in kilometers).
 *
 * @param {{lat: number, lng: number}} a - Start coordinate
 * @param {{lat: number, lng: number}} b - End coordinate
 * @param {{lat: number, lng: number}} c - Test coordinate
 * @param {number} [maxVerticalDistanceKm] - Optional. Max allowed perpendicular distance from AB in kilometers.
 * @param {number} [leewayKm] - Optional. Max allowed leeway before/after segment in kilometers. Default 0.
 * @returns {boolean} True if C is between A and B (inclusive), within maxVerticalDistanceKm if specified, and within leewayKm if specified.
 */
function isCoordinateBetween(a, b, c, maxVerticalDistanceKm, leewayKm = 0) {
  // Convert coordinates to vectors (lat, lng)
  const ax = a.lat,
    ay = a.lng;
  const bx = b.lat,
    by = b.lng;
  const cx = c.lat,
    cy = c.lng;

  // Vector math: AB and AC
  const abx = bx - ax,
    aby = by - ay;
  const acx = cx - ax,
    acy = cy - ay;

  // Project AC onto AB, get normalized t value (0=start, 1=end)
  const abLenSq = abx * abx + aby * aby;
  const dot = abx * acx + aby * acy;
  const t = abLenSq === 0 ? 0 : dot / abLenSq;

  // Calculate segment length in kilometers for leeway scaling
  const segmentLength = turf.distance([a.lng, a.lat], [b.lng, b.lat], { units: "kilometers" });
  const leewayFraction = segmentLength === 0 ? 0 : (leewayKm || 0) / segmentLength;

  // Check if projection falls within the segment, with leeway before/after
  const isOnSegment = t >= -leewayFraction && t <= 1 + leewayFraction;
  let isCloseEnough = true;

  if (typeof maxVerticalDistanceKm === "number") {
    // Use turf to calculate perpendicular distance from C to segment AB
    const line = turf.lineString([
      [a.lng, a.lat],
      [b.lng, b.lat],
    ]);
    const pt = turf.point([c.lng, c.lat]);
    const dist = turf.pointToLineDistance(pt, line, { units: "kilometers" });
    isCloseEnough = dist <= maxVerticalDistanceKm;
  }

  // Return true only if C is on segment (with leeway) and close enough (if specified)
  return isOnSegment && isCloseEnough;
}

module.exports = { isCoordinateBetween };
