import { useRef } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { cardHeight, columnsScale, useColumnsScale } from './columnsScale';
import { blockExtent, drawnExtent } from '../Common/textInk';

/* jsdom draws no letters, so where text starts and ends is given by the test */
vi.mock('../Common/textInk', () => ({
  blockExtent: vi.fn(() => null),
  drawnExtent: vi.fn(() => null),
}));

describe('columnsScale', () => {
  it('grows a page that has room down as far as the width allows, short of a margin either side', () => {
    /* 1191.2 across in 1323.4, less eight either side, where down would allow 691.4 / 584.7 */
    expect(columnsScale(1191.2, 484.7, 1323.4, 691.4)).toBeCloseTo((1323.4 - 16) / 1191.2, 6);
  });

  it('grows a page that has room across only as far as the height allows, with room for a message', () => {
    /* 539.9 tall with fifty above and below in 640 */
    expect(columnsScale(1108.8, 539.9, 1232, 640)).toBeCloseTo(640 / 639.9, 6);
  });

  it('keeps a page that fits at its own size where only the room for a message is short', () => {
    /* 630.6 tall in 670 leaves less than fifty either side, but it is not drawn smaller for it */
    expect(columnsScale(882, 630.6, 1152, 670)).toBe(1);
  });

  it('draws a page too tall for the screen only as much smaller as fits it', () => {
    expect(columnsScale(1618, 448.5, 1798, 400)).toBeCloseTo(400 / 448.5, 6);
  });

  it('draws it no smaller than three quarters of its size, however short the screen', () => {
    expect(columnsScale(1618, 448.5, 1798, 300)).toBe(0.75);
  });

  it('draws it no larger than 1.95 times its size, however large the screen', () => {
    /* A page 1000 across in 3000 could be drawn nearly three times as large */
    expect(columnsScale(1000, 400, 3000, 1500)).toBe(1.95);
  });
});

describe('cardHeight', () => {
  it('stands the card a set share taller beside the other columns than it does alone', () => {
    expect(cardHeight(356)).toBeCloseTo(356 * 1.1175, 6);
  });
});

describe('useColumnsScale', () => {
  /* The signed-out page's three columns, the middle one's text inside a game's entry, and the card with a form */
  const Page = ({ recovery = false }: { recovery?: boolean }) => {
    const ref = useRef<HTMLDivElement>(null);
    useColumnsScale(ref);
    return (
      <div data-testid="area" style={{ overflowY: 'scroll' }}>
        <div data-testid="holder" style={{ padding: '0 20px' }}>
          <div data-testid="page" ref={ref}>
            <div data-testid="first">
              <h2>Your Journey Begins</h2>
              <p data-testid="welcome-text">Every great adventure</p>
              <p>Create your own decks</p>
              <p data-testid="welcome-end">Sign in to pick up where you left off</p>
            </div>
            <div data-testid="middle">
              <h2>Three Ways to Study</h2>
              <div className="auth-game-entry">
                <h3 data-testid="games-text">FlashFlip</h3>
                <p data-testid="games-end">Browse your deck one card at a time</p>
              </div>
            </div>
            <div data-testid="last">
              <h2>Welcome to Puck</h2>
              <div className="auth-form-container" data-testid="card">
                {recovery ? (
                  <div className="recover-root">
                    <h3 className="recover-title">Password Recovery</h3>
                    <div className="recover-desc" data-testid="desc">Forgot your password?</div>
                    <form className="auth-form">
                      <label className="auth-label">Email:</label>
                      <input className="auth-input" data-testid="input" />
                      <button className="auth-recovery-btn" type="submit">Get Code</button>
                    </form>
                  </div>
                ) : (
                  <>
                    <div className="auth-tabs" data-testid="tabs" />
                    <form className="auth-form">
                      <label className="auth-label" data-testid="label">Email:</label>
                      <input className="auth-input" data-testid="input" />
                      <label className="auth-label">Password:</label>
                      <input className="auth-input" data-testid="last-input" />
                      <button className="auth-button" type="submit" data-testid="button">Login</button>
                    </form>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const measures = ['offsetWidth', 'offsetHeight', 'clientWidth', 'clientHeight'] as const;
  const originals = measures.map(key => [key, Object.getOwnPropertyDescriptor(HTMLElement.prototype, key)] as const);

  /* Gives each box, by its test id, the sizes the test lays it out at */
  const layOut = (sizes: Record<string, Partial<Record<(typeof measures)[number], number>>>) => {
    measures.forEach(key => {
      Object.defineProperty(HTMLElement.prototype, key, {
        configurable: true,
        get(this: HTMLElement) {
          return sizes[this.dataset.testid ?? '']?.[key] ?? 0;
        },
      });
    });
  };

  afterEach(() => {
    originals.forEach(([key, descriptor]) => {
      if (descriptor) Object.defineProperty(HTMLElement.prototype, key, descriptor);
    });
  });

  type Edges = { left?: number; top?: number; width?: number; bottom?: number };

  /* Draws each box where the test gives it while the page renders, 100 down the screen and as tall as it is laid out */
  const withBoxes = (boxes: Record<string, Edges>, run: () => void) => {
    const original = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
      const { left = 0, top = 100, width = 0, bottom = top + this.offsetHeight } = boxes[this.dataset.testid ?? ''] ?? {};
      return new DOMRect(left, top, width, bottom - top);
    };
    try {
      run();
    } finally {
      HTMLElement.prototype.getBoundingClientRect = original;
    }
  };

  /* The size and line spacing set on an element's column, which scale the test's letters */
  const columnOf = (el: HTMLElement) =>
    (el.closest('[data-testid="first"], [data-testid="middle"]') as HTMLElement | null)?.style;
  const sizeOf = (el: HTMLElement) => parseFloat(columnOf(el)?.getPropertyValue('--auth-text-size') ?? '') || 1;
  const stretchOf = (el: HTMLElement) => parseFloat(columnOf(el)?.getPropertyValue('--auth-stretch') ?? '') || 1;

  /* Renders with the columns' letters 83 and 90 down, as tall as given at their size and spacing, and the card 40 down */
  const renderWithLetters = (welcome: number, games: number, recovery = false, further: (el: HTMLElement) => number = () => 0) => {
    vi.mocked(blockExtent).mockImplementation(el => {
      const id = el.dataset.testid;
      if (id === 'welcome-text') return { top: 183, bottom: 183 };
      if (id === 'welcome-end') return { top: 183, bottom: 183 + welcome * sizeOf(el) * stretchOf(el) + further(el) };
      if (id === 'games-text') return { top: 190, bottom: 190 };
      if (id === 'games-end') return { top: 190, bottom: 190 + games * sizeOf(el) * stretchOf(el) };
      return null;
    });
    try {
      withBoxes({ card: { top: 140 } }, () => render(<Page recovery={recovery} />));
    } finally {
      vi.mocked(blockExtent).mockImplementation(() => null);
    }
  };

  /* Columns 400 by 485 in a page 1200 wide, a holder 1340 wide inside its padding and an area 700 tall, with a card 356 tall */
  const columns = {
    first: { offsetWidth: 400, offsetHeight: 485 },
    middle: { offsetHeight: 485 },
    last: { offsetWidth: 400, offsetHeight: 485 },
    page: { offsetWidth: 1200, offsetHeight: 485 },
    holder: { clientWidth: 1380 },
    area: { clientHeight: 700 },
    card: { offsetHeight: 356 },
  };
  const tall = 356 * 1.1175;
  const size = (column: string) => parseFloat(screen.getByTestId(column).style.getPropertyValue('--auth-text-size'));
  const stretch = (column: string) => parseFloat(screen.getByTestId(column).style.getPropertyValue('--auth-stretch'));

  it('draws the page at the scale the room allows', () => {
    layOut(columns);

    render(<Page />);

    expect(screen.getByTestId('page').style.getPropertyValue('--auth-scale')).toBe(((1340 - 16) / 1200).toFixed(4));
  });

  it('leaves a page with nothing laid out at its own size', () => {
    layOut({});

    render(<Page />);

    expect(screen.getByTestId('page').style.getPropertyValue('--auth-scale')).toBe('');
  });

  it('draws a column\'s text as large as stands no taller than the card with its lines as close as they may be', () => {
    layOut(columns);

    renderWithLetters(400, 300);

    /* Letters 400 tall with lines at 0.95 spacing may be drawn at 397.83 / (400 * 0.95), to within ten halvings */
    const most = (tall + 0.25) / (400 * 0.95);
    expect(size('first')).toBeLessThanOrEqual(most);
    expect(size('first')).toBeGreaterThan(most - 0.5 / 1024);
    expect(stretch('first')).toBeCloseTo(0.95, 3);
    expect(screen.getByTestId('first').style.getPropertyValue('--auth-text-gap')).toBe('');
  });

  it('draws it no smaller than three quarters, where even that stands taller than the card', () => {
    layOut(columns);

    renderWithLetters(500, 600);

    /* Letters 600 tall stand 427.5 even at three quarters with their lines closest, and are left so */
    expect(size('middle')).toBe(0.75);
    expect(stretch('middle')).toBe(0.95);
    /* The first column's letters, which could stand a little larger, are held to a twentieth more than that */
    expect(size('first')).toBeCloseTo(0.75 * 1.05, 6);
  });

  it('holds one column\'s letters to a twentieth larger than the other\'s, and spaces its lines out instead', () => {
    layOut(columns);

    renderWithLetters(400, 250);

    /* The games' letters, 250 tall, are held to a twentieth over the first column's, and fall short even spaced out fully */
    const first = (tall + 0.25) / (400 * 0.95);
    expect(size('middle')).toBeLessThanOrEqual(first * 1.05);
    expect(size('middle')).toBeGreaterThan((first - 0.5 / 1024) * 1.05);
    expect(stretch('middle')).toBe(1.2);
    expect(screen.getByTestId('middle').style.getPropertyValue('--auth-text-gap')).toBe('');
  });

  it('draws it no more than a quarter larger, then spaces its lines out as far as brings it to the card\'s height', () => {
    layOut(columns);

    renderWithLetters(280, 300);

    /* Letters 280 tall stand 350 a quarter larger, so their lines are spaced out to 397.83 / 350, to within ten halvings */
    expect(size('first')).toBe(1.25);
    const most = (tall + 0.25) / 350;
    expect(stretch('first')).toBeLessThanOrEqual(most);
    expect(stretch('first')).toBeGreaterThan(most - 0.25 / 1024);
    expect(screen.getByTestId('first').style.getPropertyValue('--auth-text-gap')).toBe('');
  });

  it('sets its parts further apart by what is left where even its lines spaced out furthest fall short', () => {
    layOut(columns);

    renderWithLetters(250, 300);

    /* Letters 250 tall stand 375 at a quarter larger and a fifth wider spacing, so the two gaps share the 22.83 left */
    expect(size('first')).toBe(1.25);
    expect(stretch('first')).toBe(1.2);
    expect(screen.getByTestId('first').style.getPropertyValue('--auth-text-gap')).toBe(`${((tall - 375) / 2).toFixed(2)}px`);
    /* The games' text, in one part, has no gaps to set further apart */
    expect(screen.getByTestId('middle').style.getPropertyValue('--auth-text-gap')).toBe('');
  });

  it('sets each column\'s text down to start level with the other\'s, and the card level with them', () => {
    layOut(columns);

    renderWithLetters(400, 300);

    /* The welcome text starts 83 down and the games' 90, so the welcome text drops 7 and the card, 40 down, another 50 */
    expect(screen.getByTestId('first').style.getPropertyValue('--auth-text-drop')).toBe('7.00px');
    expect(screen.getByTestId('middle').style.getPropertyValue('--auth-text-drop')).toBe('');
    expect(screen.getByTestId('card').style.getPropertyValue('--auth-card-drop')).toBe('50.00px');
  });

  it('stands the card taller by its share, its boxes taking their shares of what it gains', () => {
    layOut(columns);

    renderWithLetters(400, 300);

    /* Of the 41.83 the card gains, 0.14 goes to the buttons, and 0.268 and 0.068 of the rest to each field and label */
    const card = screen.getByTestId('card').style;
    const gain = tall - 356;
    const rest = gain - gain * 0.14;
    expect(card.getPropertyValue('--auth-card-grow')).toBe(`${gain.toFixed(2)}px`);
    expect(card.getPropertyValue('--auth-button-grow')).toBe(`${(gain * 0.14).toFixed(3)}px`);
    expect(card.getPropertyValue('--auth-input-grow')).toBe(`${((rest * 0.268) / 2).toFixed(3)}px`);
    expect(card.getPropertyValue('--auth-label-grow')).toBe(`${(rest * 0.068).toFixed(3)}px`);
    expect(card.getPropertyValue('--auth-tab-grow')).toBe(`${((rest - 2 * rest * 0.268 - 2 * rest * 0.068) / 2).toFixed(3)}px`);
    expect(card.getPropertyValue('--auth-desc-grow')).toBe('');
  });

  it('grows the fields and labels of the recovery form as those of the forms with two, its description by the rest', () => {
    layOut(columns);

    renderWithLetters(400, 300, true);

    const card = screen.getByTestId('card').style;
    const gain = tall - 356;
    const rest = gain - gain * 0.14;
    expect(card.getPropertyValue('--auth-input-grow')).toBe(`${((rest * 0.268) / 2).toFixed(3)}px`);
    expect(card.getPropertyValue('--auth-label-grow')).toBe(`${(rest * 0.068).toFixed(3)}px`);
    expect(card.getPropertyValue('--auth-desc-grow')).toBe(`${(rest - rest * 0.268 - rest * 0.068).toFixed(3)}px`);
    expect(card.getPropertyValue('--auth-tab-grow')).toBe('');
  });

  it('grows the boxes of the form the card switches to', async () => {
    layOut(columns);
    const { rerender } = render(<Page />);

    rerender(<Page recovery />);

    const card = screen.getByTestId('card').style;
    const gain = tall - 356;
    const rest = gain - gain * 0.14;
    await waitFor(() => expect(card.getPropertyValue('--auth-desc-grow')).toBe(`${(rest - rest * 0.268 - rest * 0.068).toFixed(3)}px`));
    expect(card.getPropertyValue('--auth-tab-grow')).toBe('');
  });

  it('grows the card by its share, but leaves it in place, where the text beside it cannot be measured', () => {
    layOut(columns);

    render(<Page />);

    const card = screen.getByTestId('card').style;
    expect(card.getPropertyValue('--auth-card-grow')).toBe(`${(tall - 356).toFixed(2)}px`);
    expect(card.getPropertyValue('--auth-card-drop')).toBe('');
    expect(screen.getByTestId('first').style.getPropertyValue('--auth-text-drop')).toBe('');
  });

  /* Renders the card drawn at a scale, the pill ending 150 down, the last field 300 down and the button 20 below it unscaled */
  const renderFields = (letters: number, drawnAt = 1) => {
    vi.mocked(drawnExtent).mockImplementation(el =>
      el.dataset.testid === 'label' ? { top: letters, bottom: letters + 12 } : null);
    const boxes = { tabs: { bottom: 150 }, 'last-input': { bottom: 300 }, button: { top: 300 + 20 * drawnAt }, card: { width: 300 * drawnAt } };
    try {
      withBoxes(boxes, () => render(<Page />));
    } finally {
      vi.mocked(drawnExtent).mockImplementation(() => null);
    }
  };

  it('lets the pill of tabs reach further down by as much as the fields stand further below it than above the button', () => {
    layOut({ ...columns, card: { offsetHeight: 356, offsetWidth: 300 } });

    renderFields(200, 1.25);

    /* Drawn at 1.25, the label's letters start 50 below the pill and the last field ends 25 above the button, 20 more unscaled */
    expect(screen.getByTestId('card').style.getPropertyValue('--auth-pill-reach')).toBe('20.00px');
  });

  it('leaves the pill as it is where the fields stand no further below it than above the button', () => {
    layOut({ ...columns, card: { offsetHeight: 356, offsetWidth: 300 } });

    renderFields(168);

    expect(screen.getByTestId('card').style.getPropertyValue('--auth-pill-reach')).toBe('');
  });

  it('levels the fields in the one column too, where the page is not drawn at a scale', () => {
    layOut({ card: { offsetHeight: 356, offsetWidth: 300 }, page: { offsetWidth: 400, offsetHeight: 485 } });

    renderFields(190);

    expect(screen.getByTestId('card').style.getPropertyValue('--auth-pill-reach')).toBe('20.00px');
    expect(screen.getByTestId('page').style.getPropertyValue('--auth-scale')).toBe('');
  });

  /* Lays letters out 10 wide in lines of 20, as jsdom's ranges give no boxes */
  const withLines = (run: () => void) => {
    Range.prototype.getClientRects = function (this: Range) {
      const at = this.startOffset;
      return [new DOMRect((at % 20) * 10, Math.floor(at / 20) * 20, 10, 20)] as unknown as DOMRectList;
    };
    try {
      run();
    } finally {
      delete (Range.prototype as Partial<Range>).getClientRects;
    }
  };

  it('evens out the lines of a paragraph whose last line runs much shorter than its longest', () => {
    layOut(columns);

    withLines(() => renderWithLetters(400, 300));

    /* With letters 10 wide in lines of 20, the first two paragraphs end on one letter and the last on seventeen */
    const paragraphs = Array.from(screen.getByTestId('first').querySelectorAll('p'));
    expect(paragraphs.map(paragraph => paragraph.style.getPropertyValue('text-wrap'))).toEqual(['balance', 'balance', '']);
  });

  it('spaces a column out again where evening its lines out ends them on letters that reach further down', () => {
    layOut(columns);
    const evened = () => screen.getByTestId('welcome-text').style.getPropertyValue('text-wrap') === 'balance' ? 10 : 0;

    withLines(() => renderWithLetters(280, 300, false, evened));

    /* Balancing the first paragraph takes the column's last letters 10 further down, so its lines space out to 10 less */
    expect(size('first')).toBe(1.25);
    const most = (tall + 0.25 - 10) / 350;
    expect(stretch('first')).toBeLessThanOrEqual(most);
    expect(stretch('first')).toBeGreaterThan(most - 0.25 / 1024);
  });

  /* Columns 400 wide in a page 1400 wide, drawn at 1.25 and 64 apart from 100 across an area as wide as given */
  const apart = { ...columns, page: { offsetWidth: 1328, offsetHeight: 485, clientWidth: 1400 } };
  const drawnIn = (wide: number) => ({
    first: { left: 100, width: 500 },
    middle: { left: 680, width: 500 },
    last: { left: 1260, width: 500 },
    area: { width: wide },
  });
  const renderDrawn = (drawn: Record<string, Edges>) => withBoxes(drawn, () => render(<Page />));
  const gap = () => screen.getByTestId('page').style.getPropertyValue('--auth-gap');

  it('sets the columns as far apart as they then stand from the sides of the area they are shown in', () => {
    layOut(apart);

    renderDrawn(drawnIn(1900));

    /* 64 apart and 96 from the sides on average, so 16 further apart brings each side 16 in, meeting at 80 */
    expect(gap()).toBe('80.00px');
  });

  it('keeps the columns no further apart than a quarter of a column\'s width', () => {
    layOut({ ...apart, page: { ...apart.page, clientWidth: 1600 } });

    renderDrawn(drawnIn(2400));

    /* 296 from the sides would set them 180 apart, which a page 1600 wide has room for, but a quarter of a column is 100 */
    expect(gap()).toBe('100.00px');
  });

  it('keeps the columns no further apart than leaves them inside the page', () => {
    layOut({ ...apart, page: { ...apart.page, clientWidth: 1350 } });

    renderDrawn(drawnIn(2400));

    /* A page 1350 wide leaves 150 between three columns 400 wide */
    expect(gap()).toBe('75.00px');
  });

  it('keeps the columns a little apart, however little room the sides have', () => {
    layOut(apart);

    renderDrawn(drawnIn(1600));

    /* The last column runs 160 past the area's right side, which would set them 20 apart */
    expect(gap()).toBe('24.00px');
  });

  it('lets go of the gap it set between the columns once the page shows one column', () => {
    layOut(apart);
    renderDrawn(drawnIn(1900));
    expect(gap()).toBe('80.00px');

    screen.getByTestId('first').style.display = 'none';
    window.dispatchEvent(new Event('resize'));

    expect(gap()).toBe('');
  });

  it('leaves the columns as far apart as they stand where that is already as far as the sides', () => {
    layOut(apart);

    renderDrawn({ ...drawnIn(1900), middle: { left: 700, width: 500 }, last: { left: 1300, width: 500 } });

    /* 80 from either side and 80 apart, in the page's own pixels */
    expect(gap()).toBe('');
  });
});