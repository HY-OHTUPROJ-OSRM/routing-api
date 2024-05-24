process.env.NODE_ENV = 'test';

const request = require('supertest');
const App = require('./server');

describe('Run basic server tests', () => {
  let index = {};

  // Run migrations, clear DB, then seeding
  beforeAll(async () => {
    await migrate();
    const { db } = await seed.openDB();
    await seed.clearDB(db);
    await seed.seed(db);
    await seed.closeDB(db);
  }, 30000);

  // Wait for the app to load
  beforeAll(async () => {
    index = await index();
  }, 30000);

  it('should respond 200 to the [GET /]', () => request(index).get('/').expect(200));
});
