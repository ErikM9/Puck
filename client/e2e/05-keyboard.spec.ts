import type { Locator, Page } from '@playwright/test';
import { test, expect, seedAccountWithDeck, settled } from './support/fixtures';

const CARDS = [
  ['Capital of France?', 'Paris'],
  ['Capital of Japan?', 'Tokyo'],
  ['Capital of Peru?', 'Lima'],
] as const;

/* Presses Tab until the control has focus, so a control left out of the tab order fails here */
const tabTo = async (page: Page, control: Locator) => {
  /* A board regroups its rows once it is measured, and a tile that moves row is re-created without its focus */
  await settled(page);
  for (let presses = 0; presses < 30 && !(await control.evaluate(el => el === document.activeElement)); presses += 1) {
    await page.keyboard.press('Tab');
  }
  await expect(control).toBeFocused();
};

/* Selects the deck and opens a game from the menu with the keyboard alone */
const openGame = async (page: Page, game: string) => {
  const checkbox = page.getByRole('checkbox', { name: 'Select Geography' });
  await tabTo(page, checkbox);
  await page.keyboard.press('Space');
  await expect(checkbox).toBeChecked();

  await tabTo(page, page.getByRole('button', { name: 'Continue' }));
  await page.keyboard.press('Enter');
  await tabTo(page, page.getByRole('link', { name: `Play ${game}` }));
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: game })).toBeVisible();
};

test.describe('Keyboard only', () => {
  test.beforeEach(async ({ page, request, home }) => {
    await seedAccountWithDeck(page, request, {
      name: 'Geography',
      description: 'Capitals of the world',
      flashcards: CARDS.map(([question, answer]) => ({ question, answer })),
    });
    await home.goto();
  });

  test('a deck is reached with Tab, selected with Space, and its tile shows the focus', async ({ page, home }) => {
    const checkbox = page.getByRole('checkbox', { name: 'Select Geography' });

    await tabTo(page, checkbox);
    await page.keyboard.press('Space');

    await expect(checkbox).toBeChecked();
    await expect(home.continueButton()).toBeEnabled();
    await expect(home.deckNamed('Geography')).not.toHaveCSS('outline-style', 'none');
  });

  test('FlashFlip turns a card over with Enter', async ({ page }) => {
    await openGame(page, 'FlashFlip');

    await tabTo(page, page.getByRole('button', { name: 'Capital of France?' }));
    await page.keyboard.press('Enter');

    await expect(page.getByRole('button', { name: 'Paris', pressed: true })).toBeVisible();
  });

  test('FlashChoice is answered from the keyboard, with focus kept in step', async ({ page }) => {
    await openGame(page, 'FlashChoice');

    await tabTo(page, page.getByRole('button', { name: 'Capital of France?' }));
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Question: Capital of France?' });
    await expect(dialog.getByRole('button', { name: /^(Paris|Tokyo|Lima)$/ }).first()).toBeFocused();
    await tabTo(page, dialog.getByRole('button', { name: 'Paris' }));
    await page.keyboard.press('Enter');

    await expect(page.getByRole('status')).toHaveText('Correct: 1 / 3');
    await expect(page.getByRole('button', { name: 'Capital of France? (answered correctly)' })).toBeFocused();
  });

  test('FlashMatch pairs a question with its answer and moves focus to the next question', async ({ page }) => {
    await openGame(page, 'FlashMatch');

    await tabTo(page, page.getByRole('button', { name: 'Capital of Japan?' }));
    await page.keyboard.press('Enter');
    await tabTo(page, page.getByRole('button', { name: 'Tokyo' }));
    await page.keyboard.press('Space');

    await expect(page.getByRole('status')).toContainText(/Matched:\s*1 \/ 3/);
    await expect(page.getByRole('button', { name: 'Capital of France?' })).toBeFocused();
  });
});