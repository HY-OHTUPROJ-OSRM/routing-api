const LimitRepository = require("../repositories/LimitRepository");

class LimitService {
  static async getLimitedWays() {
    return await LimitRepository.getLimitedWaysFromDb();
  }
}

module.exports = LimitService;
