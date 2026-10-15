/* Measures where an element's letters are actually drawn, which its boxes do not show, with a canvas */

/* Letters are measured at ten times their size and scaled back, as a canvas gives their extent in whole pixels */
const SCALE = 10;

let context: OffscreenCanvasRenderingContext2D | null = null;

/* Makes one canvas for every measurement, and none where there is nothing to draw with, as under jsdom */
const canvas = () => {
  if (!context && typeof OffscreenCanvas === 'function') context = new OffscreenCanvas(1, 1).getContext('2d');
  return context;
};

const fontAt = (style: CSSStyleDeclaration, size: number) =>
  `${style.fontStyle} ${style.fontWeight} ${size}px ${style.fontFamily}`;

/* Gives a letter as it is shown, which text-transform can change from how it is written */
const shown = (letter: string, style: CSSStyleDeclaration) =>
  style.textTransform === 'uppercase' ? letter.toUpperCase() : letter;

/* Measures how many of the page's pixels one of the element's CSS pixels covers, which zoom makes other than one */
const zoomOf = (el: HTMLElement, style: CSSStyleDeclaration) => {
  const width = parseFloat(style.width);
  return width > 0 ? el.getBoundingClientRect().width / width : 1;
};

/* An element's zoom as the browser gives it, where it does, without any scale a transform draws it at */
type Zoomed = HTMLElement & { currentCSSZoom?: number };

/* One line of an element's text as laid out */
interface Line {
  top: number;
  left: number;
  right: number;
  text: string;
}

/* Gathers an element's letters into lines by the tops of their boxes, with how far across each line's boxes run */
const linesOf = (el: HTMLElement, style: CSSStyleDeclaration) => {
  const range = document.createRange();
  if (typeof range.getClientRects !== 'function') return [];
  const lines = new Map<number, Line>();
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    let start = 0;
    for (const letter of node.textContent ?? '') {
      const end = start + letter.length;
      if (letter.trim()) {
        range.setStart(node, start);
        range.setEnd(node, end);
        const box = Array.from(range.getClientRects()).find(rect => rect.width > 0);
        if (box) {
          const line = lines.get(Math.round(box.top)) ?? { top: box.top, left: box.left, right: box.right, text: '' };
          line.text += shown(letter, style);
          line.left = Math.min(line.left, box.left);
          line.right = Math.max(line.right, box.right);
          lines.set(Math.round(box.top), line);
        }
      }
      start = end;
    }
  }
  return Array.from(lines.values()).sort((a, b) => a.top - b.top);
};

/* Reaches already worked out, by font, scale and letters, as a title is placed again each time its table scrolls */
const reaches = new Map<string, { ascent: number; descent: number } | null>();

/* Measures how far drawn letters reach above and below the baseline, counting a pixel row only once it is half covered */
const drawnReach = (text: string, style: CSSStyleDeclaration, size: number, across = 1, down = 1) => {
  const measure = canvas();
  if (!measure || !text.trim()) return null;
  measure.font = fontAt(style, size);
  const key = `${measure.font}|${across}|${down}|${text}`;
  if (reaches.has(key)) return reaches.get(key) ?? null;
  const metrics = measure.measureText(text);
  const width = Math.ceil((metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight) * across) + 4;
  const above = Math.ceil(metrics.actualBoundingBoxAscent * down) + 2;
  const height = above + Math.ceil(metrics.actualBoundingBoxDescent * down) + 2;
  const draw = new OffscreenCanvas(width, height).getContext('2d');
  if (!draw) return null;
  draw.font = measure.font;
  if (across === 1 && down === 1) draw.fillText(text, 2 + metrics.actualBoundingBoxLeft, above);
  else {
    draw.setTransform(across, 0, 0, down, 2 + metrics.actualBoundingBoxLeft * across, above);
    draw.fillText(text, 0, 0);
  }
  const pixels = draw.getImageData(0, 0, width, height).data;
  let first = -1;
  let last = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (pixels[(y * width + x) * 4 + 3] >= 128) {
        if (first < 0) first = y;
        last = y;
        break;
      }
    }
  }
  const reach = first < 0 ? null : { ascent: above - first, descent: last + 1 - above };
  if (reaches.size >= 500) reaches.clear();
  reaches.set(key, reach);
  return reach;
};

/* Measures how far one line's letters reach up and down the page, from their outlines or, where asked, as drawn */
const inkOfLine = (
  draw: OffscreenCanvasRenderingContext2D,
  line: Line,
  style: CSSStyleDeclaration,
  size: number,
  drawn = false,
  painted = true
) => {
  /* A line's box starts the font's ascent above its baseline, rounded at the zoomed size by the page and a canvas alike */
  draw.font = fontAt(style, size);
  const falls = line.top + draw.measureText(line.text).fontBoundingBoxAscent;
  /* The page paints each baseline on a whole pixel */
  const baseline = painted ? Math.round(falls) : falls;
  const pixel = window.devicePixelRatio || 1;
  const seen = drawn ? drawnReach(line.text, style, size * pixel) : null;
  if (seen) return { top: baseline - seen.ascent / pixel, bottom: baseline + seen.descent / pixel };
  draw.font = fontAt(style, size * SCALE);
  const metrics = draw.measureText(line.text);
  return {
    top: baseline - metrics.actualBoundingBoxAscent / SCALE,
    bottom: baseline + metrics.actualBoundingBoxDescent / SCALE,
  };
};

/* Measures from the top of an element's first line of letters to the bottom of its last, in the page's coordinates */
const inkOf = (el: HTMLElement, drawn = false, painted = true) => {
  const draw = canvas();
  if (!draw) return null;
  const style = getComputedStyle(el);
  const lines = linesOf(el, style);
  if (!lines.length) return null;
  const size = parseFloat(style.fontSize) * zoomOf(el, style);
  const first = inkOfLine(draw, lines[0], style, size, drawn, painted);
  const last = lines.length > 1 ? inkOfLine(draw, lines[lines.length - 1], style, size, drawn, painted) : first;
  return { top: first.top, bottom: last.bottom };
};

/* Where a box's top and bottom edges are painted, on whole pixels as baselines are */
export const boxTop = (el: Element) => Math.round(el.getBoundingClientRect().top);
export const boxBottom = (el: Element) => Math.round(el.getBoundingClientRect().bottom);

/* Gives where a box's fill starts under its top border, for a box whose faint border reads as space rather than edge */
export const fillTop = (el: HTMLElement) => {
  const style = getComputedStyle(el);
  return boxTop(el) + (parseFloat(style.borderTopWidth) || 0) * zoomOf(el, style);
};

/* Gives where a box's fill starts as painted, its top on a whole pixel and its border in whole screen pixels, at least one */
export const paintedFillTop = (el: HTMLElement) => {
  const style = getComputedStyle(el);
  const pixel = window.devicePixelRatio || 1;
  const border = (parseFloat(style.borderTopWidth) || 0) * zoomOf(el, style) * pixel;
  return Math.round(el.getBoundingClientRect().top) + (border > 0 ? Math.max(1, Math.round(border)) : 0) / pixel;
};

/* Where something shows down the page, from its top to its bottom */
export interface Extent {
  top: number;
  bottom: number;
}

/* Measures an element's letters by the pixel rows they cover as drawn, on baselines painted on whole pixels */
export const drawnExtent = (el: HTMLElement): Extent | null => inkOf(el, true);

/* Measures an element's letters by their outlines, on baselines painted on whole pixels */
export const paintedExtent = (el: HTMLElement): Extent | null => inkOf(el);

/* Measures an element's letters by their outlines where they fall, so the result is the same wherever it stands */
export const laidExtent = (el: HTMLElement): Extent | null => inkOf(el, false, false);

/* Measures the font's ascent and descent in the element's own pixels, and where a line of a height sets its baseline */
export const fontPlace = (el: HTMLElement, style: CSSStyleDeclaration = getComputedStyle(el)) => {
  const draw = canvas();
  if (!draw) return null;
  /* Measured at the size the page lays text out at, which its zoom sets and a transform's scale does not */
  const zoom = (el as Zoomed).currentCSSZoom || zoomOf(el, style);
  draw.font = fontAt(style, parseFloat(style.fontSize) * zoom);
  const metrics = draw.measureText('x');
  const up = metrics.fontBoundingBoxAscent;
  const down = metrics.fontBoundingBoxDescent;
  return {
    ascent: up / zoom,
    descent: down / zoom,
    /* The page splits the leading in whole pixels, rounding the half above down */
    baseline: (height: number) => (up + Math.floor((height * zoom - up - down) / 2)) / zoom,
  };
};

/* Places an element's letters by its line height rather than their boxes, which a scale can put a pixel or two out */
export const blockExtent = (el: HTMLElement): Extent | null => {
  const draw = canvas();
  if (!draw) return null;
  const style = getComputedStyle(el);
  const lines = linesOf(el, style);
  const place = fontPlace(el, style);
  const height = parseFloat(style.lineHeight);
  if (!lines.length || !place || !(height > 0)) return null;
  const zoom = zoomOf(el, style);
  const top = el.getBoundingClientRect().top
    + ((parseFloat(style.borderTopWidth) || 0) + (parseFloat(style.paddingTop) || 0)) * zoom;
  /* Where each baseline is laid out, before it is painted on a whole pixel, which a scale over the page leaves the same */
  const baseline = (line: number) => top + (line * height + place.baseline(height)) * zoom;
  /* Letters reach as far as their outlines, which a scale over the page also leaves the same */
  draw.font = fontAt(style, parseFloat(style.fontSize) * SCALE);
  const reach = (text: string) => {
    const metrics = draw.measureText(text);
    return { ascent: (metrics.actualBoundingBoxAscent / SCALE) * zoom, descent: (metrics.actualBoundingBoxDescent / SCALE) * zoom };
  };
  return {
    top: baseline(0) - reach(lines[0].text).ascent,
    bottom: baseline(lines.length - 1) + reach(lines[lines.length - 1].text).descent,
  };
};

/* Moves each item down a panel so the space above, between and below the items is the same to the eye */
export function spaceEvenly(
  panel: HTMLElement,
  items: HTMLElement[],
  extentOf: (el: HTMLElement) => Extent | null = drawnExtent
) {
  items.forEach(item => { item.style.transform = ''; });
  const extents = items.map(extentOf);
  if (!items.length || extents.some(extent => !extent)) return;
  const style = getComputedStyle(panel);
  const zoom = zoomOf(panel, style);
  const box = panel.getBoundingClientRect();
  const top = box.top + (parseFloat(style.borderTopWidth) || 0) * zoom;
  const bottom = box.bottom - (parseFloat(style.borderBottomWidth) || 0) * zoom;
  const shown = extents.reduce((sum, extent) => sum + extent!.bottom - extent!.top, 0);
  const space = (bottom - top - shown) / (items.length + 1);
  let at = top + space;
  items.forEach((item, i) => {
    const extent = extents[i]!;
    const shift = (at - extent.top) / zoomOf(item, getComputedStyle(item));
    if (Math.abs(shift) >= 0.05) item.style.transform = `translateY(${shift.toFixed(2)}px)`;
    at += extent.bottom - extent.top + space;
  });
}

/* How much larger letters are drawn than they are laid out, across and down */
export interface Scale {
  across: number;
  down: number;
}

/* The scale letters are drawn at to fill a room, and how tall they then stand in the element's own CSS pixels */
export interface Filled extends Scale {
  tall: number;
}

/* Measures how wide each line of an element's letters runs in the page's pixels, with none where nothing is laid out */
export const lineWidths = (el: HTMLElement) => linesOf(el, getComputedStyle(el)).map(line => line.right - line.left);

/* Measures how far some letters reach above and below their baseline in the element's font, as shares of its size */
export const reachOf = (el: HTMLElement, letters: string) => {
  const draw = canvas();
  if (!draw) return null;
  draw.font = fontAt(getComputedStyle(el), 100);
  const metrics = draw.measureText(letters);
  return { up: metrics.actualBoundingBoxAscent / 100, down: metrics.actualBoundingBoxDescent / 100 };
};

/* Measures a letter's width and the spacing set after it as shares of the font size, so both grow alike with it */
export const letterRun = (el: HTMLElement, letter: string) => {
  const draw = canvas();
  if (!draw) return null;
  const style = getComputedStyle(el);
  const size = parseFloat(style.fontSize);
  draw.font = fontAt(style, 100);
  return {
    per: draw.measureText(letter).width / 100,
    spacing: size > 0 ? (parseFloat(style.letterSpacing) || 0) / size : 0,
  };
};

/* Measures how wide some text runs in the element's font at a size, before any spacing between its letters */
export const textWidth = (el: HTMLElement, text: string, size: number) => {
  const draw = canvas();
  if (!draw) return null;
  draw.font = fontAt(getComputedStyle(el), size * SCALE);
  return draw.measureText(text).width / SCALE;
};

/* How far past halfway to the next screen pixel a baseline may fall and still be drawn higher, as low letters look sunk */
const TIE = 0.15;

/* Moves an element's letters to sit midway between two heights, drawn at a scale about their middle where one is given */
export function centreInkBetween(el: HTMLElement, above: number | null, below: number | null, scale?: Scale) {
  el.style.transform = '';
  if (above === null || below === null) return;
  const style = getComputedStyle(el);
  const zoom = zoomOf(el, style);
  if (!scale) {
    const ink = inkOf(el);
    if (!ink) return;
    const shift = ((above + below) / 2 - (ink.top + ink.bottom) / 2) / zoom;
    if (Math.abs(shift) >= 0.05) el.style.transform = `translateY(${shift.toFixed(2)}px)`;
    return;
  }
  const box = el.getBoundingClientRect();
  const draw = canvas();
  const lines = linesOf(el, style);
  const pixel = window.devicePixelRatio || 1;
  const size = parseFloat(style.fontSize) * zoom;
  const first = lines[0];
  const last = lines[lines.length - 1];
  const top = first ? drawnReach(first.text, style, size * pixel, scale.across, scale.down) : null;
  const bottom = last ? drawnReach(last.text, style, size * pixel, scale.across, scale.down) : null;
  let shift: number;
  if (draw && first && last && top && bottom) {
    draw.font = fontAt(style, size);
    const origin = Math.round(box.top);
    const half = box.height / 2;
    /* Where a line's baseline is drawn unmoved, on a whole pixel of the element's own and scaled about its middle */
    const scaled = (line: Line) =>
      origin + half + scale.down * (Math.round(line.top + draw.measureText(line.text).fontBoundingBoxAscent - box.top) - half);
    const firstAt = scaled(first);
    const lastAt = scaled(last);
    const onScreen = (y: number) => Math.round(y * pixel) / pixel;
    const centred = (above + below) / 2 - (firstAt + lastAt) / 2 + (top.ascent - bottom.descent) / 2 / pixel;
    /* How much more room the letters leave above them than below once moved down the page by a shift */
    const uneven = (by: number) =>
      (onScreen(firstAt + by) - top.ascent / pixel - above) - (below - onScreen(lastAt + by) - bottom.descent / pixel);
    let best = centred;
    let off = Infinity;
    /* Tries the shifts within half a pixel of the middle for the one that leaves the two gaps nearest alike */
    for (let step = -4; step <= 4; step += 1) {
      /* Tried as it will be written, to a hundredth of the element's own pixel */
      const tried = (Math.round(((centred + step / 8 / pixel) / zoom) * 100) / 100) * zoom;
      const lower = uneven(tried);
      /* Prefers the higher of two shifts that come out alike or nearly, as a row less than half covered still shows a little */
      const gap = Math.abs(lower) + (lower > 0 ? (4 * TIE) / pixel : 0);
      if (gap < off - 1e-6 || (gap <= off + 1e-6 && Math.abs(tried - centred) < Math.abs(best - centred))) {
        best = tried;
        off = gap;
      }
    }
    shift = best / zoom;
  } else {
    /* Where the letters cannot be drawn to see where they show, their outlines are centred instead */
    const ink = inkOf(el);
    if (!ink) return;
    const middle = box.top + box.height / 2;
    shift = ((above + below) / 2 - middle - scale.down * ((ink.top + ink.bottom) / 2 - middle)) / zoom;
  }
  el.style.transform = `translateY(${shift.toFixed(2)}px) scale(${scale.across.toFixed(4)}, ${scale.down.toFixed(4)})`;
}

/* How narrow letters may be drawn to stand taller, against their own width, where they already run the room's width */
const NARROWEST = 0.6;

/* Sets an element's letters as large as a height and a share of its width allow, then centres them between two heights */
export function fillBetween(
  el: HTMLElement, above: number, below: number, tall: number, wide = 1, narrowest = NARROWEST
): Filled | null {
  el.style.transform = '';
  const draw = canvas();
  const style = getComputedStyle(el);
  const lines = linesOf(el, style);
  const room = parseFloat(style.width);
  if (!draw || !lines.length || !(room > 0)) return null;
  const zoom = zoomOf(el, style);
  const laidOut = parseFloat(style.fontSize);
  /* Keeps the element at its laid-out height, so nothing around it moves */
  el.style.height = `${el.getBoundingClientRect().height / zoom}px`;
  const split = lines.map(line => line.text).join('\n');
  /* How wide each line runs in the current layout, or null where a letter has moved to another line */
  const widths = () => {
    const now = linesOf(el, getComputedStyle(el));
    return now.map(line => line.text).join('\n') === split ? now.map(line => (line.right - line.left) / zoom) : null;
  };
  if (lines.length === 1) {
    /* Sizes a single line to run just inside the width in a pass or two, keeping its laid-out size where that overruns */
    const across = room - 0.25;
    let size = laidOut;
    let now = widths();
    for (let pass = 0; pass < 4 && now; pass += 1) {
      if (now[0] <= across + 0.1 && now[0] >= across - 0.4) break;
      size = (size * across) / now[0];
      el.style.fontSize = `${size}px`;
      now = widths();
    }
    if (!now || now[0] > room) el.style.fontSize = `${laidOut}px`;
  } else {
    /* How far each line's letters reach above and below its baseline at a size of one */
    draw.font = fontAt(style, 100);
    const reach = lines.map(line => {
      const metrics = draw.measureText(line.text);
      return { up: metrics.actualBoundingBoxAscent / 100, down: metrics.actualBoundingBoxDescent / 100 };
    });
    let pitch = 0;
    /* Brings each line up as close as the letters either side allow, two ninths of the size apart */
    for (let i = 1; i < reach.length; i += 1) pitch = Math.max(pitch, reach[i - 1].down + reach[i].up + 2 / 9);
    el.style.lineHeight = String(pitch);
  }
  /* Drawn to fill the height where the lines allow it across, and narrower, within limits, where they do not */
  const ink = laidExtent(el);
  const spans = widths();
  if (!ink || !spans || ink.bottom <= ink.top) {
    centreInkBetween(el, above, below);
    return null;
  }
  const byHeight = tall / ((ink.bottom - ink.top) / zoom);
  const byWidth = (room * wide) / Math.max(...spans);
  const across = Math.min(byHeight, byWidth);
  const down = byHeight > byWidth ? Math.min(byHeight, across / narrowest) : across;
  const scale = { across, down };
  centreInkBetween(el, above, below, scale);
  return { ...scale, tall: (down * (ink.bottom - ink.top)) / zoom };
}

/* The box an element is set in, its nearest ancestor a transform draws or else the page, and how much larger it is drawn */
interface Room {
  /* Where its top stands in the page's coordinates */
  at: number;
  /* Where its top is drawn, as the page drops the fraction of a pixel a transformed box is laid out at */
  drawn: number;
  scale: number;
}

/* Gives the room a transformed box makes, or null where its transform turns or slants it rather than scaling it */
const roomIn = (box: HTMLElement, style: CSSStyleDeclaration): Room | null => {
  const matrix = /^matrix\(([^)]+)\)$/.exec(style.transform);
  if (!matrix) return null;
  const [, turn, slant, scale, , moved] = matrix[1].split(',').map(Number);
  if (turn !== 0 || slant !== 0 || !(scale > 0)) return null;
  const zoom = (box as Zoomed).currentCSSZoom || 1;
  const at = box.getBoundingClientRect().top;
  /* Where its top is laid out, before the transform draws it larger about its origin and moves it */
  const laid = at - (parseFloat(style.transformOrigin.split(' ')[1]) || 0) * zoom * (1 - scale) - (moved || 0) * zoom;
  return { at, drawn: at - (laid - Math.round(laid)), scale };
};

/* Finds the room an element's box is set in, or null where it is one this cannot follow */
const roomOf = (el: HTMLElement): Room | null => {
  for (let box = el.parentElement; box; box = box.parentElement) {
    const style = getComputedStyle(box);
    if (style.transform && style.transform !== 'none') return roomIn(box, style);
  }
  return { at: -window.scrollY, drawn: -window.scrollY, scale: 1 };
};

/* Keeps what scrolling leaves unchanged about an element's lines, as it is placed again each time its table scrolls */
let settled = new WeakMap<HTMLElement, {
  key: string; first: number; last: number; ascent: number; descent: number; font: number;
}>();

/* A font that finishes loading measures afresh, so whatever is kept is measured again */
if (typeof document !== 'undefined' && typeof document.fonts?.addEventListener === 'function') {
  document.fonts.addEventListener('loadingdone', () => { settled = new WeakMap(); reaches.clear(); });
}

/* Works out where an element's first and last baselines are drawn for a shift, and how far their letters reach */
const standingOf = (el: HTMLElement, style: CSSStyleDeclaration) => {
  const at = el.getBoundingClientRect();
  const scale = zoomOf(el, style);
  const pixel = window.devicePixelRatio || 1;
  const key = [el.textContent, style.fontSize, style.fontWeight, style.lineHeight, style.width, style.paddingTop,
    at.width, at.height, pixel].join('|');
  let known = settled.get(el);
  if (known?.key !== key) {
    const draw = canvas();
    const lines = linesOf(el, style);
    const place = fontPlace(el, style);
    if (!draw || !lines.length || !place) return null;
    const first = lines[0];
    const last = lines[lines.length - 1];
    /* Measured at the size the screen draws them, which can set a letter's top on a whole pixel of its own too */
    draw.font = fontAt(style, parseFloat(style.fontSize) * scale * pixel);
    const ascent = draw.measureText(first.text).actualBoundingBoxAscent / pixel;
    /* A tail's tip is not set on a whole pixel, and shows only as far as its outline reaches */
    draw.font = fontAt(style, parseFloat(style.fontSize) * scale * SCALE);
    const descent = draw.measureText(last.text).actualBoundingBoxDescent / SCALE;
    known = { key, first: first.top - at.top, last: last.top - at.top, ascent, descent, font: place.ascent };
    settled.set(el, known);
  }
  const { first, last, ascent, descent, font } = known;
  const room = roomOf(el);
  const zoom = (el as Zoomed).currentCSSZoom || (room ? scale / room.scale : scale);
  if (room && Math.abs(room.scale * zoom - scale) <= 0.002 * scale) {
    /* The page sets the box on a whole pixel of its room, and each line on a whole pixel of the box, before scaling */
    const box = (at.top - room.at) / room.scale;
    const set = Math.round(box);
    const stands = (offset: number) => set + Math.round(box - set + offset / room.scale + font * zoom);
    const from = stands(first);
    const to = stands(last);
    return {
      ascent,
      descent,
      baseline: (shift: number) => room.drawn + room.scale * (from + shift * zoom),
      lastBaseline: (shift: number) => room.drawn + room.scale * (to + shift * zoom),
      /* Where an edge of a box in the same room, such as the button that holds a label, is drawn */
      edge: (y: number) => room.drawn + room.scale * Math.round((y - room.at) / room.scale),
    };
  }
  /* Where the room cannot be followed, as where transforms nest, the lines are where they fall */
  const falls = at.top + first + font * scale;
  const fallsLast = at.top + last + font * scale;
  return {
    ascent,
    descent,
    baseline: (shift: number) => falls + shift * scale,
    lastBaseline: (shift: number) => fallsLast + shift * scale,
    edge: (y: number) => y,
  };
};

/* Measures an element's letters where the screen draws them, for an element no transform of its own moves */
export const drawnLetters = (el: HTMLElement): Extent | null => {
  const stands = standingOf(el, getComputedStyle(el));
  if (!stands) return null;
  const pixel = window.devicePixelRatio || 1;
  return {
    top: Math.round(stands.baseline(0) * pixel) / pixel - stands.ascent,
    bottom: Math.round(stands.lastBaseline(0) * pixel) / pixel + stands.descent,
  };
};

/* Moves an element's letters to show midway between two heights where the screen draws them, narrower where asked */
export function centreDrawnBetween(el: HTMLElement, above: number | null, below: number | null, across = 1) {
  el.style.transform = '';
  if (above === null || below === null) return;
  /* Narrower about the middle of the box, which leaves where the letters stand down the page as it is */
  const narrower = Math.abs(across - 1) >= 0.0001 ? ` scaleX(${across.toFixed(4)})` : '';
  const stands = standingOf(el, getComputedStyle(el));
  /* Where the letters cannot be measured, their outlines are centred instead */
  if (!stands) {
    centreInkBetween(el, above, below, narrower ? { across, down: 1 } : undefined);
    return;
  }
  const pixel = window.devicePixelRatio || 1;
  const onScreen = (y: number) => Math.round(y * pixel) / pixel;
  const rate = stands.baseline(1) - stands.baseline(0);
  const apart = stands.lastBaseline(0) - stands.baseline(0);
  /* Where the first line would stand for the letters to show exactly midway */
  const ideal = (above + below) / 2 - (apart + stands.descent - stands.ascent) / 2;
  let best = 0;
  let off = Infinity;
  /* Tries the shifts that put the first line on each pixel about the middle for the one with gaps nearest alike */
  for (let step = -1; step <= 2; step += 1) {
    const at = Math.floor(ideal * pixel) / pixel + step / pixel;
    /* Tried as it will be written, to a hundredth of the element's own pixel */
    const shift = Math.round(((at - stands.baseline(0)) / rate) * 100) / 100;
    const uneven = (onScreen(stands.baseline(shift)) - stands.ascent - above)
      - (below - onScreen(stands.lastBaseline(shift)) - stands.descent);
    /* Prefers the higher of two shifts that come out alike or nearly, by as much as a label's letters are set high */
    const score = Math.abs(uneven) + (uneven > 0 ? 4 * TIE / pixel : 0);
    if (score < off) {
      off = score;
      best = shift;
    }
  }
  if (Math.abs(best) >= 0.005 || narrower) el.style.transform = `translateY(${best.toFixed(2)}px)${narrower}`;
}

/* Moves a one-line label so its letters, rather than its line's box, sit in the middle of the button that holds it */
export function centreLabel(el: HTMLElement) {
  el.style.transform = '';
  const draw = canvas();
  const style = getComputedStyle(el);
  const text = Array.from(el.textContent ?? '', letter => shown(letter, style)).join('');
  /* Text that runs over its box is set from the box's start, so there is no middle to correct it to */
  if (!draw || !text.trim() || el.scrollWidth > el.clientWidth) return;
  /* Centres the letters' outlines across the line, as a font leaves more space beside some letters than others */
  draw.font = fontAt(style, parseFloat(style.fontSize) * SCALE);
  const { width, actualBoundingBoxLeft: left, actualBoundingBoxRight: right } = draw.measureText(text);
  const across = (width - (right - left)) / 2 / SCALE;
  const stands = standingOf(el, style);
  let down = 0;
  if (stands) {
    const button = (el.parentElement ?? el).getBoundingClientRect();
    const pixel = window.devicePixelRatio || 1;
    const middle = (stands.edge(button.top) + stands.edge(button.bottom)) / 2;
    /* Sets the letters midway from their top to their baseline, so a tail such as a g's hangs below as in any word */
    const line = Math.round((middle + stands.ascent / 2) * pixel - TIE) / pixel;
    down = (line - stands.baseline(0)) / (stands.baseline(1) - stands.baseline(0));
  }
  if (Math.abs(across) >= 0.05 || Math.abs(down) >= 0.05) {
    el.style.transform = `translate(${across.toFixed(2)}px, ${down.toFixed(2)}px)`;
  }
}