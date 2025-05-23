const { Router } = require("express");


const disconnectedLinksRouter = Router();

disconnectedLinksRouter.post("/", async (req, res) => {
    const { min_dist, max_dist, names_are_same } = req.body;
    try {
        console.log("min_dist", min_dist);
        console.log("max_dist", max_dist);
        console.log("names_are_same", names_are_same);
        res.json({ res: "OK", data: [0, 1, 2, 3, 4] });
    } catch (error) {
        res.status(500).json({ message: "An error occurred while fetching disconnected links", error: error.message });
    }
});

module.exports = disconnectedLinksRouter;
