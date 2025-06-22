const DigitrafficService = require('../services/DigitrafficService');

beforeEach(() => {
  fetch.resetMocks();
});

describe('DigitrafficService', () => {
  test('fetchStations returns simplified station data', async () => {
    fetch.mockResponseOnce(JSON.stringify({
      features: [
        {
          id: '1',
          properties: { name: 'Station 1', roadNumber: 4 },
          geometry: { coordinates: [24.9, 60.2] }
        }
      ]
    }));

    const stations = await DigitrafficService.fetchStations();
    expect(stations).toEqual([
      {
        id: '1',
        name: 'Station 1',
        roadNumber: 4,
        coordinates: [24.9, 60.2]
      }
    ]);
  });

  test('fetchHelsinkiStations filters stations within bounds', async () => {
    fetch.mockResponseOnce(JSON.stringify({
      features: [
        {
          id: '1',
          properties: { name: 'In Helsinki', roadNumber: 4 },
          geometry: { coordinates: [24.9, 60.25] }
        },
        {
          id: '2',
          properties: { name: 'Outside', roadNumber: 5 },
          geometry: { coordinates: [24.0, 59.9] }
        }
      ]
    }));

    const result = await DigitrafficService.fetchHelsinkiStations();
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('In Helsinki');
  });

  test('fetchVolumeForStation returns volume data', async () => {
    const mockData = { stationId: '123', traffic: [] };
    fetch.mockResponseOnce(JSON.stringify(mockData));

    const result = await DigitrafficService.fetchVolumeForStation('123');
    expect(result).toEqual(mockData);
  });

  test('fetchRoadWorks returns transformed roadwork data', async () => {
    fetch.mockResponseOnce(JSON.stringify({
      features: [
        {
          properties: {
            situationId: 'rw-1',
            announcements: [{
              title: 'Road maintenance',
              timeAndDuration: { startTime: '2024-01-01', endTime: '2024-01-02' },
              roadWorkPhases: [{
                severity: 'LOW',
                locationDetails: {
                  roadAddressLocation: {
                    primaryPoint: { roadName: 'Main St', municipality: 'Helsinki' }
                  }
                },
                restrictions: [
                  {
                    type: 'SPEED_LIMIT',
                    restriction: { name: 'Speed', quantity: 30, unit: 'km/h' }
                  }
                ]
              }]
            }]
          },
          geometry: { coordinates: [25.0, 60.2] }
        }
      ]
    }));

    const result = await DigitrafficService.fetchRoadWorks();
    expect(result[0].title).toBe('Road maintenance');
    expect(result[0].roadName).toBe('Main St');
    expect(result[0].restrictions[0].value).toBe(30);
  });

  test('fetchStations throws on error', async () => {
    fetch.mockResponseOnce('Internal Server Error', { status: 500 });

    await expect(DigitrafficService.fetchStations()).rejects.toThrow(/Failed to fetch stations/);
  });
});
