import { createRequire } from 'module';

/* Loaded with Node's own require, so the spy on nodemailer.createTransport reaches the copy the service uses */
const require = createRequire(import.meta.url);
const nodemailer = require('nodemailer');
const SERVICE = require.resolve('../utils/emailService');

const ENV_KEYS = ['NODE_ENV', 'EMAIL_DISABLED', 'EMAIL_USER', 'EMAIL_PASS'];
const CREDENTIALS = { EMAIL_USER: 'puck@gmail.com', EMAIL_PASS: 'app-password' };

let transport;
let savedEnv;

beforeEach(() => {
  transport = {
    verify: vi.fn().mockResolvedValue(true),
    sendMail: vi.fn().mockResolvedValue({ messageId: 'test' }),
  };
  vi.spyOn(nodemailer, 'createTransport').mockReturnValue(transport);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  savedEnv = Object.fromEntries(ENV_KEYS.map(key => [key, process.env[key]]));
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  delete require.cache[SERVICE];
  vi.restoreAllMocks();
});

/* The service reads its environment as it loads, so each test loads a fresh copy under an environment of its own */
const loadService = (env) => {
  for (const key of ENV_KEYS) delete process.env[key];
  Object.assign(process.env, env);
  delete require.cache[SERVICE];
  return require(SERVICE);
};

describe('at startup', () => {
  it('asks Gmail to confirm the credentials when there are some to check', async () => {
    loadService(CREDENTIALS);

    expect(nodemailer.createTransport).toHaveBeenCalledWith({
      service: 'gmail',
      auth: { user: CREDENTIALS.EMAIL_USER, pass: CREDENTIALS.EMAIL_PASS },
    });
    expect(transport.verify).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(console.log).toHaveBeenCalledWith(expect.stringContaining('credentials accepted')));
  });

  it('reports credentials that Gmail refuses', async () => {
    const refusal = Object.assign(new Error('Invalid login: 535-5.7.8 Username and Password not accepted'), {
      code: 'EAUTH',
      responseCode: 535,
    });
    transport.verify.mockRejectedValueOnce(refusal);

    loadService(CREDENTIALS);

    await vi.waitFor(() => expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Email transporter configuration error'),
      refusal.message,
    ));
  });

  it('never contacts Gmail when email is switched off, even with credentials set', () => {
    loadService({ ...CREDENTIALS, EMAIL_DISABLED: '1' });

    expect(nodemailer.createTransport).not.toHaveBeenCalled();
  });

  it('announces switched-off email as a choice, and that verification is skipped with it', () => {
    const service = loadService({ EMAIL_DISABLED: '1' });

    expect(console.log).toHaveBeenCalledWith(expect.stringMatching(/Email sending is disabled.*skip email verification/));
    expect(console.error).not.toHaveBeenCalled();
    expect(service.canSend()).toBe(false);
  });

  it('reports missing credentials once, rather than again as a failed check', () => {
    const service = loadService({});

    expect(nodemailer.createTransport).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledWith(expect.stringMatching(/EMAIL_USER \/ EMAIL_PASS are not set.*skip email verification/));
    expect(service.canSend()).toBe(false);
  });

  it('can send once credentials are set, or once a transport is dropped in without them', () => {
    expect(loadService({ ...CREDENTIALS, NODE_ENV: 'test' }).canSend()).toBe(true);

    const bare = loadService({ NODE_ENV: 'test' });
    bare.setTransporter(transport);

    expect(bare.canSend()).toBe(true);
  });

  it('never contacts Gmail in test mode, whatever credentials are set', () => {
    loadService({ ...CREDENTIALS, NODE_ENV: 'test' });

    expect(nodemailer.createTransport).not.toHaveBeenCalled();
  });
});

describe('sending', () => {
  it.each([
    ['email is switched off', { ...CREDENTIALS, EMAIL_DISABLED: '1' }],
    ['there are no credentials to send with', {}],
  ])('skips the send without an error when %s', async (_label, env) => {
    const service = loadService({ ...env, NODE_ENV: 'test' });

    await service.sendVerificationEmail('muki@example.com', 'http://localhost:5173/verify-email?token=abc');

    expect(transport.sendMail).not.toHaveBeenCalled();
  });

  it('sends the verification link as a button and written out, in the same shell as the recovery code', async () => {
    const service = loadService({ ...CREDENTIALS, NODE_ENV: 'test' });
    const link = 'http://localhost:5173/verify-email?token=abc123';

    await service.sendVerificationEmail('muki@example.com', link);

    expect(transport.sendMail).toHaveBeenCalledTimes(1);
    const mail = transport.sendMail.mock.calls[0][0];
    expect(mail).toMatchObject({ from: `"Puck" <${CREDENTIALS.EMAIL_USER}>`, to: 'muki@example.com', subject: 'Verify your Puck email ✦' });
    expect(mail.html).toContain(`<a href="${link}"`);
    expect(mail.html).toContain(`paste this into your browser: ${link}`);
    expect(mail.html).toContain('The link expires in 24 hours');
    expect(mail.html).toContain('— The Puck team');
  });

  it('sends the recovery code to the address that asked for it', async () => {
    const service = loadService({ ...CREDENTIALS, NODE_ENV: 'test' });

    await service.sendPasswordResetEmail('muki@example.com', '482913');

    expect(transport.sendMail).toHaveBeenCalledTimes(1);
    expect(transport.sendMail).toHaveBeenCalledWith(expect.objectContaining({
      from: `"Puck" <${CREDENTIALS.EMAIL_USER}>`,
      to: 'muki@example.com',
      html: expect.stringContaining('482913'),
    }));
  });
});