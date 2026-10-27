import bcrypt from 'bcrypt';
import {
  validateEmail,
  validatePasswordLength,
  normaliseEmail,
  hashPassword,
  minPasswordLength,
} from '../utils/utils';

describe('validateEmail', () => {
  it('accepts well-formed addresses', () => {
    expect(validateEmail('user@example.com')).toBe(true);
    expect(validateEmail('first.last+tag@sub.domain.co')).toBe(true);
  });

  /* A missing field arrives as undefined, and a guard that throws turns that into a 500 */
  it('rejects anything that is not a string, even a list holding a valid address', () => {
    expect(validateEmail(undefined)).toBe(false);
    expect(validateEmail(['user@example.com'])).toBe(false);
  });

  it('rejects malformed addresses', () => {
    expect(validateEmail('plainaddress')).toBe(false);
    expect(validateEmail('missing-tld@domain')).toBe(false);
    expect(validateEmail('spaces in@mail.com')).toBe(false);
    expect(validateEmail('user@dom ain.com')).toBe(false);
    expect(validateEmail('@no-local-part.com')).toBe(false);
    expect(validateEmail('user@.com')).toBe(false);
  });
});

describe('validatePasswordLength', () => {
  it('enforces the minimum length exactly at the boundary', () => {
    expect(minPasswordLength).toBe(6);
    expect(validatePasswordLength('a'.repeat(minPasswordLength - 1))).toBe(false);
    expect(validatePasswordLength('a'.repeat(minPasswordLength))).toBe(true);
  });

  it('rejects a missing password or one that is not a string, rather than throwing on it', () => {
    expect(validatePasswordLength(undefined)).toBe(false);
    expect(validatePasswordLength(['a', 'b', 'c', 'd', 'e', 'f'])).toBe(false);
  });
});

describe('normaliseEmail', () => {
  it('lowercases and trims, so one address has one spelling', () => {
    expect(normaliseEmail('  Muki@Example.COM ')).toBe('muki@example.com');
  });

  /* A query operator sent in place of an address must never reach findOne */
  it('turns anything that is not a string into an empty string', () => {
    expect(normaliseEmail(undefined)).toBe('');
    expect(normaliseEmail({ $ne: null })).toBe('');
  });
});

/* bcrypt embeds a fresh salt in every hash, so these assert behaviour rather than a value */
describe('hashPassword', () => {
  it('produces a hash that verifies against the original password only', async () => {
    const hash = await hashPassword('hunter22');

    await expect(bcrypt.compare('hunter22', hash)).resolves.toBe(true);
    await expect(bcrypt.compare('wrong-pw', hash)).resolves.toBe(false);
  });

  it('gives the same password a different hash each time', async () => {
    const [first, second] = await Promise.all([hashPassword('hunter22'), hashPassword('hunter22')]);

    expect(first).not.toBe(second);
  });
});