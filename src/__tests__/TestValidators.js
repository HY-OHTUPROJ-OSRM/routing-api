const gjv = require("../components/Validators");

describe("Validating GeoJSON", () => {
  it("works with valid GeoJSON", () => {
    const geojson = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [24.949942622, 60.176077896],
                [24.950739029, 60.176149528],
                [24.950569581, 60.17668044],
                [24.949679978, 60.176516111],
                [24.949942622, 60.176077896],
              ],
            ],
          },
          properties: {
            id: 1,
            type: "roadblock",
            name: "Tietyö",
          },
        },
      ],
    };

    expect(gjv.valid(geojson)).toBeTruthy();
  });

  it("fails with wrong type", () => {
    const geojson = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [24.949942622, 60.176077896],
                [24.950739029, 60.176149528],
                [24.950569581, 60.17668044],
                [24.949679978, 60.176516111],
                [24.949942622, 60.176077896],
              ],
            ],
          },
          properties: {
            id: 1,
            type: "asteroidcrater",
            name: "Crater",
          },
        },
      ],
    };

    expect(gjv.valid(geojson)).toBeFalsy();
  });

  it("fails with wrong coordinates", () => {
    const geojson = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [200, 60.176077896],
                [24.950739029, 60.176149528],
                [24.950569581, 60.17668044],
                [24.949679978, 60.176516111],
                [24.949942622, 60.176077896],
              ],
            ],
          },
          properties: {
            id: 1,
            type: "roadblock",
            name: "Tietyö",
          },
        },
      ],
    };

    expect(gjv.valid(geojson)).toBeFalsy();
  });
});
