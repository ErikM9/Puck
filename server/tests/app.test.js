import request from 'supertest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const APP = require.resolve('../app');

/* Loaded in test mode first, so the email service is cached and never asks Gmail to check credentials */
const app = require(APP);

const ENV_KEYS = ['NODE_ENV', 'AUTH_RATE_LIMIT_MAX'];

let savedEnv;

beforeEach(() => {
  savedEnv = Object.fromEntries(ENV_KEYS.map(key => [key, process.env[key]]));
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

/* app.js sets its rate limit as it loads, so each test reads a fresh copy of that one file under its own environment */
const loadApp = (env) => {
  for (const key of ENV_KEYS) delete process.env[key];
  Object.assign(process.env, env);
  delete require.cache[APP];
  return require(APP);
};

const logOutRepeatedly = async (target, times) => {
  const replies = [];
  for (let i = 0; i < times; i++) {
    replies.push(await request(target).post('/auth/logout'));
  }
  return replies;
};

describe('GET /health', () => {
  it('answers 200 without a token', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});

describe('the /auth rate limit outside test mode', () => {
  it.each([
    ['unset', {}],
    ['blank', { AUTH_RATE_LIMIT_MAX: '' }],
  ])('allows 20 requests from one IP when AUTH_RATE_LIMIT_MAX is %s', async (_label, env) => {
    const limited = loadApp({ NODE_ENV: 'production', ...env });

    const replies = await logOutRepeatedly(limited, 21);

    expect(replies.map(reply => reply.status)).toEqual([...Array(20).fill(200), 429]);
  });

  it('takes its cap from AUTH_RATE_LIMIT_MAX when that is a positive whole number', async () => {
    const limited = loadApp({ NODE_ENV: 'production', AUTH_RATE_LIMIT_MAX: '2' });

    const replies = await logOutRepeatedly(limited, 3);

    expect(replies.map(reply => reply.status)).toEqual([200, 200, 429]);
    expect(replies[2].body.message).toBe('Too many requests from this IP, please try again later.');
  });
});