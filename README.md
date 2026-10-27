# Puck

[![CI](https://github.com/ErikM9/Puck/actions/workflows/ci.yml/badge.svg)](https://github.com/ErikM9/Puck/actions/workflows/ci.yml)

Puck is a flashcard app for building your own decks and studying them. I built the client with React 18, TypeScript and Vite, and the API with Express and MongoDB.

**Live demo:** [erikm9.github.io/Puck](https://erikm9.github.io/Puck/). Register with any email address you like. The API runs on Render's free tier, which blocks outgoing email, so the demo opens new accounts without a verification link and sends no recovery codes, and the first request after a quiet spell can take up to a minute while the API wakes up.

## Features

- Accounts with JWT sign-in, email verification through a link which lasts 24 hours, and password recovery through a six-digit code sent by email
- Decks of at least three flashcards with your own questions and answers, which you can reorder, edit and delete while you build them
- Editing and deleting the decks you've saved
- Three games to study one deck or several at once:
  - FlashFlip, where you turn the cards over one at a time
  - FlashChoice, where you pick each card's answer from three options
  - FlashMatch, where you pair the questions with their answers, and a long question shows in full or on one line
- A layout which sizes and places its text to fit the screen, from a small phone to a wide desktop, and full keyboard access

## Tech stack

| Layer | Tech |
|---|---|
| Client | React 18, TypeScript, Vite, React Router, Axios |
| Server | Node.js, Express |
| Database | MongoDB with Mongoose |
| Auth | JWT (jsonwebtoken) and bcrypt |
| Email | Nodemailer through Gmail |
| Tests | Vitest, Testing Library, Supertest, mongodb-memory-server, Playwright |

## Running it locally

You need Node.js 20 or newer, a MongoDB server (local or on [MongoDB Atlas](https://www.mongodb.com/atlas)) and, if you want the emails to actually go out, a Gmail account with an App Password.

### The server

```bash
cd server
npm install
cp env.example .env
npm run dev   # development, with nodemon
npm start     # production
```

| Variable in `server/.env` | What it's for |
|---|---|
| `PORT` | The port the API listens on, 5000 by default |
| `MONGO_URI` | The MongoDB connection string |
| `JWT_SECRET` | Signs the login tokens, so make it long and random |
| `CLIENT_ORIGIN` | The client's address, the only origin CORS lets in |
| `CLIENT_URL` | Optional. Where the verification links open when the client lives under a path, such as `https://erikm9.github.io/Puck`; `CLIENT_ORIGIN` when it isn't set |
| `EMAIL_USER`, `EMAIL_PASS` | Optional. The Gmail address and its 16-character App Password, for the verification and recovery emails |
| `AUTH_RATE_LIMIT_MAX` | Optional. Requests per IP per 15 minutes on the `/auth` routes, 20 when it isn't set |
| `EMAIL_DISABLED` | Optional. Set it to 1 to run without sending any email, which also lets new accounts skip verification |
| `TRUST_PROXY` | Optional. Set it to 1 behind a reverse proxy, so the rate limiter sees each caller's own address |

`EMAIL_PASS` has to be an App Password, not the account's own password. Turn on 2-Step Verification, then create one under Google Account > Security > App Passwords. Without `EMAIL_USER` and `EMAIL_PASS` the server still runs, but no email leaves it: new accounts are unlocked without a verification link, recovery codes never arrive, and it says so when it starts. `env.example` leaves both commented out, so a fresh copy starts that way; to send email, fill in real values and uncomment them. A wrong address or password fails Gmail's check, which the log reports at startup. `EMAIL_DISABLED=1` switches email off on purpose, without the warning.

### The client

```bash
cd client
npm install
cp env.example .env   # VITE_API_BASE_URL=http://localhost:5000
npm run dev
```

Then open http://localhost:5173.

## Testing

| Level | Tools | Tests |
|---|---|---|
| Client unit and component | Vitest, Testing Library and user-event, in jsdom | 496 |
| Server integration and unit | Vitest and Supertest, against a real MongoDB | 97 |
| End-to-end | Playwright, against the real client, API and database | 45 per browser |

```bash
cd client && npm test                  # client unit and component tests
cd client && npm test -- --coverage    # the same with coverage and its thresholds
cd server && npm test                  # server tests
cd client && npm run test:e2e          # end-to-end tests
```

### Why these tools?

In my smaller projects I picked the testing tools so I could learn how various testing tools work. For Puck I went with Vitest, Testing Library, user-event, Supertest, mongodb-memory-server and Playwright, because they fit the project best and were the practical choice.

- Vitest is built on Vite, so the client tests compile TypeScript and JSX the same way the app does, with no Babel or ts-jest setup. The server uses it as well, so both halves share one test runner, and its fake timers, mocks and coverage thresholds come with it.
- Testing Library and user-event find elements by their role, label and text and use them the way a person would, so the component tests check what a visitor sees and does instead of the components' internals.
- Supertest sends real HTTP requests to the Express app without starting a server, and mongodb-memory-server gives every test file a throwaway MongoDB of its own, so the API is tested against the real database engine rather than a mock.
- Playwright drives the real client, API and database in Chromium, Firefox and a phone-sized Chrome. It starts both servers by itself, its request fixture seeds accounts and decks through the API, and it keeps a trace and a screenshot of every test which fails.

### Client tests

The tests sit beside the code they cover, `HomePage.test.tsx` next to `HomePage.tsx`. The component tests render the pages with Testing Library and drive them with user-event, or with fireEvent in the games' tests: signing in and out, email verification, password recovery, building and editing decks, picking decks on the home page, playing each game and the routes a signed-out visitor can't reach.

Puck sizes much of its text to fit, so a good part of the client is layout code (`textInk`, `useFitFont`, `rowLayout`, `deckLayout`, `columnsScale`) which measures where letters are actually drawn. jsdom lays nothing out, so those tests give the elements the sizes and boxes a browser would report, as real `DOMRect`s, and stand in for the canvas, `ResizeObserver` and the font set where jsdom has none.

The API client is stubbed with the errors Axios really rejects with, built by `src/test/apiErrors.ts`, so the forms are tested against the same `AxiosError`s they get in the browser.

### Server tests

The server tests drive the real Express app through Supertest against a real MongoDB, with Nodemailer stubbed so nothing leaves the machine. By default mongodb-memory-server starts a MongoDB for each test file. The first run downloads its binary, so give it time. To use a MongoDB you already have, set `MONGO_TEST_URI=mongodb://127.0.0.1:27017`, and each file works in a `puck_test_*` database of its own, which it drops when it finishes.

They cover registering and signing in, email verification (the link's single use, its expiry, the minute between emails and the sign-in an unverified account is refused), the whole recovery flow (the code's expiry, its five tries, the minute between emails and guesses sent at the same moment), the deck routes with their ownership and validation rules, the rate limit, the email service and the start-up failure when `MONGO_URI` is missing.

### End-to-end tests

Playwright drives a real browser against the real client, API and database, and seeds through the API whatever a test isn't about, so only the authentication spec registers through the form.

```bash
cd client
npx playwright install
npm run test:e2e
```

Have MongoDB running and point `MONGO_URI` at a throwaway database, since every run registers real accounts. Playwright starts the client on port 5174 and the API on port 5001 by itself, so a development stack on 5173 and 5000 can keep running alongside it. Locally it runs in Chromium. CI, or `E2E_ALL_BROWSERS=1`, adds Firefox and a Pixel 7 profile.

| Spec | What it covers | Tests |
|---|---|---|
| `01-authentication.spec.ts` | Registering, signing in and out, refused and missing credentials, password recovery and the routes a signed-out visitor can't reach | 9 |
| `02-deck-management.spec.ts` | Creating, renaming and deleting decks, the question before a deletion and the focus once it closes, the three-card minimum, the empty state and selecting decks | 8 |
| `03-study-games.spec.ts` | Playing FlashFlip, FlashChoice and FlashMatch, a long question's prompt shown whole or on one line, and leaving a game for the menu | 14 |
| `04-layout-and-accessibility.spec.ts` | No page scrolling sideways at four screen sizes, whole rows in the deck panel, the chosen sign-in tab filling its pill, the focus ring, reduced motion and text contrast | 10 |
| `05-keyboard.spec.ts` | Picking a deck and playing each game with the keyboard alone | 4 |

If a run is interrupted, its API can keep holding port 5001. On Windows this frees it:

```powershell
Get-NetTCPConnection -LocalPort 5001 -State Listen |
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

### How I write the tests

- One behaviour per test, with a title which says what happens from the user's side, never "should..."
- Arrange, act and assert, separated by blank lines, with no test depending on another one or on the order they run in
- Accessible queries first: roles, labels and text come before CSS selectors, which I only use where nothing accessible exists, such as the custom scrollbar or a tile's layout
- No fixed sleeps. The tests wait with `findBy*`, `waitFor` and web-first assertions, and anything time-based runs on Vitest's fake timers, or on timestamps set in the past in the server tests
- Doubles have to behave like the real thing: real `AxiosError`s, real `DOMRect`s, and a `ResizeObserver` and font set shaped like the browser's
- I check the tests against deliberately broken copies of the code, so a test which passes whatever the app does gets rewritten or deleted

### Coverage

`npm test -- --coverage` measures the client tests over `src/`, and CI fails when coverage drops below the thresholds in `vitest.config.ts`: 97% of statements, lines and functions and 89% of branches, a few points under the current figures.

### CI

GitHub Actions runs three jobs side by side on every push to `main` and every pull request:

| Job | What it does |
|---|---|
| client | Lint, `tsc -b` over the app, the build configs and the end-to-end specs, then the unit tests with coverage |
| server | Lint, then the server tests against an in-memory MongoDB |
| e2e | The Playwright suite against a MongoDB service container, one job per browser project |

When an end-to-end job fails, its HTML report, with the traces and screenshots, is uploaded as an artifact. A push to `main` which passes all three jobs is followed by a fourth, which builds the client for the `/Puck/` path and deploys it to GitHub Pages (see Deployment).

## API

Every `/decks` route needs an `Authorization: Bearer <token>` header.

| Method | Route | What it does |
|---|---|---|
| GET | `/health` | Answers 200 without a token, for anything checking that the server is up |
| POST | `/auth/register` | Creates an account and emails it a verification link |
| POST | `/auth/login` | Swaps an email and password for a JWT, once the address is verified |
| POST | `/auth/logout` | Acknowledges a sign-out, as the token is dropped by the client |
| POST | `/auth/verify-email` | Spends a verification link's token, after which the account can sign in |
| POST | `/auth/resend-verification` | Emails a fresh verification link, at most once a minute |
| POST | `/auth/forgot-password` | Emails a one-time recovery code |
| POST | `/auth/verify-reset-code` | Checks a code without spending it |
| POST | `/auth/reset-password` | Spends a code to set a new password |
| GET | `/decks` | Lists the signed-in user's decks |
| POST | `/decks` | Creates a deck |
| GET | `/decks/:id` | Fetches one deck |
| PUT | `/decks/:id` | Updates a deck, keeping any field the request leaves out |
| DELETE | `/decks/:id` | Deletes a deck |

## Project structure

```
client/                       React and TypeScript front end
  e2e/                        Playwright specs, with the page objects and seeding helpers in support/
  public/                     Served as it is (fairy.svg)
  src/
    api/                      The Axios client and its interceptors
    assets/fonts/             The recovery panel's two web fonts, with their licence
    test/                     The Vitest setup and the Axios error helpers shared by the client tests
    Components/
      Auth/                   Sign-in page, login, registration, email verification and password recovery
      Common/                 FitText, FillText, ScrollableBox and the text and row layout helpers
      CreateDecks/            The deck builder and its types
      Games/                  FlashFlip, FlashChoice, FlashMatch, the game menu and the end of a round
      Home/                   The deck list and its layout
      Navbar/
server/                       Express API
  config/                     MongoDB connection
  controllers/                Route handlers
  middleware/                 JWT check
  models/                     Mongoose schemas
  routes/                     Express routers
  tests/                      Vitest and Supertest suites, with the database helper in support/
  utils/                      Validation helpers and the email service
```

## Deployment

The demo is the client on GitHub Pages and the API on Render, with the database on MongoDB Atlas. The same three steps set up a copy of your own:

1. **Database.** Create a free cluster on [MongoDB Atlas](https://www.mongodb.com/atlas), add a database user, allow access from anywhere under Network Access (Render's outgoing addresses vary) and copy the connection string, with the user's password filled in and `/puck` as the database name.
2. **API.** On [Render](https://render.com), choose New, then Blueprint, and pick this repository. `render.yaml` describes the service: Node 20, `npm ci` and `node index.js` in `server/`, the `/health` check, `NODE_ENV=production`, `TRUST_PROXY=1`, a generated `JWT_SECRET`, `CLIENT_ORIGIN=https://erikm9.github.io`, `CLIENT_URL=https://erikm9.github.io/Puck` and `EMAIL_DISABLED=1`. It asks for `MONGO_URI` as it is applied. For a copy of your own, change `CLIENT_ORIGIN` and `CLIENT_URL` to your own Pages address first, as the API lets in no other origin. The service's address is on its page afterwards, `https://puck-api.onrender.com` or similar.

   Email is off because Render's free instances block outgoing mail on the SMTP ports, 25, 465 and 587. With the Gmail settings filled in there, every verification email would fail and new accounts would stay locked. On a paid instance, or a host which lets SMTP out, set `EMAIL_USER` and `EMAIL_PASS` and remove `EMAIL_DISABLED`, and verification and recovery both work.
3. **Client.** In the repository's settings, under Secrets and variables, Actions, add a repository variable `VITE_API_BASE_URL` holding the API's address. The `deploy` job in `ci.yml` then runs after every push to `main` whose tests pass (and is skipped while the variable doesn't exist): it builds the client with `BASE_PATH=/Puck/` and that variable, adds a `404.html` copy of the app so Pages hands deep links such as `/Puck/home` to React Router, and publishes `client/dist`. Pages has to be set to deploy from GitHub Actions once, in the repository settings.

For any other host, the same rules apply:

- Behind a reverse proxy, which covers most managed hosts and nginx, set `TRUST_PROXY=1`, so the rate limiter reads each caller's address from `X-Forwarded-For`. Without it every caller shares the proxy's address and the per-IP limit turns into one limit shared by everyone. Leave it unset when the server is exposed directly, because then anyone can fake the header.
- Run the server with `NODE_ENV=production`, so Express answers a malformed request with a plain error page instead of a stack trace.
- `CLIENT_ORIGIN` has to match the origin the browser shows exactly, scheme included and without a path or a trailing slash, or CORS refuses every request. When the client lives under a path, `CLIENT_URL` holds the full address, so the verification links open the app rather than the site's root.
- The client is static files: `cd client && npm run build` writes them to `client/dist`, with `VITE_API_BASE_URL` baked in at build time, so set it before building, and `BASE_PATH` when the site lives under a path. The host has to serve `index.html` for every path under the site, as React Router handles the routes in the browser.