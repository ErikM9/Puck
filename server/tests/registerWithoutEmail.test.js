import request from 'supertest';
import mongoose from 'mongoose';
import { connectTestDatabase } from './support/database.js';
import { createRequire } from 'module';

/* Email is switched off before the app loads, as the email service reads its environment then */
process.env.EMAIL_DISABLED = '1';

const require = createRequire(import.meta.url);
const app = require('../app');

const User = mongoose.model('User');

let disconnect;

beforeAll(async () => {
  disconnect = await connectTestDatabase('register-without-email');
});

afterAll(async () => {
  await disconnect?.();
});

afterEach(async () => {
  await User.deleteMany({});
});

const EMAIL = 'muki@example.com';
const PASSWORD = 'hunter22';

const register = () => request(app).post('/auth/register').send({ email: EMAIL, password: PASSWORD });
const login = () => request(app).post('/auth/login').send({ email: EMAIL, password: PASSWORD });

describe('registering while the server cannot send email', () => {
  it('unlocks the account at once, as no link could reach the inbox', async () => {
    const res = await register();

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ message: 'Registration successful! Please log in.', verificationPending: false });
    expect((await User.findOne({ email: EMAIL })).verificationPending).toBe(false);
    expect((await login()).status).toBe(200);
  });

  it('answers a request for a new link the usual way, with nothing to send', async () => {
    await register();

    const res = await request(app).post('/auth/resend-verification').send({ email: EMAIL });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('If that email is registered and still unverified, a new link has been sent.');
  });
});