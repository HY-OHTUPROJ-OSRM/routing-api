const TempRoadService = require("../services/TempRoadService");

describe("TempRoadService - Unit Tests", () => {
  let mockRepo;
  let service;

  const activeRoad = {
    id: 1,
    status: true,
    start_node: 100,
    end_node: 200,
    speed: 30,
  };

  const inactiveRoad = {
    id: 2,
    status: false,
    start_node: 300,
    end_node: 400,
    speed: 50,
  };

  beforeEach(() => {
    jest.restoreAllMocks(); // clear all mocks between tests

    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
    jest.spyOn(process.stdout, "write").mockImplementation(() => {});

    mockRepo = {
      getAll: jest.fn().mockResolvedValue([]),
      getById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      toggleActive: jest.fn(),
    };

    service = new TempRoadService(mockRepo);
    TempRoadService.activeTempRoads = [];
  });

  afterEach(() => {
    jest.restoreAllMocks(); // restore original console methods
  });

  test("createTempRoad adds active road to activeTempRoads", async () => {
    mockRepo.create.mockResolvedValue(activeRoad);
    mockRepo.getAll.mockResolvedValue([activeRoad]);

    const result = await service.createTempRoad(activeRoad);

    expect(mockRepo.create).toHaveBeenCalledWith(activeRoad);
    expect(result).toBe(activeRoad);
    expect(TempRoadService.activeTempRoads).toEqual([activeRoad]);
  });

  test("deleteTempRoad removes a road and updates activeTempRoads", async () => {
    mockRepo.getById.mockResolvedValue(activeRoad);
    mockRepo.getAll.mockResolvedValue([]);

    await service.deleteTempRoad(activeRoad.id);

    expect(mockRepo.delete).toHaveBeenCalledWith(activeRoad.id);
    expect(TempRoadService.activeTempRoads).toEqual([]);
  });

  test("toggleTempRoadActive flips status and updates activeTempRoads", async () => {
    mockRepo.getById.mockResolvedValue(inactiveRoad);
    const toggled = { ...inactiveRoad, status: true };
    mockRepo.toggleActive.mockResolvedValue(toggled);
    mockRepo.getAll.mockResolvedValue([toggled]);

    const result = await service.toggleTempRoadActive(inactiveRoad.id);

    expect(mockRepo.toggleActive).toHaveBeenCalledWith(inactiveRoad.id);
    expect(result).toBe(toggled);
    expect(TempRoadService.activeTempRoads).toEqual([toggled]);
  });

  test("updateTempRoad updates a road and refreshes activeTempRoads", async () => {
    const updates = { speed: 45 };
    mockRepo.getById.mockResolvedValue(activeRoad);
    const updated = { ...activeRoad, ...updates };
    mockRepo.update.mockResolvedValue(updated);
    mockRepo.getAll.mockResolvedValue([updated]);

    const result = await service.updateTempRoad(activeRoad.id, updates);

    expect(mockRepo.update).toHaveBeenCalledWith(activeRoad.id, updates, undefined);
    expect(result).toBe(updated);
    expect(TempRoadService.activeTempRoads).toEqual([updated]);
  });

  test("getAllTempRoads calls repository.getAll", async () => {
    mockRepo.getAll.mockResolvedValue([activeRoad, inactiveRoad]);
    const result = await service.getAllTempRoads();
    expect(mockRepo.getAll).toHaveBeenCalled();
    expect(result).toEqual([activeRoad, inactiveRoad]);
  });

  test("getTempRoadById calls repository.getById", async () => {
    mockRepo.getById.mockResolvedValue(activeRoad);
    const result = await service.getTempRoadById(activeRoad.id);
    expect(mockRepo.getById).toHaveBeenCalledWith(activeRoad.id);
    expect(result).toBe(activeRoad);
  });

  test("updateTempRoad throws when road does not exist", async () => {
    mockRepo.getById.mockResolvedValue(null);
    await expect(service.updateTempRoad(123, { speed: 10 })).rejects.toThrow(/does not exist/);
  });

  test("batchUpdateTempRoads creates, deletes and refreshes activeTempRoads", async () => {
    mockRepo.create.mockResolvedValue({});
    mockRepo.delete.mockResolvedValue();
    const updateSpy = jest.spyOn(service, "updateTempRoads").mockResolvedValue();

    const newRoads = [{ id: 3 }, { id: 4 }];
    const deletedIds = [5, 6];

    await service.batchUpdateTempRoads(newRoads, deletedIds);

    expect(mockRepo.create).toHaveBeenCalledTimes(2);
    expect(mockRepo.delete).toHaveBeenCalledTimes(2);
    expect(updateSpy).toHaveBeenCalled();
  });
});
