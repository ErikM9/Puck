import { useRef } from 'react';
import { act, render, screen } from '@testing-library/react';
import {
  cardTextMax, fewerLargerCards, fillRows, fitCardWidth, growCards, shuffle,
  useCardFit, useOptionsFit, useRowCapacity, useRowsThatFit,
} from './rowLayout';

/* Reads the count out of a real render, since useRowCapacity measures a live element */
const Probe = ({ cardWidth = 132, gap = 12, padding = 0, cssCardWidth = '', cssGap = '' }) => {
  const ref = useRef<HTMLDivElement>(null);
  const capacity = useRowCapacity(ref, cardWidth, gap, padding);
  const style = { '--card-w': cssCardWidth || undefined, columnGap: cssGap || undefined } as React.CSSProperties;
  return <div ref={ref} style={style} data-testid="box">{capacity}</div>;
};

/* jsdom performs no layout, so clientWidth is stubbed onto the prototype for the render */
const withWidth = (width: number | (() => number), run: () => void) => {
  const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
  const get = typeof width === 'function' ? width : () => width;
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get });
  try {
    run();
  } finally {
    if (original) Object.defineProperty(HTMLElement.prototype, 'clientWidth', original);
  }
};

const resize = () => act(() => { window.dispatchEvent(new Event('resize')); });

describe('fillRows', () => {
  const sizes = (rows: unknown[][]) => rows.map(row => row.length);
  const items = (n: number) => Array.from({ length: n }, (_, i) => i);

  it('returns nothing for an empty list', () => {
    expect(fillRows([], 5)).toEqual([]);
  });

  it('keeps everything on one row while it fits', () => {
    expect(sizes(fillRows(items(4), 5))).toEqual([4]);
    expect(sizes(fillRows(items(5), 5))).toEqual([5]);
  });

  it('fills each row to capacity before starting the next', () => {
    expect(sizes(fillRows(items(12), 5))).toEqual([5, 5, 2]);
  });

  it('preserves every item and its order', () => {
    const source = items(17);

    expect(fillRows(source, 5).flat()).toEqual(source);
  });

  it('treats a zero or negative capacity as one per row', () => {
    expect(sizes(fillRows(items(3), 0))).toEqual([1, 1, 1]);
    expect(sizes(fillRows(items(3), -4))).toEqual([1, 1, 1]);
  });
});

describe('shuffle', () => {
  const items = (n: number) => Array.from({ length: n }, (_, i) => i);

  it('returns every item exactly once, in a new array', () => {
    const source = items(20);

    const result = shuffle(source);

    expect(result).not.toBe(source);
    expect([...result].sort((a, b) => a - b)).toEqual(source);
    expect(source).toEqual(items(20));
  });

  it('moves the items to the places the random numbers pick', () => {
    /* With Math.random pinned to zero, each place from the end swaps with the first */
    const random = vi.spyOn(Math, 'random').mockReturnValue(0);

    const result = shuffle(['a', 'b', 'c']);
    random.mockRestore();

    expect(result).toEqual(['b', 'c', 'a']);
  });

  it('can leave every item where it was, as a fair shuffle may', () => {
    /* With Math.random just under one, each place picks its own item */
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.99);

    const result = shuffle(['a', 'b', 'c']);
    random.mockRestore();

    expect(result).toEqual(['a', 'b', 'c']);
  });
});

describe('useRowCapacity', () => {
  it('counts how many cards fit, allowing for the gaps between them', () => {
    /* 708px holds five 132px cards plus four 12px gaps, and cannot hold a sixth */
    withWidth(708, () => {
      render(<Probe />);

      expect(screen.getByTestId('box')).toHaveTextContent('5');
    });
  });

  it('leaves the container padding out of the room', () => {
    /* 300 - 100 leaves room for one card, not two */
    withWidth(300, () => {
      render(<Probe padding={100} />);

      expect(screen.getByTestId('box')).toHaveTextContent('1');
    });
  });

  it('prefers a card width declared in CSS over the value passed in', () => {
    /* 420px holds three 132px cards, but six of the 60px the stylesheet asks for */
    withWidth(420, () => {
      render(<Probe cssCardWidth="60px" />);

      expect(screen.getByTestId('box')).toHaveTextContent('6');
    });
  });

  it('prefers the gap the stylesheet sets over the value passed in', () => {
    /* 408px holds three 132px cards with the stylesheet's 6px gaps, where 12px gaps leave room for two */
    withWidth(408, () => {
      render(<Probe cssGap="6px" />);

      expect(screen.getByTestId('box')).toHaveTextContent('3');
    });
  });

  it('holds a row to eight cards however many would fit across', () => {
    /* 708px would take ten 60px cards */
    withWidth(708, () => {
      render(<Probe cssCardWidth="60px" />);

      expect(screen.getByTestId('box')).toHaveTextContent('8');
    });
  });

  it('falls back to the passed width when the stylesheet\'s is unusable', () => {
    withWidth(708, () => {
      render(<Probe cssCardWidth="auto" />);

      expect(screen.getByTestId('box')).toHaveTextContent('5');
    });
  });

  it('never reports less than one card, however narrow the container', () => {
    withWidth(0, () => {
      render(<Probe />);

      expect(screen.getByTestId('box')).toHaveTextContent('1');
    });
  });

  it('re-measures when its own container resizes, with the window untouched', () => {
    let width = 300;
    const watched: Array<() => void> = [];
    /* Keeps the callback of each element observed, as a real observer fires it when one column hides */
    vi.stubGlobal('ResizeObserver', class {
      callback: () => void;
      constructor(callback: () => void) { this.callback = callback; }
      observe() { watched.push(this.callback); }
      unobserve() {}
      disconnect() {}
    });
    try {
      withWidth(() => width, () => {
        render(<Probe />);
        expect(screen.getByTestId('box')).toHaveTextContent('2');
        width = 1000;

        act(() => { watched.forEach(callback => callback()); });

        expect(screen.getByTestId('box')).toHaveTextContent('7');
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('re-measures when the window resizes', () => {
    let width = 300;
    withWidth(() => width, () => {
      render(<Probe />);
      expect(screen.getByTestId('box')).toHaveTextContent('2');
      width = 1000;

      resize();

      expect(screen.getByTestId('box')).toHaveTextContent('7');
    });
  });
});

describe('fitCardWidth', () => {
  it('picks the widest card at which the deck fits the board in rows', () => {
    /* Two rows of two cards 100 across fill a board 212 wide with a 12px gap, and its 280 down allows rows of 134 */
    expect(fitCardWidth({ count: 4, width: 212, height: 280, max: 132 })).toBe(100);
  });

  it('goes no wider than the stylesheet allows, however roomy the board', () => {
    expect(fitCardWidth({ count: 1, width: 2000, height: 2000, max: 132 })).toBe(132);
  });

  it('holds a row to eight cards, so a wide board wraps a large deck rather than stretching it out', () => {
    /* One row of sixteen would fit at the full 100, but two rows of eight in 220 down leave cards of 78 */
    expect(fitCardWidth({ count: 16, width: 2000, height: 220, max: 100 })).toBe(78);
  });

  it('gives a deck too large for the board the smallest card, and lets it overflow', () => {
    expect(fitCardWidth({ count: 40, width: 400, height: 300, max: 132 })).toBe(64);
  });
});

describe('fewerLargerCards', () => {
  it('fills a phone\'s row with two cards where three of the stylesheet\'s would fit', () => {
    /* A board 394 across fits three cards of 116 with gaps of 6, so it takes two of (394 - 6) / 2, half a pixel short */
    expect(fewerLargerCards({ count: 5, width: 394, height: 2000, declared: 116, gap: 6 })).toBe(193);
  });

  it('keeps two cards to a row on a phone with room for only two of the stylesheet\'s', () => {
    /* A board 300 across fits only two cards of 116 with gaps of 6, and still takes two, of (300 - 6) / 2, half a pixel short */
    expect(fewerLargerCards({ count: 5, width: 300, height: 2000, declared: 116, gap: 6 })).toBe(146);
  });

  it('fills a tablet\'s row with three cards where four of the stylesheet\'s would fit', () => {
    expect(fewerLargerCards({ count: 5, width: 574, height: 2000, declared: 122, gap: 12 })).toBe(182);
  });

  it('leaves a screen with room for five or more of the stylesheet\'s cards to the usual fit', () => {
    /* A board 1000 across fits five cards of 176 with gaps of 12 */
    expect(fewerLargerCards({ count: 5, width: 1000, height: 2000, declared: 176, gap: 12 })).toBeNull();
  });

  it('brings the cards down a little where that fits the whole deck on the board', () => {
    /* Three rows of cards 174 across, 232 tall, with two gaps of 6, just fill a board 708 tall */
    expect(fewerLargerCards({ count: 5, width: 394, height: 708, declared: 116, gap: 6 })).toBe(174);
  });

  it('keeps them filling the row and lets the board scroll where fitting the deck would take more than that', () => {
    /* Cards of 160 would fit the deck on a board 652 tall, but that is more than a seventh smaller than 193.5 */
    expect(fewerLargerCards({ count: 5, width: 394, height: 652, declared: 116, gap: 6 })).toBe(193);
  });
});

describe('cardTextMax', () => {
  it('holds a card\'s text to 26px on a card no larger than a desktop\'s', () => {
    expect(cardTextMax(null)).toBe(26);
    expect(cardTextMax(132)).toBe(26);
    expect(cardTextMax(176)).toBe(26);
  });

  it('grows the text in step with a card wider than a desktop\'s', () => {
    expect(cardTextMax(264)).toBe(39);
  });
});

describe('useCardFit', () => {
  /* A game page whose stylesheet sets a 176px card and pads the stage 40px either side */
  const sheet = '.game-page { --card-w: 176px } .game-stage { padding: 0 40px }';

  const Game = ({ scoreLine = false, boardGap = '' }) => {
    const pageRef = useRef<HTMLDivElement>(null);
    const stageRef = useRef<HTMLDivElement>(null);
    const width = useCardFit(pageRef, stageRef, 24);
    return (
      <div ref={pageRef} className="game-page" data-testid="page">
        <style>{sheet}</style>
        {scoreLine && <div className="game-topline" data-testid="score">Correct: 0 / 24</div>}
        <div ref={stageRef} className="game-stage" data-testid="stage">
          <div className="flashcard-grid" style={{ rowGap: boardGap || undefined }} />
        </div>
        <output>{width}</output>
      </div>
    );
  };

  /* Lays the stage out 100 down the screen at a size, with the score line, if any, ending a distance down it */
  const layOut = (width: number, height: number, lineEnds = 0) => {
    const stage = screen.getByTestId('stage');
    Object.defineProperty(stage, 'clientWidth', { configurable: true, get: () => width });
    Object.defineProperty(stage, 'clientHeight', { configurable: true, get: () => height });
    stage.getBoundingClientRect = () => new DOMRect(0, 100, width, height);
    const score = screen.queryByTestId('score');
    if (score) score.getBoundingClientRect = () => new DOMRect(0, 100, width, lineEnds);
  };

  const cardWidth = () => screen.getByTestId('page').style.getPropertyValue('--card-w');

  it('brings a large deck down until it fits the stage', () => {
    render(<Game />);
    layOut(1400, 600);

    resize();

    /* Three rows of eight in 580 down leave cards of (580 - 2 x 12) / 3 / (176 / 132) = 139, short of the sheet's 176 */
    expect(cardWidth()).toBe('139px');
    expect(screen.getByRole('status')).toHaveTextContent('139');
  });

  it('keeps the board below the score line, in the room left under it', () => {
    render(<Game scoreLine />);
    layOut(1400, 600, 150);

    resize();

    /* The score line ends 150 down the stage, so the board starts 162 down and three rows of 98 fill the 418 under it */
    expect(screen.getByTestId('stage').style.getPropertyValue('--board-top')).toBe('162px');
    expect(cardWidth()).toBe('98px');
  });

  it('lets the cards grow again once the stage grows', () => {
    render(<Game />);
    layOut(1400, 400);
    resize();
    expect(cardWidth()).toBe('89px');
    layOut(1400, 900);

    resize();

    expect(cardWidth()).toBe('158px');
  });

  it('gives a narrow board one fewer, larger card a row, spaced by the board\'s own gap', () => {
    render(<Game boardGap="6px" />);
    layOut(700, 600);

    resize();

    /* The sheet's 176 fits three across 620, so rows of two take (620 - 6) / 2 with the board's 6px gap, half a pixel short */
    expect(cardWidth()).toBe('306px');
  });
});

describe('useOptionsFit', () => {
  /* An overlay of three rows, a question over its answers and a note under them */
  const Overlay = () => {
    const ref = useRef<HTMLDivElement>(null);
    const width = useOptionsFit(ref, 'q1');
    return (
      <>
        <div data-testid="overlay" style={{ rowGap: '16px' }}>
          <h3 data-testid="question">Capital of France?</h3>
          <div ref={ref} data-testid="answers" style={{ columnGap: '12px' }}>
            <button>Paris</button>
            <button>Lyon</button>
            <button>Nice</button>
          </div>
          <p data-testid="note">Pick one</p>
        </div>
        <output>{width}</output>
      </>
    );
  };

  /* Lays the overlay out at a height and the answers' row at a width, under a question 120 tall and over a note 40 tall */
  const layOut = (height: number, width: number) => {
    const size = (id: string, key: string, value: number) =>
      Object.defineProperty(screen.getByTestId(id), key, { configurable: true, get: () => value });
    size('overlay', 'clientHeight', height);
    size('question', 'offsetHeight', 120);
    size('note', 'offsetHeight', 40);
    size('answers', 'clientWidth', width);
  };

  const optionWidth = () => screen.getByTestId('answers').style.getPropertyValue('--option-w');

  it('sizes the answer cards to the room the overlay\'s other rows leave', () => {
    render(<Overlay />);
    layOut(300, 600);

    resize();

    /* 300 down less the question's 120, the note's 40 and two 16px gaps leaves 108, room for one row of three 81 across */
    expect(optionWidth()).toBe('81px');
    expect(screen.getByRole('status')).toHaveTextContent('81');
  });

  it('keeps the answers at least two to a row', () => {
    render(<Overlay />);
    layOut(600, 200);

    resize();

    /* Two cards of 94 and a 12px gap fill a row 200 across, where cards one to a row could be 96 */
    expect(optionWidth()).toBe('94px');
  });
});

describe('useRowsThatFit', () => {
  const RowsProbe = ({ fewest = 2, shape = {} }: { fewest?: number; shape?: Record<string, string> }) => {
    const ref = useRef<HTMLDivElement>(null);
    useRowsThatFit(ref, '.deck-list');
    return (
      <div className="app-scroll" data-testid="scroller">
        <div data-testid="content">
          <div ref={ref} className="home-page" data-testid="page">
            <div className="deck-list" data-testid="panel" style={{ '--row-h-min': '100px', '--row-h-max': '150px', '--rows-min': String(fewest), '--rows-max': '4', padding: '16px', border: '1px solid transparent', rowGap: '20px', ...shape } as React.CSSProperties} />
          </div>
        </div>
      </div>
    );
  };

  /* Cards three wide to four tall, as the deck and card tables have them */
  const cards = (more: Record<string, string> = {}) => ({ '--card-aspect': '0.75', ...more });

  /* jsdom lays nothing out, so the page, panel and scroller sizes are stubbed onto the elements */
  const layOut = (pageHeight: number, scrollerOverflow = 0, panelWidth = 0) => {
    const page = screen.getByTestId('page');
    const panel = screen.getByTestId('panel');
    Object.defineProperty(page, 'clientHeight', { configurable: true, get: () => Math.round(pageHeight) });
    page.getBoundingClientRect = () => new DOMRect(0, 0, 0, pageHeight);
    /* A 134px panel holds 100px of rows inside 16px of padding and a 1px border all round */
    Object.defineProperty(panel, 'clientHeight', { configurable: true, get: () => 132 });
    Object.defineProperty(panel, 'clientWidth', { configurable: true, get: () => panelWidth });
    Object.defineProperty(panel, 'offsetHeight', { configurable: true, get: () => 134 });
    panel.getBoundingClientRect = () => new DOMRect(0, 0, panelWidth, 134);
    /* An 800px scroller under a 60px bar, whose content runs past its foot by the overflow given */
    screen.getByTestId('scroller').getBoundingClientRect = () => new DOMRect(0, 60, 0, 800);
    screen.getByTestId('content').getBoundingClientRect = () => new DOMRect(0, 60, 0, 800 + scrollerOverflow);
  };

  const prop = (name: string) => screen.getByTestId('panel').style.getPropertyValue(name);

  it('fills the page with as many full-height rows as fit', () => {
    render(<RowsProbe />);
    layOut(600);

    resize();

    /* 134px of panel and 466px spare, less 34px of padding and border, is room for three 150px rows, not four */
    expect(prop('--rows')).toBe('3');
    expect(prop('--row-h')).toBe('150px');
  });

  it('shortens the rows rather than drop below the fewest the stylesheet asks for', () => {
    render(<RowsProbe fewest={3} />);
    layOut(500);

    resize();

    /* 466px of room holds two full rows, so three rows of (466 + 20) / 3 - 20 = 142px fit instead */
    expect(prop('--rows')).toBe('3');
    expect(prop('--row-h')).toBe('142px');
  });

  it('counts what already runs past the bottom of the scroller as room it does not have', () => {
    render(<RowsProbe />);
    layOut(700, 500);

    resize();

    /* The same page with 500px past the bottom has room for only one row */
    expect(prop('--rows')).toBe('1');
  });

  it('gives the rows the room the page has to a fraction of a pixel, however the browser rounds its heights to whole ones', () => {
    render(<RowsProbe fewest={4} />);
    layOut(600.6, 0.4);
    /* Whole pixels rounded up, as a browser can give them, a pixel apart where the content runs only 0.4px past the foot */
    Object.defineProperty(screen.getByTestId('page'), 'clientHeight', { configurable: true, get: () => 601 });
    Object.defineProperty(screen.getByTestId('scroller'), 'clientHeight', { configurable: true, get: () => 800 });
    Object.defineProperty(screen.getByTestId('scroller'), 'scrollHeight', { configurable: true, get: () => 801 });

    resize();

    /* 600.6px less the 134px panel and the 0.4px past the foot leaves 466.2px, for four rows of 586.2 / 4 - 20 */
    expect(prop('--rows')).toBe('4');
    expect(prop('--row-h')).toBe('126.55px');
  });

  it('leaves the borders and padding of the page and the scroller out of the room they give', () => {
    render(<RowsProbe fewest={4} />);
    layOut(600, 1);
    const page = screen.getByTestId('page');
    const scroller = screen.getByTestId('scroller');
    Object.assign(page.style, { border: '1px solid transparent', padding: '10px 0' });
    Object.assign(scroller.style, { border: '1px solid transparent', padding: '4px 0' });
    /* The same 600px and 800px inside them, with the content still running 1px past the scroller's padding */
    page.getBoundingClientRect = () => new DOMRect(0, 0, 0, 622);
    scroller.getBoundingClientRect = () => new DOMRect(0, 60, 0, 810);

    resize();

    /* 600px less the panel and the 1px past the foot leaves 465px, for four rows of 585 / 4 - 20 */
    expect(prop('--row-h')).toBe('126.25px');
  });

  it('counts no room below content that stops short of the scroller\'s foot', () => {
    render(<RowsProbe />);
    layOut(600, -100);

    resize();

    /* As on a page that fills the scroller, three rows rather than the four the 100px under it would make room for */
    expect(prop('--rows')).toBe('3');
  });

  it('leaves the panel alone where the stylesheet gives it no row heights', () => {
    /* The stylesheet registers both with an initial value of 0px */
    render(<RowsProbe shape={{ '--row-h-min': '0px', '--row-h-max': '0px' }} />);
    layOut(600);

    resize();

    expect(prop('--rows')).toBe('');
    expect(prop('--row-h')).toBe('');
  });

  it('measures again once the web font has loaded', async () => {
    let loaded = () => {};
    const fonts = { status: 'loading', ready: new Promise(resolve => { loaded = () => resolve(fonts); }) };
    Object.defineProperty(document, 'fonts', { configurable: true, value: fonts });
    try {
      render(<RowsProbe />);
      layOut(600);

      fonts.status = 'loaded';
      loaded();
      await fonts.ready;

      expect(prop('--rows')).toBe('3');
    } finally {
      delete (document as { fonts?: unknown }).fonts;
    }
  });

  it('gives shaped cards the column count that keeps the table nearest the size its rows describe', () => {
    render(<RowsProbe shape={cards()} />);
    layOut(600, 0, 700);

    resize();

    /* Five cards of 117.6 by 156.8 across 668px make three rows of 510.4px, nearest the 490px of three 150px rows */
    expect(prop('--cols')).toBe('5');
    expect(prop('--rows')).toBe('3');
    expect(parseFloat(prop('--row-h'))).toBeCloseTo(156.8, 1);
    expect(prop('--fit-gap')).toBe('');
    expect(prop('--fit-pad')).toBe('');
  });

  it('lets shaped cards grow taller into the room left under their rows, where the stylesheet allows it', () => {
    render(<RowsProbe shape={cards({ '--card-stretch': '1.2' })} />);
    layOut(600, 0, 700);

    resize();

    /* Three rows of 156.8px grow to the (566 - 2 x 20) / 3 = 175.33px that fills the room, inside the fifth again allowed */
    expect(prop('--cols')).toBe('5');
    expect(prop('--rows')).toBe('3');
    expect(parseFloat(prop('--row-h'))).toBeCloseTo(175.33, 1);
  });

  it('grows the cards no taller than the stylesheet allows, however much room is left', () => {
    render(<RowsProbe shape={cards({ '--card-stretch': '1.05' })} />);
    layOut(600, 0, 700);

    resize();

    /* The same room would take 175.33px rows, but 156.8px cards may grow by only a twentieth, to 164.64px */
    expect(parseFloat(prop('--row-h'))).toBeCloseTo(164.64, 1);
  });

  it('widens the gap a little where that lets the rows fit, rather than drop a row', () => {
    render(<RowsProbe shape={cards()} />);
    layOut(534, 0, 700);

    resize();

    /* Five by three come to 510.4px with 20px gaps, and to the 500px of room with 28.67px gaps, which narrow every card */
    expect(prop('--cols')).toBe('5');
    expect(prop('--rows')).toBe('3');
    expect(prop('--fit-gap')).toBe('28.67px');
    expect(parseFloat(prop('--row-h'))).toBeCloseTo(147.55, 1);
    expect(prop('--fit-pad')).toBe('');
  });

  it('grows the padding along with the gap where two columns could not fit their rows by the gap alone', () => {
    render(<RowsProbe shape={cards({ '--card-min-w': '110px' })} />);
    layOut(384, 0, 305);

    resize();

    /* Two by two need 357.3px of the 350px, so 7.33px more padding and gap bring the cards to 115.5 by 154 */
    expect(prop('--cols')).toBe('2');
    expect(prop('--rows')).toBe('2');
    expect(parseFloat(prop('--fit-pad'))).toBeCloseTo(23.34, 1);
    expect(parseFloat(prop('--fit-gap'))).toBeCloseTo(27.34, 1);
    expect(parseFloat(prop('--row-h'))).toBeCloseTo(154, 1);
  });

  it('passes over cards far taller than the rows while a count with shorter ones fits', () => {
    render(<RowsProbe shape={cards({ '--card-min-w': '110px' })} />);
    layOut(464, 0, 232);

    resize();

    /* One column of 266.7px cards would score best, but they are over 1.75 times the 150px rows, so two columns win */
    expect(prop('--cols')).toBe('2');
  });

  it('passes over cards narrower than the stylesheet allows while wider ones fit nearly as well', () => {
    render(<RowsProbe shape={cards({ '--card-min-w': '110px' })} />);
    layOut(600, 0, 620);

    resize();

    /* Five columns would keep the table nearer its size, but their cards come to 101.6 across, short of the 110 asked for */
    expect(prop('--cols')).toBe('4');
  });

  it('settles for cards taller than the rows where no count gives shorter ones', () => {
    render(<RowsProbe shape={cards({ '--row-h-min': '80px', '--row-h-max': '100px' })} />);
    layOut(566, 0, 2032);

    resize();

    /* On a panel 2000px across, even eight cards to a row each stand over three times the 100px rows */
    expect(prop('--cols')).toBe('8');
    expect(prop('--rows')).toBe('1');
  });

  it('fills the same table with fewer, larger cards where the stylesheet asks for them', () => {
    render(<RowsProbe shape={cards({ '--card-grow': '1.45', '--card-grow-max': '2.3', '--card-give': '1.4' })} />);
    layOut(600, 0, 700);

    resize();

    /* Three columns in two rows of (510.4 - 20) / 2 = 245.2px fill the five-by-three table with cards half as large again */
    expect(prop('--cols')).toBe('3');
    expect(prop('--rows')).toBe('2');
    expect(parseFloat(prop('--row-h'))).toBeCloseTo(245.2, 1);
    expect(prop('--fit-gap')).toBe('');
    expect(prop('--fit-pad')).toBe('');
  });

  it('keeps the cards as they were where no larger ones fill the table close enough to their shape', () => {
    render(<RowsProbe shape={cards({ '--card-grow': '1.45', '--card-grow-max': '2.3', '--card-give': '1.05' })} />);
    layOut(600, 0, 700);

    resize();

    expect(prop('--cols')).toBe('5');
    expect(prop('--rows')).toBe('3');
    expect(parseFloat(prop('--row-h'))).toBeCloseTo(156.8, 1);
  });
});

describe('growCards', () => {
  /* The five-by-three table above, 668px across inside its padding with 510.4px of rows and 20px gaps */
  const table = { width: 668, height: 510.4, cols: 5, rows: 3, aspect: 0.75, gap: 20, base: 156.8 };

  it('picks the counts whose larger cards keep nearest their shape', () => {
    /* Two rows of three need cards 0.88 of their shaped height, two rows of four 1.21 times it */
    expect(growCards({ ...table, grow: 1.45, growMax: 2.3, give: 1.4 })).toEqual({ cols: 3, rows: 2, height: 245.2 });
  });

  it('leaves out counts whose cards would grow too little or too much', () => {
    /* Two rows grow the cards by only 1.56 times, and one row of two by 3.26 times, which only a higher growMax allows */
    expect(growCards({ ...table, grow: 1.6, growMax: 4, give: 1.4 })).toEqual({ cols: 2, rows: 1, height: 510.4 });
    expect(growCards({ ...table, grow: 1.6, growMax: 2.3, give: 1.4 })).toBeNull();
  });

  it('finds nothing where every count strays further from the shape than it may', () => {
    expect(growCards({ ...table, grow: 1.45, growMax: 2.3, give: 1.1 })).toBeNull();
  });
});