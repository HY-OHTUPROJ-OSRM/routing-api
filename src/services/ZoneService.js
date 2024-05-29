const ZoneRepository = require("../repositories/ZoneRepository")

class ZoneService {
    static async getZones() {
        const zones = await ZoneRepository.getZones()
        return zones
    }
}

module.exports = ZoneService
