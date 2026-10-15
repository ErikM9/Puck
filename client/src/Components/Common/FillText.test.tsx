import { render, screen } from '@testing-library/react';
import FillText from './FillText';

const rangeRects = Object.getOwnPropertyDescriptor(Range.prototype, 'getClientRects');

/* Wraps text across a box of the given width, its letters half their size wide, as jsdom lays nothing out */
const layOut = (width: number) => {
  Range.prototype.getClientRects = function (this: Range) {
    const el = this.startContainer as HTMLElement;
    const size = parseFloat(el.style.fontSize);
    const lines = Math.ceil(((el.textContent ?? '').length * size * 0.5) / width);
    const rects = Array.from({ length: lines }, (_, i) => new DOMRect(0, i * size * 1.25, width, size * 1.25));
    return Object.assign(rects, { item: (i: number) => rects[i] ?? null }) as unknown as DOMRectList;
  };
};

afterEach(() => {
  if (rangeRects) Object.defineProperty(Range.prototype, 'getClientRects', rangeRects);
  else delete (Range.prototype as { getClientRects?: unknown }).getClientRects;
});

/* One line from 16px to 24px, or else two from 12px to 26px, as the home page sets its description */
const TIERS = [{ lines: 1, min: 16, max: 24 }, { lines: 2, min: 12, max: 26 }];

describe('FillText', () => {
  it('renders the text in the element it is asked for', () => {
    render(<FillText as="p" className="blurb" tiers={[{ lines: 3, min: 10, max: 30 }]}>A line of text</FillText>);

    const el = screen.getByText('A line of text');
    expect(el.tagName).toBe('P');
    expect(el).toHaveClass('blurb');
  });

  it('settles on the largest size of the first tier the text fits', () => {
    /* Thirteen letters half their size wide keep to one line 130 wide up to 20px */
    layOut(130);

    render(<FillText tiers={TIERS}>Select a deck</FillText>);

    expect(screen.getByText('Select a deck').style.fontSize).toBe('20px');
  });

  it('falls back to the next tier where the text cannot keep to the first one\'s lines even at its smallest size', () => {
    /* At 16px the thirteen letters take two lines 70 wide, which they keep to up to 21.5px */
    layOut(70);

    render(<FillText tiers={TIERS}>Select a deck</FillText>);

    expect(screen.getByText('Select a deck').style.fontSize).toBe('21.5px');
  });

  it('settles on the last tier\'s smallest size where the text keeps to no tier\'s lines', () => {
    layOut(30);

    render(<FillText tiers={TIERS}>Select a deck</FillText>);

    expect(screen.getByText('Select a deck').style.fontSize).toBe('12px');
  });
});