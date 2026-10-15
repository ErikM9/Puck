import { useRef } from 'react';
import { render, renderHook, screen } from '@testing-library/react';
import FitText from './FitText';
import { evenOutRun, spanText, useFitFont } from './useFitFont';
import { fontPlace } from './textInk';

/* jsdom has no fonts to measure, so a test that needs a font's metrics gives them */
vi.mock('./textInk', async importOriginal => ({
  ...(await importOriginal<typeof import('./textInk')>()),
  fontPlace: vi.fn(() => null),
}));

type Measure = 'scrollHeight' | 'clientHeight' | 'scrollWidth' | 'clientWidth';
type RangeBoxes = Pick<Range, 'getClientRects' | 'getBoundingClientRect'>;

const jsdomRange = Object.getOwnPropertyDescriptors(Range.prototype);

afterEach(() => {
  for (const name of ['getClientRects', 'getBoundingClientRect'] as const) {
    if (jsdomRange[name]) Object.defineProperty(Range.prototype, name, jsdomRange[name]);
    else Reflect.deleteProperty(Range.prototype, name);
  }
  Reflect.deleteProperty(document, 'fonts');
  document.body.replaceChildren();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/* jsdom lays nothing out, so each test gives the sizes the hook measures a box by */
const layOut = (sizes: Partial<Record<Measure, number | ((el: HTMLElement) => number)>>) => {
  for (const [measure, size] of Object.entries(sizes) as [Measure, number | ((el: HTMLElement) => number)][]) {
    vi.spyOn(HTMLElement.prototype, measure, 'get').mockImplementation(function (this: HTMLElement) {
      return typeof size === 'function' ? size(this) : size;
    });
  }
};

/* jsdom gives a range no boxes, so a test that reads lines gives them */
const stubRange = <K extends keyof RangeBoxes>(name: K, boxes: (this: Range) => ReturnType<RangeBoxes[K]>) => {
  Object.defineProperty(Range.prototype, name, { configurable: true, writable: true, value: boxes });
};

/* A browser's DOMRectList, which jsdom cannot make, as an array with its item() */
const rectList = (rects: DOMRect[]) =>
  Object.assign(rects, { item: (index: number) => rects[index] ?? null }) as unknown as DOMRectList;

const line = (row: number) => new DOMRect(0, row * 20, 5, 20);

const holderOf = (range: Range) =>
  (range.startContainer instanceof HTMLElement ? range.startContainer : range.startContainer.parentElement) as HTMLElement;

const sizeOf = (el: HTMLElement) => parseFloat(el.style.fontSize);

describe('FitText', () => {
  it('sets the text at max when it already fits there', () => {
    layOut({ scrollHeight: 40, clientHeight: 100 });

    render(<FitText max={15} min={8}>Roomy</FitText>);

    expect(sizeOf(screen.getByText('Roomy'))).toBe(15);
  });

  it('falls back to the floor when nothing fits', () => {
    layOut({ scrollHeight: 900, clientHeight: 10 });

    render(<FitText max={15} min={8}>Overflowing</FitText>);

    expect(sizeOf(screen.getByText('Overflowing'))).toBe(8);
  });

  it('settles on the largest half-pixel size that fits when only smaller sizes do', () => {
    /* The text stands nine times its size tall in a box 100 tall, so it fits up to about 11.2px */
    layOut({ clientHeight: 100, scrollHeight: el => 9 * sizeOf(el) });

    render(<FitText max={15} min={8}>Middling</FitText>);

    expect(sizeOf(screen.getByText('Middling'))).toBe(11);
  });

  it('hands over the element once its size is settled, for anything placed by it', () => {
    const handed: [HTMLElement, string][] = [];
    layOut({ scrollHeight: 40, clientHeight: 100 });

    render(<FitText max={15} min={8} onFit={el => handed.push([el, el.style.fontSize])}>Settled</FitText>);

    expect(handed).toEqual([[screen.getByText('Settled'), '15px']]);
  });

  it('forwards a title, so text the box has to shrink can still be read in full', () => {
    render(<FitText max={15} min={8} title="The whole question, untrimmed">Trimmed</FitText>);

    expect(screen.getByTitle('The whole question, untrimmed')).toHaveTextContent('Trimmed');
  });

  it('applies the class it is given, so CSS can still size the box', () => {
    render(<FitText className="card-text" max={15} min={8}>Classed</FitText>);

    expect(screen.getByText('Classed')).toHaveClass('card-text');
  });

  describe('across its width', () => {
    /* The text runs ten times its size wide and a pixel more, in a box 150 wide */
    const tenTimesWide = (el: HTMLElement) => 10 * sizeOf(el) + 1;

    it('measures width instead of height when asked to', () => {
      /* Only the width overflows, at every size */
      layOut({ scrollHeight: 10, clientHeight: 100, scrollWidth: 900, clientWidth: 10 });

      render(<FitText axis="width" max={15} min={8}>Wide label</FitText>);

      expect(sizeOf(screen.getByText('Wide label'))).toBe(8);
    });

    it('lets the text run a pixel over its width, for rounding', () => {
      layOut({ scrollWidth: tenTimesWide, clientWidth: 150 });

      render(<FitText axis="width" max={16} min={8}>Loose</FitText>);

      expect(sizeOf(screen.getByText('Loose'))).toBe(15);
    });

    it('allows the width no pixel for rounding when asked to be exact', () => {
      layOut({ scrollWidth: tenTimesWide, clientWidth: 150 });

      render(<FitText axis="width" max={16} min={8} exact>Exact</FitText>);

      expect(sizeOf(screen.getByText('Exact'))).toBe(14.5);
    });

    describe('at a heavier weight', () => {
      /* Five letters half the size wide each, a tenth wider again at weight 600, in a box 100 wide padded 4 each side */
      const renderLabel = () => {
        vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(100);
        vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 100, 20));
        layOut({ clientWidth: 100 });
        stubRange('getBoundingClientRect', function () {
          const label = holderOf(this);
          return new DOMRect(0, 0, 2.5 * sizeOf(label) * (label.style.fontWeight === '600' ? 1.1 : 1), 20);
        });
        render(
          <>
            <style>{'.padded { padding: 0 4px; }'}</style>
            <FitText className="padded" axis="width" heavier="600" max={40} min={8}>Login</FitText>
          </>
        );
        return screen.getByText('Login');
      };

      it('fits its width at the heavier weight its text takes on, inside the box\'s padding', () => {
        /* Heavier, the label fits the 92 inside the padding up to 33px */
        const label = renderLabel();

        expect(sizeOf(label)).toBe(33);
      });

      it('keeps its own weight once the heavier one is measured', () => {
        const label = renderLabel();

        expect(label.style.fontWeight).toBe('');
      });
    });
  });

  describe('wholeWords', () => {
    it('keeps words whole where a smaller size allows it, when asked to', () => {
      /* Height fits at every size, but above 12px the long word overruns its line and runs onto the next */
      layOut({ scrollHeight: 10, clientHeight: 100 });
      stubRange('getClientRects', function () {
        const split = sizeOf(holderOf(this)) > 12 && this.toString() === 'Unbreakable';
        return rectList(split ? [line(0), line(1)] : [line(0)]);
      });

      render(<FitText max={15} min={8} wholeWords>Unbreakable words</FitText>);

      expect(sizeOf(screen.getByText('Unbreakable words'))).toBe(12);
    });

    it('gives up keeping words whole where one is too long for the box at any size, rather than drop to the floor', () => {
      /* The word runs onto a second line at every size, and the box's height takes the text up to 12px */
      layOut({ clientHeight: 100, scrollHeight: el => (sizeOf(el) > 12 ? 200 : 50) });
      stubRange('getClientRects', function () {
        return rectList(this.toString() === 'Overlongword' ? [line(0), line(1)] : [line(0)]);
      });

      render(<FitText max={15} min={8} wholeWords>Overlongword</FitText>);

      expect(sizeOf(screen.getByText('Overlongword'))).toBe(12);
    });
  });

  describe('centreBox', () => {
    it('centres its text in the box, with equal padding at either end', () => {
      layOut({ scrollHeight: 40, clientHeight: 100 });

      render(<FitText centreBox basePad={7} max={15} min={8}>Centred</FitText>);

      const { display, alignContent, paddingTop, paddingBottom } = screen.getByText('Centred').style;
      expect([display, alignContent, paddingTop, paddingBottom]).toEqual(['grid', 'center', '7px', '7px']);
    });

    it.each<[string, number, number, string]>([
      ['spaces its lines out to fill the box inside its padding', 2, 46, '1.4'],
      ['spaces its lines no further apart than 1.6 times its size', 1, 100, '1.6'],
      ['leaves lines that only just fit the box at their own spacing', 2, 34, ''],
    ])('%s', (_outcome, lines, clientHeight, lineHeight) => {
      layOut({ scrollHeight: 30, clientHeight });
      stubRange('getClientRects', () => rectList(Array.from({ length: lines }, (_, row) => line(row))));

      render(<FitText centreBox basePad={2} max={15} min={8}>Spaced out</FitText>);

      expect(screen.getByText('Spaced out').style.lineHeight).toBe(lineHeight);
    });

    it('keeps its own line spacing where spacing it out would overflow the box', () => {
      /* Spaced out, the two lines run past the bottom of the box */
      layOut({ clientHeight: 46, scrollHeight: el => (el.style.lineHeight ? 60 : 30) });
      stubRange('getClientRects', () => rectList([line(0), line(1)]));

      render(<FitText centreBox basePad={2} max={15} min={8}>Two lines</FitText>);

      expect(screen.getByText('Two lines').style.lineHeight).toBe('');
    });

    it('leaves layout alone when it is not asked to centre', () => {
      layOut({ scrollHeight: 40, clientHeight: 100 });

      render(<FitText max={15} min={8}>Plainly placed</FitText>);

      expect(screen.getByText('Plainly placed').style.display).toBe('');
    });
  });

  describe('sized by a sample', () => {
    /* Every ten letters take a line as tall as the size, in a box 100 tall */
    const tenToALine = { clientHeight: 100, scrollHeight: (el: HTMLElement) => ((el.textContent?.length ?? 0) / 10) * sizeOf(el) };

    it('lets its text grow past max to the size at which the sample fills the box', () => {
      /* Fifty letters fill the box at 20px */
      layOut(tenToALine);

      render(<FitText max={15} min={8} growTo={'x'.repeat(50)}>Short</FitText>);

      expect(sizeOf(screen.getByText('Short'))).toBe(20);
    });

    it('keeps max as the ceiling when the sample fills the box at less than that', () => {
      layOut(tenToALine);

      render(<FitText max={15} min={8} growTo={'x'.repeat(100)}>Short</FitText>);

      expect(sizeOf(screen.getByText('Short'))).toBe(15);
    });

    it('holds a short text to the size its longest would fit at, when sized as a sample', () => {
      /* Eighty letters fill the box at 12.5px, where the text's own five would fit at max */
      layOut(tenToALine);

      render(<FitText max={20} min={8} sizedAs={'x'.repeat(80)}>Short</FitText>);

      expect(sizeOf(screen.getByText('Short'))).toBe(12.5);
    });
  });

  describe('alongside a partner', () => {
    const partner = (text: string) => {
      const el = document.createElement('div');
      el.textContent = text;
      document.body.append(el);
      return el;
    };

    it('sets another element at its own size, at one where that element\'s line fits its width as well', () => {
      /* The text fits at any size, while the title's line runs eight times its size wide in a box 100 wide */
      const title = partner('Title');
      layOut({ scrollHeight: 10, clientHeight: 100, clientWidth: 100, scrollWidth: el => (el === title ? 8 * sizeOf(title) : 50) });

      render(<FitText max={15} min={8} alongside={() => title}>Under a title</FitText>);

      expect(sizeOf(screen.getByText('Under a title'))).toBe(12.5);
      expect(sizeOf(title)).toBe(12.5);
    });

    it('starts its partner each pass from the layout its CSS gives it, clearing what an earlier pass sets', () => {
      const title = partner('Title');
      Object.assign(title.style, { whiteSpace: 'normal', height: '50px', lineHeight: '0.9', transform: 'translateY(3px)' });
      layOut({ scrollHeight: 10, clientHeight: 100, clientWidth: 100, scrollWidth: 50 });

      render(<FitText max={15} min={8} alongside={() => title}>Under a title</FitText>);

      const { whiteSpace, height, lineHeight, transform } = title.style;
      expect([whiteSpace, height, lineHeight, transform]).toEqual(['', '', '', '']);
    });

    describe('fullAs', () => {
      /* The title's one line fits up to a given size, and wrapped it takes two lines above 10px and fits up to 20px */
      const layOutTitle = (oneLineUpTo: number) => {
        const title = partner('Title words');
        const wrapped = () => title.style.whiteSpace === 'normal';
        const titleLines = () => (wrapped() && sizeOf(title) > 10 ? 2 : 1);
        stubRange('getClientRects', function () {
          const lines = title.contains(this.startContainer) ? titleLines() : 1;
          return rectList(Array.from({ length: lines }, (_, row) => line(row)));
        });
        /* The text takes a line as tall as its size for every ten letters, in a box 100 tall less the title's lines */
        layOut({
          clientWidth: 100,
          clientHeight: el => (el === title ? 0 : 100 - titleLines() * sizeOf(title)),
          scrollHeight: el => ((el.textContent?.length ?? 0) / 10) * sizeOf(el),
          scrollWidth: el => {
            if (el !== title) return 50;
            return wrapped() ? 5 * sizeOf(title) : (100 / oneLineUpTo) * sizeOf(title);
          },
        });
        return title;
      };

      it('splits a title over two lines where they let a full text come out larger, and sets both at one size', () => {
        /* On one line the title holds sixty letters to 10px, while on two they fit at 12.5px */
        const title = layOutTitle(10);

        render(<FitText max={20} min={8} alongside={() => title} fullAs={'x'.repeat(60)}>Short</FitText>);

        expect(title.style.whiteSpace).toBe('normal');
        expect(sizeOf(screen.getByText('Short'))).toBe(20);
        expect(sizeOf(title)).toBe(20);
      });

      it('keeps a title on its one line where two would hold a full text smaller', () => {
        /* On one line sixty letters fit at 14px, and two lines would hold them to 12.5px */
        const title = layOutTitle(18);

        render(<FitText max={20} min={8} alongside={() => title} fullAs={'x'.repeat(60)}>Short</FitText>);

        expect(title.style.whiteSpace).toBe('');
        expect(sizeOf(screen.getByText('Short'))).toBe(18);
        expect(sizeOf(title)).toBe(18);
      });
    });
  });

  describe('runs with no spaces', () => {
    /* Letters run 0.6 of the size wide, an i a quarter and a W the whole size, in lines 120 wide */
    const letterWidth = (letter: string) => (letter === 'i' ? 0.25 : letter === 'W' ? 1 : 0.6);
    /* The box a run's text node sits in, holding the run itself or its rows */
    const runOf = (node: Node) => {
      const holder = (node instanceof HTMLElement ? node : node.parentElement) as HTMLElement;
      return holder.classList.contains('run') ? holder : (holder.parentElement as HTMLElement);
    };
    /* Where each line of a text starts, filled a letter at a time as far as 120 holds, a zero-width space ending one */
    const lineStarts = (text: string, size: number, spacing = 0) => {
      const starts = [0];
      let across = 0;
      Array.from(text).forEach((letter, at) => {
        if (letter === '\u200B') {
          starts.push(at + 1);
          across = 0;
          return;
        }
        const wide = letterWidth(letter) * size + spacing;
        if (across > 0 && across + wide > 120 + 1e-9) {
          starts.push(at);
          across = 0;
        }
        across += wide;
      });
      return starts;
    };
    /* The lines of a run, or of each of its rows, which are blocks of their own */
    const blocksOf = (run: HTMLElement) => (run.children.length
      ? (Array.from(run.children) as HTMLElement[]).map(row =>
        lineStarts(row.textContent ?? '', sizeOf(run), parseFloat(row.style.letterSpacing) || 0))
      : [lineStarts(run.textContent ?? '', sizeOf(run))]);
    const linesOf = (run: HTMLElement) => blocksOf(run).reduce((sum, starts) => sum + starts.length, 0);
    /* The box of each line a range of a run's letters takes, a zero-width space taking no room */
    const rectsOf = (range: Range) => {
      const run = runOf(range.startContainer);
      const blocks = blocksOf(run);
      const block = Math.max(0, Array.from(run.children).indexOf(holderOf(range)));
      const above = blocks.slice(0, block).reduce((sum, starts) => sum + starts.length, 0);
      const lineAt = (offset: number) => blocks[block].filter(start => start <= offset).length - 1;
      const first = lineAt(range.startOffset);
      const last = lineAt(Math.max(range.startOffset, range.endOffset - 1));
      const wide = range.toString().replace(/\u200B/g, '') ? 5 : 0;
      return Array.from({ length: last - first + 1 }, (_, at) => new DOMRect(0, (above + first + at) * 20, wide, 20));
    };
    /* Lines stand 1.3 times the size tall, in a box 180 tall */
    const layOutRuns = ({ tall = 180, zoom = 1 } = {}) => {
      layOut({ clientHeight: tall, scrollHeight: el => linesOf(el) * sizeOf(el) * 1.3 });
      vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(120);
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 120 * zoom, 180 * zoom));
      stubRange('getClientRects', function () { return rectList(rectsOf(this)); });
      stubRange('getBoundingClientRect', function () {
        const across = Array.from(this.toString()).reduce((sum, letter) => sum + letterWidth(letter), 0);
        return new DOMRect(0, 0, across * sizeOf(runOf(this.startContainer)) * zoom, 20);
      });
    };
    const renderRun = (text: string, fillRuns = false) => {
      const { container } = render(<FitText className="run" max={26} min={6} fillRuns={fillRuns}>{text}</FitText>);
      return container.firstChild as HTMLElement;
    };
    /* How many letters each row holds, read from its rows or from the zero-width spaces between them */
    const sharesOf = (run: HTMLElement) => (run.children.length
      ? Array.from(run.children, row => row.textContent?.length)
      : (run.textContent ?? '').split('\u200B').map(share => share.length));

    it('shares a run out evenly over the lines it takes, at its own size where they can each hold the same', () => {
      /* Sixty-three letters take seven lines of ten at 19.5px, the last holding three, so they go nine to a line */
      layOutRuns();

      const run = renderRun('D'.repeat(63));

      expect(sizeOf(run)).toBe(19.5);
      expect(sharesOf(run)).toEqual([9, 9, 9, 9, 9, 9, 9]);
    });

    it('takes a smaller size at which the rows hold the same, where its own size cannot share them out', () => {
      /* Two hundred letters take twelve lines of seventeen at 11.5px, which no share evens out, and ten of twenty at 10px */
      layOutRuns();

      const run = renderRun('D'.repeat(200));

      expect(sizeOf(run)).toBe(10);
      expect(sharesOf(run)).toEqual(Array(10).fill(20));
    });

    it('leaves a run as it breaks where no size down to four fifths of its own shares it out', () => {
      layOutRuns();

      const run = renderRun('D'.repeat(163));

      expect(sizeOf(run)).toBe(12.5);
      expect(sharesOf(run)).toEqual([163]);
    });

    it.each<[string, number]>([
      ['on a page at its own size', 1],
      ['on a page zoomed to twice its size', 2],
    ])('keeps its own size where it is set to fill its box, its rows drawn the same width with a letter more first, %s', (_page, zoom) => {
      /* Eight rows of seventeen at 11.5px run 117.3 wide and four of sixteen 110.4, each then spaced to run 113.85 */
      layOutRuns({ zoom });

      const run = renderRun('D'.repeat(200), true);

      const rows = Array.from(run.children) as HTMLElement[];
      expect(sizeOf(run)).toBe(11.5);
      expect(sharesOf(run)).toEqual([...Array(8).fill(17), ...Array(4).fill(16)]);
      expect(parseFloat(rows[0].style.letterSpacing)).toBeCloseTo((113.85 - 117.3) / 16, 6);
      expect(parseFloat(rows[11].style.letterSpacing)).toBeCloseTo((113.85 - 110.4) / 15, 6);
      expect(parseFloat(rows[11].style.marginRight)).toBeCloseTo(-(113.85 - 110.4) / 15, 6);
    });

    it('leaves a run set to fill its box as it breaks where its rows would not each keep to one line', () => {
      /* At 23px forty i and twenty W break twenty, twenty and four lines of five W, and rows of ten W take two lines */
      layOutRuns();

      const run = renderRun('i'.repeat(40) + 'W'.repeat(20), true);

      expect(sizeOf(run)).toBe(23);
      expect(sharesOf(run)).toEqual([60]);
    });

    it('keeps its rows their own widths where evening them out would move their letters more than a sixth of its size', () => {
      /* At 26px rows of seven D and of six i run 109.2 and 39 wide, so evening them out would move letters 5.85 apart */
      layOutRuns();

      const run = renderRun('D'.repeat(20) + 'i'.repeat(6), true);

      expect(sharesOf(run)).toEqual([7, 7, 6, 6]);
      expect(Array.from(run.children, row => (row as HTMLElement).style.letterSpacing)).toEqual(['', '', '', '']);
    });

    describe('evenOutRun', () => {
      const runAt = (text: string, size: number) => {
        const run = document.createElement('div');
        run.className = 'run';
        run.style.fontSize = `${size}px`;
        run.textContent = text;
        document.body.append(run);
        return run;
      };

      it('leaves a run as it breaks where its even rows would overflow its box', () => {
        /* Sixty-three letters at 19.5px share out nine to a line, and their seven lines stand 177.45 tall */
        layOutRuns({ tall: 150 });
        const run = runAt('D'.repeat(63), 19.5);

        const even = evenOutRun(run, 'D'.repeat(63));

        expect(even).toBe(false);
        expect(run.textContent).toBe('D'.repeat(63));
      });

      it('leaves text with a space in it alone, as it breaks at its spaces', () => {
        /* At 19.5px its words break after each space, into lines of ten, ten and one, which would share out seven a line */
        layOutRuns();
        const text = `${'D'.repeat(9)} ${'D'.repeat(9)} D`;
        const run = runAt(text, 19.5);

        const even = evenOutRun(run, text);

        expect(even).toBe(false);
        expect(run.textContent).toBe(text);
      });
    });
  });

  it('evens out its lines where asked, its sides drawn in as far as its text keeps to as many lines', () => {
    /* The text runs 300 wide, so it takes two lines of a box 200 wide, and still does down to 150 wide */
    layOut({ scrollHeight: 40, clientHeight: 100, clientWidth: 200 });
    stubRange('getClientRects', function () {
      const { paddingLeft, paddingRight } = holderOf(this).style;
      const across = 200 - (parseFloat(paddingLeft) || 0) - (parseFloat(paddingRight) || 0);
      return rectList(Array.from({ length: Math.ceil(300 / across) }, (_, row) => line(row)));
    });

    render(<FitText max={15} min={8} evenLines>Evenly spread text</FitText>);

    const { paddingLeft, paddingRight } = screen.getByText('Evenly spread text').style;
    expect([paddingLeft, paddingRight]).toEqual(['25px', '25px']);
  });

  describe('clampToBox', () => {
    const QUESTION = 'A question far longer than the box it has been given can ever show';
    /* Each letter stands a given height, in a box 40 tall */
    const lettersTall = (each: number) => ({ clientHeight: 40, scrollHeight: (el: HTMLElement) => (el.textContent?.length ?? 0) * each });

    it('leaves the text alone when it already fits', () => {
      layOut(lettersTall(0.1));

      render(<FitText clampToBox max={15} min={8}>Short enough</FitText>);

      expect(screen.getByText('Short enough')).toBeInTheDocument();
    });

    it('cuts the text and ends it with an ellipsis when the floor still overflows', () => {
      /* At four pixels a letter, ten letters fit, the ellipsis among them */
      layOut(lettersTall(4));

      render(<FitText clampToBox max={15} min={8}>{QUESTION}</FitText>);

      expect(screen.getByText('A questio\u2026')).toBeInTheDocument();
    });

    it('does not truncate when the option is absent, however long the text', () => {
      layOut(lettersTall(4));

      render(<FitText max={15} min={8}>{QUESTION}</FitText>);

      expect(screen.getByText(QUESTION)).toBeInTheDocument();
    });
  });

  describe('spanning its box', () => {
    const WIDE = 300;
    const FOURS = Array(24).fill('abcd').join(' ');
    const SIXES = Array(16).fill('abcdef').join(' ');

    /* Letters run half their size wide and a space a quarter */
    const widthOf = (text: string, size: number) =>
      Array.from(text).reduce((sum, letter) => sum + (letter === ' ' ? 0.25 : 0.5) * size, 0);

    /* The spanned box a text node is laid out in, whether it holds the text itself or the text's lines as rows */
    const spanOf = (node: Node) => {
      const holder = node.parentElement as HTMLElement;
      return holder.classList.contains('spanned') ? holder : (holder.parentElement as HTMLElement);
    };
    const fontOf = (box: HTMLElement) => parseFloat(box.style.fontSize) || 16;
    /* A box runs 300 wide where nothing sets its width */
    const roomOf = (box: HTMLElement) =>
      (box.style.width === 'max-content' ? Infinity : parseFloat(box.style.width) || WIDE)
        - (parseFloat(box.style.paddingLeft) || 0) - (parseFloat(box.style.paddingRight) || 0);
    const wideOf = (el: HTMLElement) => {
      if (!el.classList.contains('spanned')) return 0;
      const padding = (parseFloat(el.style.paddingLeft) || 0) + (parseFloat(el.style.paddingRight) || 0);
      if (el.style.width === 'max-content') return widthOf(el.textContent ?? '', fontOf(el)) + padding;
      return parseFloat(el.style.width) || WIDE;
    };

    /* Where each line of a text starts and ends, broken at its spaces as late as each line fits */
    const breaks = (text: string, size: number, room: number) => {
      const lines: [number, number][] = [];
      let from = 0;
      let to = 0;
      for (const word of text.split(/(?<= )/)) {
        if (to > from && widthOf(text.slice(from, to + word.length).trimEnd(), size) > room + 0.001) {
          lines.push([from, to]);
          from = to;
        }
        to += word.length;
      }
      if (to > from) lines.push([from, to]);
      return lines;
    };

    /* The boxes of a range's letters, one a line, lines 1.25 times their size apart and below those of any rows above */
    const rectsOf = (range: Range) => {
      const node = range.startContainer;
      const box = spanOf(node);
      const size = fontOf(box);
      const room = roomOf(box);
      const text = node.textContent ?? '';
      let above = 0;
      for (const row of Array.from(box.children)) {
        if (row === node.parentElement) break;
        above += breaks(row.textContent ?? '', size, room).length;
      }
      return breaks(text, size, room).flatMap(([from, to], at) => {
        const start = Math.max(from, range.startOffset);
        const end = Math.min(to, range.endOffset);
        if (end <= start) return [];
        return [new DOMRect(widthOf(text.slice(from, start), size), (above + at) * size * 1.25, widthOf(text.slice(start, end), size), size)];
      });
    };

    /* Letters reach 0.7 of their size above their line and 0.2 below */
    class Canvas {
      constructor(public width: number, public height: number) {}
      getContext() {
        return {
          font: '10px sans-serif',
          measureText(this: { font: string }, text: string) {
            const size = parseFloat(/([\d.]+)px/.exec(this.font)?.[1] ?? '10');
            return { width: widthOf(text, size), actualBoundingBoxAscent: 0.7 * size, actualBoundingBoxDescent: 0.2 * size };
          },
        };
      }
    }

    const layOutSpan = ({ canvas = true } = {}) => {
      stubRange('getClientRects', function () { return rectList(rectsOf(this)); });
      stubRange('getBoundingClientRect', function () {
        const rects = rectsOf(this);
        const left = Math.min(...rects.map(rect => rect.left));
        const right = Math.max(...rects.map(rect => rect.right));
        return new DOMRect(left, rects[0].top, right - left, rects[rects.length - 1].bottom - rects[0].top);
      });
      vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (this: HTMLElement) {
        return wideOf(this);
      });
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
        return new DOMRect(0, 0, wideOf(this), 0);
      });
      if (canvas) vi.stubGlobal('OffscreenCanvas', Canvas);
    };

    const spanned = (text: string) => {
      const el = document.createElement('div');
      el.className = 'spanned';
      el.textContent = text;
      document.body.append(el);
      return el;
    };
    const rowsOf = (el: HTMLElement) => Array.from(el.children) as HTMLElement[];

    it('fits a text set to span its box as any other, where there is no laying it out', () => {
      layOut({ scrollHeight: 40, clientHeight: 100 });

      render(<FitText max={15} min={8} spanBox alike={['Other copy']} room={() => 120}>Spanned</FitText>);

      const { fontSize, height } = screen.getByText('Spanned').style;
      expect([fontSize, height]).toEqual(['15px', '']);
    });

    it('spans its box rather than fitting it, where it can be laid out, and hands it over', () => {
      /* Spanned, the text comes out at about 21.1px, where fitting a box with room to spare would set it at max */
      layOutSpan();
      const onFit = vi.fn();

      const { container } = render(<FitText className="spanned" max={40} min={8} spanBox room={() => 120} onFit={onFit}>{FOURS}</FitText>);

      expect(sizeOf(container.firstChild as HTMLElement)).toBeCloseTo((WIDE - 1.5) / (212 / 16 + 0.9), 2);
      expect(onFit).toHaveBeenCalledTimes(1);
    });

    describe('spanText', () => {
      it('lays a text out over as many lines as leave them far enough apart, as large as runs them the box\'s width', () => {
        /* Over four lines its words run 212 across at 16px, and five lines would stand closer than 1.15 apart */
        layOutSpan();
        const el = spanned(FOURS);

        const laid = spanText(el, FOURS, [], 120, 8, 40);

        expect(laid).toBe(true);
        expect(sizeOf(el)).toBeCloseTo((WIDE - 1.5) / (212 / 16 + 0.9), 2);
        expect(rowsOf(el).map(row => row.textContent?.trim().split(' ').length)).toEqual([6, 6, 6, 6]);
        expect(el.textContent).toBe(FOURS);
      });

      it('draws each line as a row of its own the box\'s width, its letters spaced out a little', () => {
        /* Each row falls 1.5 short of the room, and half of that is shared out among its 29 letters and spaces */
        layOutSpan();
        const el = spanned(FOURS);

        spanText(el, FOURS, [], 120, 8, 40);

        expect(rowsOf(el).map(row => row.style.display)).toEqual(['block', 'block', 'block', 'block']);
        expect([el.style.textAlign, el.style.getPropertyValue('text-align-last')]).toEqual(['justify', 'justify']);
        expect(rowsOf(el)[0].style.letterSpacing).toBe('0.026px');
      });

      it('stands in from either side by nine twentieths of its size', () => {
        layOutSpan();
        const el = spanned(FOURS);

        spanText(el, FOURS, [], 120, 8, 40);

        expect(parseFloat(el.style.paddingLeft)).toBeCloseTo(0.45 * sizeOf(el), 1);
        expect(el.style.paddingRight).toBe(el.style.paddingLeft);
      });

      it.each<[string, number | null]>([
        ['exactly as tall as asked', 120],
        ['as tall as its stylesheet makes it, where no height is asked for', null],
      ])('stands %s', (_stands, height) => {
        layOutSpan();
        layOut({ clientHeight: 120 });
        const el = spanned(FOURS);

        spanText(el, FOURS, [], height, 8, 40);

        expect(el.style.height).toBe('120px');
      });

      it('sets each of the texts the box shows at the same size, over the same number of lines, the same way in', () => {
        layOutSpan();
        const laid = [FOURS, SIXES].map(text => {
          const el = spanned(text);
          spanText(el, text, [FOURS, SIXES], 120, 8, 40);
          return { size: el.style.fontSize, rows: el.children.length, inset: el.style.paddingLeft, height: el.style.height };
        });

        expect(laid[0].rows).toBe(4);
        expect(laid[1]).toEqual(laid[0]);
      });

      it('spaces its lines so its letters stand as tall as the box less the space they stand in from its sides', () => {
        /* A font reaching 0.8 of its size above its line and a quarter below, the leading split evenly above and below */
        vi.mocked(fontPlace).mockImplementationOnce(el => {
          const size = parseFloat(el.style.fontSize);
          return { ascent: 0.8 * size, descent: 0.25 * size, baseline: (height: number) => 0.8 * size + (height - 1.05 * size) / 2 };
        });
        layOutSpan();
        const el = spanned(FOURS);

        spanText(el, FOURS, [], 120, 8, 40);

        const size = sizeOf(el);
        const inset = 0.45 * size;
        const leading = parseFloat(el.style.lineHeight);
        /* Its four lines' letters, from the first's tops to the last's tails, stand the box's height less the inset twice */
        expect(leading).toBeCloseTo((120 - 2 * inset - 0.9 * size) / (3 * size), 3);
        /* The first line's letters, 0.1 of their size under the font's reach and half the leading, stand the inset down */
        expect(parseFloat(el.style.paddingTop)).toBeCloseTo(inset - (0.1 * size + (leading * size - 1.05 * size) / 2), 1);
      });

      it('keeps a text at max to the fewest lines that reach it, however tall the box', () => {
        /* At 20px four lines already reach max, where twelve would still stand far enough apart in a box 300 tall */
        layOutSpan();
        const el = spanned(FOURS);

        spanText(el, FOURS, [], 300, 8, 20);

        expect(sizeOf(el)).toBe(20);
        expect(el.children).toHaveLength(4);
      });

      it('breaks its lines where the page does, where there is no canvas to measure its words', () => {
        layOutSpan({ canvas: false });
        const el = spanned(FOURS);
        const six = Array(6).fill('abcd').join(' ');

        spanText(el, FOURS, [], 120, 8, 40);

        expect(rowsOf(el).map(row => row.textContent)).toEqual([`${six} `, `${six} `, `${six} `, six]);
      });
    });
  });

  describe('after the first fit', () => {
    /* Frames run only when a test steps through them */
    const stepFrames = () => vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] });

    /* A box whose height and place a test changes, holding a text that stands nine times its size tall */
    const movableBox = () => {
      const box = { top: 0, height: 100 };
      layOut({ clientHeight: () => box.height, scrollHeight: el => 9 * sizeOf(el) });
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => new DOMRect(0, box.top, 100, box.height));
      return box;
    };

    /* jsdom has no ResizeObserver, so this one reports a resize of the boxes it observes when a test says */
    const observeResizes = () => {
      const observers: { report: () => void }[] = [];
      vi.stubGlobal('ResizeObserver', class implements ResizeObserver {
        private targets = new Set<Element>();
        constructor(private callback: ResizeObserverCallback) { observers.push(this); }
        observe(target: Element) { this.targets.add(target); }
        unobserve(target: Element) { this.targets.delete(target); }
        disconnect() { this.targets.clear(); }
        report() {
          const entries = Array.from(this.targets, target => ({ target, contentRect: target.getBoundingClientRect() }) as ResizeObserverEntry);
          if (entries.length) this.callback(entries, this);
        }
      });
      return () => observers.forEach(observer => observer.report());
    };

    /* jsdom has no FontFaceSet, so this one stays loading until a test loads it */
    const fontsLoading = () => {
      let resolve: (fonts: FontFaceSet) => void = () => {};
      const fonts = { status: 'loading' as FontFaceSetLoadStatus, ready: new Promise<FontFaceSet>(done => { resolve = done; }) };
      Object.defineProperty(document, 'fonts', { configurable: true, value: fonts });
      return {
        loaded: () => fonts.status === 'loaded',
        load: async () => {
          fonts.status = 'loaded';
          resolve(fonts as unknown as FontFaceSet);
          await fonts.ready;
        },
      };
    };

    it('fits again when the window is resized', () => {
      stepFrames();
      const box = movableBox();
      render(<FitText max={15} min={8}>Watched</FitText>);

      box.height = 200;
      window.dispatchEvent(new Event('resize'));
      vi.advanceTimersToNextFrame();

      expect(sizeOf(screen.getByText('Watched'))).toBe(15);
    });

    it('fits once for a burst of window resizes', () => {
      stepFrames();
      movableBox();
      const onFit = vi.fn();
      render(<FitText max={15} min={8} onFit={onFit}>Batched</FitText>);
      onFit.mockClear();

      for (let i = 0; i < 3; i += 1) window.dispatchEvent(new Event('resize'));
      vi.advanceTimersToNextFrame();

      expect(onFit).toHaveBeenCalledTimes(1);
    });

    it('fits again when its box is resized', () => {
      stepFrames();
      const resize = observeResizes();
      const box = movableBox();
      render(<FitText max={15} min={8}>Observed</FitText>);

      box.height = 200;
      resize();
      vi.advanceTimersToNextFrame();

      expect(sizeOf(screen.getByText('Observed'))).toBe(15);
    });

    it('lets go a resize that only reports the sizes its own pass leaves', () => {
      stepFrames();
      const resize = observeResizes();
      movableBox();
      const onFit = vi.fn();
      render(<FitText max={15} min={8} onFit={onFit}>Observed</FitText>);
      onFit.mockClear();

      resize();
      vi.advanceTimersToNextFrame();

      expect(onFit).not.toHaveBeenCalled();
    });

    it('fits again once the page\'s fonts have loaded', async () => {
      /* The loaded font stands the text nine times its size tall, where the fallback stands it four times */
      stepFrames();
      const fonts = fontsLoading();
      layOut({ clientHeight: 100, scrollHeight: el => (fonts.loaded() ? 9 : 4) * sizeOf(el) });
      render(<FitText max={15} min={8}>Late font</FitText>);

      await fonts.load();
      vi.advanceTimersToNextFrame();

      expect(sizeOf(screen.getByText('Late font'))).toBe(11);
    });

    it('places its text again when it moves on the page without any size changing', () => {
      stepFrames();
      const box = movableBox();
      const onFit = vi.fn();
      render(<FitText max={15} min={8} onFit={onFit}>Moved</FitText>);
      onFit.mockClear();

      vi.advanceTimersToNextFrame();
      box.top = 12.5;
      vi.advanceTimersToNextFrame();

      expect(onFit).toHaveBeenCalledTimes(1);
    });

    it('fits again where what it places changes the size of its box, once in a row at most', () => {
      /* Every placing makes the box taller, as moving an underline over a description can */
      stepFrames();
      const box = movableBox();
      const onFit = vi.fn(() => { box.height += 10; });
      render(<FitText max={15} min={8} onFit={onFit}>Placed</FitText>);

      vi.advanceTimersToNextFrame();
      vi.advanceTimersToNextFrame();

      expect(onFit).toHaveBeenCalledTimes(2);
    });

    it('stops fitting and placing its text once unmounted', () => {
      stepFrames();
      const resize = observeResizes();
      const box = movableBox();
      const onFit = vi.fn();
      const { unmount } = render(<FitText max={15} min={8} onFit={onFit}>Gone</FitText>);
      /* A resize just before unmounting leaves a pass waiting for the next frame */
      window.dispatchEvent(new Event('resize'));
      unmount();
      onFit.mockClear();

      Object.assign(box, { top: 12.5, height: 200 });
      window.dispatchEvent(new Event('resize'));
      resize();
      vi.advanceTimersToNextFrame();
      vi.advanceTimersToNextFrame();

      expect(onFit).not.toHaveBeenCalled();
    });

    it('does not fit again when the page\'s fonts load after it is unmounted', async () => {
      stepFrames();
      const fonts = fontsLoading();
      movableBox();
      const onFit = vi.fn();
      const { unmount } = render(<FitText max={15} min={8} onFit={onFit}>Gone</FitText>);
      unmount();
      onFit.mockClear();

      await fonts.load();
      vi.advanceTimersToNextFrame();

      expect(onFit).not.toHaveBeenCalled();
    });
  });
});

describe('useFitFont', () => {
  it('does nothing while its ref holds no element, as a closed editor\'s does', () => {
    expect(() => renderHook(() => useFitFont({ current: null }, 'Draft question'))).not.toThrow();
  });

  it('sets an empty draft at max', () => {
    const Draft = () => {
      const ref = useRef<HTMLTextAreaElement>(null);
      useFitFont(ref, '');
      return <textarea ref={ref} aria-label="Question" />;
    };

    render(<Draft />);

    expect(screen.getByRole('textbox', { name: 'Question' }).style.fontSize).toBe('15px');
  });
});