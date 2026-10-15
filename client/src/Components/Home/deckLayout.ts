import { RefObject, useLayoutEffect } from 'react';
import { splitsAWord } from '../Common/useFitFont';
import {
  Scale, blockExtent, centreDrawnBetween, centreInkBetween, drawnLetters, fillBetween, laidExtent, letterRun,
  lineWidths, paintedFillTop, reachOf, textWidth,
} from '../Common/textInk';

/* Sizes and places the names and descriptions of the decks on the Home page */

/* The sizes a description is set between, and the steps it is tried in */
const SMALLEST = 7;
const LARGEST = 36;
const STEP = 0.25;

/* How far a name or a description may run across its deck at most, a little short of the deck's sides */
const WIDEST = 0.96;

/* The longest name and description the deck form allows, run over two lines and five, measured in one capital */
const NAME_LINE = 20 / 2;
const DESCRIPTION_LETTERS = 60;
const DESCRIPTION_LINE = DESCRIPTION_LETTERS / 5;
const SAMPLE = 'D';

/* Lets a word as long as a line of the longest name measure 1% wider, as measuring is not exact, and stay on one line */
const ONE_LINE_GRACE = 1.01;

/* How narrow a name of several words may be drawn on one line to stand as tall as two, before it goes over two instead */
const WORDS_NARROWEST = 0.55;

/* How narrow a name on one line may be drawn to stand as tall as two lines, as narrow as the widest whole word needs */
const ONE_LINE_NARROWEST = 0.3;

/* Lets a description's lines run a tenth of a pixel wider, as a browser measures letters a hair unlike a canvas */
const DESCRIPTION_SLACK = 0.1;

/* How much wider a name's line runs than a description's, so however fonts measure a description never shows wider */
const SPAN_MARGIN = 1.004;

/* How far the tails of a name's first line stand clear of the tallest letters of its second, as a share of its size */
const LINE_CLEAR = 2 / 9;
/* How much further apart, at most, a name's lines stand where its letters are shorter than capitals, to stand as tall */
const LINE_SPARE = 1 / 3;

/* The letters that reach furthest above the line, and furthest below it, in most text */
const TALL_LETTERS = 'Hbdfhklt';
const TAIL_LETTERS = 'gjpqy';

/* The size a name's shape is measured at, large enough for its fraction of a pixel */
const MEASURED_AT = 40;

/* How tall every name's box is, which puts the underline under it */
const TITLE_BAND = '--title-band';

/* How much larger than the stylesheet sets them the card count and buttons are drawn, and how much larger at most */
const COUNTER_GROW = '--counter-grow';
const GROW_MOST = 1.5;

/* The card count's bottom margin in its own pixels, which stands its letters one space above the buttons */
const COUNT_BELOW = '--count-below';
/* How far above the stylesheet's place the buttons stand, in their own pixels, as the spaces share the room left over */
const DECK_FOOT = '--deck-foot';

/* The widest card count the decks are laid out for, its digits all as wide as each other */
const COUNT_SAMPLE = '100 CARDS';

/* How much of its depth each space may give up for the longest description to run over six lines rather than five */
const GAP_GIVE = 0.25;

/* How many sizes the count and buttons are tried at, at most, in finding how much larger to draw them */
const SPREAD_TRIES = 6;
/* How near nothing, in the page's pixels, the room a try leaves must come for that try to be taken */
const SPREAD_NEAR = 0.05;

/* The largest size the labels of a deck's buttons are set at, as the stylesheet draws them, which they grow with */
export const LABEL_MOST = 16;

/* The elements of one deck's tile */
interface Deck {
  item: HTMLElement;
  heading: HTMLElement;
  name: HTMLElement;
  description: HTMLElement;
  count: HTMLElement;
  buttons: HTMLElement;
}

const partsOf = (item: HTMLElement): Deck | null => {
  const heading = item.querySelector('h3');
  const name = item.querySelector('.deck-title-text');
  const description = item.querySelector('.deck-desc');
  const count = item.querySelector('.deck-card-count');
  const buttons = item.querySelector('.deck-item-actions');
  if (!(heading instanceof HTMLElement) || !(name instanceof HTMLElement) || !(description instanceof HTMLElement)
    || !(count instanceof HTMLElement) || !(buttons instanceof HTMLElement)) return null;
  return { item, heading, name, description, count, buttons };
};

const decksIn = (table: HTMLElement) =>
  Array.from(table.querySelectorAll<HTMLElement>('.deck-item')).map(partsOf).filter((deck): deck is Deck => !!deck);

/* How a name measures, laid out large */
export interface NameShape {
  /* Whether it has more than one word */
  words: boolean;
  /* How wide its one line runs for each pixel of its size */
  one: number;
  /* How wide its one line runs for each pixel its letters stand tall */
  across: number;
  /* How wide the wider of its two lines runs for each pixel of its size, or null where it cannot go over two */
  twoWide: number | null;
  /* How tall its two lines stand a pitch apart for each pixel of its size, or null where it cannot go over two */
  twoTall: number | null;
}

/* Picks the names that go over two lines from their shapes for each pixel of size, so a name breaks alike at every size */
export const overTwo = (shapes: (NameShape | null)[], longest: number, tallest: number) =>
  shapes.map(shape => !!shape && shape.twoTall !== null && (shape.words
    ? shape.across * tallest * WORDS_NARROWEST > longest
    : shape.one > longest * ONE_LINE_GRACE));

/* Finds the largest size, a step at a time, at which something fits, or gives the smallest where nothing does */
export const largestFitting = (fits: (size: number) => boolean, most = LARGEST) => {
  if (fits(most)) return most;
  let low = SMALLEST;
  let high = most;
  if (!fits(low)) return low;
  while (high - low > STEP + 1e-9) {
    const middle = Math.round((low + high) / 2 / STEP) * STEP;
    if (fits(middle)) low = middle;
    else high = middle;
  }
  return low;
};

/* Lays a name out at a size on one line, or on two balanced lines a pitch apart, with its box as the stylesheet sets it */
const layName = (name: HTMLElement, split: boolean, size: number, pitch?: number) => {
  name.style.transform = '';
  name.style.removeProperty('height');
  name.style.removeProperty('width');
  name.style.removeProperty('margin-left');
  name.style.removeProperty('padding-left');
  name.style.removeProperty('padding-right');
  if (pitch) name.style.lineHeight = String(pitch);
  else name.style.removeProperty('line-height');
  name.style.whiteSpace = split ? 'normal' : '';
  if (split) name.style.setProperty('text-wrap', 'balance');
  else name.style.removeProperty('text-wrap');
  /* Chrome breaks at a marked break even on a line set not to wrap, so the mark is hidden on one line */
  name.querySelectorAll('wbr').forEach(mark => { mark.style.display = split ? '' : 'none'; });
  name.style.fontSize = `${size}px`;
};

/* Draws in the sides of a name still on one line to midway between its one line and its wider two, so it breaks evenly */
const pressToTwo = (name: HTMLElement, zoom: number, twoWide: number) => {
  const lines = lineWidths(name);
  if (lines.length !== 1) return;
  const inset = Math.max(0, (name.clientWidth - (lines[0] / zoom + twoWide) / 2) / 2);
  name.style.paddingLeft = `${inset.toFixed(2)}px`;
  name.style.paddingRight = `${inset.toFixed(2)}px`;
};

/* Sets a name too wide for its deck in a box as wide as its wider line, centred, so it is drawn narrower about the middle */
const widenToTwo = (name: HTMLElement, wide: number, room: number) => {
  name.style.width = `${wide.toFixed(2)}px`;
  name.style.marginLeft = `${((room - wide) / 2).toFixed(2)}px`;
};

/* A name's shape, measured large, or null where it cannot be measured */
const shapeOf = (name: HTMLElement, zoom: number, pitch: number): NameShape | null => {
  const words = /\S\s+\S/.test(name.textContent ?? '');
  layName(name, false, MEASURED_AT);
  const one = lineWidths(name)[0];
  const stands = blockExtent(name);
  if (!(one > 0) || !stands || !(stands.bottom > stands.top)) return null;
  const shape: NameShape = {
    words,
    one: one / zoom / MEASURED_AT,
    across: one / (stands.bottom - stands.top),
    twoWide: null,
    twoTall: null,
  };
  if (words || name.querySelector('wbr')) {
    layName(name, true, MEASURED_AT, pitch);
    /* Laid out just narrower than its one line, which puts it over two however wide its deck */
    name.style.width = `${(one / zoom - 0.5).toFixed(2)}px`;
    const lines = lineWidths(name);
    const two = blockExtent(name);
    if (lines.length === 2 && two) {
      shape.twoWide = Math.max(...lines) / zoom / MEASURED_AT;
      shape.twoTall = (two.bottom - two.top) / zoom / MEASURED_AT;
    }
  }
  return shape;
};

/* Counts the lines an element's text runs over, leaving out the zero-width spaces between the shares of a run */
const rowsOf = (el: HTMLElement) => {
  const range = document.createRange();
  /* jsdom has no line boxes, which reads as none */
  if (typeof range.getClientRects !== 'function') return 0;
  range.selectNodeContents(el);
  return new Set(Array.from(range.getClientRects()).filter(box => box.width > 0).map(box => Math.round(box.top))).size;
};

/* Lays a description out at a size, drawn in alike from both sides, at its stylesheet's line spacing, and counts its lines */
const describeAt = (description: HTMLElement, text: string, size: number, inset: number) => {
  description.textContent = text;
  description.style.transform = '';
  description.style.fontSize = `${size}px`;
  description.style.removeProperty('line-height');
  description.style.paddingLeft = `${inset.toFixed(2)}px`;
  description.style.paddingRight = `${inset.toFixed(2)}px`;
  return rowsOf(description);
};

/* Shares a run with no space in it evenly over its lines, the first lines a letter longer, split by zero-width spaces */
const shareRun = (description: HTMLElement, text: string) => {
  const rows = rowsOf(description);
  /* Text with a space in it is left to the browser, which balances its lines */
  if (rows < 2 || /\s/.test(text)) return;
  const letters = Array.from(text);
  const share = Math.floor(letters.length / rows);
  const longer = letters.length % rows;
  let at = 0;
  const shares = Array.from({ length: rows }, (_, row) => {
    const take = share + (row < longer ? 1 : 0);
    at += take;
    return letters.slice(at - take, at).join('');
  });
  description.textContent = shares.join('\u200B');
  /* Puts the run back as it broke where its shares do not each take a line of their own */
  if (rowsOf(description) !== rows) description.textContent = text;
};

/* A size to the hundredth of a pixel below it, so the same room comes out the same however the page got there */
const hundredth = (size: number) => Math.floor(size * 100) / 100;

/* A share to the thousandth below it, keeping one already on a thousandth whatever its floating-point error */
const thousandth = (share: number) => Math.floor(share * 1000 + 1e-6) / 1000;

/* A description's text without the breaks put in it to share a run out over its lines */
const unbroken = (el: HTMLElement) => (el.textContent ?? '').replace(/\u200B/g, '');

/* The scale each name is drawn at, or null, kept so a scroll places it again without setting it afresh */
const placed = new WeakMap<HTMLElement, Scale | null>();

/* Where a height falls on the screen's pixels, as the edge of a box is drawn */
const onScreen = (y: number) => {
  const pixel = window.devicePixelRatio || 1;
  return Math.round(y * pixel) / pixel;
};

/* Where a deck's underline, the heading's last CSS pixel, is drawn on the screen's pixels, its top and its bottom */
const underlineOf = (deck: Deck) => {
  const heading = deck.heading.getBoundingClientRect();
  const zoom = heading.width / (parseFloat(getComputedStyle(deck.heading).width) || heading.width);
  return { top: onScreen(heading.bottom - zoom), bottom: onScreen(heading.bottom) };
};

/* Centres a deck's name between its top border and its underline, by where the screen draws its letters */
const placeName = (deck: Deck, scale: Scale | null) => {
  const above = paintedFillTop(deck.item);
  const below = underlineOf(deck).top;
  /* A name drawn taller or shorter is placed by the rows it covers, and one only drawn narrower by its lines */
  if (scale && scale.down !== 1) centreInkBetween(deck.name, above, below, scale);
  else centreDrawnBetween(deck.name, above, below, scale?.across ?? 1);
};

/* Centres a deck's description between the underline and the card count's letters, as the screen draws them */
const placeDescription = (deck: Deck) => {
  centreDrawnBetween(deck.description, underlineOf(deck).bottom, drawnLetters(deck.count)?.top ?? null);
};

/* An element's zoom as the browser gives it, where it does, from the page, its ancestors and itself */
type Zoomed = HTMLElement & { currentCSSZoom?: number };

/* Draws the count and buttons larger as far as the room allows, giving back how much and the room left over or wanting */
const growCounter = (table: HTMLElement, first: Deck, inked: number, space: number, zoom: number, widest: number) => {
  const under = first.heading.getBoundingClientRect().bottom;
  const labels = Array.from(first.buttons.querySelectorAll<HTMLElement>('.mini-btn-label'));
  /* The room left over at a share, between the underline and the buttons, less both texts' letters and three spaces */
  const leftAt = (grow: number) => {
    if (grow > 1) table.style.setProperty(COUNTER_GROW, grow.toFixed(3));
    else table.style.removeProperty(COUNTER_GROW);
    const counted = laidExtent(first.count);
    const buttons = first.buttons.getBoundingClientRect();
    if (!counted || !(buttons.height > 0)) return null;
    return buttons.top - under - inked - (counted.bottom - counted.top) - 3 * space;
  };
  /* How wide each label is laid out in its own pixels, at the share last tried */
  const labelsAt = (grow: number) =>
    labels.map(label => label.getBoundingClientRect().width / ((label as Zoomed).currentCSSZoom || zoom * grow));
  const left = leftAt(1);
  if (left === null || left < 0.01) return { grow: 1, left: left ?? 0 };

  /* How wide each label's word runs at its largest size, with its padding and a pixel to spare for rounding */
  const needs = labels.map(label => {
    const style = getComputedStyle(label);
    const word = textWidth(label, label.textContent ?? '', LABEL_MOST);
    return word === null ? null : word + (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0) + 1;
  });
  const widths = labelsAt(1);
  const counting = getComputedStyle(first.count);
  /* How wide the widest count runs, its letters spaced as the stylesheet spaces them */
  const sample = textWidth(first.count, COUNT_SAMPLE, parseFloat(counting.fontSize) || 0);
  const counts = sample === null ? null
    : sample + Array.from(COUNT_SAMPLE).length * (parseFloat(counting.letterSpacing) || 0);
  /* No further than the widest count fits and every label's word, first as if a label narrowed by the share alone */
  let most = thousandth(Math.min(GROW_MOST, counts === null ? 1 : widest / counts,
    ...needs.map((need, i) => (need === null ? 1 : widths[i] / need))));
  let atMost = most > 1 ? leftAt(most) : null;
  /* A label narrows faster, as the space around it keeps its width, so the share is found again from its width there */
  if (atMost !== null) {
    const there = labelsAt(most);
    const fits = Math.min(...needs.map((need, i) => {
      if (need === null) return 1;
      const kept = (there[i] * most - widths[i]) / (1 - most);
      const fit = (widths[i] + kept) / (need + kept);
      return fit > 0 ? fit : 1;
    }));
    if (fits < most) {
      most = thousandth(Math.max(1, fits));
      atMost = most > 1 ? leftAt(most) : null;
    }
  }
  /* The share at which nothing is left over, or as near under it as a few tries come */
  let grow = 1;
  if (atMost !== null && atMost >= -SPREAD_NEAR) grow = most;
  else if (atMost !== null) {
    let low = 1;
    let lowLeft = left;
    let high = most;
    let highLeft = atMost;
    for (let tries = 0; tries < SPREAD_TRIES && high - low > 0.001; tries += 1) {
      /* The room falls all but straight, so each try is where a line through the shares either side leaves nothing */
      const at = thousandth(low + ((high - low) * lowLeft) / (lowLeft - highLeft));
      const there = leftAt(at);
      if (there === null) break;
      if (there >= 0) {
        low = at;
        lowLeft = there;
      } else {
        high = at;
        highLeft = there;
      }
      if (Math.abs(there) <= SPREAD_NEAR) break;
    }
    grow = highLeft >= -SPREAD_NEAR ? high : low;
  }
  return { grow, left: leftAt(grow) ?? 0 };
};

/* Places the names and descriptions of the decks in view again as the table moves, at the sizes last set */
export const placeDecks = (table: HTMLElement) => {
  const view = table.getBoundingClientRect();
  decksIn(table).forEach(deck => {
    const box = deck.item.getBoundingClientRect();
    /* A deck more than its own height out of view is placed as it comes into view */
    if (box.bottom < view.top - box.height || box.top > view.bottom + box.height) return;
    if (placed.has(deck.name)) placeName(deck, placed.get(deck.name) ?? null);
    placeDescription(deck);
  });
};

/* Sets every deck in a table for the longest name and description the deck form allows, so every deck looks alike */
export const settleDecks = (table: HTMLElement) => {
  const decks = decksIn(table);
  if (!decks.length) return;
  /* Measures with the count and the buttons back as the stylesheet sets them */
  table.style.removeProperty(COUNTER_GROW);
  table.style.removeProperty(COUNT_BELOW);
  table.style.removeProperty(DECK_FOOT);
  const first = decks[0];
  const box = first.item.getBoundingClientRect();
  const style = getComputedStyle(first.item);
  const zoom = box.width / (parseFloat(style.width) || box.width);
  const nameReach = reachOf(first.name, TALL_LETTERS + TAIL_LETTERS);
  const nameCap = reachOf(first.name, SAMPLE);
  const textCap = reachOf(first.description, SAMPLE);
  const nameRun = letterRun(first.name, SAMPLE);
  const textRun = letterRun(first.description, SAMPLE);
  const counted = laidExtent(first.count);
  if (!(zoom > 0) || !(box.height > 0) || !nameReach || !nameCap || !textCap || !counted
    || !(nameRun && nameRun.per > 0) || !(textRun && textRun.per > 0)) return;

  const bottom = box.bottom - (parseFloat(style.borderBottomWidth) || 0) * zoom;
  const buttons = first.buttons.getBoundingClientRect();
  /* The space every part of a deck stands from the next, as deep as the buttons stand above the bottom border */
  const gap = (bottom - buttons.bottom) / zoom;
  const band = parseFloat(getComputedStyle(first.name).height) || 0;
  const under = first.heading.getBoundingClientRect().bottom;
  /* What the stylesheet leaves around a name's box between the top border and the underline */
  const around = (under - zoom - box.top) / zoom - (parseFloat(style.borderTopWidth) || 0) - band;
  const room = parseFloat(getComputedStyle(first.heading).width) || 0;
  const widest = room * WIDEST;
  const across = first.description.getBoundingClientRect().width / zoom;
  /* The lines stay as close as the stylesheet sets them on every screen, and the room they leave goes to the deck's spaces */
  const described = getComputedStyle(first.description);
  const spaced = parseFloat(described.lineHeight) / parseFloat(described.fontSize);
  /* The stylesheet's 1.12 where the line height cannot be read in pixels */
  const spacing = spaced > 0 ? spaced : 1.12;

  const pitch = nameReach.up + nameReach.down + LINE_CLEAR;
  const tallest = 2 * (nameReach.up + nameReach.down) + LINE_CLEAR;
  const shapes = decks.map(deck => shapeOf(deck.name, zoom, pitch));

  /* How wide a capital runs, with its spacing, for each pixel of a name's size and of a description's */
  const nameLetter = nameRun.per + nameRun.spacing;
  const textLetter = textRun.per + textRun.spacing;
  /* How much larger a name is set than a description for its line to run a hair wider, and never smaller */
  const larger = Math.max(1, (DESCRIPTION_LINE * textLetter * SPAN_MARGIN) / (NAME_LINE * nameLetter));
  const two = overTwo(shapes, NAME_LINE * nameLetter, tallest);
  /* The largest size a name may be set at, where a line of the longest name fits the width a deck allows */
  const limit = widest / (NAME_LINE * nameLetter);
  /* The size a name is set at beside a description's, larger by that much or as the deck allows, and never smaller */
  const nameSize = (size: number) => hundredth(Math.max(size, Math.min(size * larger, limit)));
  /* The size at which a line of the longest name runs as wide as it is drawn, as a name set larger is drawn narrower */
  const drawnAt = (size: number) => Math.min(nameSize(size), limit);
  /* The width every name and description is held to */
  const widthAt = (size: number) => Math.min(NAME_LINE * nameLetter * drawnAt(size), widest);
  /* How far a description's box is drawn in from either side to hold it there */
  const insetAt = (size: number) => Math.max(0, (across - widthAt(size) - DESCRIPTION_SLACK) / 2);

  /* How tall the longest name's two lines stand, from the top of the first's capitals to the second's baseline */
  const nameInk = (size: number) => (pitch + nameCap.up) * size;
  /* How many lines the longest description runs over at a size, in the width its lines are held to */
  const rowsAt = (size: number) => Math.ceil(DESCRIPTION_LETTERS
    / Math.max(1, Math.floor((widthAt(size) + DESCRIPTION_SLACK) / (size * textLetter) + 1e-9)));
  /* How tall those lines stand a spacing apart, from the top of the first's capitals to the last's baseline */
  const textInk = (size: number) => (rowsAt(size) - 1) * spacing * size + textCap.up * size;

  /* The room the longest description has, between the underline and the count's letters, a space clear of each */
  const open = (buttons.top - under - (counted.bottom - counted.top)) / zoom - 3 * gap;
  /* That room at a size, which shrinks as the underline goes down for larger names */
  const roomAt = (size: number) => open - (nameInk(nameSize(size)) + 2 * gap - around - band);
  const fits = (size: number) => size * textLetter * SPAN_MARGIN <= drawnAt(size) * nameLetter + 1e-6
    && textInk(size) <= roomAt(size) + 0.05;

  /* The size at which a description's letters run as wide as the names' do at the largest size a deck allows */
  const held = hundredth((hundredth(limit) * nameLetter) / (textLetter * SPAN_MARGIN));
  /* The size at which five lines of the longest description run the full width a deck allows */
  const fullest = hundredth(widest / (DESCRIPTION_LINE * textLetter * SPAN_MARGIN));
  /* Whether the longest description's lines, shared out evenly, run the width they are held to */
  const evenly = (size: number) =>
    (DESCRIPTION_LETTERS / rowsAt(size)) * size * textLetter >= widthAt(size) / SPAN_MARGIN - DESCRIPTION_SLACK;
  let size = largestFitting(fits);
  /* Where its lines would run short, it goes over six at the names' width if the spaces can give that room, or over five */
  if (!evenly(size)) size = textInk(held) <= roomAt(held) + 6 * gap * GAP_GIVE ? held : fullest;
  const named = nameSize(size);
  const width = widthAt(size);
  const inset = insetAt(size);
  const rows = rowsAt(size);
  const tall = nameInk(named);

  /* How tall the names' box is for the longest name's letters to stand a space from the top border and the underline */
  const bandFor = (space: number) => tall + 2 * space - around;
  table.style.setProperty(TITLE_BAND, `${bandFor(gap).toFixed(2)}px`);
  /* Grows the count and buttons into the room the lines leave, and shares what is left over or wanting among the six spaces */
  const { grow, left } = growCounter(table, first, textInk(size) * zoom, gap * zoom, zoom, widest);
  const shared = left / zoom / 6;
  const space = gap + shared;
  if (Math.abs(shared) >= 0.005) {
    table.style.setProperty(TITLE_BAND, `${bandFor(space).toFixed(2)}px`);
    table.style.setProperty(DECK_FOOT, `${(shared / grow).toFixed(2)}px`);
  }
  /* Stands the count's letters a space above the buttons by how far its box reaches under them */
  const counting = laidExtent(first.count);
  if (counting) {
    const local = (first.count as Zoomed).currentCSSZoom || zoom * grow;
    const margin = parseFloat(getComputedStyle(first.count).marginBottom) || 0;
    const stands = first.buttons.getBoundingClientRect().top - counting.bottom;
    table.style.setProperty(COUNT_BELOW, `${(margin + (space * zoom - stands) / local).toFixed(2)}px`);
  }

  /* Sets each description at that size, or smaller where it takes more lines or splits a word a smaller size keeps whole */
  const texts = decks.map(deck => unbroken(deck.description));
  decks.forEach((deck, i) => {
    const text = texts[i];
    const splitsAt = (at: number) => {
      describeAt(deck.description, text, at, inset);
      return splitsAWord(deck.description);
    };
    const whole = /\s/.test(text) && !splitsAt(SMALLEST);
    const fitsAt = (at: number) => describeAt(deck.description, text, at, inset) <= rows
      && (!whole || !splitsAWord(deck.description));
    if (!fitsAt(size)) describeAt(deck.description, text, largestFitting(fitsAt, size), inset);
    shareRun(deck.description, text);
  });

  decks.forEach((deck, i) => {
    const shape = shapes[i];
    if (two[i] && shape) {
      const short = Math.max(0, tall / named - (shape.twoTall ?? tall / named));
      const wide = (shape.twoWide ?? 0) * named;
      layName(deck.name, true, named, pitch + Math.min(LINE_SPARE, short));
      const narrower = wide > widest ? { across: widest / wide, down: 1 } : null;
      if (narrower) widenToTwo(deck.name, wide + 1, room);
      else pressToTwo(deck.name, zoom, wide);
      placed.set(deck.name, narrower);
      placeName(deck, narrower);
      return;
    }
    /* A name on one line is drawn the width every name is held to and as tall as two lines stand */
    layName(deck.name, false, named);
    const fit = fillBetween(deck.name, paintedFillTop(deck.item), underlineOf(deck).top, tall, width / room,
      ONE_LINE_NARROWEST);
    placed.set(deck.name, fit ? { across: fit.across, down: fit.down } : null);
  });
  decks.forEach(placeDescription);
};

/* Sets a page's decks when they change, resize or their fonts load, and places them again as the table scrolls */
export function useDeckLayout(pageRef: RefObject<HTMLElement | null>, decks: unknown) {
  useLayoutEffect(() => {
    const table = pageRef.current?.querySelector<HTMLElement>('.deck-list');
    if (!table) return;
    /* Where the first deck stands on the page, which moves with the table, and how large it and the table are */
    const where = () => {
      const deck = table.querySelector('.deck-item')?.getBoundingClientRect();
      return deck ? `${deck.left.toFixed(2)},${deck.top.toFixed(2)}` : '';
    };
    const sizes = () => {
      const box = table.getBoundingClientRect();
      const deck = table.querySelector('.deck-item')?.getBoundingClientRect();
      return `${box.width.toFixed(2)}x${box.height.toFixed(2)} ${deck?.width.toFixed(2)}x${deck?.height.toFixed(2)}`;
    };
    let spot = '';
    let measured = '';
    const settle = () => {
      settleDecks(table);
      measured = sizes();
      spot = where();
    };
    settle();

    let frame = 0;
    const later = (always = false) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (always || sizes() !== measured) settle();
      });
    };
    let watching = 0;
    const watch = () => {
      watching = requestAnimationFrame(() => {
        const now = where();
        if (now !== spot) {
          placeDecks(table);
          spot = now;
        }
        watch();
      });
    };
    watch();

    /* jsdom has no ResizeObserver of its own */
    const resized = () => later();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(resized) : null;
    if (observer) {
      observer.observe(table);
      const deck = table.querySelector('.deck-item');
      if (deck) observer.observe(deck);
    }
    window.addEventListener('resize', resized);
    if (document.fonts && document.fonts.status !== 'loaded') {
      document.fonts.ready.then(() => later(true)).catch(() => {});
    }
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(watching);
      observer?.disconnect();
      window.removeEventListener('resize', resized);
    };
  }, [pageRef, decks]);
}