import { test, expect, seedAccountWithDeck, settled } from './support/fixtures';

const CARDS = [
  ['Capital of France?', 'Paris'],
  ['Capital of Japan?', 'Tokyo'],
  ['Capital of Peru?', 'Lima'],
  ['Capital of Kenya?', 'Nairobi'],
] as const;

test.describe('Study games', () => {

  /* The deck is seeded, so a fault in the deck form fails 02 alone rather than every game as well */
  test.beforeEach(async ({ page, request, home }) => {
    await seedAccountWithDeck(page, request, {
      name: 'Geography',
      description: 'Capitals of the world',
      flashcards: CARDS.map(([question, answer]) => ({ question, answer })),
    });
    await home.goto();
    await home.select('Geography');
    await home.continueButton().click();
    await expect(page.getByRole('heading', { name: 'Game Menu' })).toBeVisible();
  });

  test.describe('FlashFlip', () => {

    test.beforeEach(async ({ page }) => {
      await page.getByRole('link', { name: 'Play FlashFlip' }).click();
    });

    test('a card turns over to its answer and back', async ({ page }) => {
      /* The turn is a CSS rotation of the element holding both faces, which has no role of its own */
      const faces = page.locator('.ff-flip-card-inner');

      await page.getByRole('button', { name: 'Capital of France?' }).click();
      await expect(page.getByRole('button', { name: 'Paris', pressed: true })).toBeVisible();
      await expect(faces).toHaveCSS('transform', /^matrix3d\(-1,/);

      await page.getByRole('button', { name: 'Paris' }).click();
      await expect(page.getByRole('button', { name: 'Capital of France?', pressed: false })).toBeVisible();
      await expect(faces).toHaveCSS('transform', 'none');
    });

    test('the deck can be walked forwards and back, and the counter follows', async ({ page }) => {
      await page.getByRole('button', { name: 'Next' }).click();
      await expect(page.getByRole('button', { name: 'Capital of Japan?' })).toBeVisible();
      await expect(page.getByText('2 / 4')).toBeVisible();

      await page.getByRole('button', { name: 'Prev' }).click();
      await expect(page.getByRole('button', { name: 'Capital of France?' })).toBeVisible();
      await expect(page.getByText('1 / 4')).toBeVisible();
    });

    test('moving to another card shows its question rather than the last answer', async ({ page }) => {
      await page.getByRole('button', { name: 'Capital of France?' }).click();
      await expect(page.getByRole('button', { name: 'Paris' })).toBeVisible();

      await page.getByRole('button', { name: 'Next' }).click();

      await expect(page.getByRole('button', { name: 'Capital of Japan?', pressed: false })).toBeVisible();
    });
  });

  test.describe('FlashChoice', () => {

    test.beforeEach(async ({ page }) => {
      await page.getByRole('link', { name: 'Play FlashChoice' }).click();
    });

    test('the board shows every question and a score starting at zero', async ({ page }) => {
      for (const [question] of CARDS) {
        await expect(page.getByRole('button', { name: question })).toBeVisible();
      }
      await expect(page.getByRole('status')).toHaveText('Correct: 0 / 4');
    });

    test('choosing the right option scores the card and marks it answered', async ({ page }) => {
      await page.getByRole('button', { name: 'Capital of France?' }).click();
      const dialog = page.getByRole('dialog', { name: 'Question: Capital of France?' });
      await expect(dialog.getByRole('button', { name: /^(Paris|Tokyo|Lima|Nairobi)$/ })).toHaveCount(3);

      await dialog.getByRole('button', { name: 'Paris' }).click();

      await expect(page.getByRole('status')).toHaveText('Correct: 1 / 4');
      await expect(page.getByRole('button', { name: 'Capital of France? (answered correctly)' })).toBeVisible();
    });

    test('answering every card ends the round with its score', async ({ page }) => {
      for (const [question, answer] of CARDS) {
        await page.getByRole('button', { name: question, exact: true }).click();
        await page.getByRole('dialog').getByRole('button', { name: answer }).click();
      }

      await expect(page.getByText('4 / 4')).toBeVisible();
      await expect(page.getByText('Round complete!')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Play Again' })).toBeVisible();
    });
  });

  test.describe('FlashMatch', () => {

    test.beforeEach(async ({ page }) => {
      await page.getByRole('link', { name: 'Play FlashMatch' }).click();
    });

    test('the answers stay out of sight until a question is picked', async ({ page }) => {
      const paris = page.getByRole('button', { name: 'Paris', includeHidden: true });
      await expect(paris).toBeHidden();

      await page.getByRole('button', { name: 'Capital of France?' }).click();

      await expect(paris).toBeVisible();
    });

    test('a correct pair leaves the board and counts towards the total', async ({ page }) => {
      await page.getByRole('button', { name: 'Capital of France?' }).click();
      await expect(page.getByText('Match: Capital of France?')).toBeVisible();

      await page.getByRole('button', { name: 'Paris' }).click();

      await expect(page.getByRole('status')).toContainText(/Matched:\s*1 \/ 4/);
      await expect(page.getByRole('button', { name: 'Capital of France?', includeHidden: true })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Paris', includeHidden: true })).toHaveCount(0);
    });

    test('a wrong pair is counted as a mistake and both cards stay in play', async ({ page }) => {
      await page.getByRole('button', { name: 'Capital of France?' }).click();

      await page.getByRole('button', { name: 'Tokyo' }).click();

      await expect(page.getByRole('status')).toContainText(/Mistakes:\s*1\D/);
      await expect(page.getByRole('status')).toContainText(/Matched:\s*0 \/ 4/);
      await expect(page.getByRole('button', { name: 'Capital of France?', includeHidden: true })).toHaveCount(1);
      await expect(page.getByRole('button', { name: 'Tokyo', includeHidden: true })).toHaveCount(1);
    });

    test('a picked question can be put back without guessing', async ({ page }) => {
      await page.getByRole('button', { name: 'Capital of France?' }).click();

      await page.getByRole('button', { name: 'Unsure? Pick another card' }).click();

      await expect(page.getByRole('button', { name: 'Capital of France?', pressed: false })).toBeVisible();
    });
  });

  /* Its own deck, as the question has to outrun the control above the prompt by a long way */
  test.describe('FlashMatch with a long question', () => {
    const long = 'Which process runs through prophase, metaphase, anaphase and telophase before the cell finally splits in two?';

    test.beforeEach(async ({ page, request, home }) => {
      await seedAccountWithDeck(page, request, {
        name: 'Biology',
        description: 'Cell division',
        flashcards: [[long, 'Mitosis'], ['What does the nucleus hold?', 'The genetic material'], ['What is DNA?', 'A nucleic acid']]
          .map(([question, answer]) => ({ question, answer })),
      });
      await home.goto();
      await home.select('Biology');
      await home.continueButton().click();
      await page.getByRole('link', { name: 'Play FlashMatch' }).click();
    });

    test('shows the whole question, centred under the control, with none of it cut', async ({ page }) => {
      await page.getByRole('button', { name: long }).click();

      const prompt = page.getByText(`Match: ${long}`);
      await expect(prompt).toBeVisible();
      const control = page.getByRole('button', { name: 'Unsure? Pick another card' });
      const [promptBox, controlBox, cut] = await Promise.all([
        prompt.boundingBox(),
        control.boundingBox(),
        prompt.evaluate(el => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1),
      ]);
      expect(cut).toBe(false);
      expect(promptBox!.width).toBeGreaterThan(controlBox!.width);
      /* Centred on the control, so it has grown past it by the same amount on each side */
      const promptCentre = promptBox!.x + promptBox!.width / 2;
      const controlCentre = controlBox!.x + controlBox!.width / 2;
      expect(Math.abs(promptCentre - controlCentre)).toBeLessThan(2);
    });

    /* On a phone the answers take the questions' place, so a prompt of one line leaves them where the questions stood */
    test('cuts the question to one line as wide as the control on a toggle, which keeps the answers where the questions stood', async ({ page }) => {
      await page.setViewportSize({ width: 393, height: 851 });
      await settled(page);
      const question = page.getByRole('button', { name: long });
      /* Read once the board has stopped moving, as it lays itself out again for the narrower window */
      await question.scrollIntoViewIfNeeded();
      const questionsAt = (await question.boundingBox())!.y;
      await question.click();
      const toggle = page.getByRole('button', { name: 'Whole question' });
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');

      await toggle.click();

      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      const prompt = page.getByText(`Match: ${long}`);
      const [promptBox, controlBox, toggleBox, cut] = await Promise.all([
        prompt.boundingBox(),
        page.getByRole('button', { name: 'Unsure? Pick another card' }).boundingBox(),
        toggle.boundingBox(),
        prompt.evaluate(el => el.scrollWidth > el.clientWidth + 1),
      ]);
      expect(cut).toBe(true);
      expect(promptBox!.width).toBeCloseTo(controlBox!.width, 0);
      /* The toggle stands past the line's right end rather than on it */
      expect(toggleBox!.x).toBeGreaterThanOrEqual(promptBox!.x + promptBox!.width - 0.5);
      const answer = page.getByRole('button', { name: /^(Mitosis|The genetic material|A nucleic acid)$/ }).first();
      await answer.scrollIntoViewIfNeeded();
      expect((await answer.boundingBox())!.y).toBeCloseTo(questionsAt, 0);
    });

    /* On a phone the line starts wider than the control above it until the control is measured */
    test('offers no toggle for a question that fits on the line, even after a long one was cut to it', async ({ page }) => {
      await page.setViewportSize({ width: 360, height: 740 });
      await page.getByRole('button', { name: long }).click();
      await page.getByRole('button', { name: 'Whole question' }).click();
      await page.getByRole('button', { name: 'Unsure? Pick another card' }).click();

      await page.getByRole('button', { name: 'What is DNA?' }).click();

      await expect(page.getByText('Match: What is DNA?')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Whole question' })).toHaveCount(0);
    });
  });

  test('the back control returns from a game to the menu', async ({ page }) => {
    await page.getByRole('link', { name: 'Play FlashFlip' }).click();

    await page.getByRole('link', { name: 'Back to Game Menu' }).click();

    await expect(page.getByRole('heading', { name: 'Game Menu' })).toBeVisible();
  });
});