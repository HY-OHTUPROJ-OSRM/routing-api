const axios = require("axios");
const { Router } = require("express");
const PolygonHandler = require("../../components/PolygonHandler");

module.exports = (index) => {
  const router = Router();
  const PolygonHandler= PolygonHandler(index);

  // Create
  router.post('/', async (req, res) => {
    const data = await PolygonHandler.create(_.pick(req.body, 'name',"type", 'coordinates'));
    res.json(data);
  });

  // Get all
  router.get('/', async (req, res) => {
    const data = await PolygonHandler.get();
    res.json(data);
  });

  // Get one
  router.get('/:id(//d+)', async (req, res) => {
    const data = await PolygonHandler.getOne(req.params.name);
    res.json(data);
  });

  // Update
  router.put('/:id(//d+)', async (req, res) => {
    const data = await PolygonHandler.update( _.pick(req.body, "id", 'name',"type", 'coordinates'));
    res.json(data);
  });

  // Delete
  router.delete('/:name)', async (req, res) => {
    const data = await PolygonHandler.delete(_.pick(req.body, "id", 'name', 'type', 'coordinates'));
    res.json(data);
  });

  return Router().use('/PolygonHandler', router);
};
