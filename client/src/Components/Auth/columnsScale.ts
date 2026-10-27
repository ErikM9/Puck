import { RefObject, useLayoutEffect } from 'react';
import { blockExtent, drawnExtent } from '../Common/textInk';

/* Room under the card for a two-line message, and as much above to keep it centred, as the one-column stylesheet leaves */
const MESSAGE_ROOM = 50;

/* The least room left either side of the page once it is grown */
const SIDE_ROOM = 8;

/* How much taller the form card stands beside the other two columns than it does alone, against its own height */
const CARD_GROWTH = 0.1175;

/* The share of the card's gained height that goes to its buttons, so they match in size and place in every form */
const BUTTON_SHARE = 0.14;

/* Works out how much larger the three-column page can be drawn in the room across and down, with room for a message */
export function columnsScale(columns: number, height: number, across: number, down: number): number {
  const wide = (across - 2 * SIDE_ROOM) / columns;
  const tall = down / (height + 2 * MESSAGE_ROOM);
  /* A page that fits is never drawn smaller for the message's sake, only as much smaller as it must be to fit */
  const kept = Math.min(1, wide, down / height);
  return Math.min(1.95, Math.max(0.75, Math.min(wide, tall), kept));
}

/* How tall the form card stands beside the other two columns, from its own height */
export function cardHeight(card: number): number {
  return card * (1 + CARD_GROWTH);
}

/* Each field's share of the gain past the buttons, calibrated on the recovery form's field and description by height */
const FIELD_SHARE = 0.268;
/* Each label's share, what a field in the two-field forms takes beyond the recovery form's field */
const LABEL_SHARE = 0.068;

/* The box that takes the rest of the gain, the tabs growing on both sides of their text or the description as a whole */
const FILLERS: { selector: string; grow: string; sides: number }[] = [
  { selector: '.auth-tabs', grow: '--auth-tab-grow', sides: 2 },
  { selector: '.recover-desc', grow: '--auth-desc-grow', sides: 1 },
];
const CARD_GROW = '--auth-card-grow';
const BUTTON_GROW = '--auth-button-grow';
/* How much taller each field grows, on each side of its text, and how much taller each label's line */
const FIELD_GROW = '--auth-input-grow';
const LABEL_GROW = '--auth-label-grow';
/* How far down its column the card is set, so it stands level with the letters beside it */
const CARD_DROP = '--auth-card-drop';
/* How much further down the pill of tabs reaches, so the fields sit as far below it as above the button */
const PILL_REACH = '--auth-pill-reach';

/* Set on each text column, so its letters start level with the other column's and end level with the card */
const TEXT_SIZE = '--auth-text-size';
/* How much closer or further apart a text column's lines and the gaps between its parts are spaced */
const STRETCH = '--auth-stretch';
const TEXT_DROP = '--auth-text-drop';
const TEXT_GAP = '--auth-text-gap';

/* The bounds on a column's text size and line spacing as its letters are fitted to the card's height */
const SIZE_LEAST = 0.75;
const SIZE_MOST = 1.25;
const SPACING_LEAST = 0.95;
const SPACING_MOST = 1.2;
/* How much larger one column's letters may be drawn than the other's, so the two read as one */
const SIZE_APART = 1.05;

/* How close to the card's height a column's letters are brought, and how many halvings of a range bring them there */
const CLOSE = 0.25;
const HALVINGS = 10;

/* A paragraph whose last line runs under this share of its longest is balanced over as many lines, so it stands as tall */
const SHORT_LINE = 0.55;

/* Measures each line of an element's text from the boxes of its letters, or none where a range has none, as under jsdom */
const lineWidths = (el: HTMLElement) => {
  const range = document.createRange();
  if (typeof range.getClientRects !== 'function') return [];
  const lines = new Map<number, { left: number; right: number }>();
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    let at = 0;
    for (const letter of node.textContent ?? '') {
      if (letter.trim()) {
        range.setStart(node, at);
        range.setEnd(node, at + letter.length);
        const box = Array.from(range.getClientRects()).find(rect => rect.width > 0);
        if (box) {
          const line = lines.get(Math.round(box.top)) ?? { left: box.left, right: box.right };
          line.left = Math.min(line.left, box.left);
          line.right = Math.max(line.right, box.right);
          lines.set(Math.round(box.top), line);
        }
      }
      at += letter.length;
    }
  }
  return Array.from(lines.entries()).sort((a, b) => a[0] - b[0]).map(([, line]) => line.right - line.left);
};

/* Evens out the lines of each of a column's paragraphs whose last line runs much shorter than its longest */
const evenShortLines = (column: HTMLElement) => {
  column.querySelectorAll<HTMLElement>('p').forEach(paragraph => {
    paragraph.style.removeProperty('text-wrap');
    const widths = lineWidths(paragraph);
    if (widths.length > 1 && widths[widths.length - 1] < SHORT_LINE * Math.max(...widths)) {
      paragraph.style.setProperty('text-wrap', 'balance');
    }
  });
};

const GAP = '--auth-gap';
/* The least gap in pixels, and the most as a share of a column's width, so a very wide screen keeps the columns together */
const GAP_LEAST = 24;
const GAP_MOST = 0.25;

/* Spaces the columns as far apart as the outer ones stand from the sides of the area the page is shown in */
const spaceColumns = (page: HTMLElement, area: HTMLElement) => {
  const columns = Array.from(page.children).filter((column): column is HTMLElement => column instanceof HTMLElement);
  const first = columns[0];
  const last = columns[columns.length - 1];
  if (columns.length < 2 || !(first.offsetWidth > 0)) return;
  const firstBox = first.getBoundingClientRect();
  const lastBox = last.getBoundingClientRect();
  const shown = area.getBoundingClientRect();
  /* The scale the page is drawn at, as boxes are measured drawn but the gap is set in the page's own pixels */
  const k = firstBox.width / first.offsetWidth;
  if (!(k > 0)) return;
  const gap = (columns[1].getBoundingClientRect().left - firstBox.right) / k;
  const side = (firstBox.left - shown.left + shown.right - lastBox.right) / 2 / k;
  const width = first.offsetWidth;
  const most = Math.min(width * GAP_MOST, (page.clientWidth - columns.length * width) / (columns.length - 1));
  /* Widening the gap by a pixel brings each outer column a pixel nearer its side, so the two meet halfway */
  const set = Math.max(GAP_LEAST, Math.min(most, (side + gap) / 2));
  if (Math.abs(set - gap) >= 0.05) page.style.setProperty(GAP, `${set.toFixed(2)}px`);
};

/* Finds the nearest scrolling ancestor, whose height is the room the page is shown in */
const scrollingBox = (el: HTMLElement) => {
  for (let box = el.parentElement; box; box = box.parentElement) {
    if (/(auto|scroll)/.test(getComputedStyle(box).overflowY)) return box;
  }
  return null;
};

/* How tall a box is laid out, to a fraction of a pixel, which its offsetHeight rounds away */
const heightOf = (el: HTMLElement) => parseFloat(getComputedStyle(el).height) || el.offsetHeight;

/* How tall a column's text is under its heading, its parts and the gaps between them */
const textHeight = (column: HTMLElement) => Array.from(column.children).slice(1).reduce((sum, part) => {
  const style = getComputedStyle(part);
  return sum + (part instanceof HTMLElement ? heightOf(part) : 0)
    + (parseFloat(style.marginTop) || 0) + (parseFloat(style.marginBottom) || 0);
}, 0);

/* Finds the innermost first or last element of a part, as a game's name and description sit inside its entry */
const textEnd = (part: Element | null, last = false) => {
  let el = part;
  while (el?.firstElementChild) el = last ? el.lastElementChild : el.firstElementChild;
  return el instanceof HTMLElement ? el : null;
};

/* Finds where a column's letters start and end below its top, in layout pixels, and how many parts its text is in */
const lettersOf = (column: HTMLElement) => {
  const first = textEnd(column.children[1]);
  const last = textEnd(column.lastElementChild, true);
  if (!first || !last || first === column.firstElementChild || !(column.offsetHeight > 0)) return null;
  const box = column.getBoundingClientRect();
  const down = (y: number) => (y - box.top) / (box.height / column.offsetHeight);
  /* Placed as the page lays the lines out, as the letters' own boxes stand a pixel or two off under a scale */
  const top = blockExtent(first)?.top;
  const foot = blockExtent(last)?.bottom;
  if (top === undefined || foot === undefined) return null;
  return { top: down(top), foot: down(foot), parts: column.children.length - 1 };
};

/* How tall a column's letters stand, or its text's height where they cannot be measured */
const standing = (column: HTMLElement) => {
  const letters = lettersOf(column);
  return letters ? letters.foot - letters.top : textHeight(column);
};

/* Finds by halving a range the largest value of a property at which a column's letters stand no taller than a height */
const largest = (column: HTMLElement, name: string, from: number, to: number, tall: number) => {
  const set = (value: number) => {
    column.style.setProperty(name, value.toFixed(4));
    return standing(column);
  };
  if (set(to) <= tall + CLOSE) return to;
  if (set(from) > tall + CLOSE) return from;
  let kept = from;
  let over = to;
  for (let i = 0; i < HALVINGS; i += 1) {
    const value = (kept + over) / 2;
    if (set(value) <= tall + CLOSE) kept = value;
    else over = value;
  }
  set(kept);
  return kept;
};

/* Spaces a column's lines out to bring its letters to a height, putting any shortfall into the gaps between its parts */
const spaceText = (column: HTMLElement, tall: number) => {
  column.style.removeProperty(TEXT_GAP);
  largest(column, STRETCH, SPACING_LEAST, SPACING_MOST, tall);
  const letters = lettersOf(column);
  if (!letters) return;
  const short = tall - (letters.foot - letters.top);
  if (short >= CLOSE && letters.parts > 1) column.style.setProperty(TEXT_GAP, `${(short / (letters.parts - 1)).toFixed(2)}px`);
};

/* Sizes a column's letters to the largest that fit the height at the closest spacing, then spaces them out to it */
const fitText = (column: HTMLElement, tall: number, most = SIZE_MOST) => {
  [TEXT_SIZE, STRETCH, TEXT_GAP, TEXT_DROP].forEach(name => column.style.removeProperty(name));
  column.style.setProperty(STRETCH, SPACING_LEAST.toFixed(4));
  const size = largest(column, TEXT_SIZE, SIZE_LEAST, most, tall);
  spaceText(column, tall);
  return size;
};

/* Puts the card back to its own height and place, its boxes with it */
const resetCard = (card: HTMLElement) =>
  [CARD_GROW, BUTTON_GROW, CARD_DROP, FIELD_GROW, LABEL_GROW, PILL_REACH, ...FILLERS.map(box => box.grow)]
    .forEach(name => card.style.removeProperty(name));

/* Lets the pill of tabs reach down so the fields sit midway between it and the button, where the card shows a pill */
const levelFields = (card: HTMLElement) => {
  card.style.removeProperty(PILL_REACH);
  const pill = card.querySelector<HTMLElement>('.auth-tabs');
  const label = card.querySelector<HTMLElement>('.auth-form .auth-label');
  const fields = card.querySelectorAll<HTMLElement>('.auth-form .auth-input');
  const button = card.querySelector<HTMLElement>('.auth-form .auth-button');
  const letters = label ? drawnExtent(label) : null;
  if (!pill || !letters || !fields.length || !button || !(card.offsetWidth > 0)) return;
  const zoom = card.getBoundingClientRect().width / card.offsetWidth;
  const above = letters.top - pill.getBoundingClientRect().bottom;
  const below = button.getBoundingClientRect().top - fields[fields.length - 1].getBoundingClientRect().bottom;
  const reach = (above - below) / zoom;
  if (reach >= 0.25) card.style.setProperty(PILL_REACH, `${reach.toFixed(2)}px`);
};

/* Grows the card to a height, its buttons, fields and labels by their shares and the tabs or description by the rest */
const fillCard = (card: HTMLElement, height: number) => {
  const gain = height - heightOf(card);
  const filler = FILLERS.find(box => card.querySelector(box.selector));
  if (!(gain >= 0.5) || !filler) return;
  const buttons = gain * BUTTON_SHARE;
  const field = (gain - buttons) * FIELD_SHARE;
  const label = (gain - buttons) * LABEL_SHARE;
  const rest = gain - buttons - field * card.querySelectorAll('.auth-input').length
    - label * card.querySelectorAll('.auth-label').length;
  card.style.setProperty(CARD_GROW, `${gain.toFixed(2)}px`);
  card.style.setProperty(BUTTON_GROW, `${buttons.toFixed(3)}px`);
  card.style.setProperty(FIELD_GROW, `${(field / 2).toFixed(3)}px`);
  card.style.setProperty(LABEL_GROW, `${label.toFixed(3)}px`);
  card.style.setProperty(filler.grow, `${(rest / filler.sides).toFixed(3)}px`);
};

/* Scales the signed-out page's three columns to the room, levelling the text beside the card with it */
export function useColumnsScale(ref: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const page = ref.current;
    if (!page) return;
    const area = scrollingBox(page);
    const card = page.querySelector<HTMLElement>('.auth-form-container');

    const measure = () => {
      const first = page.firstElementChild;
      const last = page.lastElementChild;
      /* The two text columns beside the card's, which come back to their own size, spacing and place before measuring */
      const text = Array.from(page.children).filter((column): column is HTMLElement =>
        column instanceof HTMLElement && column !== last);
      const place = (column: HTMLElement, name: string, value: number) => {
        if (Math.abs(value) >= 0.005) column.style.setProperty(name, `${value.toFixed(2)}px`);
        else column.style.removeProperty(name);
      };
      text.forEach(column => [TEXT_SIZE, STRETCH, TEXT_DROP, TEXT_GAP].forEach(name => column.style.removeProperty(name)));
      if (card) resetCard(card);
      /* Measured unscaled, as letters fall on other pixels at another scale and each scale set would lead to another */
      page.style.removeProperty('--auth-scale');
      const shown = first instanceof HTMLElement && last instanceof HTMLElement && first !== last
        && getComputedStyle(first).display !== 'none';
      /* The room across is the box the page is laid out in, inside its padding */
      const holder = page.parentElement;
      const around = holder ? getComputedStyle(holder) : null;
      const across = holder && around
        ? holder.clientWidth - (parseFloat(around.paddingLeft) || 0) - (parseFloat(around.paddingRight) || 0)
        : 0;
      const down = area?.clientHeight ?? 0;
      if (!shown || !card || !(page.offsetWidth > 0) || !(page.offsetHeight > 0) || !(across > 0) || !(down > 0)) {
        /* One column has no columns to set apart */
        page.style.removeProperty(GAP);
        if (card) levelFields(card);
        return;
      }
      const tall = cardHeight(heightOf(card));
      /* Fits each column with its lines wrapped as they fall, holding one much larger than the other to a little larger */
      text.forEach(column => column.querySelectorAll('p').forEach(paragraph => paragraph.style.removeProperty('text-wrap')));
      const sizes = text.map(column => fitText(column, tall));
      const least = Math.min(...sizes);
      text.forEach((column, i) => { if (sizes[i] > least * SIZE_APART) fitText(column, tall, least * SIZE_APART); });
      /* Balanced lines can end on letters with longer or shorter tails, so the columns are spaced out to the height again */
      text.forEach(evenShortLines);
      text.forEach(column => spaceText(column, tall));
      /* Sets each column's text down to the lowest first line, and the card level with them from under its heading */
      const letters = text.map(lettersOf);
      const at = letters.filter((column): column is NonNullable<typeof column> => column !== null);
      if (at.length === text.length && at.length > 0 && last.offsetHeight > 0) {
        const top = Math.max(...at.map(column => column.top));
        text.forEach((column, i) => place(column, TEXT_DROP, top - at[i]!.top));
        const box = last.getBoundingClientRect();
        const from = (card.getBoundingClientRect().top - box.top) / (box.height / last.offsetHeight);
        card.style.setProperty(CARD_DROP, `${Math.max(0, top - from).toFixed(2)}px`);
      }
      fillCard(card, tall);
      levelFields(card);
      page.style.setProperty('--auth-scale', columnsScale(page.offsetWidth, page.offsetHeight, across, down).toFixed(4));
      if (area) spaceColumns(page, area);
    };

    measure();

    /* Where there is no ResizeObserver, as under jsdom, the page is measured again only when the window is resized */
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    observer?.observe(page);
    if (area) observer?.observe(area);
    window.addEventListener('resize', measure);
    /* Another form in the card has other boxes to grow */
    const swapped = typeof MutationObserver === 'function' ? new MutationObserver(measure) : null;
    if (card) swapped?.observe(card, { childList: true, subtree: true });

    return () => {
      observer?.disconnect();
      swapped?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [ref]);
}