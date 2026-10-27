import { test as base, expect, Page, APIRequestContext } from '@playwright/test';

/* Unique per call, so tests running side by side never share an account */
export const uniqueEmail = () => `e2e_${Date.now()}_${Math.floor(Math.random() * 1e6)}@puck.test`;
export const PASSWORD = 'e2e-Passw0rd!';

const API = process.env.E2E_API_URL ?? 'http://localhost:5001';

/* Creates an account through the API and leaves the browser signed out */
export async function registerAccount(request: APIRequestContext) {
  const email = uniqueEmail();
  const response = await request.post(`${API}/auth/register`, { data: { email, password: PASSWORD } });
  await expect(response).toBeOK();
  return email;
}

/* Signs the browser in to a new account through the API, for tests whose subject is not signing in */
export async function seedAccount(page: Page, request: APIRequestContext) {
  const email = await registerAccount(request);
  const response = await request.post(`${API}/auth/login`, { data: { email, password: PASSWORD } });
  await expect(response).toBeOK();
  const { token } = await response.json();

  /* Runs before the app's own scripts on every navigation, so App finds the token as it mounts */
  await page.addInitScript(value => localStorage.setItem('token', value), token);
  return { email, token };
}

type SeedDeck = { name: string; description: string; flashcards: { question: string; answer: string }[] };

export async function seedDeck(request: APIRequestContext, token: string, deck: SeedDeck) {
  const response = await request.post(`${API}/decks`, {
    headers: { Authorization: `Bearer ${token}` },
    data: deck,
  });
  await expect(response).toBeOK();
}

export async function seedAccountWithDeck(page: Page, request: APIRequestContext, deck: SeedDeck) {
  const account = await seedAccount(page, request);
  await seedDeck(request, account.token, deck);
  return account;
}

/* Waits for the web fonts and two frames, by when the layout scripts have sized the page */
export const settled = (page: Page) => page.evaluate(async () => {
  await document.fonts.ready;
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
});

export class AuthPage {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto('/');
  }

  async register(email: string, password = PASSWORD) {
    await this.page.getByRole('tab', { name: 'Register' }).click();
    await this.page.getByLabel('Email:').fill(email);
    await this.page.getByLabel('Password:').fill(password);
    await this.page.getByRole('button', { name: 'Register', exact: true }).click();
  }

  /* Registering issues no token, so this waits for the form to hand over to Login and then signs in */
  async registerAndSignIn(email: string, password = PASSWORD) {
    await this.register(email, password);
    await this.page.getByRole('status').waitFor();
    await this.page.getByRole('button', { name: 'Login', exact: true }).waitFor();
    await this.login(email, password);
  }

  async login(email: string, password = PASSWORD) {
    await this.page.getByLabel('Email:').fill(email);
    await this.page.getByLabel('Password:').fill(password);
    await this.page.getByRole('button', { name: 'Login', exact: true }).click();
  }

  async enterRecovery() {
    await this.page.getByRole('button', { name: 'Forgot your password?' }).click();
  }

  async requestCode(email: string) {
    await this.page.getByLabel('Email:').fill(email);
    await this.page.getByRole('button', { name: 'Get Code' }).click();
  }
}

export class HomePage {
  constructor(private readonly page: Page) {}

  /* A deck's tile has no role or name of its own, so it is found by its class and the deck name it shows */
  deckNamed = (name: string) => this.page.locator('.deck-item').filter({ has: this.page.getByText(name, { exact: true }) });
  continueButton = () => this.page.getByRole('button', { name: 'Continue' });

  async goto() {
    await this.page.goto('/home');
  }

  async createDeck() {
    await this.page.getByRole('link', { name: 'Create Deck' }).click();
  }

  async select(name: string) {
    await this.deckNamed(name).click();
  }

  /* Presses a deck's Delete and confirms it in the overlay */
  async deleteDeck(name: string) {
    await this.deckNamed(name).getByRole('button', { name: 'Delete' }).click();
    await this.page.getByRole('alertdialog', { name: 'Delete this deck?' }).getByRole('button', { name: 'Delete' }).click();
  }
}

export class DeckFormPage {
  constructor(private readonly page: Page) {}

  saveButton = () => this.page.getByRole('button', { name: 'Save Deck' });

  async setName(name: string) {
    await this.page.getByRole('button', { name: 'Edit deck name' }).click();
    await this.page.getByLabel('Deck Name:').fill(name);
    await this.page.getByRole('button', { name: 'Done' }).click();
  }

  async setDescription(description: string) {
    await this.page.getByRole('button', { name: 'Edit description' }).click();
    await this.page.getByLabel('Description:').fill(description);
    await this.page.getByRole('button', { name: 'Done' }).click();
  }

  async addCard(question: string, answer: string) {
    await this.page.getByRole('button', { name: 'Add Flashcard' }).click();
    await this.page.getByLabel('Question:').fill(question);
    await this.page.getByLabel('Answer:').fill(answer);
    await this.page.getByRole('button', { name: 'Done' }).click();
  }

  /* Saving a deck, new or edited, returns to the deck list once the server has it */
  async save() {
    await this.saveButton().click();
  }
}

type Fixtures = { auth: AuthPage; home: HomePage; deckForm: DeckFormPage };

export const test = base.extend<Fixtures>({
  auth: async ({ page }, use) => { await use(new AuthPage(page)); },
  home: async ({ page }, use) => { await use(new HomePage(page)); },
  deckForm: async ({ page }, use) => { await use(new DeckFormPage(page)); },
});

export { expect };