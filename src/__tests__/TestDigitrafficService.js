const DigitrafficService = require('../services/DigitrafficService');
const fetch = require('node-fetch');

jest.mock('node-fetch');
const { Response } = jest.requireActual('node-fetch');

describe('DigitrafficService', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  // --- Test fetchStations ---
  test('fetchStations returns filtered station data', async () => {
    const mockApiResponse = {
      features: [
        {
          id: 'station-1',
          geometry: { coordinates: [24.9, 60.2] },
          properties: {
            name: 'Station A',
            roadNumber: 1
          }
        }
      ]
    };

    fetch.mockResolvedValueOnce(new Response(JSON.stringify(mockApiResponse)));

    const result = await DigitrafficService.fetchStations();

    expect(result).toEqual([
      {
        id: 'station-1',
        name: 'Station A',
        roadNumber: 1,
        coordinates: [24.9, 60.2]
      }
    ]);
  });

  // --- Test fetchHelsinkiStations ---
  test('fetchHelsinkiStations filters by coordinates within Helsinki bounds', async () => {
    const mockApiResponse = {
      features: [
        {
          id: 'hel-1',
          geometry: { coordinates: [24.85, 60.2] }, // inside bounds
          properties: { name: 'Helsinki Station', roadNumber: 4 }
        },
        {
          id: 'not-hel',
          geometry: { coordinates: [22.0, 60.5] }, // outside bounds
          properties: { name: 'Far Away Station', roadNumber: 5 }
        }
      ]
    };

    fetch.mockResolvedValueOnce(new Response(JSON.stringify(mockApiResponse)));

    const result = await DigitrafficService.fetchHelsinkiStations();

    expect(result).toEqual([
      {
        id: 'hel-1',
        name: 'Helsinki Station',
        roadNumber: 4,
        coordinates: [24.85, 60.2]
      }
    ]);
  });

  // --- Test fetchVolumeForStation ---
  test('fetchVolumeForStation returns raw JSON response', async () => {
    const stationId = 'station-123';
    const mockVolumeData = {
      stationId,
      data: [{ vehicleCount: 100, averageSpeed: 45 }]
    };

    fetch.mockResolvedValueOnce(new Response(JSON.stringify(mockVolumeData)));

    const result = await DigitrafficService.fetchVolumeForStation(stationId);

    expect(result).toEqual(mockVolumeData);
  });

  // --- Test fetchRoadWorks ---
  test('fetchRoadWorks returns simplified filtered road work data', async () => {
    const mockRoadWorks = {
      features: [
        {
          geometry: {
            coordinates: [[24.9, 60.2], [25.0, 60.3]]
          },
          properties: {
            situationId: 'roadwork-1',
            announcements: [
              {
                title: 'Road work on 3',
                timeAndDuration: {
                  startTime: '2025-06-04T17:00:00Z',
                  endTime: '2025-06-05T03:00:00Z'
                },
                roadWorkPhases: [
                  {
                    severity: 'HIGH',
                    restrictions: [
                      {
                        type: 'SPEED_LIMIT',
                        restriction: {
                          name: 'Nopeusrajoitus',
                          quantity: 50,
                          unit: 'km/h'
                        }
                      }
                    ],
                    locationDetails: {
                      roadAddressLocation: {
                        primaryPoint: {
                          roadName: 'Hämeenlinnanväylä',
                          municipality: 'Vantaa'
                        }
                      }
                    }
                  }
                ]
              }
            ]
          }
        }
      ]
    };

    fetch.mockResolvedValueOnce(new Response(JSON.stringify(mockRoadWorks)));

    const result = await DigitrafficService.fetchRoadWorks();

    expect(result).toEqual([
      {
        id: 'roadwork-1',
        title: 'Road work on 3',
        roadName: 'Hämeenlinnanväylä',
        municipality: 'Vantaa',
        startTime: '2025-06-04T17:00:00Z',
        endTime: '2025-06-05T03:00:00Z',
        severity: 'HIGH',
        restrictions: [
          {
            type: 'SPEED_LIMIT',
            name: 'Nopeusrajoitus',
            value: 50,
            unit: 'km/h'
          }
        ],
        coordinates: [[24.9, 60.2], [25.0, 60.3]]
      }
    ]);
  });
});
