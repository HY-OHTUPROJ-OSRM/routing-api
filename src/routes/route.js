const axios = require("axios");
const { Router } = require("express")
const { BACKEND_URL } = require("../utils/config")

const routeRouter = Router()

routeRouter.get("/v1/driving/:routeParams", async (req, res) => {
    const url = `${BACKEND_URL}/route/v1/driving/${req.params.routeParams}`

    query = req.query
    
    if (query.hints == ";") {
        delete query.hints
    }

    try {
        const routing = await axios.get(url, {
            params: query
        })

        res.send(routing.data)
    } catch (error) {
        console.error(error.message)
        res.status(404).send()
    }
});

module.exports = routeRouter
