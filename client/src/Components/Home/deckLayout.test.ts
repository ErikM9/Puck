import { renderHook } from '@testing-library/react';
import { NameShape, largestFitting, overTwo, placeDecks, settleDecks, useDeckLayout } from './deckLayout';
import {
  Extent, blockExtent, centreDrawnBetween, centreInkBetween, drawnLetters, fillBetween, laidExtent, letterRun,
  lineWidths, paintedFillTop, reachOf, textWidth,
} from '../Common/textInk';
import { splitsAWord } from '../Common/useFitFont';

/* jsdom lays nothing out, so what textInk measures of a laid-out page is stood in for */
vi.mock('../Common/textInk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../Common/textInk')>();
  return {
    ...actual,
    blockExtent: vi.fn(),
    centreDrawnBetween: vi.fn(),
    centreInkBetween: vi.fn(),
    drawnLetters: vi.fn(),
    fillBetween: vi.fn(),
    laidExtent: vi.fn(),
    letterRun: vi.fn(),
    lineWidths: vi.fn(),
    paintedFillTop: vi.fn(),
    reachOf: vi.fn(),
    textWidth: vi.fn(),
  };
});

vi.mock('../Common/useFitFont', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../Common/useFitFont')>()),
  splitsAWord: vi.fn(),
}));

/* A single word as wide as a line of the longest name, and a name of words 10 wide that splits into lines 5 wide */
const word: NameShape = { words: false, one: 7.5, across: 10.7, twoWide: 3.75, twoTall: 2 };
const words: NameShape = { words: true, one: 10, across: 11.1, twoWide: 5, twoTall: 2 };

describe('overTwo', () => {
  /* A line of the longest name runs 7.5 for each pixel of size, and two lines of the tallest letters stand 2.0222 */
  it('keeps a single word on one line where it runs no wider than a line of the longest name, and splits a wider one', () => {
    expect(overTwo([word, { ...word, one: 7.55 }, { ...word, one: 7.7 }], 7.5, 2.0222)).toEqual([false, false, true]);
  });

  it('sends a name of words over two lines where its one line would be drawn too narrow to stand as tall as two', () => {
    /* Drawn 7.5 wide and 2.0222 tall, a name 11.1 wide for each pixel of height is 0.33 as wide, and one 6 wide 0.62 */
    expect(overTwo([words, { ...words, across: 6 }], 7.5, 2.0222)).toEqual([true, false]);
  });

  it('keeps a name that cannot be split, or cannot be measured, on one line', () => {
    expect(overTwo([{ ...word, one: 9, twoWide: null, twoTall: null }, null], 7.5, 2.0222)).toEqual([false, false]);
  });
});

describe('largestFitting', () => {
  it('finds the largest size, a quarter of a pixel at a time, at which something fits', () => {
    expect(largestFitting(size => size <= 11.6)).toBe(11.5);
  });

  it('gives the smallest size where nothing fits', () => {
    expect(largestFitting(() => false)).toBe(7);
  });

  it('gives the largest size where everything fits', () => {
    expect(largestFitting(() => true)).toBe(36);
  });

  it('finds it no larger than a size given, which it gives where that fits', () => {
    expect(largestFitting(size => size <= 11.6, 10.19)).toBe(10.19);
    expect(largestFitting(size => size <= 9.6, 10.19)).toBe(9.5);
  });
});

/* How wide a name runs on one line and on the wider of two, and how tall its letters stand, for each pixel of its size */
const NAMES: Record<string, { one: number; two: number; high: number }> = {
  'Organic Chemistry II': { one: 10, two: 5, high: 0.9 },
  'Wide Wordy Name': { one: 10, two: 8, high: 0.9 },
  'Art History': { one: 7, two: 3.6, high: 0.9 },
  'mean scores': { one: 8, two: 4, high: 0.5 },
  Thermodynamics: { one: 9, two: 4.6, high: 0.9 },
};
const SHORT_WORD = { one: 4, two: 2, high: 0.9 };
const shapeFor = (el: HTMLElement) => NAMES[el.textContent ?? ''] ?? SHORT_WORD;

/* How wide a box's lines may run inside its padding, from its own width or the one given */
const inside = (el: HTMLElement, wide: number) =>
  (parseFloat(el.style.width) || wide) - (parseFloat(el.style.paddingLeft) || 0) - (parseFloat(el.style.paddingRight) || 0);

/* A name set to wrap goes over two lines where its one line runs wider than its box, 88 like its heading */
const nameLines = (el: HTMLElement) => {
  const { one, two } = shapeFor(el);
  const size = parseFloat(el.style.fontSize);
  return el.style.whiteSpace === 'normal' && one * size > inside(el, 88) ? [two * size, two * size * 0.8] : [one * size];
};

/* The card count's letters stand 6 tall and 12 above the buttons, and grow with them */
const countLetters = (count: HTMLElement): Extent => {
  const buttons = (count.parentElement?.querySelector('.deck-item-actions') as HTMLElement).getBoundingClientRect();
  const grown = buttons.height / 24;
  return { top: buttons.top - 18 * grown, bottom: buttons.top - 12 * grown };
};

/* A letter runs half as wide as its size, and a W as wide */
const widthOf = (text: string, size: number) =>
  Array.from(text).reduce((sum, letter) => sum + (letter === 'W' ? 1 : 0.5) * size, 0);

/* Lines across a description's box of 92 break anywhere one is full, and at a zero-width space where a share does not fit */
function lineBoxes(this: Range) {
  const box = this.startContainer as HTMLElement;
  const size = parseFloat(box.style.fontSize) || 12;
  const across = inside(box, 92);
  let rows = 0;
  let used = across;
  (box.textContent ?? '').split('\u200B').forEach(share => {
    const wide = widthOf(share, size);
    if (used + wide <= across) used += wide;
    else {
      rows += Math.ceil(wide / across);
      used = wide - (Math.ceil(wide / across) - 1) * across;
    }
  });
  return Array.from({ length: rows }, (_, row) => new DOMRect(4, 28 + row * 20, across, 20)) as unknown as DOMRectList;
}

/* A table of decks 100 wide and 150 tall, or taller by as much as given, side by side, which a test can resize or scroll */
const tableOf = (decks: [string, string][], { taller = 0, labelled = 60, counting = '12px' } = {}) => {
  const view = { taller, scrolled: 0 };
  const table = document.createElement('div');
  table.className = 'deck-list';
  table.getBoundingClientRect = () => new DOMRect(0, 0, 400, 320);
  const set = (property: string) => parseFloat(table.style.getPropertyValue(property)) || 0;
  const grown = () => set('--counter-grow') || 1;
  decks.forEach(([name, description], i) => {
    const item = document.createElement('div');
    item.className = 'deck-item';
    item.style.width = '100px';
    item.style.borderTopWidth = '1px';
    item.style.borderBottomWidth = '1px';
    item.innerHTML = '<h3><div class="deck-title-text"></div></h3><div class="deck-desc"></div>'
      + '<p class="deck-card-count">1 card</p><div class="deck-item-actions">'
      + '<button><span class="mini-btn-label">Edit</span></button><button><span class="mini-btn-label">Delete</span></button>'
      + '</div>';
    const heading = item.querySelector('h3') as HTMLElement;
    const title = item.querySelector('.deck-title-text') as HTMLElement;
    const text = item.querySelector('.deck-desc') as HTMLElement;
    const count = item.querySelector('.deck-card-count') as HTMLElement;
    const buttons = item.querySelector('.deck-item-actions') as HTMLElement;
    title.textContent = name;
    title.style.height = '18px';
    text.textContent = description;
    heading.style.width = '88px';
    count.style.fontSize = counting;
    const left = i * 114;
    const top = () => -view.scrolled;
    item.getBoundingClientRect = () => new DOMRect(left, top(), 100, 150 + view.taller);
    /* The underline at 27, which goes down as far as the names' box is set taller than 18 */
    heading.getBoundingClientRect = () => {
      /* Laid out, the name's box is as tall as --title-band, which jsdom cannot read from the stylesheet's var() */
      title.style.height = `${set('--title-band') || 18}px`;
      return new DOMRect(left + 6, top() + 6, 88, 4 + (set('--title-band') || 18));
    };
    /* A name's box runs the heading's width */
    Object.defineProperty(title, 'clientWidth', { value: 88 });
    text.getBoundingClientRect = () => new DOMRect(left + 4, top() + 28, 92, 74 + view.taller);
    /* The buttons end 5 above the bottom border, grow up from there, and stand as much higher as the deck's foot */
    buttons.getBoundingClientRect = () => {
      const bottom = top() + 144 + view.taller - set('--deck-foot') * grown();
      /* Laid out in 64ths of a pixel, as Chrome lays out boxes */
      const snap = (y: number) => Math.round(y * 64) / 64;
      return new DOMRect(left + 6, snap(bottom - snap(24 * grown())), 88, snap(24 * grown()));
    };
    /* A label narrows as the buttons grow, as the 2 either side of it keeps its width in its own pixels */
    buttons.querySelectorAll<HTMLElement>('.mini-btn-label').forEach(label => {
      label.getBoundingClientRect = () => new DOMRect(0, 0, labelled + 2 - 2 * grown(), 24);
    });
    table.append(item);
  });
  document.body.append(table);
  return { table, view };
};

const settle = (decks: [string, string][], options: Parameters<typeof tableOf>[1] = {}) => {
  const { table } = tableOf(decks, options);
  settleDecks(table);
  return table;
};

const all = (table: HTMLElement, selector: string) => Array.from(table.querySelectorAll<HTMLElement>(selector));
const fontSizes = (table: HTMLElement, selector: string) => all(table, selector).map(el => el.style.fontSize);

const RUN = 'D'.repeat(50);
const DECKS: [string, string][] = [
  ['Biology', 'Cells and what they do'],
  ['Organic Chemistry II', 'Reactions of alkenes and alkynes, and what each step needs'],
  ['Physics', RUN],
];

/* A deck 10 shorter, in which the longest description fits over five lines at 10 and would take six at 10.25 */
const SHORTER = -10;

beforeEach(() => {
  Range.prototype.getClientRects = lineBoxes;
  /* The tallest letters reach 0.7 of the size above the line and the longest tails 0.2 below it, a capital as high */
  vi.mocked(reachOf).mockReturnValue({ up: 0.7, down: 0.2 });
  /* A capital runs 0.75 of a name's size and 0.6875 of a description's, so a name is set 1.1044 times as large */
  vi.mocked(letterRun).mockImplementation(el => ({ per: el.classList.contains('deck-desc') ? 0.6875 : 0.75, spacing: 0 }));
  vi.mocked(lineWidths).mockImplementation(nameLines);
  /* A name's letters stand as high as given, and its lines a line height apart */
  vi.mocked(blockExtent).mockImplementation(el => {
    const size = parseFloat(el.style.fontSize);
    const lines = nameLines(el).length;
    return { top: 0, bottom: ((lines - 1) * parseFloat(el.style.lineHeight || '0') + shapeFor(el).high) * size };
  });
  vi.mocked(laidExtent).mockImplementation(countLetters);
  vi.mocked(drawnLetters).mockImplementation(countLetters);
  /* Text runs half as wide as its size for each letter */
  vi.mocked(textWidth).mockImplementation((_el, text, size) => text.length * size * 0.5);
  /* A deck's fill starts under its top border, a pixel deep */
  vi.mocked(paintedFillTop).mockImplementation(item => Math.round(item.getBoundingClientRect().top) + 1);
  /* A name on one line is drawn as it is laid out */
  vi.mocked(fillBetween).mockImplementation((_el, _above, _below, tall) => ({ across: 1, down: 1, tall }));
  /* A word is split where it runs wider than its description's line */
  vi.mocked(splitsAWord).mockImplementation(el =>
    (el.textContent ?? '').split(' ').some(part => widthOf(part, parseFloat(el.style.fontSize)) > inside(el, 92)));
});

afterEach(() => {
  delete (Range.prototype as { getClientRects?: unknown }).getClientRects;
  document.body.innerHTML = '';
});

describe('settleDecks', () => {
  it('lays every deck out alike for the longest name and description the deck form allows, whatever its own', () => {
    const long = settle(DECKS, { taller: SHORTER });

    const short = settle([['Bio', 'Cells'], ['Art', 'Painters']], { taller: SHORTER });

    expect(short.style.cssText).toBe(long.style.cssText);
    expect(fontSizes(short, '.deck-desc')).toEqual(['10px', '10px']);
  });

  it('lays the decks out the same when they are set again as they stand', () => {
    /* The second time, the count and the buttons are already drawn larger and the run already shared out */
    const { table } = tableOf(DECKS, { taller: 110 });
    settleDecks(table);
    const laid = table.style.cssText;
    const shared = all(table, '.deck-desc')[2].textContent;

    settleDecks(table);

    expect(table.style.cssText).toBe(laid);
    expect(all(table, '.deck-desc')[2].textContent).toBe(shared);
  });

  it('sets the descriptions at the largest size at which the longest description fits over five even lines', () => {
    /* At 10 its 60 capitals run 12 to a line, over five lines 51.8 tall in the 56.88 left, and at 10.25 they take six */
    const table = settle(DECKS, { taller: SHORTER });

    expect(fontSizes(table, '.deck-desc')).toEqual(['10px', '10px', '10px']);
  });

  it('sets every name a little larger than the descriptions, for a line of the longest name to run as wide', () => {
    const table = settle(DECKS, { taller: SHORTER });

    expect(fontSizes(table, '.deck-title-text')).toEqual(['11.04px', '11.04px', '11.04px']);
  });

  it('stands the longest name\'s two lines a space from the top border and the underline, as deep as the buttons stand', () => {
    /* At 11.04 its two lines stand 20.12 tall, which with 5 above and below them, less the 8 around the box, is 22.12 */
    const table = settle(DECKS, { taller: SHORTER });

    expect(table.style.getPropertyValue('--title-band')).toBe('22.12px');
  });

  it('lays a name of words too wide for one line over two, midway between the top border and the underline', () => {
    /* The fill starts under the top border at 1, and the underline 10 + 22.12 down is drawn on the pixel at 31 */
    const table = settle(DECKS, { taller: SHORTER });

    const name = all(table, '.deck-title-text')[1];
    expect(name.style.whiteSpace).toBe('normal');
    expect(centreDrawnBetween).toHaveBeenCalledWith(name, 1, 31, 1);
  });

  it('draws a name on one line as wide as a line of the longest name and as tall as its two lines', () => {
    /* A line of the longest name runs 7.5 x 11.04 = 82.8 of the heading's 88 */
    const table = settle(DECKS, { taller: SHORTER });

    const name = all(table, '.deck-title-text')[0];
    expect(name.style.whiteSpace).toBe('');
    expect(fillBetween).toHaveBeenCalledWith(name, 1, 31, expect.closeTo(1.82222 * 11.04, 3), expect.closeTo(82.8 / 88, 6), 0.3);
  });

  it('holds every description to the width a line of the longest name runs', () => {
    /* That 82.8 draws each description's box of 92 in by 4.55 either side, leaving a tenth of a pixel to spare */
    const table = settle(DECKS, { taller: SHORTER });

    all(table, '.deck-desc').forEach(description => {
      expect(description.style.paddingLeft).toBe('4.55px');
      expect(description.style.paddingRight).toBe('4.55px');
    });
  });

  it('leaves the descriptions\' lines as the stylesheet spaces them, and draws the count and the buttons larger with the room they leave', () => {
    /* Five lines stand 51.8 tall in the 56.88 left, and the count and buttons take the 5.08 over at 30 per share larger */
    const table = settle(DECKS, { taller: SHORTER });

    all(table, '.deck-desc').forEach(description => {
      expect(description.style.lineHeight).toBe('');
    });
    expect(table.style.getPropertyValue('--counter-grow')).toBe('1.169');
    expect(table.style.getPropertyValue('--deck-foot')).toBe('');
  });

  it('centres each description between the underline and the card count\'s letters', () => {
    /* The underline, 10 + 22.12 down, ends on the pixel at 32 */
    const table = settle(DECKS, { taller: SHORTER });

    const description = all(table, '.deck-desc')[0];
    const count = all(table, '.deck-card-count')[0];
    expect(centreDrawnBetween).toHaveBeenCalledWith(description, 32, countLetters(count).top);
  });

  it('shares a run with no space in it out over its lines as evenly as they go, the first lines a letter longer', () => {
    /* Fifty letters run over 4 lines in a width of 82.9 at 10 */
    const table = settle(DECKS, { taller: SHORTER });

    const run = all(table, '.deck-desc')[2];
    expect(run.textContent?.split('\u200B')).toEqual(['D'.repeat(13), 'D'.repeat(13), 'D'.repeat(12), 'D'.repeat(12)]);
  });

  it('leaves a description with a space in it for the browser to break between its words', () => {
    const table = settle(DECKS, { taller: SHORTER });

    expect(all(table, '.deck-desc')[1].textContent).toBe(DECKS[1][1]);
  });

  it('leaves a run as it breaks where an even share of its letters would not fit on a line', () => {
    /* Thirty letters and ten wide Ws run over 4 lines, but the last ten, all Ws, would take 2 lines of their own */
    const mixed = 'D'.repeat(30) + 'W'.repeat(10);

    const table = settle([...DECKS, ['Maths', mixed]], { taller: SHORTER });

    expect(all(table, '.deck-desc')[3].textContent).toBe(mixed);
  });

  it('sets a deck\'s own description smaller where it runs over more lines than the longest description does, the rest as they are', () => {
    /* Ninety letters run over 6 lines at 10, and no more than 5 at 9 */
    const table = settle([...DECKS, ['Chemistry', 'D'.repeat(90)]], { taller: SHORTER });

    expect(fontSizes(table, '.deck-desc')).toEqual(['10px', '10px', '10px', '9px']);
  });

  it('sets a deck\'s own description smaller to keep its words whole, unless no size keeps them whole', () => {
    /* A word of 22 letters is split at 10 but fits a line at 7.5, while one of 45 is split even at 7 */
    const table = settle([
      ...DECKS,
      ['Medicine', 'Electroencephalography basics'],
      ['Lung disease', 'Pneumonoultramicroscopicsilicovolcanoconiosis explained'],
    ], { taller: SHORTER });

    expect(fontSizes(table, '.deck-desc').slice(3)).toEqual(['7.5px', '10px']);
  });

  it('sets the descriptions at the size five lines take, rather than over six that run narrower than the names', () => {
    /* At 10.5 its capitals would run 11 to a line, short of the names, so it takes 10.19, where 12 run the names' 84.38 */
    const table = settle(DECKS);

    all(table, '.deck-desc').forEach(description => {
      expect(description.style.fontSize).toBe('10.19px');
      expect(description.style.paddingLeft).toBe('3.76px');
    });
    expect(all(table, '.deck-title-text')[1].style.fontSize).toBe('11.25px');
  });

  it('sets the descriptions of a tall deck over six lines, their letters as wide as the names\' are drawn, and the names as large', () => {
    /* With 110 more room 10 capitals to a line at 12.23 run the 84.48 a line of the longest name may run */
    const table = settle(DECKS, { taller: 110 });

    expect(fontSizes(table, '.deck-desc')).toEqual(['12.23px', '12.23px', '12.23px']);
    expect(all(table, '.deck-title-text')[1].style.fontSize).toBe('12.23px');
  });

  it('draws a name over two lines narrower where it would run wider than a deck allows', () => {
    /* Its wider line runs 8 x 12.23 = 97.84 in a box a pixel wider, drawn 84.48 / 97.84 as wide under the underline at 64 */
    const table = settle([DECKS[0], ['Wide Wordy Name', 'Forces']], { taller: 110 });

    const name = all(table, '.deck-title-text')[1];
    expect(name.style.width).toBe('98.84px');
    expect(centreDrawnBetween).toHaveBeenCalledWith(name, 1, 64, expect.closeTo(84.48 / 97.84, 6));
  });

  it('draws in the sides of a name of words still on one line, to midway between its one line and its wider two', () => {
    /* At 11.04 the one line of Art History runs 7 x 11.04 = 77.28, inside its box of 88, and its wider two 39.74 */
    const table = settle([...DECKS, ['Art History', 'Painters']], { taller: SHORTER });

    const name = all(table, '.deck-title-text')[3];
    expect(name.style.paddingLeft).toBe('14.74px');
    expect(name.style.paddingRight).toBe('14.74px');
  });

  it('hides the break marked in a single word while it is kept on one line, and shows it where the word goes over two', () => {
    /* Biology runs 4 wide for each pixel of size, inside a line of the longest name, and Thermodynamics 9, wider */
    const { table } = tableOf([['Biology', 'Cells'], ['Thermodynamics', 'Heat']], { taller: SHORTER });
    const [short, long] = all(table, '.deck-title-text');
    short.innerHTML = 'Biol<wbr>ogy';
    long.innerHTML = 'Thermod<wbr>ynamics';

    settleDecks(table);

    expect(short.querySelector('wbr')?.style.display).toBe('none');
    expect(long.querySelector('wbr')?.style.display).toBe('');
    expect(long.style.whiteSpace).toBe('normal');
  });

  it('stands the lines of a name with short letters further apart, to stand as tall as the longest name\'s', () => {
    /* Two lines of letters 0.5 high stand 1.6222 tall for each pixel of size, 0.2 short of the longest name's 1.8222 */
    const table = settle([...DECKS, ['mean scores', 'Statistics']], { taller: SHORTER });

    expect(parseFloat(all(table, '.deck-title-text')[3].style.lineHeight)).toBeCloseTo(1.1222 + 0.2, 4);
  });

  it('draws the card count and the buttons as large as a label still fits, and gives the six spaces what is then left over', () => {
    /* Lines 1.12 apart leave 13.72 over, taken at 30 a share up to the 1.215 Delete fits, and the 7.27 left shared six ways */
    const table = settle(DECKS);

    expect(table.style.getPropertyValue('--counter-grow')).toBe('1.215');
    expect(table.style.getPropertyValue('--deck-foot')).toBe('1.00px');
  });

  it('sets the count\'s letters a space above the buttons, its box reaching as much further under them or less', () => {
    /* Drawn 1.215 larger, its letters stand 14.58 above the buttons, 8.37 more than the space of 6.21 */
    const table = settle(DECKS);

    expect(table.style.getPropertyValue('--count-below')).toBe('-6.89px');
  });

  it('draws them as large as fills the room even where the page\'s rounding then leaves it a hair short', () => {
    /* At 9.5 shorter, 1.186 larger leaves the room 0.002 short once the buttons are laid out, within the 0.05 allowed */
    const table = settle(DECKS, { taller: -9.5 });

    expect(table.style.getPropertyValue('--counter-grow')).toBe('1.186');
    expect(table.style.getPropertyValue('--deck-foot')).toBe('');
  });

  it('draws them no larger than a label still grows at', () => {
    /* A label 60 wide keeps 2 either side as it grows, so Delete's word, 48 and a pixel to spare, fits 62 / 51 larger */
    const table = settle(DECKS, { taller: 110 });

    expect(table.style.getPropertyValue('--counter-grow')).toBe('1.215');
  });

  it('shares the room left over alike by every space in the deck', () => {
    /* 91.2 is left over, 15.2 for each of the six spaces, which sets the buttons up 12.51 in their own pixels */
    const table = settle(DECKS, { taller: 110 });

    expect(table.style.getPropertyValue('--deck-foot')).toBe('12.51px');
    expect(table.style.getPropertyValue('--title-band')).toBe('54.69px');
  });

  it('draws them no larger than the widest count the decks are laid out for still fits a deck', () => {
    /* A hundred cards counted at 17 run 76.5 wide, which fits the 84.48 a deck allows drawn up to 1.104 larger */
    const table = settle(DECKS, { counting: '17px' });

    expect(table.style.getPropertyValue('--counter-grow')).toBe('1.104');
  });

  it('keeps the count and the buttons at their size where a label\'s word already fills its button', () => {
    /* Labels 45 wide are short of the 49 that Delete needs, so the 13.72 over goes to the six spaces alone */
    const table = settle(DECKS, { labelled: 45 });

    expect(table.style.getPropertyValue('--counter-grow')).toBe('');
    expect(table.style.getPropertyValue('--deck-foot')).toBe('2.29px');
  });

  it('lets every space give up a little of its depth for the longest description to run over six lines rather than five', () => {
    /* With 8 more room six lines at 12.23 need 4.34 more than there is, under a fifth of a space from each of the six */
    const table = settle(DECKS, { taller: 8 });

    expect(fontSizes(table, '.deck-desc')).toEqual(['12.23px', '12.23px', '12.23px']);
    expect(table.style.getPropertyValue('--counter-grow')).toBe('');
    expect(table.style.getPropertyValue('--deck-foot')).toBe('-0.72px');
    expect(table.style.getPropertyValue('--title-band')).toBe('22.84px');
  });

  it('sizes the descriptions by the spacing the stylesheet gives their lines, which it leaves as it is', () => {
    /* Lines 1.4 apart fit five to the room only at 9.25 */
    const sheet = document.createElement('style');
    sheet.textContent = '.deck-desc { font-size: 12px; line-height: 16.8px; }';
    document.body.append(sheet);

    const table = settle(DECKS, { taller: SHORTER });

    expect(fontSizes(table, '.deck-desc')).toEqual(['9.25px', '9.25px', '9.25px']);
    all(table, '.deck-desc').forEach(description => {
      expect(description.style.lineHeight).toBe('');
    });
  });

  it('leaves the decks alone where nothing can be measured', () => {
    vi.mocked(reachOf).mockReturnValue(null);

    const table = settle(DECKS);

    expect(fontSizes(table, '.deck-desc')).toEqual(['', '', '']);
    expect(table.style.getPropertyValue('--title-band')).toBe('');
  });
});

describe('placeDecks', () => {
  it('places the name and description of each deck in view again, at the scale its name is drawn at', () => {
    vi.mocked(fillBetween).mockImplementation((_el, _above, _below, tall) => ({ across: 0.9, down: 1.2, tall }));
    const { table, view } = tableOf(DECKS, { taller: SHORTER });
    settleDecks(table);
    vi.mocked(centreDrawnBetween).mockClear();
    view.scrolled = 40;

    placeDecks(table);

    const [single, several] = all(table, '.deck-title-text');
    expect(centreInkBetween).toHaveBeenCalledWith(single, -39, -9, { across: 0.9, down: 1.2 });
    expect(centreDrawnBetween).toHaveBeenCalledWith(several, -39, -9, 1);
    const count = all(table, '.deck-card-count')[0];
    expect(centreDrawnBetween).toHaveBeenCalledWith(all(table, '.deck-desc')[0], -8, countLetters(count).top);
  });

  it('places a deck that comes within its own height of the view', () => {
    /* Scrolled 279 up, a deck 140 tall ends 139 above the top of the view */
    const { table, view } = tableOf(DECKS, { taller: SHORTER });
    settleDecks(table);
    vi.mocked(centreDrawnBetween).mockClear();
    view.scrolled = 279;

    placeDecks(table);

    expect(centreDrawnBetween).toHaveBeenCalledWith(all(table, '.deck-title-text')[1], -278, -248, 1);
  });

  it('leaves a deck further than its own height out of view to be placed as it comes nearer', () => {
    const { table, view } = tableOf(DECKS, { taller: SHORTER });
    settleDecks(table);
    vi.mocked(centreDrawnBetween).mockClear();
    view.scrolled = 281;

    placeDecks(table);

    expect(centreDrawnBetween).not.toHaveBeenCalled();
    expect(centreInkBetween).not.toHaveBeenCalled();
  });
});

describe('useDeckLayout', () => {
  /* A ResizeObserver tells its callback about the elements it observes, which the setup's stand-in never does */
  class Observer {
    watched = new Set<Element>();

    constructor(readonly told: ResizeObserverCallback) {
      observers.push(this);
    }

    observe(el: Element) { this.watched.add(el); }

    unobserve(el: Element) { this.watched.delete(el); }

    disconnect() { this.watched.clear(); }
  }
  let observers: Observer[] = [];
  const resize = (el: Element) => observers
    .filter(observer => observer.watched.has(el))
    .forEach(observer => observer.told([], observer as unknown as ResizeObserver));

  beforeEach(() => {
    observers = [];
    vi.stubGlobal('ResizeObserver', Observer);
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    delete (document as { fonts?: unknown }).fonts;
  });

  const page = { current: document.body };

  it.each([
    ['the table', (table: HTMLElement) => resize(table)],
    ['a deck', (table: HTMLElement) => resize(all(table, '.deck-item')[0])],
    ['the window', () => window.dispatchEvent(new Event('resize'))],
  ])('sets the decks afresh when a resize of %s changes their size', (_, resizing) => {
    const { table, view } = tableOf(DECKS, { taller: SHORTER });
    renderHook(() => useDeckLayout(page, DECKS));

    view.taller = 0;
    resizing(table);
    vi.advanceTimersToNextFrame();

    expect(fontSizes(table, '.deck-desc')).toEqual(['10.19px', '10.19px', '10.19px']);
  });

  it('places the decks again as the table scrolls', () => {
    const { table, view } = tableOf(DECKS, { taller: SHORTER });
    renderHook(() => useDeckLayout(page, DECKS));
    vi.mocked(centreDrawnBetween).mockClear();

    view.scrolled = 40;
    vi.advanceTimersToNextFrame();

    expect(centreDrawnBetween).toHaveBeenCalledWith(all(table, '.deck-title-text')[1], -39, -9, 1);
  });

  it('sets the decks afresh once the fonts load', async () => {
    let loaded = () => {};
    /* A FontFaceSet as a browser gives it while its fonts load, which jsdom has none of */
    const fonts: { status: string; ready?: Promise<unknown> } = { status: 'loading' };
    fonts.ready = new Promise(resolve => {
      loaded = () => {
        fonts.status = 'loaded';
        resolve(fonts);
      };
    });
    Object.defineProperty(document, 'fonts', { configurable: true, value: fonts });
    const { table } = tableOf(DECKS, { taller: SHORTER });
    renderHook(() => useDeckLayout(page, DECKS));

    /* The web font runs a description's capitals 0.72 of its size, where the fallback's run 0.6875 */
    vi.mocked(letterRun).mockImplementation(el => ({ per: el.classList.contains('deck-desc') ? 0.72 : 0.75, spacing: 0 }));
    loaded();
    await fonts.ready;
    vi.advanceTimersToNextFrame();

    expect(fontSizes(table, '.deck-desc')).toEqual(['9.75px', '9.75px', '9.75px']);
  });

  it('stops following the table once the page is gone', () => {
    const { table, view } = tableOf(DECKS, { taller: SHORTER });
    const { unmount } = renderHook(() => useDeckLayout(page, DECKS));
    /* A resize just before the page goes leaves a frame waiting */
    view.taller = 0;
    window.dispatchEvent(new Event('resize'));

    unmount();
    vi.mocked(centreDrawnBetween).mockClear();
    view.scrolled = 40;
    resize(table);
    window.dispatchEvent(new Event('resize'));
    vi.advanceTimersToNextFrame();

    expect(fontSizes(table, '.deck-desc')).toEqual(['10px', '10px', '10px']);
    expect(centreDrawnBetween).not.toHaveBeenCalled();
  });
});