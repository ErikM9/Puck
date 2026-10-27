import { RefObject, useLayoutEffect } from 'react';
import { spareHeight } from './rowLayout';

/* A line count to aim for and the sizes the text may take to reach it */
export interface FillTier {
  lines: number;
  min: number;
  max: number;
}

/* Counts the line boxes the text takes up, by the distinct rows its fragments sit on, and none under jsdom */
const countLines = (el: HTMLElement): number => {
  const range = document.createRange();
  range.selectNodeContents(el);
  const rects = typeof range.getClientRects === 'function' ? Array.from(range.getClientRects()) : [];
  return new Set(rects.filter(rect => rect.width > 1).map(rect => Math.round(rect.top))).size;
};

/* Finds the largest size, to a quarter pixel, that keeps the text to its lines, and leaves the last size tried on it */
const largestFitting = (el: HTMLElement, lines: number, min: number, max: number): number | null => {
  const fits = (size: number) => {
    el.style.fontSize = `${size}px`;
    return countLines(el) <= lines;
  };
  if (max < min || !fits(min)) return null;
  let lo = min;
  let hi = max;
  for (let i = 0; i < 8; i += 1) {
    const mid = Math.round(((lo + hi) / 2) * 4) / 4;
    if (fits(mid)) lo = mid; else hi = mid;
  }
  return fits(hi) ? hi : lo;
};

/* Measures again a frame after the boxes, the window or the fonts change, so a burst of changes costs one pass */
const remeasureOnChange = (targets: Element[], measure: () => void): (() => void) => {
  let frame = 0;
  const remeasure = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(measure);
  };
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(remeasure) : null;
  targets.forEach((target) => observer?.observe(target));
  window.addEventListener('resize', remeasure);
  if (document.fonts && document.fonts.status !== 'loaded') {
    document.fonts.ready.then(remeasure).catch(() => {});
  }
  return () => {
    cancelAnimationFrame(frame);
    observer?.disconnect();
    window.removeEventListener('resize', remeasure);
  };
};

/* Sizes the text as large as keeps it to a tier's lines, so they are all but full once the stylesheet balances them */
export function useFillLines(ref: RefObject<HTMLElement | null>, content: string, tiers: FillTier[]) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const measure = () => {
      el.textContent = content;
      let chosen = tiers[tiers.length - 1].min;
      for (const tier of tiers) {
        const size = largestFitting(el, tier.lines, tier.min, tier.max);
        if (size !== null) {
          chosen = size;
          break;
        }
      }
      el.style.fontSize = `${chosen}px`;
    };

    measure();
    return remeasureOnChange(el.parentElement ? [el.parentElement] : [], measure);
  }, [ref, content, tiers]);
}

/* Sizes a list's descriptions alike to fill their lines, narrowing the list where the page is too short to hold it */
export function useFillList(listRef: RefObject<HTMLElement | null>, selector: string, lines: number, min: number, max: number) {
  useLayoutEffect(() => {
    const list = listRef.current;
    const page = list?.parentElement;
    const scroller = list?.closest<HTMLElement>('.app-scroll');
    const texts = list ? Array.from(list.querySelectorAll<HTMLElement>(selector)) : [];
    if (!list || !page || !scroller || texts.length === 0) return;

    /* Spaces out letters as far as keeps the text to its lines, up to 3% of its size, so justifying opens less between words */
    const track = (el: HTMLElement) => {
      let lo = 0;
      let hi = (parseFloat(el.style.fontSize) || 0) * 0.03;
      for (let i = 0; i < 6; i += 1) {
        const mid = (lo + hi) / 2;
        el.style.letterSpacing = `${mid}px`;
        if (countLines(el) <= lines) lo = mid; else hi = mid;
      }
      el.style.letterSpacing = lo > 0 ? `${Math.floor(lo * 100) / 100}px` : '';
    };

    const fitSize = () => {
      const fill = () => Math.min(...texts.map((el) => largestFitting(el, lines, min, max) ?? min));
      const apply = (size: number) => texts.forEach((el) => { el.style.fontSize = `${size}px`; });
      /* A little room is left over, so the list never runs right up to the heading and the foot of the screen */
      const fitsPage = () => spareHeight(page, scroller) >= 12;

      /* The stylesheet holds the list to --fill-w, so the full width is measured without it */
      list.style.removeProperty('--fill-w');
      const fullSize = fill();
      apply(fullSize);
      if (fitsPage()) return;

      /* Everything beside the text (padding, border, the Play control) keeps its width as the list narrows */
      const zoom = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('zoom')) || 1;
      const fullWidth = list.getBoundingClientRect().width / zoom;
      const fullText = texts[0].clientWidth;
      /* Shrinks the text in step with the list, as a line of text is as long as the text is large */
      const sizeAt = (width: number) => Math.max(min, (fullSize * (fullText - (fullWidth - width))) / fullText);
      const tryWidth = (width: number) => {
        list.style.setProperty('--fill-w', `${width}px`);
        apply(sizeAt(width));
        return fitsPage();
      };

      /* The widest list that fits, found by halving between the width at the smallest size and the full width */
      let lo = fullWidth - fullText * (1 - min / fullSize);
      let hi = fullWidth;
      if (tryWidth(lo)) {
        for (let i = 0; i < 10; i += 1) {
          const mid = (lo + hi) / 2;
          if (tryWidth(mid)) lo = mid; else hi = mid;
        }
      }
      list.style.setProperty('--fill-w', `${lo}px`);
      /* The exact fill at that width, unless it comes out a touch larger than the size found to fit */
      const exact = fill();
      apply(exact);
      if (!fitsPage()) apply(Math.min(exact, sizeAt(lo)));
    };

    const measure = () => {
      if (!list.clientWidth) return;
      /* Spacing from the last pass would hold every size tried a little smaller */
      texts.forEach((el) => { el.style.letterSpacing = ''; });
      fitSize();
      texts.forEach(track);
    };

    measure();
    return remeasureOnChange([scroller, page], measure);
  }, [listRef, selector, lines, min, max]);
}