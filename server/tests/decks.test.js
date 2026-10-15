import request from 'supertest';
import mongoose from 'mongoose';
import { connectTestDatabase } from './support/database.js';
import jwt from 'jsonwebtoken';
import app from '../app';

/* Read off mongoose, where importing the app has already registered the models */
const User = mongoose.model('User');
const Deck = mongoose.model('Deck');

let disconnect;
let userA;
let userB;
let tokenA;
let tokenB;

const makeToken = (userId) => jwt.sign({ userId }, process.env.JWT_SECRET);

const DECK_PAYLOAD = {
  name: 'Capitals',
  description: 'Geography drills',
  flashcards: [
    { question: 'France', answer: 'Paris' },
    { question: 'Japan', answer: 'Tokyo' },
  ],
};

beforeAll(async () => {
  disconnect = await connectTestDatabase('decks');

  /* These routes only check the JWT, so the stored password is never consulted */
  userA = await User.create({ email: 'a@example.com', password: 'irrelevant' });
  userB = await User.create({ email: 'b@example.com', password: 'irrelevant' });
  tokenA = makeToken(userA._id.toString());
  tokenB = makeToken(userB._id.toString());
});

afterAll(async () => {
  await disconnect?.();
});

afterEach(async () => {
  await Deck.deleteMany({});
  vi.restoreAllMocks();
});

const asA = (req) => req.set('Authorization', `Bearer ${tokenA}`);
const createDeckAs = (token, payload = DECK_PAYLOAD) =>
  request(app).post('/decks').set('Authorization', `Bearer ${token}`).send(payload);

describe('the token check on /decks', () => {
  it('refuses every route without a token', async () => {
    const replies = await Promise.all([
      request(app).post('/decks').send(DECK_PAYLOAD),
      request(app).get('/decks'),
      request(app).get('/decks/000000000000000000000000'),
      request(app).put('/decks/000000000000000000000000').send(DECK_PAYLOAD),
      request(app).delete('/decks/000000000000000000000000'),
    ]);

    for (const res of replies) {
      expect(res.status).toBe(401);
      expect(res.body.message).toBe('No token provided');
    }
  });

  it('treats a token sent without the Bearer scheme as no token', async () => {
    const res = await request(app).get('/decks').set('Authorization', `Token ${tokenA}`);

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('No token provided');
  });

  it.each([
    ['signed with another secret', () => jwt.sign({ userId: userA._id.toString() }, 'not-the-secret')],
    ['past its expiry', () => jwt.sign(
      { userId: userA._id.toString(), exp: Math.floor(Date.now() / 1000) - 60 },
      process.env.JWT_SECRET,
    )],
  ])('refuses a token that is %s', async (_label, makeBadToken) => {
    const token = makeBadToken();

    const res = await request(app).get('/decks').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid or expired token');
  });
});

describe('POST /decks', () => {
  it('creates a deck owned by the requester, whatever owner the body names', async () => {
    const res = await createDeckAs(tokenA, { ...DECK_PAYLOAD, userId: userB._id.toString() });

    expect(res.status).toBe(201);
    expect(res.body.userId).toBe(userA._id.toString());
    expect(res.body.flashcards).toHaveLength(2);
    expect(res.body.flashcards[0]._id).toMatch(/^[a-f\d]{24}$/);

    const stored = await Deck.findById(res.body._id);
    expect(stored.name).toBe('Capitals');
    expect(stored.userId.toString()).toBe(userA._id.toString());
  });

  it.each(['name', 'description'])('refuses a deck without a %s', async (field) => {
    const res = await createDeckAs(tokenA, { ...DECK_PAYLOAD, [field]: undefined });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('A deck needs a name and a description');
    expect(await Deck.countDocuments()).toBe(0);
  });

  it('refuses a deck without a flashcards array', async () => {
    const res = await createDeckAs(tokenA, { ...DECK_PAYLOAD, flashcards: undefined });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('flashcards must be an array');
    expect(await Deck.countDocuments()).toBe(0);
  });

  it.each(['question', 'answer'])('refuses a card with an empty %s', async (field) => {
    const card = { question: 'France', answer: 'Paris', [field]: '' };

    const res = await createDeckAs(tokenA, { ...DECK_PAYLOAD, flashcards: [card] });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Every card needs a question and an answer');
    expect(await Deck.countDocuments()).toBe(0);
  });
});

describe('GET /decks', () => {
  it("lists only the requester's decks", async () => {
    await createDeckAs(tokenA);
    await createDeckAs(tokenB, { ...DECK_PAYLOAD, name: 'B Private' });

    const res = await asA(request(app).get('/decks'));

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe('Capitals');
  });
});

describe('GET /decks/:id', () => {
  it('returns a deck to its owner', async () => {
    const own = (await createDeckAs(tokenA)).body;

    const res = await asA(request(app).get(`/decks/${own._id}`));

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Capitals');
  });

  it("answers for another user's deck exactly as for one that does not exist", async () => {
    const foreign = (await createDeckAs(tokenB)).body;
    const missingId = new mongoose.Types.ObjectId().toString();

    const foreignRes = await asA(request(app).get(`/decks/${foreign._id}`));
    const missingRes = await asA(request(app).get(`/decks/${missingId}`));

    expect([foreignRes.status, missingRes.status]).toEqual([404, 404]);
    expect(foreignRes.body).toEqual(missingRes.body);
  });

  it('answers a malformed id with 400 rather than a server error', async () => {
    const res = await asA(request(app).get('/decks/not-an-id'));

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Invalid deck id');
  });
});

describe('PUT /decks/:id', () => {
  it('updates a deck for its owner', async () => {
    const own = (await createDeckAs(tokenA)).body;

    const res = await asA(request(app).put(`/decks/${own._id}`).send({ ...DECK_PAYLOAD, name: 'Renamed' }));

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Renamed');
    expect((await Deck.findById(own._id)).name).toBe('Renamed');
  });

  it("answers 404 to an update of another user's deck and leaves it unchanged", async () => {
    const foreign = (await createDeckAs(tokenB)).body;

    const res = await asA(request(app).put(`/decks/${foreign._id}`).send({ ...DECK_PAYLOAD, name: 'Renamed' }));

    expect(res.status).toBe(404);
    expect((await Deck.findById(foreign._id)).name).toBe('Capitals');
  });

  /* An update rebuilds each card as create does, so a client cannot choose the id a card is stored under */
  it('stores updated cards under ids of its own rather than ones the client sends', async () => {
    const own = (await createDeckAs(tokenA)).body;
    const smuggled = new mongoose.Types.ObjectId().toString();

    const res = await asA(request(app).put(`/decks/${own._id}`).send({
      ...DECK_PAYLOAD,
      flashcards: [{ _id: smuggled, question: 'France', answer: 'Paris' }],
    }));

    expect(res.status).toBe(200);
    const stored = await Deck.findById(own._id);
    expect(stored.flashcards).toHaveLength(1);
    expect(stored.flashcards[0]._id.toString()).not.toBe(smuggled);
  });

  it('refuses a flashcards value that is not an array', async () => {
    const own = (await createDeckAs(tokenA)).body;

    const res = await asA(request(app).put(`/decks/${own._id}`).send({ flashcards: 'nope' }));

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('flashcards must be an array');
  });

  it('answers a card that is not an object with 400 rather than a server error', async () => {
    const own = (await createDeckAs(tokenA)).body;

    const res = await asA(request(app).put(`/decks/${own._id}`).send({ ...DECK_PAYLOAD, flashcards: [null] }));

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Every card needs a question and an answer');
  });

  it('rejects an update that would empty a required field', async () => {
    const own = (await createDeckAs(tokenA)).body;

    const res = await asA(request(app).put(`/decks/${own._id}`).send({ ...DECK_PAYLOAD, name: '' }));

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('A deck needs a name and a description');
    expect((await Deck.findById(own._id)).name).toBe('Capitals');
  });
});

describe('DELETE /decks/:id', () => {
  it('deletes a deck for its owner', async () => {
    const own = (await createDeckAs(tokenA)).body;

    const res = await asA(request(app).delete(`/decks/${own._id}`));

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Deck deleted successfully');
    expect(await Deck.findById(own._id)).toBeNull();
  });

  it("answers 404 to a delete of another user's deck and keeps it", async () => {
    const foreign = (await createDeckAs(tokenB)).body;

    const res = await asA(request(app).delete(`/decks/${foreign._id}`));

    expect(res.status).toBe(404);
    expect(await Deck.findById(foreign._id)).not.toBeNull();
  });
});

describe('when the database fails', () => {
  it('answers 500 with a generic message and keeps the details for the server log', async () => {
    const outage = new mongoose.mongo.MongoNetworkError('connection 2 to 127.0.0.1:27017 closed');
    vi.spyOn(Deck, 'find').mockRejectedValueOnce(outage);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await asA(request(app).get('/decks'));

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ message: 'Internal server error' });
    expect(console.error).toHaveBeenCalledWith('Error fetching decks:', outage);
  });
});