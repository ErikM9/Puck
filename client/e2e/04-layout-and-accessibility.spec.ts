import type { APIRequestContext, Page } from '@playwright/test';
import { test, expect, seedAccount, seedDeck, settled, HomePage } from './support/fixtures';

/* One size per set of the stylesheet's breakpoints, as two sizes that meet the same media queries lay out alike */
const VIEWPORTS = [
  { name: 'Galaxy S8+', width: 360, height: 740 },
  { name: 'iPad Mini', width: 768, height: 1024 },
  { name: 'Nest Hub', width: 1024, height: 600 },
  { name: 'Laptop', width: 1440, height: 900 },
] as const;

const DECK = {
  name: 'Geography',
  description: 'Capitals of the world',
  flashcards: [['Capital of France?', 'Paris'], ['Capital of Japan?', 'Tokyo'], ['Capital of Peru?', 'Lima']]
    .map(([question, answer]) => ({ question, answer })),
};

/* Every element that would let the page scroll sideways, as html and body hide their own overflow */
const sidewaysScrollers = async (page: Page) => {
  await settled(page);
  return page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>('*'))
    .filter(el => /auto|scroll/.test(getComputedStyle(el).overflowX) && el.scrollWidth > el.clientWidth + 1)
    .map(el => `${el.tagName.toLowerCase()}.${el.className}`));
};

/* Runs the check on every page in turn, signed out first and then signed in with one deck picked */
const everyPage = async (page: Page, request: APIRequestContext, home: HomePage, check: (name: string) => Promise<void>) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Welcome to Puck' })).toBeVisible();
  await check('the sign-in page');

  const { token } = await seedAccount(page, request);
  await seedDeck(request, token, DECK);
  await home.goto();
  await expect(home.deckNamed('Geography')).toBeVisible();
  await check('Home');

  await home.createDeck();
  await expect(page.getByRole('heading', { name: 'Build Your Deck' })).toBeVisible();
  await check('Build Your Deck');

  await page.getByRole('link', { name: 'Back to Home' }).click();
  await home.select('Geography');
  await home.continueButton().click();
  await expect(page.getByRole('heading', { name: 'Game Menu' })).toBeVisible();
  await check('Game Menu');

  for (const game of ['FlashFlip', 'FlashChoice', 'FlashMatch']) {
    await page.getByRole('link', { name: `Play ${game}` }).click();
    await expect(page.getByRole('heading', { name: game })).toBeVisible();
    await check(game);
    await page.getByRole('link', { name: 'Back to Game Menu' }).click();
  }
};

test.describe('Layout and accessibility', () => {

  test.describe('no page scrolls sideways', () => {
    for (const viewport of VIEWPORTS) {
      test(`${viewport.name} at ${viewport.width}x${viewport.height}`, async ({ page, request, home }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        const overflowing: string[] = [];

        await everyPage(page, request, home, async name => {
          for (const scroller of await sidewaysScrollers(page)) overflowing.push(`${name}: ${scroller}`);
        });

        expect(overflowing).toEqual([]);
      });
    }
  });

  test('the deck panel shows whole rows, with the same space above and below them', async ({ page, request, home }) => {
    const { token } = await seedAccount(page, request);
    /* Nine decks make at least two rows, as a row holds eight at most */
    for (let n = 1; n <= 9; n += 1) await seedDeck(request, token, { ...DECK, name: `Deck ${n}` });
    await home.goto();
    await expect(home.deckNamed('Deck 9')).toBeAttached();
    await settled(page);

    /* The panel and its tiles have no roles, so they are found by class */
    const miss = await page.evaluate(() => {
      const panel = document.querySelector<HTMLElement>('.deck-list')!.getBoundingClientRect();
      const tiles = Array.from(document.querySelectorAll<HTMLElement>('.deck-list .deck-item'), tile => tile.getBoundingClientRect());
      const inset = tiles[0].top - panel.top;
      const pitch = tiles.find(tile => tile.top > tiles[0].top + 1)!.top - tiles[0].top;
      const gap = pitch - tiles[0].height;
      const room = panel.height - 2 * inset + gap;
      return Math.abs(room - Math.round(room / pitch) * pitch);
    });

    /* Whole rows fill the room inside an inset as deep as the one above them, to within a pixel of rounding */
    expect(miss).toBeLessThanOrEqual(1);
  });

  /* The card stands alone on a phone and beside two columns on a wide screen, where its tabs grow by rules of their own */
  for (const viewport of [{ width: 393, height: 851 }, { width: 1600, height: 900 }]) {
    test(`the chosen tab fills the pill of tabs at ${viewport.width}x${viewport.height}, however far the pill reaches down to level the fields`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto('/');
      await expect(page.getByRole('heading', { name: 'Welcome to Puck' })).toBeVisible();
      await settled(page);
      const card = page.locator('.auth-form-container');
      const tabs = page.getByRole('tablist');
      /* Distances are read in the card's own pixels, as a wide screen draws the page larger */
      const scale = await tabs.evaluate(el => el.getBoundingClientRect().width / (el as HTMLElement).offsetWidth);
      /* The reach the script sets depends on the fonts the browser has, so the test sets its own */
      await card.evaluate(el => el.style.setProperty('--auth-pill-reach', '0px'));
      const short = (await tabs.boundingBox())!.height;
      await card.evaluate(el => el.style.setProperty('--auth-pill-reach', '20px'));

      const pill = (await tabs.boundingBox())!;
      const tab = (await page.getByRole('tab', { selected: true }).boundingBox())!;
      const beside = (tab.x - pill.x) / scale;

      /* The tabs grow by the reach, to within a pixel of how the button lays out its taller box */
      expect(Math.abs((pill.height - short) / scale - 20)).toBeLessThan(1);
      /* The pill's rim is a pixel deeper below the tabs than above and beside them */
      expect((tab.y - pill.y) / scale).toBeCloseTo(beside, 0);
      expect((pill.y + pill.height - (tab.y + tab.height)) / scale).toBeCloseTo(beside + 1, 0);
    });
  }

  test('the first Tab lands on Log out, which shows a focus ring', async ({ page, request, home }) => {
    await seedAccount(page, request);
    await home.goto();
    await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();

    await page.keyboard.press('Tab');

    const logOut = page.getByRole('button', { name: 'Log out' });
    await expect(logOut).toBeFocused();
    await expect(logOut).not.toHaveCSS('outline-style', 'none');
  });

  test('animation is suppressed for visitors who ask for reduced motion', async ({ page, request, home }) => {
    await seedAccount(page, request);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await home.goto();
    await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();

    const lasting = await page.evaluate(() => Array.from(document.querySelectorAll('*'))
      .flatMap(el => [getComputedStyle(el), getComputedStyle(el, '::before'), getComputedStyle(el, '::after')])
      .flatMap(style => style.animationDuration.split(',').map(parseFloat))
      .filter(seconds => seconds >= 0.05));

    expect(lasting).toEqual([]);
  });

  test('body text clears the WCAG AA contrast floor against the page background', async ({ page, request, home }) => {
    await seedAccount(page, request);
    await home.goto();
    const text = page.getByText('Select one or more decks, then continue to the Game Menu.');
    await expect(text).toBeVisible();

    const ratio = await text.evaluate(el => {
      const channels = (value: string) => (value.match(/[\d.]+/g) ?? []).map(Number);
      const [red, green, blue, alpha = 1] = channels(getComputedStyle(el).color);
      const background = channels(getComputedStyle(document.documentElement).backgroundColor);
      /* A translucent colour lets the background through, so the colour seen is a blend of the two */
      const seen = [red, green, blue].map((channel, i) => channel * alpha + background[i] * (1 - alpha));
      const luminance = (rgb: number[]) => {
        const [r, g, b] = rgb.map(value => {
          const channel = value / 255;
          return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      const [light, dark] = [luminance(seen), luminance(background)].sort((a, b) => b - a);
      return (light + 0.05) / (dark + 0.05);
    });

    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });
});