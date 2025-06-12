/**
 * Combines two OSRM route responses into a single continuous route by inserting a connecting step between them.
 *
 * - Takes two OSRM route responses (start→temp road start, temp road end→end) and a connecting road segment.
 * - Inserts a synthetic step for the connecting road, with geometry and timing based on provided distance and speed.
 * - Updates route and leg totals (distance, duration, summary, steps) to reflect the combined route.
 * - Returns a new OSRM response object, or null if either input response is invalid.
 *
 * @param {object} resp1 - OSRM response for the first route segment (start to temp road start).
 * @param {object} resp2 - OSRM response for the second route segment (temp road end to end).
 * @param {object} tempRoadStartCoord - Coordinates {lng, lat} for the start of the temporary road.
 * @param {object} tempRoadEndCoord - Coordinates {lng, lat} for the end of the temporary road.
 * @param {object} [connectingRoad] - Optional parameter with `speed` (km/h) and `distance` (km) for the connecting road.
 * @returns {object|null} Combined OSRM response object, or null if combination is not possible.
 */
function combineOSRMResponses(resp1, resp2, tempRoadStartCoord, tempRoadEndCoord, connectingRoad) {
  // Validate both responses contain usable routes
  if (resp1.code !== 'Ok' || resp2.code !== 'Ok' || !resp1.routes.length || !resp2.routes.length) {
    console.error("Cannot combine responses, one or both legs failed.", { code1: resp1.code, code2: resp2.code });
    return null;
  }

  const route1 = resp1.routes[0];
  const route2 = resp2.routes[0];
  const leg1 = route1.legs[0];
  const leg2 = route2.legs[0];

  // Create a step representing the connecting road between the two segments
  let connectingDistance = 0;
  let connectingDuration = 0;
  if (connectingRoad && typeof connectingRoad.distance === 'number' && typeof connectingRoad.speed === 'number') {
    // distance in km, speed in km/h, duration in seconds
    connectingDistance = connectingRoad.distance * 1000; // convert km to meters
    connectingDuration = (connectingRoad.distance / connectingRoad.speed) * 3600; // hours to seconds
  }
  const middleStep = {
    intersections: [{
      out: 0,
      entry: [true],
      bearings: [0],
      location: [tempRoadStartCoord.lng, tempRoadStartCoord.lat],
    }],
    driving_side: 'right',
    geometry: {
      type: 'LineString',
      // Straight line from connecting road start to end
      coordinates: [
        [tempRoadStartCoord.lng, tempRoadStartCoord.lat],
        [tempRoadEndCoord.lng, tempRoadEndCoord.lat],
      ],
    },
    maneuver: {
      // Maneuver at the start of the connecting road
      location: [tempRoadStartCoord.lng, tempRoadStartCoord.lat],
      bearing_before: leg1.steps[leg1.steps.length - 2]?.maneuver.bearing_after || 0,
      bearing_after: leg2.steps[1]?.maneuver.bearing_before || 0,
      type: 'continue',
      modifier: 'straight',
    },
    name: 'Connecting Road',
    mode: 'driving',
    weight: 0,
    duration: connectingDuration,
    distance: connectingDistance,
  };

  // Combine steps: all but last from leg1, the middle step, all but first from leg2
  const combinedSteps = [
    ...leg1.steps.slice(0, -1),
    middleStep,
    ...leg2.steps.slice(1),
  ];

  // Clone the first response to use as a template for the combined result
  const combinedResponse = JSON.parse(JSON.stringify(resp1));
  const combinedRoute = combinedResponse.routes[0];
  const combinedLeg = combinedRoute.legs[0];

  // Update route totals (distance, duration, weight)
  combinedRoute.distance = route1.distance + route2.distance + connectingDistance;
  combinedRoute.duration = route1.duration + route2.duration + connectingDuration;
  combinedRoute.weight = route1.weight + route2.weight;

  // Update leg totals and summary
  combinedLeg.distance = leg1.distance + leg2.distance + connectingDistance;
  combinedLeg.duration = leg1.duration + leg2.duration + connectingDuration;
  combinedLeg.weight = leg1.weight + leg2.weight;
  combinedLeg.summary = `${leg1.summary}, Connecting Road, ${leg2.summary}`;

  // Replace steps with the combined steps
  combinedLeg.steps = combinedSteps;
  
  // Set waypoints to original start and final destination
  combinedResponse.waypoints = [
      resp1.waypoints[0],
      resp2.waypoints[1],
  ];

  return combinedResponse;
}

module.exports = { combineOSRMResponses };