import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const connectDB = require('../config/database');

let savedUri;

beforeEach(() => {
  savedUri = process.env.MONGO_URI;
  vi.spyOn(process, 'exit').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  if (savedUri === undefined) delete process.env.MONGO_URI;
  else process.env.MONGO_URI = savedUri;
  vi.restoreAllMocks();
});

describe('connectDB', () => {
  it('reports the failure and exits with code 1 when MONGO_URI is not set', async () => {
    delete process.env.MONGO_URI;

    await connectDB();

    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Error connecting to MongoDB'));
    expect(process.exit).toHaveBeenCalledWith(1);
  });
});