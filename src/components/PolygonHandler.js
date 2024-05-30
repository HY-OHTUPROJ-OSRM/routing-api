const validatePolygon = require("./Validators");


module.exports = (index) => {
    const db = index.get('db');
    const { polygons } = db;
    const module = {};
  
    // Create
    module.create = async (name, type, coordinates) => {
      const validationResult = validatePolygon(name, type, coordinates);

      if (validationResult.error) {
        return res.status(400).json({ error: validationResult.error });
      }
      delete row.id;
      return polygons.save({ ...row, user_id: user.id });
    };
  
    // Get all
    module.get = async () => db.query('select * from polygons');
  
    // Get one
    module.getOne = async (id) => db.query(
      'select *from polygons id=$1',
      [id],
      { single: true }
    );
  
    // Update
    module.update = async (id) => {
      if (!Number(id)) throw new Error('No name given');
      row.id = id;
      return polygons.save(row);
    };
  
    // Delete
    module.delete = async (id) => {
      if (!Number(id)) throw new Error('No id given');
      return polygons.destroy({ id });
    };
  
    return module;
  };