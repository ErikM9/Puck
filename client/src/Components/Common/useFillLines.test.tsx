import { useRef } from 'react';
import { render, screen } from '@testing-library/react';
import { useFillList } from './useFillLines';

const TEXT = 'x'.repeat(118);
const FULL_WIDTH = 600;
const BESIDE = 100;

const ListProbe = ({ texts = [TEXT, TEXT] }: { texts?: string[] }) => {
  const ref = useRef<HTMLDivElement>(null);
  useFillList(ref, 'p', 3, 9, 30);
  return (
    <div className="app-scroll">
      <div data-testid="page">
        <div ref={ref} data-testid="list">
          {texts.map((text, i) => <p key={i}>{text}</p>)}
        </div>
      </div>
    </div>
  );
};

/* A model stands in for layout, as jsdom has none, its letters a share of their size wide in a page of a set height */
const model = { pageHeight: 0, letter: 0.5 };

const list = () => screen.getByTestId('list');
const descriptions = () => screen.getAllByText(/^x+$/);
const listWidth = () => parseFloat(list().style.getPropertyValue('--fill-w')) || FULL_WIDTH;
const sizeOf = (el: HTMLElement) => parseFloat(el.style.fontSize) || 16;
const spacingOf = (el: HTMLElement) => parseFloat(el.style.letterSpacing) || 0;
const linesOf = (el: HTMLElement) =>
  Math.ceil(((el.textContent ?? '').length * (sizeOf(el) * model.letter + spacingOf(el))) / (listWidth() - BESIDE));
const listHeight = () => descriptions().reduce((sum, p) => sum + linesOf(p) * sizeOf(p) * 1.25, 16);

const original = {
  clientWidth: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth'),
  rect: HTMLElement.prototype.getBoundingClientRect,
  rangeRects: Object.getOwnPropertyDescriptor(Range.prototype, 'getClientRects'),
};

/* Lays the page out to the model, each description wrapping across the list's width less what sits beside it */
const layOut = (pageHeight: number) => {
  model.pageHeight = pageHeight;
  model.letter = 0.5;
  const isList = (el: HTMLElement) => el.dataset.testid === 'list';
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get(this: HTMLElement) { return isList(this) ? listWidth() : this.tagName === 'P' ? listWidth() - BESIDE : 0; },
  });
  /* The page is as tall as the scroller that shows it */
  const isPage = (el: HTMLElement) => el.dataset.testid === 'page' || el.classList.contains('app-scroll');
  HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
    if (isList(this)) return new DOMRect(0, 0, listWidth(), listHeight());
    return isPage(this) ? new DOMRect(0, 0, 0, model.pageHeight) : new DOMRect();
  };
  /* One fragment per line, each on its own row */
  Range.prototype.getClientRects = function (this: Range) {
    const el = this.startContainer as HTMLElement;
    const rects = Array.from({ length: linesOf(el) }, (_, i) => new DOMRect(0, i * sizeOf(el), 10, sizeOf(el)));
    return Object.assign(rects, { item: (i: number) => rects[i] ?? null }) as unknown as DOMRectList;
  };
};

afterEach(() => {
  vi.useRealTimers();
  delete (document as { fonts?: unknown }).fonts;
  /* Deleting a stand-in restores jsdom, which keeps its sizes on Element and has no line boxes for a range */
  const restore = (target: object, name: string, descriptor?: PropertyDescriptor) => {
    if (descriptor) Object.defineProperty(target, name, descriptor);
    else delete (target as Record<string, unknown>)[name];
  };
  restore(HTMLElement.prototype, 'clientWidth', original.clientWidth);
  HTMLElement.prototype.getBoundingClientRect = original.rect;
  restore(Range.prototype, 'getClientRects', original.rangeRects);
});

describe('useFillList', () => {
  it('fills three lines in every description at the largest size the full width allows, where the page has room', () => {
    layOut(1000);

    render(<ListProbe />);

    /* At half their size wide, 118 letters keep to three lines across 500px up to 25.42px, or 25.25px to a quarter pixel */
    for (const p of descriptions()) {
      expect(p.style.fontSize).toBe('25.25px');
      expect(linesOf(p)).toBe(3);
    }
    expect(list().style.getPropertyValue('--fill-w')).toBe('');
  });

  it('narrows the list, and the text with it, where the page is too short for the full width', () => {
    layOut(200);

    render(<ListProbe />);

    const [first, second] = descriptions();
    const narrowed = parseFloat(list().style.getPropertyValue('--fill-w'));
    expect(narrowed).toBeLessThan(FULL_WIDTH);
    expect(narrowed).toBeGreaterThan(500);
    /* Both at one size, smaller than the full width gave, still three full lines */
    expect(first.style.fontSize).toBe(second.style.fontSize);
    expect(sizeOf(first)).toBeLessThan(25.25);
    expect(sizeOf(first)).toBeGreaterThan(20);
    expect(linesOf(first)).toBe(3);
    /* With the room the hook leaves above and below the list */
    expect(200 - listHeight()).toBeGreaterThanOrEqual(12);
  });

  it('spaces out the letters of a description that falls short of its lines, by as much as still keeps it to them', () => {
    layOut(1000);

    render(<ListProbe texts={[TEXT, 'x'.repeat(110)]} />);

    /* Both at the longer one's size, which it fills but for 0.08px a letter, while the shorter is held to 3% of its size */
    const [longer, shorter] = descriptions();
    expect(longer.style.fontSize).toBe(shorter.style.fontSize);
    expect(longer.style.letterSpacing).toBe('0.08px');
    expect(shorter.style.letterSpacing).toBe('0.74px');
    expect(linesOf(longer)).toBe(3);
    expect(linesOf(shorter)).toBe(3);
  });

  it('sets every description at the smallest size where one cannot keep to its lines at any size', () => {
    layOut(1000);

    render(<ListProbe texts={[TEXT, 'x'.repeat(400)]} />);

    /* Four hundred letters take four lines even at 9px, the smallest size allowed */
    expect(descriptions().map(p => p.style.fontSize)).toEqual(['9px', '9px']);
  });

  it('fits the descriptions again when the window is resized', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] });
    layOut(1000);
    render(<ListProbe />);
    model.pageHeight = 200;

    window.dispatchEvent(new Event('resize'));
    vi.advanceTimersToNextFrame();

    expect(listWidth()).toBeLessThan(FULL_WIDTH);
  });

  it('fits the descriptions again once the page\'s fonts have loaded', async () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] });
    let loaded = () => {};
    const ready = new Promise<void>(resolve => { loaded = resolve; });
    Object.defineProperty(document, 'fonts', { value: { status: 'loading', ready }, configurable: true });
    layOut(1000);
    render(<ListProbe />);

    /* The web font's letters run 0.55 of their size wide, which keeps 118 of them to three lines up to 23.11px */
    model.letter = 0.55;
    loaded();
    await ready;
    vi.advanceTimersToNextFrame();

    expect(descriptions().map(p => p.style.fontSize)).toEqual(['23px', '23px']);
  });

  it('leaves the text alone until the list has a width to fill', () => {
    render(<ListProbe />);

    for (const p of descriptions()) expect(p.style.fontSize).toBe('');
  });
});