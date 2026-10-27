const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const authRoutes = require('./routes/auth');
const decksRoutes = require('./routes/decks');

const app = express();

app.use(helmet());

/* Behind a reverse proxy the rate limiter has to read X-Forwarded-For, or every caller shares the proxy's address */
if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);

/* Only the client may call the API, and 5173 is where Vite serves it in development */
app.use(cors({
  origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  credentials: true,
}));

/* The client caps a card at 200 characters, so even a large deck is small and anything past this is not a real request */
app.use(express.json({ limit: '256kb' }));

/* Overridable, as the browser suite registers dozens of accounts from one IP */
const configuredLimit = Number(process.env.AUTH_RATE_LIMIT_MAX);
/* Anything but a positive whole number falls back, as 0 would refuse every request and NaN would allow them all */
const authMax = Number.isInteger(configuredLimit) && configuredLimit > 0
  ? configuredLimit
  : (process.env.NODE_ENV === 'test' ? 1000 : 20);

/* Guessing passwords or codes costs attempts, and this is what makes those attempts finite */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: authMax,
  message: { message: 'Too many requests from this IP, please try again later.' },
});

/* Answers 200 without a token, so a supervisor can tell the API is up without reading a 401 as good news */
app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

app.use('/auth', authLimiter, authRoutes);
app.use('/decks', decksRoutes);

module.exports = app;