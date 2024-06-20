var startTime
var status = "none"
var percentage = 0

var prevRunTime

const listeners = {}

class StatusService {
    static startJob() {
        if (status == "none") {
            startTime = new Date(Date.now())
            status = "processing"
            percentage = 0
            StatusService.sendStatus()
        }
    }

    static async endJob() {
        if (status == "processing") {
            const runTime = Date.now() - Number(startTime)

            status = "completed"
            percentage = 100
            await StatusService.sendStatus()

            prevRunTime = runTime

            status = "none"
            percentage = 0
            startTime = undefined
        }
    }

    static addListener(id, response) {
        listeners[id] = response
    }

    static removeListener(id) {
        delete listeners[id]
    }

    static async sendStatus() {
        Object.values(listeners).forEach(res => {
            res.write(`data: ${JSON.stringify(StatusService.getStatus())}\n\n`)
        })
    }

    static progress() {
        if (status == "processing") {
            percentage = Math.min(percentage + 10, 99)
            StatusService.sendStatus()
        }
    }

    static getEstimate() {
        if (startTime && prevRunTime) {
            return (new Date(Number(startTime) + prevRunTime)).toISOString()
        } else {
            return undefined
        }
    }

    static getStatus() {
        return {
            status,
            progress: {
                percentage,
                estimate: StatusService.getEstimate()
            }
        }
    }
}

module.exports = StatusService
