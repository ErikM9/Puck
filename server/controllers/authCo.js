const bcrypt = require('bcrypt');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const User = require('../models/user');
const {
  validateEmail,
  validatePasswordLength,
  normaliseEmail,
  hashPassword,
  minPasswordLength,
} = require('../utils/utils');
const { sendVerificationEmail, sendPasswordResetEmail, canSend } = require('../utils/emailService');

const RESET_CODE_TTL_MS = 15 * 60 * 1000;
const RESET_RESEND_COOLDOWN_MS = 60 * 1000;
const RESET_MAX_ATTEMPTS = 5;
const VERIFY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const VERIFY_RESEND_COOLDOWN_MS = 60 * 1000;

/* Only a hash of a code or token is stored, so the plain one exists nowhere but in the email */
const hashSecret = (secret) =>
  crypto.createHash('sha256').update(String(secret)).digest('hex');

/* The page the verification link opens, under the client's own path on a host such as GitHub Pages */
const clientUrl = () =>
  (process.env.CLIENT_URL || process.env.CLIENT_ORIGIN || 'http://localhost:5173').replace(/\/$/, '');

/* Stores a fresh token's hash and expiry on the user, and gives back the link the email carries */
const issueVerificationLink = async (user) => {
  const token = crypto.randomBytes(32).toString('hex');
  user.verifyTokenHash = hashSecret(token);
  user.verifyTokenExpiry = new Date(Date.now() + VERIFY_TOKEN_TTL_MS);
  user.verifyLastSentAt = new Date();
  await user.save();
  return `${clientUrl()}/verify-email?token=${token}`;
};

/* Hashed at the cost saltRounds sets, so checking it for an unknown email takes as long as a real check */
const DUMMY_HASH = '$2b$10$CwTycUXWue0Thq9StjUM0uJ8.EKuBs1sTGkFTzHrJfMQmTOgAt4Iu';

/* Checks a code for verify and reset alike, returning the user or the error to send */
const checkResetCode = async (email, code) => {
  const invalid = { status: 400, body: { message: 'Invalid or expired code.' } };

  const user = await User.findOne({ email: normaliseEmail(email) });
  if (!user || !user.resetCodeHash || !user.resetCodeExpiry) return { error: invalid };
  if (user.resetCodeExpiry.getTime() < Date.now()) return { error: invalid };
  /* Each check reserves an attempt atomically before comparing, so guesses sent together cannot all slip under the limit */
  const reserved = await User.findOneAndUpdate(
    { _id: user._id, resetCodeAttempts: { $lt: RESET_MAX_ATTEMPTS } },
    { $inc: { resetCodeAttempts: 1 } },
    { new: true }
  );
  if (!reserved) {
    return { error: { status: 429, body: { message: 'Too many attempts. Please request a new code.' } } };
  }

  if (hashSecret(code) !== reserved.resetCodeHash) return { error: invalid };

  /* A correct code hands its reserved attempt back, so checking it before the reset costs nothing */
  reserved.resetCodeAttempts -= 1;
  await User.updateOne({ _id: reserved._id }, { $inc: { resetCodeAttempts: -1 } });

  return { user: reserved };
};

exports.register = async (req, res) => {
  try {
    const email = normaliseEmail(req.body.email);
    const { password } = req.body;

    if (!validateEmail(email)) {
      return res.status(400).json({ message: 'Invalid email format' });
    }
    if (!validatePasswordLength(password)) {
      return res.status(400).json({ message: `Password must be at least ${minPasswordLength} characters long` });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'This email is already in use' });
    }

    const hashedPassword = await hashPassword(password);
    /* Verification needs an email to carry the link, so a server which cannot send one unlocks the account at once */
    const pending = canSend();
    const newUser = new User({ email, password: hashedPassword, verificationPending: pending });
    await newUser.save();

    if (!pending) {
      return res.status(201).json({ message: 'Registration successful! Please log in.', verificationPending: false });
    }

    /* Awaited, so nobody is told to look for a link which never left the server */
    try {
      await sendVerificationEmail(email, await issueVerificationLink(newUser));
    } catch (err) {
      console.error('Verification email failed to send:', err.message);
      return res.status(201).json({
        message: 'Account created, but the email failed to send. Log in to ask for a new link.',
        verificationPending: true,
      });
    }

    res.status(201).json({
      message: 'Registration successful! Open the link we have emailed you, then log in.',
      verificationPending: true,
    });
  } catch (error) {
    /* Two sign-ups for one address can both pass the lookup above, and the unique index turns the second away */
    if (error.code === 11000 && error.keyPattern?.email) {
      return res.status(400).json({ message: 'This email is already in use' });
    }
    console.error('Error registering:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.login = async (req, res) => {
  try {
    const email = normaliseEmail(req.body.email);
    /* A password that is not a string would make bcrypt throw, so it is treated as a wrong one */
    const password = typeof req.body.password === 'string' ? req.body.password : '';

    const user = await User.findOne({ email });
    const isPasswordValid = await bcrypt.compare(password, user ? user.password : DUMMY_HASH);

    /* One answer for a wrong email and a wrong password, so a refusal never confirms that an account exists */
    if (!user || !isPasswordValid) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    /* Only once the password is right, so the state of an account is never revealed to anyone else */
    if (user.verificationPending) {
      return res.status(403).json({
        message: 'Please verify your email address first.',
        verificationPending: true,
      });
    }

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });
    res.status(200).json({ token });
  } catch (error) {
    console.error('Error logging in:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/* Spends the token once, so a link clicked a second time, or guessed, unlocks nothing */
exports.verifyEmail = async (req, res) => {
  try {
    const { token } = req.body;
    const invalid = { message: 'This verification link is invalid or has expired.' };
    if (!token) return res.status(400).json(invalid);

    const user = await User.findOne({ verifyTokenHash: hashSecret(token) });
    if (!user || !user.verifyTokenExpiry || user.verifyTokenExpiry.getTime() < Date.now()) {
      return res.status(400).json(invalid);
    }

    user.verificationPending = false;
    user.verifyTokenHash = null;
    user.verifyTokenExpiry = null;
    await user.save();

    res.status(200).json({ message: 'Email verified! You can now log in.' });
  } catch (error) {
    console.error('Error in verifyEmail:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/* Replies the same whether or not the address has an unverified account, so it reveals no accounts */
exports.resendVerification = async (req, res) => {
  try {
    const email = normaliseEmail(req.body.email);
    const generic = { message: 'If that email is registered and still unverified, a new link has been sent.' };

    if (!validateEmail(email)) return res.status(200).json(generic);

    const user = await User.findOne({ email });
    if (!user || !user.verificationPending) return res.status(200).json(generic);

    /* Repeat requests inside the cooldown get the same reply and send nothing, so no inbox floods */
    if (user.verifyLastSentAt && Date.now() - user.verifyLastSentAt.getTime() < VERIFY_RESEND_COOLDOWN_MS) {
      return res.status(200).json(generic);
    }

    const link = await issueVerificationLink(user);
    /* Unawaited, as a slower reply for real accounts would give away which ones exist */
    sendVerificationEmail(email, link).catch(err =>
      console.error('Verification email failed to send:', err.message)
    );

    res.status(200).json(generic);
  } catch (error) {
    console.error('Error in resendVerification:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/* Only acknowledges the sign-out, as a JWT leaves no server-side session to end */
exports.logout = async (req, res) => {
  res.status(200).json({ message: 'Logout successful' });
};

/* Replies the same whether or not the address is registered, so it reveals no accounts */
exports.forgotPassword = async (req, res) => {
  try {
    const email = normaliseEmail(req.body.email);
    const generic = { message: 'If that email is registered, a recovery code has been sent.' };

    if (!validateEmail(email)) return res.status(200).json(generic);

    const user = await User.findOne({ email });
    if (!user) return res.status(200).json(generic);

    /* Repeat requests inside the cooldown get the same reply and send nothing, so no inbox floods */
    if (user.resetCodeLastSentAt && Date.now() - user.resetCodeLastSentAt.getTime() < RESET_RESEND_COOLDOWN_MS) {
      return res.status(200).json(generic);
    }

    const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    user.resetCodeHash = hashSecret(code);
    user.resetCodeExpiry = new Date(Date.now() + RESET_CODE_TTL_MS);
    user.resetCodeAttempts = 0;
    user.resetCodeLastSentAt = new Date();
    await user.save();

    /* Also unawaited, as a slower reply for real accounts would give away which ones exist */
    sendPasswordResetEmail(email, code).catch(err =>
      console.error('Password reset email failed to send:', err.message)
    );

    res.status(200).json(generic);
  } catch (error) {
    console.error('Error in forgotPassword:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/* Tests a code without consuming it, which is what lets the client open the new-password step */
exports.verifyResetCode = async (req, res) => {
  try {
    const { email, code } = req.body;

    const result = await checkResetCode(email, code);
    if (result.error) return res.status(result.error.status).json(result.error.body);

    res.status(200).json({ message: 'Code verified.' });
  } catch (error) {
    console.error('Error in verifyResetCode:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/* Checks the code again and clears it in the same save, so one code can only be spent once */
exports.resetPassword = async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;

    if (!validatePasswordLength(newPassword)) {
      return res.status(400).json({ message: `Password must be at least ${minPasswordLength} characters long` });
    }

    const result = await checkResetCode(email, code);
    if (result.error) return res.status(result.error.status).json(result.error.body);

    const user = result.user;
    user.password = await hashPassword(newPassword);
    user.resetCodeHash = null;
    user.resetCodeExpiry = null;
    user.resetCodeAttempts = 0;
    /* A code from the inbox proves the address as well as the link would, so an unverified account is unlocked too */
    user.verificationPending = false;
    user.verifyTokenHash = null;
    user.verifyTokenExpiry = null;
    await user.save();

    res.status(200).json({ message: 'Password reset successful! Please log in.' });
  } catch (error) {
    console.error('Error in resetPassword:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};