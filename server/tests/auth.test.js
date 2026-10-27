import request from 'supertest';
import mongoose from 'mongoose';
import { connectTestDatabase } from './support/database.js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { createHash } from 'crypto';
import { createRequire } from 'module';

/* Loaded with require, so setTransporter reaches the same email service instance the app sends through */
const require = createRequire(import.meta.url);
const { setTransporter } = require('../utils/emailService');
const app = require('../app');

/* The stub captures each message, which is also how these tests read a recovery code back */
const sendMail = vi.fn().mockResolvedValue({ messageId: 'test' });

beforeAll(() => {
  setTransporter({ sendMail, verify: async () => true });
});

/* Read off mongoose, where requiring the app has already registered the models */
const User = mongoose.model('User');

let disconnect;

beforeAll(async () => {
  disconnect = await connectTestDatabase('auth');
});

afterAll(async () => {
  await disconnect?.();
});

afterEach(async () => {
  await User.deleteMany({});
  sendMail.mockClear();
});

const EMAIL = 'muki@example.com';
const PASSWORD = 'hunter22';
const GENERIC_RECOVERY_REPLY = 'If that email is registered, a recovery code has been sent.';
const GENERIC_RESEND_REPLY = 'If that email is registered and still unverified, a new link has been sent.';
const VERIFY_FIRST = 'Please verify your email address first.';

const register = (email = EMAIL, password = PASSWORD) =>
  request(app).post('/auth/register').send({ email, password });
const login = (email = EMAIL, password = PASSWORD) =>
  request(app).post('/auth/login').send({ email, password });
const forgot = (email = EMAIL) =>
  request(app).post('/auth/forgot-password').send({ email });
const verifyCode = (code, email = EMAIL) =>
  request(app).post('/auth/verify-reset-code').send({ email, code });
const resetPassword = (code, newPassword, email = EMAIL) =>
  request(app).post('/auth/reset-password').send({ email, code, newPassword });
const verifyEmail = (token) =>
  request(app).post('/auth/verify-email').send({ token });
const resendVerification = (email = EMAIL) =>
  request(app).post('/auth/resend-verification').send({ email });

/* Reads the whole number between two tags, so a code of the wrong length is not cut down to six digits */
const lastEmailedCode = () => sendMail.mock.calls.at(-1)[0].html.match(/>\s*(\d+)\s*</)[1];

/* Reads the token off the link in the last verification email */
const lastEmailedToken = () => sendMail.mock.calls.at(-1)[0].html.match(/verify-email\?token=([0-9a-f]+)/)[1];

/* Registers and spends the link, as every test of a signed-in user starts from a verified account */
const registerVerified = async (email = EMAIL, password = PASSWORD) => {
  const res = await register(email, password);
  await verifyEmail(lastEmailedToken());
  sendMail.mockClear();
  return res;
};

const setupRecovery = async () => {
  await registerVerified();
  await forgot();
  return lastEmailedCode();
};

const anotherCode = (code) => (code === '000000' ? '000001' : '000000');

describe('POST /auth/register', () => {
  it('creates the account with the password stored as a hash, awaiting verification', async () => {
    const res = await register();

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      message: 'Registration successful! Open the link we have emailed you, then log in.',
      verificationPending: true,
    });
    const user = await User.findOne({ email: EMAIL });
    await expect(bcrypt.compare(PASSWORD, user.password)).resolves.toBe(true);
    expect(user.verificationPending).toBe(true);
  });

  it('emails the new address a verification link to the client, holding only a hash of its token', async () => {
    await register();

    expect(sendMail).toHaveBeenCalledTimes(1);
    const mail = sendMail.mock.calls[0][0];
    expect(mail.to).toBe(EMAIL);
    expect(mail.subject).toContain('Verify');
    expect(mail.html).toContain('http://localhost:5173/verify-email?token=');
    const token = lastEmailedToken();
    const user = await User.findOne({ email: EMAIL });
    expect(user.verifyTokenHash).toBe(createHash('sha256').update(token).digest('hex'));
    expect(user.verifyTokenExpiry.getTime() - Date.now()).toBeGreaterThan(23 * 60 * 60 * 1000);
  });

  it('builds the link on CLIENT_URL, where the client lives under a path of its own', async () => {
    process.env.CLIENT_URL = 'https://example.github.io/Puck/';

    await register();

    expect(sendMail.mock.calls[0][0].html).toContain('https://example.github.io/Puck/verify-email?token=');
    delete process.env.CLIENT_URL;
  });

  it('still creates the account, and says so, when the verification email cannot be sent', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    sendMail.mockRejectedValueOnce(new Error('Connection refused'));

    const res = await register();

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      message: 'Account created, but the email failed to send. Log in to ask for a new link.',
      verificationPending: true,
    });
    expect((await User.findOne({ email: EMAIL })).verificationPending).toBe(true);
    expect(consoleError).toHaveBeenCalledWith('Verification email failed to send:', 'Connection refused');
    consoleError.mockRestore();
  });

  it('rejects malformed emails without creating anything', async () => {
    const res = await register('not-an-email');

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Invalid email format');
    expect(await User.countDocuments()).toBe(0);
  });

  it('rejects passwords under the minimum length', async () => {
    const res = await register(EMAIL, 'abc12');

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/at least 6 characters/);
    expect(await User.countDocuments()).toBe(0);
  });

  it('rejects duplicate emails', async () => {
    await register();

    const res = await register();

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('This email is already in use');
    expect(await User.countDocuments()).toBe(1);
  });

  /* Both sign-ups pass the lookup before either is saved, so only the unique index can turn the second away */
  it('lets only one of two simultaneous sign-ups for an address through', async () => {
    const replies = await Promise.all([register(), register()]);

    expect(replies.map(reply => reply.status).sort()).toEqual([201, 400]);
    expect(replies.find(reply => reply.status === 400).body.message).toBe('This email is already in use');
    expect(await User.countDocuments()).toBe(1);
  });

  /* A guard that reads .length off a missing field turns the caller's mistake into a 500 */
  it('answers a missing password with 400 rather than a server error', async () => {
    const res = await request(app).post('/auth/register').send({ email: EMAIL });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/at least 6 characters/);
    expect(await User.countDocuments()).toBe(0);
  });

  /* Without normalisation the unique index sees two different strings and allows both */
  it('treats an address as the same account whatever its casing', async () => {
    await register('Muki@Example.COM');

    const res = await register('muki@example.com');

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('This email is already in use');
    expect(await User.countDocuments()).toBe(1);
  });

  /* A pasted address often brings spaces with it, which are trimmed before the format check */
  it('accepts an address with stray spaces around it and stores it trimmed', async () => {
    const res = await register(`  ${EMAIL} `);

    expect(res.status).toBe(201);
    expect((await User.findOne({})).email).toBe(EMAIL);
  });
});

describe('POST /auth/verify-email', () => {
  it('unlocks the account the link was sent to and spends the token', async () => {
    await register();
    const token = lastEmailedToken();

    const res = await verifyEmail(token);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Email verified! You can now log in.');
    const user = await User.findOne({ email: EMAIL });
    expect(user.verificationPending).toBe(false);
    expect(user.verifyTokenHash).toBeNull();
    expect((await verifyEmail(token)).status).toBe(400);
  });

  it.each([
    ['a token nobody was sent', '0'.repeat(64)],
    ['no token at all', undefined],
    ['a query operator in place of a token', { $ne: null }],
  ])('refuses %s', async (_label, token) => {
    await register();

    const res = await verifyEmail(token);

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('This verification link is invalid or has expired.');
    expect((await User.findOne({ email: EMAIL })).verificationPending).toBe(true);
  });

  it('refuses a link older than 24 hours', async () => {
    await register();
    const token = lastEmailedToken();
    await User.updateOne({ email: EMAIL }, { verifyTokenExpiry: new Date(Date.now() - 1000) });

    const res = await verifyEmail(token);

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('This verification link is invalid or has expired.');
  });
});

describe('POST /auth/resend-verification', () => {
  it('sends a new link, which is accepted, and makes the old one worthless', async () => {
    await register();
    const first = lastEmailedToken();
    await User.updateOne({ email: EMAIL }, { verifyLastSentAt: new Date(Date.now() - 61 * 1000) });

    const res = await resendVerification();

    expect(res.status).toBe(200);
    expect(res.body.message).toBe(GENERIC_RESEND_REPLY);
    await vi.waitFor(() => expect(sendMail).toHaveBeenCalledTimes(2));
    const second = lastEmailedToken();
    expect(second).not.toBe(first);
    expect((await verifyEmail(first)).status).toBe(400);
    expect((await verifyEmail(second)).status).toBe(200);
  });

  it('sends nothing within a minute of the last link, and says the same', async () => {
    await register();

    const res = await resendVerification();

    expect(res.status).toBe(200);
    expect(res.body.message).toBe(GENERIC_RESEND_REPLY);
    expect(sendMail).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['an unknown address', 'ghost@example.com'],
    ['a malformed address', 'not-an-email'],
  ])('replies the same for %s and sends nothing', async (_label, email) => {
    await register();
    sendMail.mockClear();

    const res = await resendVerification(email);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe(GENERIC_RESEND_REPLY);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('sends nothing for an account which is already verified', async () => {
    await registerVerified();
    await User.updateOne({ email: EMAIL }, { verifyLastSentAt: new Date(Date.now() - 61 * 1000) });

    const res = await resendVerification();

    expect(res.body.message).toBe(GENERIC_RESEND_REPLY);
    expect(sendMail).not.toHaveBeenCalled();
  });
});

describe('POST /auth/login', () => {
  it('returns a JWT that identifies the user and expires after an hour', async () => {
    await registerVerified();
    const user = await User.findOne({ email: EMAIL });

    const res = await login();

    expect(res.status).toBe(200);
    const payload = jwt.verify(res.body.token, process.env.JWT_SECRET);
    expect(payload.userId).toBe(user._id.toString());
    expect(payload.exp - payload.iat).toBe(60 * 60);
  });

  it('refuses an account whose address is still unverified, with the right password', async () => {
    await register();

    const res = await login();

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ message: VERIFY_FIRST, verificationPending: true });
  });

  /* The wrong password answers first, so an unverified account is never revealed to anyone without its password */
  it('refuses the wrong password on an unverified account like any other wrong password', async () => {
    await register();

    const res = await login(EMAIL, 'wrong-pw');

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid email or password');
  });

  it('signs in with a casing that differs from the one used to register', async () => {
    await registerVerified('Muki@Example.COM');

    const res = await login('MUKI@example.com');

    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
  });

  /* A password that is not a string makes bcrypt throw, which has to come back as a refusal rather than a 500 */
  it.each([
    ['a number', 123456],
    ['a query operator', { $ne: null }],
    ['an array holding the right password', [PASSWORD]],
  ])('answers a password sent as %s with 401 rather than a server error', async (_label, password) => {
    await registerVerified();

    const res = await login(EMAIL, password);

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid email or password');
  });

  /* Identical bodies keep the endpoint from revealing which accounts exist */
  it('rejects a wrong password and an unknown email with an identical message', async () => {
    await registerVerified();

    const wrongPassword = await login(EMAIL, 'wrong-pw');
    const unknownEmail = await login('ghost@example.com', PASSWORD);

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body).toEqual(unknownEmail.body);
  });
});

describe('POST /auth/logout', () => {
  it('acknowledges the sign-out', async () => {
    const res = await request(app).post('/auth/logout').send({});

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Logout successful');
  });
});

describe('POST /auth/forgot-password', () => {
  it('emails a six-digit code to a registered address', async () => {
    await registerVerified();

    const res = await forgot();

    expect(res.status).toBe(200);
    expect(res.body.message).toBe(GENERIC_RECOVERY_REPLY);
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail.mock.calls[0][0].to).toBe(EMAIL);
    expect(lastEmailedCode()).toMatch(/^\d{6}$/);
  });

  it('stores the code only as a hash', async () => {
    await registerVerified();

    await forgot();

    const user = await User.findOne({ email: EMAIL });
    expect(user.resetCodeHash).toBe(createHash('sha256').update(lastEmailedCode()).digest('hex'));
  });

  /* The email promises 15 minutes, so the stored expiry has to match it */
  it('lets the code expire 15 minutes after it is sent', async () => {
    await registerVerified();
    const before = Date.now();

    await forgot();

    const ttl = (await User.findOne({ email: EMAIL })).resetCodeExpiry.getTime() - before;
    expect(ttl).toBeGreaterThan(14 * 60 * 1000);
    expect(ttl).toBeLessThanOrEqual(15 * 60 * 1000 + 5000);
  });

  it('responds identically for unknown emails and sends nothing', async () => {
    await registerVerified();
    const known = await forgot(EMAIL);
    sendMail.mockClear();

    const unknown = await forgot('ghost@example.com');

    expect(unknown.status).toBe(200);
    expect(unknown.body).toEqual(known.body);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('answers a repeat request inside a minute the same way, without sending another code', async () => {
    await registerVerified();
    const first = await forgot();
    sendMail.mockClear();

    const second = await forgot();

    expect(second.status).toBe(200);
    expect(second.body).toEqual(first.body);
    expect(sendMail).not.toHaveBeenCalled();
  });

  /* The lockout reply tells the person to ask for a new code, so a new code has to come with a fresh set of tries */
  it('sends a fresh code with fresh tries once the minute is up, even after a lockout', async () => {
    const code = await setupRecovery();
    for (let i = 0; i < 5; i++) {
      await verifyCode(anotherCode(code));
    }
    await User.updateOne({ email: EMAIL }, { resetCodeLastSentAt: new Date(Date.now() - 61 * 1000) });
    sendMail.mockClear();

    await forgot();

    expect(sendMail).toHaveBeenCalledTimes(1);
    expect((await verifyCode(lastEmailedCode())).status).toBe(200);
  });
});

describe('POST /auth/verify-reset-code', () => {
  it('refuses a wrong code', async () => {
    const code = await setupRecovery();

    const res = await verifyCode(anotherCode(code));

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Invalid or expired code.');
  });

  /* Each guess has to be counted before it is compared, or guesses sent together all slip under the limit */
  it('counts guesses sent at the same moment, so they cannot outrun the limit', async () => {
    const code = await setupRecovery();

    const replies = await Promise.all(Array.from({ length: 10 }, () => verifyCode(anotherCode(code))));

    expect(replies.filter(reply => reply.status === 400).length).toBeLessThanOrEqual(5);
    expect((await verifyCode(code)).status).toBe(429);
  });

  it('five wrong attempts lock the code out, even for the correct value', async () => {
    const code = await setupRecovery();
    for (let i = 0; i < 5; i++) {
      await verifyCode(anotherCode(code));
    }

    const lockedOut = await verifyCode(code);

    expect(lockedOut.status).toBe(429);
    expect(lockedOut.body.message).toMatch(/Too many attempts/);
  });

  /* Five wrong guesses lock the code, so after four the right code must still verify and then reset */
  it('four wrong attempts still leave the correct code usable', async () => {
    const code = await setupRecovery();
    for (let i = 0; i < 4; i++) {
      await verifyCode(anotherCode(code));
    }

    const verified = await verifyCode(code);
    const reset = await resetPassword(code, 'newpass99');

    expect(verified.status).toBe(200);
    expect(reset.status).toBe(200);
  });
});

describe('POST /auth/reset-password', () => {
  it('replaces the password, so only the new one signs in', async () => {
    const code = await setupRecovery();
    await verifyCode(code);

    const res = await resetPassword(code, 'newpass99');

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Password reset successful! Please log in.');
    expect((await login(EMAIL, PASSWORD)).status).toBe(401);
    expect((await login(EMAIL, 'newpass99')).status).toBe(200);
  });

  it('a code cannot be reused after a successful reset', async () => {
    const code = await setupRecovery();
    await resetPassword(code, 'newpass99');

    const replay = await resetPassword(code, 'evilpass1');

    expect(replay.status).toBe(400);
    expect((await login(EMAIL, 'newpass99')).status).toBe(200);
  });

  it('rejects expired codes', async () => {
    const code = await setupRecovery();
    await User.updateOne({ email: EMAIL }, { resetCodeExpiry: new Date(Date.now() - 1000) });

    const res = await resetPassword(code, 'newpass99');

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Invalid or expired code.');
    expect((await login(EMAIL, PASSWORD)).status).toBe(200);
  });

  /* The code came from the inbox, which is all the verification link would have proved */
  it('unlocks an account whose address was never verified, as the code proves the inbox', async () => {
    await register();
    await forgot();
    const code = lastEmailedCode();

    await resetPassword(code, 'newpass99');

    expect((await User.findOne({ email: EMAIL })).verificationPending).toBe(false);
    expect((await login(EMAIL, 'newpass99')).status).toBe(200);
  });

  it('rejects new passwords under the minimum length without burning the code', async () => {
    const code = await setupRecovery();

    const res = await resetPassword(code, 'abc');

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/at least 6 characters/);
    expect((await resetPassword(code, 'newpass99')).status).toBe(200);
  });
});

describe('when an email fails to send', () => {
  const refusal = Object.assign(new Error('Invalid login: 535-5.7.8 Username and Password not accepted'), {
    code: 'EAUTH',
    responseCode: 535,
  });

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    console.error.mockRestore();
  });

  it('still gives a request for a new link the generic reply and logs the failure', async () => {
    await register();
    await User.updateOne({ email: EMAIL }, { verifyLastSentAt: new Date(Date.now() - 61 * 1000) });
    sendMail.mockRejectedValueOnce(refusal);

    const res = await resendVerification();

    expect(res.status).toBe(200);
    expect(res.body.message).toBe(GENERIC_RESEND_REPLY);
    await vi.waitFor(() => expect(console.error).toHaveBeenCalledWith(
      'Verification email failed to send:',
      refusal.message,
    ));
  });

  it('still gives a recovery request the generic reply and logs the failure', async () => {
    await registerVerified();
    sendMail.mockRejectedValueOnce(refusal);

    const res = await forgot();

    expect(res.status).toBe(200);
    expect(res.body.message).toBe(GENERIC_RECOVERY_REPLY);
    await vi.waitFor(() => expect(console.error).toHaveBeenCalledWith(
      'Password reset email failed to send:',
      refusal.message,
    ));
  });
});