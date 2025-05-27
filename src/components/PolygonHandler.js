const validatePolygon = require("./Validators");

module.exports = (index) => {
  const db = index.get("db");
  const { polygons } = db;
  const module = {};

  // Create
  module.create = async (name, type, coordinates, userId) => {
    const validationResult = validatePolygon(name, type, coordinates);

    if (validationResult.error) {
      return { error: validationResult.error };
    }

    const polygonData = {
      name,
      type,
      coordinates,
      user_id: userId,
    };

    return polygons.save(polygonData);
  };

  // Get all
  module.get = async () => db.query("SELECT * FROM polygons");

  // Get one
  module.getOne = async (id) => {
    if (!Number(id)) throw new Error("Invalid id");
    return db.query("SELECT * FROM polygons WHERE id = $1", [id], {
      single: true,
    });
  };

  // Update
  module.update = async (id, updateData) => {
    if (!Number(id)) throw new Error("Invalid id");
    const polygonData = { ...updateData, id };
    return polygons.save(polygonData);
  };

  // Delete
  module.delete = async (id) => {
    if (!Number(id)) throw new Error("Invalid id");
    return polygons.destroy({ id });
  };

  return module;
};
