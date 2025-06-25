const MmlTileRepository = require("../repositories/MmlTileRepository");

class MmlTileService {
  constructor(repository = new MmlTileRepository()) {
    this.repository = repository;
  }

  async getAllLayers() {
    return await this.repository.fetchLayers();
  }

  async getLayersByMatrixSet(matrixSet = "ETRS-TM35FIN") {
    const all = await this.repository.fetchLayers();
    return all.filter((layer) => layer.tileMatrixSet.includes(matrixSet));
  }

  async getLayerById(identifier) {
    const all = await this.repository.fetchLayers();
    return all.find((layer) => layer.identifier === identifier) || null;
  }
}

module.exports = MmlTileService;
