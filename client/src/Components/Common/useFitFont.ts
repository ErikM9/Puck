import { RefObject, useLayoutEffect } from 'react';
import { fontPlace } from './textInk';

/* How far the text may shrink, which axis it is measured on, and how it sits in its box */
export interface FitOptions {
  max?: number;
  min?: number;
  /* Lines the text is allowed to overrun by, for boxes that can afford to spill a little */
  slackLines?: number;
  centreBox?: boolean;
  basePad?: number;
  axis?: 'height' | 'width';
  /* Cuts the text and appends an ellipsis when even the smallest size will not fit */
  clampToBox?: boolean;
  /* Counts a size at which a word has to be split across lines as not fitting, while a smaller one avoids it */
  wholeWords?: boolean;
  /* Allows no pixel for rounding, as text that runs over by even that much sits at the box's start, not centred */
  exact?: boolean;
  /* A weight the text takes on, such as on hover, fitted inside the box's padding so it stays whole at either weight */
  heavier?: string;
  /* A sample of the longest text the box is for, which lets the text grow past max to the size that fits the sample */
  growTo?: string;
  /* A sample of the longest text the box is for, whose size caps the text so a short one comes out the same size */
  sizedAs?: string;
  /* Another element set at the text's size, such as a title over it, holding the text to sizes its own line fits at */
  alongside?: (el: HTMLElement) => HTMLElement | null;
  /* A sample of the longest text the box is for, which wraps the partner where one line would hold the sample smaller */
  fullAs?: string;
  /* Keeps a run with no spaces at its fitted size, its rows evened out by letter spacing rather than a smaller size */
  fillRuns?: boolean;
  /* Evens out the lengths of the text's lines however many it runs over, where Chrome balances only a few */
  evenLines?: boolean;
  /* Lays the text out as one justified block filling the box, with the same space on every side, at the largest size */
  spanBox?: boolean;
  /* Texts a spanned box shows at other times, such as a form's other steps, all set at one size over as many lines */
  alike?: string[];
  /* How tall a spanned box stands in its own pixels, or null to keep the height its stylesheet gives it */
  room?: (el: HTMLElement) => number | null;
  /* Runs once the size is settled, for anything placed by the text's final size */
  onFit?: (el: HTMLElement) => void;
}

/* Tells whether a word of the element's text breaks onto another line, never so under jsdom, which has no lines */
export const splitsAWord = (el: HTMLElement): boolean => {
  const text = el.firstChild;
  if (!text || text.nodeType !== Node.TEXT_NODE) return false;
  const range = document.createRange();
  if (typeof range.getClientRects !== 'function') return false;
  let start = 0;
  for (const word of (text.textContent ?? '').split(' ')) {
    range.setStart(text, start);
    range.setEnd(text, start + word.length);
    const tops = new Set(Array.from(range.getClientRects()).filter(rect => rect.width > 0).map(rect => Math.round(rect.top)));
    if (tops.size > 1) return true;
    start += word.length + 1;
  }
  return false;
};

/* Counts the letters on each line one by one, as a run broken across lines has no spaces to find its lines by */
const lineLengths = (el: HTMLElement): number[] => {
  const text = el.firstChild;
  if (!text || text.nodeType !== Node.TEXT_NODE) return [];
  const range = document.createRange();
  if (typeof range.getClientRects !== 'function') return [];
  const lines = new Map<number, number>();
  let at = 0;
  for (const letter of text.textContent ?? '') {
    range.setStart(text, at);
    range.setEnd(text, at + letter.length);
    const box = Array.from(range.getClientRects()).find(rect => rect.width > 0);
    if (box) lines.set(Math.round(box.top), (lines.get(Math.round(box.top)) ?? 0) + 1);
    at += letter.length;
  }
  return Array.from(lines.entries()).sort((a, b) => a[0] - b[0]).map(([, count]) => count);
};

/* Counts the lines the element's text runs over, none under jsdom */
const lineCount = (el: HTMLElement): number => {
  const range = document.createRange();
  if (typeof range.getClientRects !== 'function') return 0;
  range.selectNodeContents(el);
  return new Set(Array.from(range.getClientRects()).filter(rect => rect.width > 0).map(rect => Math.round(rect.top))).size;
};

/* Counts lines by the boxes of the text alone, as a range over an element also holds each inner element's box */
const textLines = (el: HTMLElement, wider = 0): number => {
  const range = document.createRange();
  if (typeof range.getClientRects !== 'function') return 0;
  const tops = new Set<number>();
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    range.selectNodeContents(node);
    /* Boxes no wider than given, such as a zero-width space's, are left out */
    Array.from(range.getClientRects()).filter(rect => rect.width > wider).forEach(rect => tops.add(Math.round(rect.top)));
  }
  return tops.size;
};

/* Shares a run with no spaces evenly over its lines with zero-width spaces, and tells whether its rows come out even */
export const evenOutRun = (el: HTMLElement, content: string, fits = () => el.scrollHeight <= el.clientHeight + 1) => {
  if (/\s/.test(content)) return false;
  el.textContent = content;
  const letters = Array.from(content);
  const count = lineLengths(el).length;
  /* Only a run whose rows can all hold the same, or the last one fewer, is shared out, and one line is even already */
  if (count < 2 || (letters.length % count !== 0 && letters.length % count !== count - 1)) return count === 1;
  const share = Math.ceil(letters.length / count);
  const parts = Array.from({ length: count }, (_, line) => letters.slice(line * share, (line + 1) * share).join(''));
  el.textContent = parts.join('\u200B');
  /* Letters differ in width, so even shares can still take another line or overflow, and are then undone */
  if (lineLengths(el).length === count && fits()) return true;
  el.textContent = content;
  return false;
};

/* Reads the text of each laid-out line letter by letter, each space going with the line it ends */
const lineTexts = (el: HTMLElement): string[] => {
  const range = document.createRange();
  if (typeof range.getClientRects !== 'function') return [];
  const lines: string[] = [];
  let top: number | null = null;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    let at = 0;
    for (const letter of node.textContent ?? '') {
      range.setStart(node, at);
      range.setEnd(node, at + letter.length);
      const box = letter.trim() ? Array.from(range.getClientRects()).find(rect => rect.width > 0) : undefined;
      if (box && (top === null || Math.abs(box.top - top) > 1)) {
        top = box.top;
        lines.push('');
      }
      if (lines.length) lines[lines.length - 1] += letter;
      at += letter.length;
    }
  }
  return lines;
};

/* How far in from every side of its box a spanned text stands, against its size */
const SPAN_INSET = 0.45;
/* How far apart a spanned text's lines are set to start with, and at the loosest and closest, against its size */
const SPAN_LEADING = 1.28;
const SPAN_LOOSEST = 1.5;
const SPAN_CLOSEST = 1.15;
/* The size a text is laid out at to find its breaks, which a larger size makes at a width as much larger */
const SPAN_MEASURE = 16;
const SPAN_MOST_LINES = 12;
/* Pixels a line is broken short of its room by, as the page measures words a little differently from a canvas */
const SPAN_SLACK = 0.75;
/* The share of a line's shortfall taken up by spacing its letters, the rest by its spaces, so no line's spaces gape */
const SPAN_TRACKING = 0.5;
/* The most a line's letters are spaced, against its size, so they stay close to those of the lines either side */
const SPAN_TRACKING_MOST = 0.05;

/* Finds where to break words into lines within a width so their spaces widen evenly, or null where they cannot fit */
const evenBreaks = (widths: number[], space: number, lines: number, width: number) => {
  const count = widths.length;
  const before = [0];
  widths.forEach((word, i) => before.push(before[i] + word));
  const across = (from: number, to: number) => before[to] - before[from] + space * (to - from - 1);
  /* A line of one word has no space to widen, so it counts as having a quarter of one */
  const widen = (from: number, to: number) => (width - across(from, to)) / Math.max(0.25, to - from - 1);
  const cost = Array.from({ length: lines + 1 }, () => new Array<number>(count + 1).fill(Infinity));
  const start = Array.from({ length: lines + 1 }, () => new Array<number>(count + 1).fill(-1));
  cost[0][0] = 0;
  for (let line = 1; line <= lines; line += 1) {
    for (let to = 1; to <= count; to += 1) {
      for (let from = to - 1; from >= 0 && across(from, to) <= width; from -= 1) {
        const total = cost[line - 1][from] + widen(from, to) ** 2;
        if (total < cost[line][to]) {
          cost[line][to] = total;
          start[line][to] = from;
        }
      }
    }
  }
  if (cost[lines][count] === Infinity) return null;
  const breaks: [number, number][] = [];
  for (let line = lines, to = count; line > 0; line -= 1) {
    const from = start[line][to];
    breaks.unshift([from, to]);
    to = from;
  }
  return breaks;
};

/* Lays a text out as one block filling its box, alike in every text the box shows, and tells whether it can */
export function spanText(el: HTMLElement, content: string, alike: string[], height: number | null, min: number, max: number) {
  el.textContent = content;
  ['width', 'height', 'padding-top', 'padding-bottom', 'padding-left', 'padding-right', 'text-align', 'text-align-last']
    .forEach(property => el.style.removeProperty(property));
  const style = getComputedStyle(el);
  const border = (parseFloat(style.borderLeftWidth) || 0) + (parseFloat(style.borderRightWidth) || 0);
  const wide = el.offsetWidth - border;
  const tall = height !== null
    ? height - (parseFloat(style.borderTopWidth) || 0) - (parseFloat(style.borderBottomWidth) || 0)
    : el.clientHeight;
  /* A box with no size or no lines laid out, as under jsdom, cannot be measured */
  if (!(wide > 0) || !(tall > 0) || textLines(el, 1) === 0) return false;
  const texts = [content, ...alike.filter(text => text !== content)];

  /* Halves its way to the narrowest width at which a text at a size runs over no more than a number of lines */
  el.style.paddingLeft = '0px';
  el.style.paddingRight = '0px';
  const narrowest = (text: string, size: number, lines: number) => {
    el.textContent = text;
    el.style.fontSize = `${size}px`;
    el.style.width = 'max-content';
    const one = el.offsetWidth - border + 1;
    let fits = one;
    let over = Math.max(1, one / lines - 1);
    el.style.width = `${(over + border).toFixed(3)}px`;
    /* An even share can fit with room to spare, as the spaces where lines break take up none, so the search goes lower */
    if (textLines(el, 1) <= lines) {
      fits = over;
      over = Math.max(1, over / 2);
    }
    for (let i = 0; i < 14 && fits - over > 0.02; i += 1) {
      const width = (fits + over) / 2;
      el.style.width = `${(width + border).toFixed(3)}px`;
      if (textLines(el, 1) <= lines) fits = width;
      else over = width;
    }
    return fits;
  };

  /* How far the texts' letters reach above and below their lines, against their size */
  const draw = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(1, 1).getContext('2d') : null;
  let reach = 1;
  if (draw) {
    draw.font = `${style.fontStyle} ${style.fontWeight} ${SPAN_MEASURE * 10}px ${style.fontFamily}`;
    reach = Math.max(...texts.map(text => {
      const metrics = draw.measureText(text);
      return (metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent) / (SPAN_MEASURE * 10);
    }));
  }

  /* The most lines whose size leaves them spaced no closer than they may be */
  let chosen = { lines: 1, size: Math.min(max, tall / (2 * SPAN_INSET + reach)) };
  for (let lines = 2; lines <= SPAN_MOST_LINES; lines += 1) {
    const size = Math.min(max, ...texts.map(text =>
      (wide - 2 * SPAN_SLACK) / (narrowest(text, SPAN_MEASURE, lines) / SPAN_MEASURE + 2 * SPAN_INSET)));
    const leading = ((tall - 2 * SPAN_INSET * size) / size - reach) / (lines - 1);
    if (leading < SPAN_CLOSEST) break;
    chosen = { lines, size };
    /* At max, more lines would only stand closer together */
    if (size >= max) break;
  }
  const size = Math.max(min, chosen.size);

  const even = narrowest(content, size, chosen.lines);
  /* The space either side gives way where the lines need it, as a size scaled from another holds to a fraction of a pixel */
  const inset = Math.max(0, Math.min(SPAN_INSET * size, (wide - even) / 2));
  el.style.width = `${(even + border).toFixed(3)}px`;
  const laidLines = lineTexts(el);
  const rowsOf = (lines: string[]) => lines.map(text => {
    const row = document.createElement('span');
    row.style.display = 'block';
    row.textContent = text;
    return row;
  });
  el.style.removeProperty('width');
  el.style.paddingLeft = `${inset.toFixed(2)}px`;
  el.style.paddingRight = `${inset.toFixed(2)}px`;
  el.style.textAlign = 'left';
  let rows: HTMLElement[] = [];
  if (draw) {
    draw.font = `${style.fontStyle} ${style.fontWeight} ${size}px ${style.fontFamily}`;
    const words = content.split(' ');
    const broken = evenBreaks(words.map(word => draw.measureText(word).width), draw.measureText(' ').width,
      chosen.lines, wide - 2 * inset - SPAN_SLACK);
    if (broken) {
      rows = rowsOf(broken.map(([from, to], i) => words.slice(from, to).join(' ') + (i < broken.length - 1 ? ' ' : '')));
      el.replaceChildren(...rows);
      if (rows.some(row => textLines(row, 1) > 1)) rows = [];
    }
  }
  /* Breaks where the page does at the narrowest width, where measured breaks are not found or a line of them wraps */
  if (!rows.length) {
    rows = rowsOf(laidLines);
    el.replaceChildren(...rows);
  }
  /* Spaces out each line's letters by their share of what it falls short, measured before its spaces open up */
  const zoomed = el.offsetWidth > 0 ? el.getBoundingClientRect().width / el.offsetWidth : 1;
  const room = wide - 2 * inset;
  rows.forEach(row => {
    const text = row.firstChild;
    const letters = (row.textContent ?? '').trimEnd().length;
    if (!text || letters < 2) return;
    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, letters);
    const short = room - range.getBoundingClientRect().width / zoomed;
    if (short > 0) row.style.letterSpacing = `${Math.min(SPAN_TRACKING_MOST * size, (SPAN_TRACKING * short) / letters).toFixed(3)}px`;
  });
  el.style.textAlign = 'justify';
  el.style.setProperty('text-align-last', 'justify');

  /* Spaces the lines so the letters stand as tall as the box less the inset above and below, and centres them in it */
  el.style.height = 'auto';
  el.style.paddingBottom = '0px';
  /* Placed by the font as the page lays lines out, as a scale over the page leaves letter boxes a pixel or two off */
  const place = fontPlace(el, style);
  let leading = SPAN_LEADING;
  let down = 0;
  if (draw && place && rows.length) {
    draw.font = `${style.fontStyle} ${style.fontWeight} ${size * 10}px ${style.fontFamily}`;
    const rise = draw.measureText((rows[0].textContent ?? '').trim()).actualBoundingBoxAscent / 10;
    const fall = draw.measureText((rows[rows.length - 1].textContent ?? '').trim()).actualBoundingBoxDescent / 10;
    if (rows.length > 1) {
      const spread = (tall - 2 * inset - rise - fall) / ((rows.length - 1) * size);
      leading = Number(Math.min(SPAN_LOOSEST, Math.max(SPAN_CLOSEST, spread)).toFixed(4));
    }
    const line = leading * size;
    const letters = (rows.length - 1) * line + rise + fall;
    down = (tall - letters) / 2 - (place.baseline(line) - rise);
  }
  el.style.lineHeight = String(leading);
  el.style.paddingTop = `${Math.max(0, down).toFixed(2)}px`;
  /* Stands exactly as tall as asked, the same in every text it shows */
  const borders = (parseFloat(style.borderTopWidth) || 0) + (parseFloat(style.borderBottomWidth) || 0);
  el.style.height = `${(tall + borders).toFixed(2)}px`;
  return true;
}

/* Lets an element's text wrap onto balanced lines, or puts it back on the one line its CSS sets */
const wrapEvenly = (el: HTMLElement, on: boolean) => {
  el.style.whiteSpace = on ? 'normal' : '';
  if (on) el.style.setProperty('text-wrap', 'balance'); else el.style.removeProperty('text-wrap');
  /* Chrome breaks at a <wbr> even on a line set not to wrap, so each is hidden while the text keeps to one line */
  el.querySelectorAll('wbr').forEach(mark => { mark.style.display = on ? '' : 'none'; });
};

/* Binary-searches the largest size at which an element's text still fits the box its CSS gives it */
export function useFitFont(
  ref: RefObject<HTMLElement | null>,
  content: string,
  options: FitOptions = {}
) {
  const {
    max = 15,
    min = 8,
    slackLines = 0,
    centreBox = false,
    axis = 'height',
    basePad = 7,
    clampToBox = false,
    wholeWords = false,
    exact = false,
    heavier,
    growTo,
    sizedAs,
    alongside,
    fullAs,
    fillRuns = false,
    evenLines = false,
    spanBox = false,
    alike,
    room,
    onFit,
  } = options;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    /* Sizes of the box and its parent at the last pass, which resizes them itself and must not set off another */
    const sizes = () => {
      const box = el.getBoundingClientRect();
      const parent = el.parentElement?.getBoundingClientRect();
      return `${box.width.toFixed(2)}x${box.height.toFixed(2)} ${parent?.width.toFixed(2)}x${parent?.height.toFixed(2)}`;
    };
    let measured = '';

    /* Where the box sits, checked each frame, as onFit places by page pixels that shift without any size changing */
    const spot = () => {
      const box = el.getBoundingClientRect();
      return `${box.left.toFixed(2)},${box.top.toFixed(2)}`;
    };
    let placed = '';

    /* Whether the current pass is a refit after onFit resizes the box, so a refit never sets off another */
    let refitted = false;
    let frame = 0;

    const measure = () => {
      /* Every pass starts from the same state, or a re-run inherits the last one's answer */
      el.textContent = content;
      el.style.lineHeight = '';
      el.style.removeProperty('-webkit-line-clamp');

      if (centreBox) {
        el.style.paddingTop = `${basePad}px`;
        el.style.paddingBottom = `${basePad}px`;
      }
      if (evenLines) {
        el.style.removeProperty('padding-left');
        el.style.removeProperty('padding-right');
      }
      /* Spanned as one block, where it can be laid out, rather than fitted */
      if (spanBox && spanText(el, content, alike ?? [], room?.(el) ?? null, min, max)) {
        handOver();
        return;
      }

      /* Seven halvings settle a half-pixel answer across any range this app uses */
      const searchLargest = (from: number, to: number, fitsAt: (size: number) => boolean) => {
        let lo = from;
        let hi = to;
        let largest = from;
        for (let i = 0; i < 7; i += 1) {
          const mid = Math.round(((lo + hi) / 2) * 2) / 2;
          if (fitsAt(mid)) {
            largest = mid;
            lo = mid;
          } else {
            hi = mid;
          }
        }
        return largest;
      };

      /* The partner starts every pass on one line as its CSS lays it out, free of styles any earlier pass leaves */
      const partner = alongside?.(el) ?? null;
      if (partner) {
        wrapEvenly(partner, false);
        partner.style.removeProperty('height');
        partner.style.removeProperty('line-height');
        partner.style.removeProperty('transform');
      }
      const setSize = (size: number) => {
        el.style.fontSize = `${size}px`;
        if (partner) partner.style.fontSize = `${size}px`;
      };

      /* Whether the text fits inside the padding at the heavier weight, or null where nothing is laid out, as under jsdom */
      const heavierFits = () => {
        const range = document.createRange();
        if (!heavier || typeof range.getBoundingClientRect !== 'function' || !(el.offsetWidth > 0)) return null;
        const own = el.style.fontWeight;
        el.style.fontWeight = heavier;
        range.selectNodeContents(el);
        const zoom = el.getBoundingClientRect().width / el.offsetWidth;
        const wide = range.getBoundingClientRect().width / zoom;
        el.style.fontWeight = own;
        const style = getComputedStyle(el);
        return wide <= el.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0);
      };

      let keepWhole = wholeWords;
      const fits = (size: number) => {
        if (axis === 'width') return heavierFits() ?? el.scrollWidth <= el.clientWidth + (exact ? 0 : 1);
        return el.scrollHeight <= el.clientHeight + 1 + size * 1.35 * slackLines
          && (!keepWhole || !splitsAWord(el));
      };

      const largestFitting = (from: number, to: number) => searchLargest(from, to, size => {
        setSize(size);
        return fits(size);
      });

      /* The sample is tried in the box itself, up to twice max, before the box gets its own text back */
      let ceiling = max;
      if (growTo) {
        el.textContent = growTo;
        ceiling = largestFitting(max, max * 2);
        el.textContent = content;
      }
      if (sizedAs) {
        el.textContent = sizedAs;
        ceiling = largestFitting(min, ceiling);
        el.textContent = content;
      }
      /* Held to sizes at which the partner fits its width, on one line or on two where that sets the sample larger */
      if (partner) {
        const fitsAt = (lines: number) => (size: number) => {
          partner.style.fontSize = `${size}px`;
          return partner.scrollWidth <= partner.clientWidth + 1 && (lines === 1 || lineCount(partner) <= lines);
        };
        const onOneLine = searchLargest(min, max, fitsAt(1));
        let partnerCeiling = onOneLine;
        if (fullAs) {
          el.textContent = fullAs;
          const whole = keepWhole;
          /* The sample is tried as a run that may break anywhere */
          keepWhole = false;
          const fullOnOne = largestFitting(min, Math.min(ceiling, onOneLine));
          wrapEvenly(partner, true);
          const onTwoLines = searchLargest(min, max, fitsAt(2));
          const fullOnTwo = largestFitting(min, Math.min(ceiling, onTwoLines));
          if (fullOnTwo > fullOnOne) partnerCeiling = onTwoLines;
          else wrapEvenly(partner, false);
          keepWhole = whole;
          el.textContent = content;
        }
        ceiling = Math.min(ceiling, partnerCeiling);
      }

      let best = largestFitting(min, ceiling);
      /* A word that splits even at min splits at any size, so the size is found again without keeping words whole */
      if (keepWhole && best === min) {
        setSize(min);
        if (splitsAWord(el)) {
          keepWhole = false;
          best = largestFitting(min, ceiling);
        }
      }
      setSize(best);

      /* Cutting characters and measuring is exact, where line clamping varies by engine */
      if (clampToBox) {
        el.textContent = content;
        if (el.scrollHeight > el.clientHeight + 1) {
          let low = 0;
          let high = content.length;
          while (low < high) {
            const mid = Math.ceil((low + high) / 2);
            el.textContent = `${content.slice(0, mid).trimEnd()}\u2026`;
            if (el.scrollHeight <= el.clientHeight + 1) low = mid; else high = mid - 1;
          }
          el.textContent = `${content.slice(0, low).trimEnd()}\u2026`;
        }
      }

      /* A run with no spaces breaks wherever a line fills, which can leave its last line short */
      if (axis === 'height' && !/\s/.test(content) && el.textContent === content) {
        const letters = Array.from(content);
        const lines = lineLengths(el);
        const short = lines.length > 1 && lines[lines.length - 1] < Math.max(...lines);
        if (short && fillRuns) {
          /* Each row a block of its own, the longer rows first, all spaced to the width midway between the widest and narrowest */
          const count = lines.length;
          const share = Math.floor(letters.length / count);
          let at = 0;
          const rows = Array.from({ length: count }, (_, line) => {
            const take = share + (line < letters.length % count ? 1 : 0);
            at += take;
            const row = document.createElement('span');
            row.style.display = 'block';
            row.textContent = letters.slice(at - take, at).join('');
            return row;
          });
          el.replaceChildren(...rows);
          const range = document.createRange();
          const widths = rows.map(row => {
            range.selectNodeContents(row);
            return typeof range.getBoundingClientRect === 'function' ? range.getBoundingClientRect().width : 0;
          });
          const shown = el.getBoundingClientRect().width;
          const zoom = el.offsetWidth > 0 && shown > 0 ? shown / el.offsetWidth : 1;
          const across = (Math.max(...widths) + Math.min(...widths)) / 2;
          const spaces = rows.map((row, i) => {
            const gaps = Math.max(1, Array.from(row.textContent ?? '').length - 1);
            return (across - widths[i]) / zoom / gaps;
          });
          /* Rows that would need their letters moved by more than a sixth of the size keep their own widths */
          if (spaces.every(space => Math.abs(space) <= best / 6)) {
            rows.forEach((row, i) => {
              if (Math.abs(spaces[i]) < 0.005) return;
              row.style.letterSpacing = `${spaces[i]}px`;
              /* Takes back the spacing after the last letter, so the row stays centred */
              row.style.marginRight = `${-spaces[i]}px`;
            });
          }
          /* A run whose rows do not come out one to a line, or overflow, is left as it breaks */
          if (textLines(el) !== count || !fits(best)) el.textContent = content;
        } else if (short) {
          /* Takes the largest size down to four fifths of the fit at which the run shares out evenly */
          let shared = false;
          for (let size = best; size >= Math.max(min, best * 0.8) && !shared; size -= 0.25) {
            setSize(size);
            shared = evenOutRun(el, content, () => fits(size));
            if (shared) best = size;
          }
          if (!shared) {
            setSize(best);
            el.textContent = content;
          }
        }
      }

      /* Draws both sides in as far as the text keeps to as many lines, in eight halvings of up to a quarter of its width */
      if (evenLines && axis === 'height') {
        const lines = textLines(el, 1);
        if (lines > 1) {
          const style = getComputedStyle(el);
          const left = parseFloat(style.paddingLeft) || 0;
          const right = parseFloat(style.paddingRight) || 0;
          const inset = (by: number) => {
            el.style.paddingLeft = `${(left + by).toFixed(2)}px`;
            el.style.paddingRight = `${(right + by).toFixed(2)}px`;
          };
          let kept = 0;
          let over = (el.clientWidth - left - right) / 4;
          for (let i = 0; i < 8; i += 1) {
            const by = (kept + over) / 2;
            inset(by);
            if (textLines(el, 1) === lines) kept = by;
            else over = by;
          }
          inset(kept);
        }
      }

      if (centreBox) {
        /* Range.getClientRects is not everywhere, which reads as one line */
        const lines = Math.max(1, textLines(el, 1));
        const room = el.clientHeight - 2 * basePad;
        const original = el.style.lineHeight;
        const leading = Math.min(1.6, room / (lines * best));
        if (leading > 1.05) {
          el.style.lineHeight = String(leading);
          if (el.scrollHeight > el.clientHeight + 1) el.style.lineHeight = original;
        }
        /* Centred by grid, since halving the leftover space relies on scrollHeight */
        el.style.display = 'grid';
        el.style.alignContent = 'center';
        el.style.paddingTop = `${basePad}px`;
        el.style.paddingBottom = `${basePad}px`;
      }

      handOver();
    };

    /* One pass measures before the font loads and the zoom settles, so it runs again */
    const remeasure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        measure();
        measured = sizes();
        if (onFit) placed = spot();
      });
    };

    /* Hands the element to onFit, and fits it again, once in a row at most, where what onFit places resizes the box */
    const handOver = () => {
      if (!onFit) return;
      const fitted = sizes();
      onFit(el);
      if (sizes() !== fitted && !refitted) {
        refitted = true;
        remeasure();
      } else refitted = false;
    };

    measure();
    measured = sizes();
    placed = onFit ? spot() : '';
    let watching = 0;
    const watch = () => {
      watching = requestAnimationFrame(() => {
        if (spot() !== placed) {
          onFit?.(el);
          placed = spot();
        }
        watch();
      });
    };
    if (onFit) watch();

    /* jsdom has neither, so under test the hook quietly falls back to its single pass */
    const observer = typeof ResizeObserver === 'function'
      ? new ResizeObserver(() => { if (sizes() !== measured) remeasure(); })
      : null;
    if (observer) {
      if (el.parentElement) observer.observe(el.parentElement);
      observer.observe(el);
    }
    window.addEventListener('resize', remeasure);
    /* A promise cannot be called off, so fonts that finish loading once the element is gone are ignored */
    let mounted = true;
    if (document.fonts && document.fonts.status !== 'loaded') {
      document.fonts.ready.then(() => { if (mounted) remeasure(); }).catch(() => {});
    }

    return () => {
      mounted = false;
      cancelAnimationFrame(frame);
      cancelAnimationFrame(watching);
      observer?.disconnect();
      window.removeEventListener('resize', remeasure);
    };
  }, [ref, content, max, min, slackLines, centreBox, axis, basePad, clampToBox, wholeWords, exact, heavier, growTo, sizedAs, alongside, fullAs, fillRuns, evenLines, spanBox, alike, room, onFit]);
}