import { RefObject, useLayoutEffect, useState } from 'react';

/* Fills each row to capacity in turn, so any remainder ends up in a shorter last row */
export function fillRows<T>(items: T[], capacity: number): T[][] {
  const cap = Math.max(1, capacity);
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += cap) rows.push(items.slice(i, i + cap));
  return rows;
}

/* The most cards a row holds, however wide the screen */
export const MAX_COLS = 8;

/* Works out how many cards fit across a container that is not itself sized by the rows */
export function useRowCapacity(
  ref: RefObject<HTMLElement | null>,
  cardWidth: number,
  gap: number,
  horizontalPadding = 0
): number {
  const [capacity, setCapacity] = useState(1);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const measure = () => {
      const declared = parseFloat(getComputedStyle(el).getPropertyValue('--card-w'));
      /* The stylesheet owns the card width, so the count follows whatever size it renders at */
      const card = Number.isFinite(declared) && declared > 0 ? declared : cardWidth;
      /* The gap comes from the stylesheet too, which narrows it on a phone */
      const declaredGap = parseFloat(getComputedStyle(el).columnGap);
      const between = Number.isFinite(declaredGap) ? declaredGap : gap;
      const width = el.clientWidth - horizontalPadding;
      setCapacity(Math.max(1, Math.min(MAX_COLS, Math.floor((width + between) / (card + between)))));
    };

    measure();

    /* A container can change width on its own, as when one FlashMatch column hides */
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    observer?.observe(el);
    window.addEventListener('resize', measure);

    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [ref, cardWidth, gap, horizontalPadding]);

  return capacity;
}

/* Finds the widest card, no wider than max, at which the deck fits the board, and min for a deck too large to fit */
export function fitCardWidth({ count, width, height, max, gap = 12, aspect = 176 / 132, min = 64 }: {
  count: number; width: number; height: number; max: number; gap?: number; aspect?: number; min?: number;
}): number {
  let best = 0;
  for (let cols = 1; cols <= Math.min(count, MAX_COLS); cols += 1) {
    const rows = Math.ceil(count / cols);
    const byWidth = (width - (cols - 1) * gap) / cols;
    const byHeight = (height - (rows - 1) * gap) / rows / aspect;
    best = Math.max(best, Math.min(max, byWidth, byHeight));
  }
  return Math.floor(Math.max(min, Math.min(max, best)));
}

/* Gives a phone's or tablet's row one fewer, larger card so its text stays readable, or null on a wider screen */
export function fewerLargerCards({ count, width, height, declared, gap = 12, aspect = 176 / 132 }: {
  count: number; width: number; height: number; declared: number; gap?: number; aspect?: number;
}): number | null {
  const across = Math.floor((width + gap) / (declared + gap));
  if (across > 4) return null;
  const cols = Math.max(2, across - 1);
  /* Half a pixel short of the room, which is measured in whole pixels where the board's own may fall short of it */
  const full = (width - (cols - 1) * gap) / cols - 0.5;
  const rows = Math.ceil(count / cols);
  const fitted = (height - (rows - 1) * gap) / rows / aspect;
  /* Shrinks the cards by up to a seventh where that fits the whole deck, and otherwise lets the board scroll */
  return Math.floor(fitted >= full * (6 / 7) ? Math.min(full, fitted) : full);
}

/* Sets --option-w so the overlay's answer cards fit the room its other rows leave, again on resize or a new key */
export function useOptionsFit(rowRef: RefObject<HTMLElement | null>, key: unknown, aspect = 176 / 132): number | null {
  const [fitted, setFitted] = useState<number | null>(null);

  useLayoutEffect(() => {
    const row = rowRef.current;
    const overlay = row?.parentElement;
    if (!row || !overlay) return;

    const fit = () => {
      const px = (value: string) => parseFloat(value) || 0;
      const style = getComputedStyle(row);
      const gap = px(style.columnGap);
      const width = row.clientWidth - px(style.paddingLeft) - px(style.paddingRight);
      /* The overlay's other rows take their own heights, and the gaps between its three tracks are kept */
      const others = Array.from(overlay.children).reduce((sum, child) => (child === row ? sum : sum + (child as HTMLElement).offsetHeight), 0);
      const height = overlay.clientHeight - others - 2 * px(getComputedStyle(overlay).rowGap) - px(style.paddingTop) - px(style.paddingBottom);
      const card = px(style.getPropertyValue('--card-w')) || 132;
      /* As large as the board's card, but never so large that two cannot share a row */
      const max = Math.min(card, (width - gap) / 2);
      const next = fitCardWidth({ count: row.children.length, width, height, max, gap, aspect });
      row.style.setProperty('--option-w', `${next}px`);
      setFitted(next);
    };

    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [rowRef, key, aspect]);

  return fitted;
}

/* Caps a card's text at 26px, or in proportion on a card wider than a desktop's 176px, as a phone's or tablet's can be */
export const cardTextMax = (cardWidth: number | null) => Math.max(26, Math.round(((cardWidth ?? 0) * 26) / 176));

/* Sizes the game cards so the whole deck fits the stage, or on a phone or tablet so fewer, larger cards fill each row */
export function useCardFit(
  pageRef: RefObject<HTMLElement | null>,
  stageRef: RefObject<HTMLElement | null>,
  count: number,
  { gap = 12, aspect = 176 / 132, boardPadding = 0, reserve = 0, maxBoardWidth = Infinity, clearance = 12 }: {
    gap?: number; aspect?: number; boardPadding?: number; reserve?: number; maxBoardWidth?: number; clearance?: number;
  } = {}
): number | null {
  const [fitted, setFitted] = useState<number | null>(null);

  useLayoutEffect(() => {
    const page = pageRef.current;
    const stage = stageRef.current;
    if (!page || !stage || count === 0) return;

    const measure = () => {
      if (!stage.clientHeight || !stage.clientWidth) return;

      /* Sets the fitted width aside to read the stylesheet's, which caps the card, as both live on the page element */
      page.style.removeProperty('--card-w');
      const declared = parseFloat(getComputedStyle(page).getPropertyValue('--card-w')) || 132;

      /* Box positions come back scaled by the page zoom, while client sizes do not */
      const zoom = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('zoom')) || 1;
      /* Keeps the board clear of the score line above it */
      const topline = page.querySelector<HTMLElement>('.game-topline');
      const stageTop = stage.getBoundingClientRect().top;
      const boardTop = topline ? Math.max(0, (topline.getBoundingClientRect().bottom - stageTop) / zoom) + clearance : 0;
      stage.style.setProperty('--board-top', `${Math.round(boardTop)}px`);

      const style = getComputedStyle(stage);
      const width = Math.min(stage.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight), maxBoardWidth) - boardPadding;
      /* Less the 20px that the stage's last grid track keeps under the board */
      const height = stage.clientHeight - boardTop - parseFloat(style.paddingBottom) - 20 - reserve - boardPadding;
      /* The gap between cards is the board's own where it has been laid out, as a phone's sheet narrows it */
      const grid = stage.querySelector<HTMLElement>('.flashcard-grid, .fm-col-cards');
      const gridGap = grid ? parseFloat(getComputedStyle(grid).rowGap) : NaN;
      const between = Number.isFinite(gridGap) ? gridGap : gap;
      /* Off a phone or tablet, a card is never so wide that three cannot share a row */
      const next = fewerLargerCards({ count, width, height, declared, gap: between, aspect })
        ?? fitCardWidth({ count, width, height, max: Math.min(declared, (width - 2 * between) / 3), gap: between, aspect });
      page.style.setProperty('--card-w', `${next}px`);
      setFitted(next);
    };

    measure();

    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    observer?.observe(stage);
    const topline = page.querySelector<HTMLElement>('.game-topline');
    if (topline) observer?.observe(topline);
    window.addEventListener('resize', measure);

    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [pageRef, stageRef, count, gap, aspect, boardPadding, reserve, maxBoardWidth, clearance]);

  return fitted;
}

/* Finds fewer, larger cards to fill the same table, the count within the limits that keeps them nearest their shape */
export function growCards({ width, height, cols, rows, aspect, gap, base, grow, growMax, give }: {
  width: number; height: number; cols: number; rows: number; aspect: number; gap: number; base: number;
  grow: number; growMax: number; give: number;
}): { cols: number; rows: number; height: number } | null {
  let best: { cols: number; rows: number; height: number; off: number } | null = null;
  for (let c = 1; c <= cols; c += 1) {
    const shaped = (width - (c - 1) * gap) / c / aspect;
    for (let r = 1; r <= rows; r += 1) {
      const filled = (height - (r - 1) * gap) / r;
      const growth = filled / base;
      /* How far the cards stray from their shape, on a log scale so taller and wider count alike */
      const off = Math.abs(Math.log(filled / shaped));
      if (growth < grow || growth > growMax || off > Math.log(give)) continue;
      if (!best || off < best.off) best = { cols: c, rows: r, height: filled, off };
    }
  }
  return best && { cols: best.cols, rows: best.rows, height: best.height };
}

/* Measures how much taller the page's content could grow before the page scrolls, negative where it already overflows */
export function spareHeight(page: HTMLElement, scroller: HTMLElement): number {
  /* Box positions come back scaled by the page zoom, while client sizes do not */
  const zoom = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('zoom')) || 1;
  const px = (value: string) => parseFloat(value) || 0;
  const pageStyle = getComputedStyle(page);
  const content = page.clientHeight - px(pageStyle.paddingTop) - px(pageStyle.paddingBottom);
  const flow = flowChildren(page);
  const first = flow[0]?.getBoundingClientRect();
  const last = flow[flow.length - 1]?.getBoundingClientRect();
  const stack = first && last ? (last.bottom - first.top) / zoom : 0;
  return content - stack - (scroller.scrollHeight - scroller.clientHeight);
}

/* The page's children that take part in its flow, which is everything but the heading and the back link */
const flowChildren = (page: HTMLElement): HTMLElement[] =>
  Array.from(page.children).filter((child): child is HTMLElement => !/absolute|fixed/.test(getComputedStyle(child).position));

/* Fits a panel of rows to the room its page has, writing --rows, --row-h, --cols, --fit-gap and --fit-pad on the panel */
export function useRowsThatFit(pageRef: RefObject<HTMLElement | null>, panelSelector: string, ready = true): void {
  useLayoutEffect(() => {
    /* A page that renders the panel only once its data arrives passes ready at that moment */
    if (!ready) return;
    const page = pageRef.current;
    const panel = page?.querySelector<HTMLElement>(panelSelector);
    const scroller = page?.closest<HTMLElement>('.app-scroll');
    if (!page || !panel || !scroller) return;

    const measure = () => {
      if (!panel.clientHeight || !page.clientHeight) return;
      const style = getComputedStyle(panel);
      const min = parseFloat(style.getPropertyValue('--row-h-min'));
      const max = parseFloat(style.getPropertyValue('--row-h-max'));
      const fewest = parseInt(style.getPropertyValue('--rows-min'), 10) || 2;
      const most = parseInt(style.getPropertyValue('--rows-max'), 10) || 4;
      /* The stylesheet's gap rather than the one in use, which may be a widened one from the last pass */
      const gap = parseFloat(style.getPropertyValue('--grid-gap')) || parseFloat(style.rowGap) || 0;
      if (!(min > 0) || !(max >= min)) return;

      /* Sizes stay fractional, as whole pixels would round differently each time the rows change and never settle */
      const px = (value: string) => parseFloat(value) || 0;
      const zoom = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('zoom')) || 1;
      /* The stylesheet's padding, like the gap, rather than one grown on the last pass */
      const pad = parseFloat(style.getPropertyValue('--grid-pad')) || px(style.paddingTop);
      const frame = 2 * pad + px(style.borderTopWidth) + px(style.borderBottomWidth);
      /* The panel's height plus the page's spare room stays the same as the panel grows, so the answer holds still */
      const room = panel.getBoundingClientRect().height / zoom + spareHeight(page, scroller) - frame;

      /* Full-height rows up to --rows-max, or where fewer than --rows-min fit, that many shorter rows down to --row-h-min */
      const fullRows = Math.floor((room + gap) / (max + gap));
      let rows = Math.min(most, fullRows);
      let rowHeight = max;
      if (fullRows < fewest) {
        rows = Math.max(1, Math.min(fewest, Math.floor((room + gap) / (min + gap))));
        rowHeight = Math.max(min, Math.min(max, (room + gap) / rows - gap));
      }

      /* Cards of a set shape (--card-aspect, width over height) take their height from the column count */
      const aspect = parseFloat(style.getPropertyValue('--card-aspect'));
      if (aspect > 0) {
        const width = panel.clientWidth - 2 * pad;
        /* The height of a card with this gap between the cards and this much added to the padding all round */
        const heightAt = (cols: number, between: number, extra = 0) => (width - 2 * extra - (cols - 1) * between) / cols / aspect;
        const span = (cols: number, count: number, between: number, extra = 0) =>
          count * heightAt(cols, between, extra) + (count - 1) * between + 2 * extra;
        /* The gap at which these rows just fit, widened by up to three quarters again, as a wider gap narrows every card */
        const widenedGap = (cols: number, count: number): number | null => {
          const shrink = (count * (cols - 1)) / (cols * aspect) - (count - 1);
          if (shrink <= 0) return null;
          const needed = ((count * width) / (cols * aspect) - room) / shrink;
          return needed <= gap * 1.75 ? Math.max(gap, needed) : null;
        };
        /* The amount the gap and padding grow together for the rows to fit, up to half the padding, where the gap alone cannot */
        const grownSpacing = (cols: number, count: number): number | null => {
          const shrink = (count * (cols + 1)) / (cols * aspect) - (count + 1);
          if (shrink <= 0) return null;
          const needed = (span(cols, count, gap) - room) / shrink;
          return needed <= pad / 2 ? Math.max(0, needed) : null;
        };

        /* Scores each column count, at the most rows it fits, on how far its table strays from the one the rows describe */
        const designed = rows * rowHeight + (rows - 1) * gap;
        const narrowest = parseFloat(style.getPropertyValue('--card-min-w')) || 0;
        type Fit = { cols: number; count: number; between: number; extra: number; score: number };
        let best: Fit | null = null;
        let tallest: Fit | null = null;
        for (let cols = 1; cols <= MAX_COLS; cols += 1) {
          for (let count = rows; count >= 1; count -= 1) {
            let between = span(cols, count, gap) <= room + 0.5 ? gap : widenedGap(cols, count);
            let extra = 0;
            if (between === null) {
              const grown = grownSpacing(cols, count);
              if (grown === null) continue;
              between = gap + grown;
              extra = grown;
            }
            const height = heightAt(cols, between, extra);
            if (height <= 0) break;
            const cramped = narrowest > 0 ? Math.max(0, narrowest - height * aspect) / narrowest : 0;
            /* Straying from the row height weighs a third as much, and falling short of --card-min-w double */
            const score = Math.abs(span(cols, count, between, extra) - designed) / designed
              + Math.abs(height - rowHeight) / rowHeight / 3 + 2 * cramped;
            const fit = { cols, count, between, extra, score };
            /* Cards over three quarters taller than the rows are kept only as a fallback, as the table would hold too few */
            if (height <= rowHeight * 1.75) { if (!best || score < best.score) best = fit; }
            else if (!tallest || score < tallest.score) tallest = fit;
            break;
          }
        }
        best = best ?? tallest;

        if (best) {
          rows = best.count;
          rowHeight = heightAt(best.cols, best.between, best.extra);
          /* Lets the cards stretch up to --card-stretch times taller into the room left, so a tall screen shows no empty space */
          const stretch = parseFloat(style.getPropertyValue('--card-stretch')) || 1;
          if (stretch > 1) {
            const filling = (room - (rows - 1) * best.between - 2 * best.extra) / rows;
            rowHeight = Math.max(rowHeight, Math.min(rowHeight * stretch, filling));
          }
          /* Where the stylesheet asks for larger cards, the same table is filled by fewer of them with its own gap and padding */
          const grow = parseFloat(style.getPropertyValue('--card-grow'));
          if (grow > 1) {
            const grown = growCards({
              width, height: rows * rowHeight + (rows - 1) * best.between + 2 * best.extra, cols: best.cols, rows,
              aspect, gap, base: rowHeight, grow,
              growMax: parseFloat(style.getPropertyValue('--card-grow-max')) || grow,
              give: parseFloat(style.getPropertyValue('--card-give')) || 1,
            });
            if (grown) {
              best = { ...best, cols: grown.cols, between: gap, extra: 0 };
              rows = grown.rows;
              rowHeight = grown.height;
            }
          }
          if (panel.style.getPropertyValue('--cols') !== String(best.cols)) panel.style.setProperty('--cols', String(best.cols));
          /* Like the rows, a widened gap or padding moves only for a change of more than a fraction of a pixel */
          const settle = (name: string, value: number, base: number) => {
            const written = parseFloat(panel.style.getPropertyValue(name));
            if (value === base) panel.style.removeProperty(name);
            else if (!(Math.abs(written - value) < 0.25)) panel.style.setProperty(name, `${Math.ceil(value * 100) / 100}px`);
          };
          settle('--fit-gap', best.between, gap);
          settle('--fit-pad', pad + best.extra, pad);
        }
      }

      /* A change of a fraction of a pixel is left alone, so that rounding in the layout cannot keep it moving */
      const current = parseFloat(panel.style.getPropertyValue('--row-h'));
      if (panel.style.getPropertyValue('--rows') !== String(rows)) panel.style.setProperty('--rows', String(rows));
      if (!(Math.abs(current - rowHeight) < 0.25)) panel.style.setProperty('--row-h', `${Math.floor(rowHeight * 100) / 100}px`);
    };

    measure();

    /* Watches everything beside the panel at each level up to the page, as text sizing or wrapping there changes the room */
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    observer?.observe(scroller);
    observer?.observe(page);
    for (let child: Element = panel; child !== page && child.parentElement; child = child.parentElement) {
      Array.from(child.parentElement.children).forEach((sibling) => { if (sibling !== child) observer?.observe(sibling); });
    }
    window.addEventListener('resize', measure);
    let stale = false;
    if (document.fonts && document.fonts.status !== 'loaded') {
      document.fonts.ready.then(() => { if (!stale) measure(); }).catch(() => {});
    }

    return () => {
      stale = true;
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [pageRef, panelSelector, ready]);
}

/* Fisher-Yates, since sorting on a random comparator is both biased and undefined */
export function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}