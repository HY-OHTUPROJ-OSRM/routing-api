const ZoneRepository = require("../repositories/ZoneRepository")
const validator = require("../components/Validators")

class ZoneService {
    static async getZones() {
        const zones = await ZoneRepository.getZones()
        return zones
    }

    static async createZones(featureCollection) {
        const errors = validator.valid(featureCollection, true)

        if (errors.length > 0) {
            throw Error(errors[0])
        }

        featureCollection.features.forEach(async (feature) => {
            await ZoneRepository.createZone(feature)
        })
    }
}

module.exports = ZoneService
