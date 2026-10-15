const bcrypt = require('bcrypt');

/* Loose on purpose, since the only job here is to catch input that cannot be an address */
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const minPasswordLength = 6;

/* Bcrypt work factor, where each step up doubles the time to hash and to check */
const saltRounds = 10;

/* Both guards take whatever the request body held, so a missing field fails rather than throws */
const validateEmail = (email) => typeof email === 'string' && emailRegex.test(email);

const validatePasswordLength = (password) =>
  typeof password === 'string' && password.length >= minPasswordLength;

/* One spelling of an address everywhere, or the same person ends up with two accounts */
const normaliseEmail = (email) =>
  typeof email === 'string' ? email.trim().toLowerCase() : '';

const hashPassword = async (password) => bcrypt.hash(password, saltRounds);

module.exports = {
  validateEmail,
  validatePasswordLength,
  normaliseEmail,
  hashPassword,
  minPasswordLength,
};