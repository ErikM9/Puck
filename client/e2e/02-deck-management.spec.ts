import { test, expect, seedAccount, seedDeck } from './support/fixtures';

/* A deck of the minimum size, for tests that need one to exist rather than to be built through the form */
const threeCardDeck = (name: string) => ({
  name,
  description: 'Desc',
  flashcards: [['Q1', 'A1'], ['Q2', 'A2'], ['Q3', 'A3']].map(([question, answer]) => ({ question, answer })),
});

test.describe('Deck management', () => {

  let token: string;

  test.beforeEach(async ({ page, request }) => {
    ({ token } = await seedAccount(page, request));
  });

  test('a deck can be created, returns to the deck list, and reports its card count', async ({ page, home, deckForm }) => {
    await home.goto();

    await home.createDeck();
    await deckForm.setName('Capital Cities');
    await deckForm.setDescription('Geography drills');
    await deckForm.addCard('Capital of France?', 'Paris');
    await deckForm.addCard('Capital of Japan?', 'Tokyo');
    await deckForm.addCard('Capital of Peru?', 'Lima');
    await deckForm.save();

    await expect(page).toHaveURL(/\/home$/);
    const deck = home.deckNamed('Capital Cities');
    await expect(deck).toBeVisible();
    await expect(deck).toContainText('3 cards');
  });

  test('an existing deck can be renamed, and the new name outlasts a reload', async ({ page, request, home, deckForm }) => {
    await seedDeck(request, token, threeCardDeck('Before'));
    await home.goto();

    await home.deckNamed('Before').getByRole('button', { name: 'Edit' }).click();
    await deckForm.setName('After');
    await deckForm.save();

    await expect(home.deckNamed('After')).toBeVisible();
    await expect(home.deckNamed('Before')).toHaveCount(0);
    await page.reload();
    await expect(home.deckNamed('After')).toBeVisible();
  });

  test('Delete asks first, and cancelling keeps the deck and returns the focus to its Delete', async ({ page, request, home }) => {
    await seedDeck(request, token, threeCardDeck('Keeper'));
    await home.goto();

    await home.deckNamed('Keeper').getByRole('button', { name: 'Delete' }).click();
    const question = page.getByRole('alertdialog', { name: 'Delete this deck?' });
    await expect(question).toContainText('Keeper and its 3 cards will be gone for good.');
    await question.getByRole('button', { name: 'Cancel' }).click();

    await expect(question).toBeHidden();
    await expect(home.deckNamed('Keeper')).toBeVisible();
    await expect(home.deckNamed('Keeper').getByRole('button', { name: 'Delete' })).toBeFocused();
    await page.reload();
    await expect(home.deckNamed('Keeper')).toBeVisible();
  });

  test('a deck can be deleted and does not come back on reload', async ({ page, request, home }) => {
    await seedDeck(request, token, threeCardDeck('Disposable'));
    await home.goto();

    await home.deleteDeck('Disposable');
    await expect(home.deckNamed('Disposable')).toHaveCount(0);

    await page.reload();
    await expect(page.getByText('You have no decks yet.')).toBeVisible();
  });

  test.describe('validation', () => {

    test('Save Deck stays disabled below the three-card minimum and opens at it', async ({ home, deckForm }) => {
      await home.goto();
      await home.createDeck();
      await deckForm.addCard('Q1', 'A1');
      await deckForm.addCard('Q2', 'A2');
      await expect(deckForm.saveButton()).toBeDisabled();

      await deckForm.addCard('Q3', 'A3');

      await expect(deckForm.saveButton()).toBeEnabled();
    });

    test('an unnamed deck is refused and never reaches the deck list', async ({ page, home, deckForm }) => {
      await home.goto();
      await home.createDeck();
      await deckForm.addCard('Q1', 'A1');
      await deckForm.addCard('Q2', 'A2');
      await deckForm.addCard('Q3', 'A3');

      await deckForm.save();

      await expect(page.getByText('Please add a deck name and a description.')).toBeVisible();
      await page.getByRole('link', { name: 'Back to Home' }).click();
      await expect(page.getByText('You have no decks yet.')).toBeVisible();
    });
  });

  test('a fresh account is told how to begin rather than shown a blank panel', async ({ page, home }) => {
    await home.goto();

    await expect(page.getByText('You have no decks yet.')).toBeVisible();
    await expect(page.getByText('Use Create Deck below to build your first set of flashcards.')).toBeVisible();
  });

  test('Continue stays disabled until at least one deck is selected', async ({ request, home }) => {
    await seedDeck(request, token, threeCardDeck('Selectable'));
    await home.goto();
    await expect(home.deckNamed('Selectable')).toBeVisible();
    await expect(home.continueButton()).toBeDisabled();

    await home.select('Selectable');

    await expect(home.continueButton()).toBeEnabled();
  });
});