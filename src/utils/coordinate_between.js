const turf = require("@turf/turf");

/**
 * Checks if point C (cx, cy) is between points A (ax, ay) and B (bx, by) on a straight line segment.
 * Optionally limits the maximum perpendicular distance from the segment (vertical axis) in kilometers.
 * @param {{lat: number, lng: number}} a - Start coordinate
 * @param {{lat: number, lng: number}} b - End coordinate
 * @param {{lat: number, lng: number}} c - Test coordinate
 * @param {number} [maxVerticalDistanceKm] - Optional. Max allowed perpendicular distance in kilometers.
 * @returns {boolean} True if C is between A and B (inclusive) and within maxVerticalDistanceKm if specified.
 */
function isCoordinateBetween(a, b, c, maxVerticalDistanceKm) {
  // Convert to vectors
  const ax = a.lat,
    ay = a.lng;
  const bx = b.lat,
    by = b.lng;
  const cx = c.lat,
    cy = c.lng;

  // Vector AB and AC
  const abx = bx - ax,
    aby = by - ay;
  const acx = cx - ax,
    acy = cy - ay;

  // Project AC onto AB, get the normalized t value
  const abLenSq = abx * abx + aby * aby;
  const dot = abx * acx + aby * acy;
  const t = abLenSq === 0 ? 0 : dot / abLenSq;

  // Check if projection falls within the segment and C is colinear with AB
  const isOnSegment = t >= 0 && t <= 1;
  // Check colinearity by cross product (should be close to 0)
  const cross = abx * acy - aby * acx;
  const epsilon = 1e-8;
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

  return isOnSegment && Math.abs(cross) < epsilon && isCloseEnough;
}

module.exports = { isCoordinateBetween };
