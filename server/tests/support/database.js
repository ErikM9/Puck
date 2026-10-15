import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

/* Waits for the indexes, as the simultaneous sign-up test needs the unique one in place from its first request */
const indexesBuilt = () => Promise.all(Object.values(mongoose.models).map(model => model.init()));

/* Uses MONGO_TEST_URI when one is given, such as a local MongoDB or a CI service, and a fresh in-memory server otherwise */
export async function connectTestDatabase(name) {
  if (process.env.MONGO_TEST_URI) {
    await mongoose.connect(process.env.MONGO_TEST_URI, { dbName: `puck_test_${name}` });
    await indexesBuilt();

    return async () => {
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    };
  }

  const mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await indexesBuilt();

  return async () => {
    await mongoose.disconnect();
    await mongod.stop();
  };
}