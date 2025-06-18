class StatusService {
  static startTime = undefined;
  static status = "none";
  static percentage = 0;
  static prevRunTime = undefined;
  static listeners = {};

  static startJob() {
    if (StatusService.status == "none") {
      StatusService.startTime = new Date(Date.now());
      StatusService.status = "processing";
      StatusService.percentage = 0;
      StatusService.sendStatus();
    }
  }

  static async endJob() {
    if (StatusService.status == "processing") {
      const runTime = Date.now() - Number(StatusService.startTime);

      StatusService.status = "completed";
      StatusService.percentage = 100;
      await StatusService.sendStatus();

      StatusService.prevRunTime = runTime;

      StatusService.status = "none";
      StatusService.percentage = 0;
      StatusService.startTime = undefined;
    }
  }

  static addListener(id, response) {
    StatusService.listeners[id] = response;
  }

  static removeListener(id) {
    delete StatusService.listeners[id];
  }

  static async sendStatus() {
    Object.values(StatusService.listeners).forEach((res) => {
      res.write(`data: ${JSON.stringify(StatusService.getStatus())}\n\n`);
    });
  }

  static progress() {
    if (StatusService.status == "processing") {
      StatusService.percentage = Math.min(StatusService.percentage + 10, 99);
      StatusService.sendStatus();
    }
  }

  static getEstimate() {
    if (StatusService.startTime && StatusService.prevRunTime) {
      return new Date(Number(StatusService.startTime) + StatusService.prevRunTime).toISOString();
    } else {
      return undefined;
    }
  }

  static getStatus() {
    return {
      status: StatusService.status,
      progress: {
        percentage: StatusService.percentage,
        estimate: StatusService.getEstimate(),
      },
    };
  }
}

module.exports = StatusService;
