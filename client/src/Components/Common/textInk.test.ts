/* With neither a canvas nor line boxes in jsdom, both are stood in for and the arithmetic between them is tested */

/* Every measurement a canvas gives, each nothing until a test sets it */
const NO_METRICS: TextMetrics = {
  width: 0, actualBoundingBoxLeft: 0, actualBoundingBoxRight: 0, actualBoundingBoxAscent: 0, actualBoundingBoxDescent: 0,
  fontBoundingBoxAscent: 0, fontBoundingBoxDescent: 0, emHeightAscent: 0, emHeightDescent: 0, hangingBaseline: 0,
  alphabeticBaseline: 0, ideographicBaseline: 0,
};

type Measures = Partial<TextMetrics> | ((text: string) => Partial<TextMetrics>);

/* A canvas measuring letters as given at 16px and in proportion at other sizes, drawing a row as faint as it is covered */
const stubCanvas = (at16: Measures) => {
  const measured = typeof at16 === 'function' ? at16 : () => at16;
  vi.stubGlobal('OffscreenCanvas', class {
    getContext() {
      let down = 1;
      let from = 0;
      const inked: { top: number; bottom: number }[] = [];
      const context = {
        font: '',
        measureText(text: string): TextMetrics {
          const size = parseFloat(/([\d.]+)px/.exec(context.font)?.[1] ?? '0');
          const metrics = Object.entries({ ...NO_METRICS, ...measured(text) }).map(([name, value]) => [name, (value * size) / 16]);
          return Object.fromEntries(metrics);
        },
        setTransform(_across: number, _b: number, _c: number, scaleDown: number, _e: number, moveDown: number) {
          down = scaleDown;
          from = moveDown;
        },
        fillText(text: string, _x: number, y: number) {
          const metrics = context.measureText(text);
          const baseline = from + down * y;
          inked.push({
            top: baseline - metrics.actualBoundingBoxAscent * down,
            bottom: baseline + metrics.actualBoundingBoxDescent * down,
          });
        },
        getImageData(_x: number, _y: number, width: number, height: number): ImageData {
          const data = new Uint8ClampedArray(width * height * 4);
          for (let row = 0; row < height; row += 1) {
            const covered = Math.max(0, ...inked.map(ink => Math.min(row + 1, ink.bottom) - Math.max(row, ink.top)));
            for (let x = 0; x < width; x += 1) data[(row * width + x) * 4 + 3] = Math.round(255 * Math.min(1, covered));
          }
          return { data, width, height, colorSpace: 'srgb' };
        },
      };
      return context;
    }
  });
};

/* Letters half their size wide, 0.7 of it above the baseline and 0.2 below, in line boxes starting their size above it */
const sized = (text: string) => ({
  fontBoundingBoxAscent: 16, actualBoundingBoxAscent: 0.7 * 16, actualBoundingBoxDescent: 0.2 * 16,
  width: 8 * text.length, actualBoundingBoxRight: 8 * text.length,
});

/* Line boxes starting 16 above the baseline, with letters reaching 11 above it and 4 below */
const drawnFont = () => stubCanvas({ fontBoundingBoxAscent: 16, actualBoundingBoxAscent: 11, actualBoundingBoxDescent: 4 });

/* A fresh copy of the module, as it keeps the first canvas it makes */
const load = async () => {
  vi.resetModules();
  return import('./textInk');
};

const element = (text: string) => {
  const el = document.createElement('div');
  el.textContent = text;
  el.style.fontSize = '16px';
  document.body.appendChild(el);
  return el;
};

const rangeRects = Object.getOwnPropertyDescriptor(Range.prototype, 'getClientRects');

/* Gives each letter the box the test lays it out in, found by where the letter stands in its text */
const layOut = (boxOf: (at: number) => DOMRect) => {
  Range.prototype.getClientRects = function (this: Range) {
    const rects = [boxOf(this.startOffset)];
    return Object.assign(rects, { item: (i: number) => rects[i] ?? null }) as unknown as DOMRectList;
  };
};

/* Every letter five wide on one line whose box starts at a height */
const oneLine = (top: number) => layOut(at => new DOMRect(at * 5, top, 5, 20));

/* The letters before an element's first space on a line whose box starts at one height, and the rest at another */
const twoLines = (el: HTMLElement, first: number, second: number) => {
  const space = (el.textContent ?? '').indexOf(' ');
  layOut(at => (at < space ? new DOMRect(at * 5, first, 5, 20) : new DOMRect((at - space - 1) * 5, second, 5, 20)));
};

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
  if (rangeRects) Object.defineProperty(Range.prototype, 'getClientRects', rangeRects);
  else delete (Range.prototype as { getClientRects?: unknown }).getClientRects;
  delete (document as { fonts?: unknown }).fonts;
});

describe('centreLabel', () => {
  it('leaves the text where it is when there is no canvas to measure with', async () => {
    const { centreLabel } = await load();
    const label = element('Delete');

    centreLabel(label);

    expect(label.style.transform).toBe('');
  });

  it('moves the letters across to centre them where the font leaves more space on one side of them', async () => {
    /* An advance of 40 with letters from 2 in to 39, so they stand half a pixel right of centre */
    stubCanvas({ width: 40, actualBoundingBoxLeft: -2, actualBoundingBoxRight: 39 });
    const { centreLabel } = await load();
    const label = element('Delete');

    centreLabel(label);

    expect(label.style.transform).toBe('translate(-0.50px, 0.00px)');
  });

  /* A label in a button between two edges, in line boxes starting 16 above the baseline, its letters 11 tall above it */
  const labelled = async (top: number, bottom: number, tail = 0) => {
    stubCanvas({
      width: 40, actualBoundingBoxRight: 40, fontBoundingBoxAscent: 16, actualBoundingBoxAscent: 11, actualBoundingBoxDescent: tail,
    });
    const { centreLabel } = await load();
    const button = document.createElement('button');
    button.getBoundingClientRect = () => new DOMRect(0, top, 60, bottom - top);
    document.body.appendChild(button);
    const label = element('Edit');
    button.appendChild(label);
    return { centreLabel, button, label };
  };

  it('moves the line down to set its letters in the middle of the button that holds it', async () => {
    /* A line box from 2 puts the baseline on 18, and letters 11 tall centre on the button's 14.5 standing on 20 */
    const { centreLabel, label } = await labelled(0, 29);
    oneLine(2);

    centreLabel(label);

    expect(label.style.transform).toBe('translate(0.00px, 2.00px)');
  });

  it('centres the letters from their top to their baseline, so a tail below it hangs under the middle', async () => {
    /* Letters reaching 4 below the baseline, as a g's tail does, stand where letters without one would */
    const { centreLabel, label } = await labelled(0, 29, 4);
    oneLine(2);

    centreLabel(label);

    expect(label.style.transform).toBe('translate(0.00px, 2.00px)');
  });

  it('sets the line on the whole pixel nearest the middle', async () => {
    /* Centred on 13.4 the letters would stand on 18.9, so the line goes a pixel down onto 19 */
    const { centreLabel, label } = await labelled(0, 26.8);
    oneLine(2);

    centreLabel(label);

    expect(label.style.transform).toBe('translate(0.00px, 1.00px)');
  });

  it('keeps the line on the pixel above where the middle falls a shade past halfway', async () => {
    /* Centred on 13.1 the letters would stand on 18.6, a shade past halfway, so the line stays on 18 */
    const { centreLabel, label } = await labelled(0, 26.2);
    oneLine(2);

    centreLabel(label);

    expect(label.style.transform).toBe('');
  });

  it('places the line where the page draws it, its box and the line within it each on a whole pixel', async () => {
    /* The box from 0.4 is drawn from 0 and its line 18 below, so the line moves 2 onto 20 rather than 1.6 */
    const { centreLabel, label } = await labelled(0, 29);
    label.getBoundingClientRect = () => new DOMRect(0, 0.4, 30, 20);
    oneLine(2.4);

    centreLabel(label);

    expect(label.style.transform).toBe('translate(0.00px, 2.00px)');
  });

  it('sets the line on the screen\'s own pixels, which are finer where it has more of them', async () => {
    /* With two screen pixels to each of the page's, the 18.5 the letters centre on is a whole pixel the line moves onto */
    const { centreLabel, label } = await labelled(0, 26);
    vi.stubGlobal('devicePixelRatio', 2);
    oneLine(2);

    centreLabel(label);

    expect(label.style.transform).toBe('translate(0.00px, 0.50px)');
  });

  it('follows a box a transform draws larger, by the whole pixels of its own it sets everything in it on', async () => {
    /* A box laid out from 100.3 and drawn 1.1 times as large from 100, the fraction dropped, that holds the button */
    const { centreLabel, button, label } = await labelled(100.3 + 1.1 * 5.4, 100.3 + 1.1 * 35.4);
    const room = document.createElement('div');
    room.style.transform = 'matrix(1.1, 0, 0, 1.1, 0, 0)';
    room.style.transformOrigin = '0px 0px';
    room.getBoundingClientRect = () => new DOMRect(0, 100.3, 220, 110);
    document.body.appendChild(room);
    room.appendChild(button);
    label.style.width = '50px';
    Object.defineProperty(label, 'currentCSSZoom', { value: 1 });
    label.getBoundingClientRect = () => new DOMRect(0, 100.3 + 1.1 * 10.2, 55, 22);
    oneLine(100.3 + 1.1 * 12.2);

    centreLabel(label);

    /* Drawn from 105.5 to 138.5, the button sets letters 12.1 tall on 128, 2.8 of the page's pixels up, or 2.55 of the label's */
    expect(label.style.transform).toBe('translate(0.00px, -2.55px)');
  });

  it('moves the line from where it falls inside a box a transform turns, whose pixels cannot be followed', async () => {
    const { centreLabel, button, label } = await labelled(0.4, 30.4);
    const room = document.createElement('div');
    room.style.transform = 'matrix(0.98, 0.17, -0.17, 0.98, 0, 0)';
    document.body.appendChild(room);
    room.appendChild(button);
    label.getBoundingClientRect = () => new DOMRect(0, 0.4, 30, 20);
    oneLine(2.4);

    centreLabel(label);

    /* The line falls on 18.4, 16 below its box at 2.4, and letters centred on the button's 15.4 stand on 21 */
    expect(label.style.transform).toBe('translate(0.00px, 2.60px)');
  });

  it('leaves text that runs over its box alone, as it is not centred to begin with', async () => {
    stubCanvas({ width: 40, actualBoundingBoxLeft: -2, actualBoundingBoxRight: 39 });
    const { centreLabel } = await load();
    const label = element('Delete');
    Object.defineProperty(label, 'scrollWidth', { value: 60 });
    Object.defineProperty(label, 'clientWidth', { value: 50 });

    centreLabel(label);

    expect(label.style.transform).toBe('');
  });
});

describe('centreInkBetween', () => {
  /* Line boxes starting 10 above the baseline, with letters reaching 7 above it and 2 below */
  const font = () => stubCanvas({ fontBoundingBoxAscent: 10, actualBoundingBoxAscent: 7, actualBoundingBoxDescent: 2 });

  it('sets the letters midway between the edge above them and the letters below', async () => {
    font();
    const { boxBottom, centreInkBetween } = await load();
    const title = element('Title');
    title.getBoundingClientRect = () => new DOMRect(0, 70, 100, 20);
    const text = element('Centred text');
    oneLine(100);

    centreInkBetween(text, boxBottom(title), 203);

    /* Letters from 103 to 112 centre between an edge at 90 and a count's letters from 203 by moving down to 146.5 */
    expect(text.style.transform).toBe('translateY(39.00px)');
  });

  it('leaves the letters where they are when either height is not known', async () => {
    font();
    const { centreInkBetween } = await load();
    const text = element('Centred text');
    text.style.transform = 'translateY(3px)';
    oneLine(100);

    centreInkBetween(text, 90, null);

    expect(text.style.transform).toBe('');
  });

  it('leaves the letters where they are when there is no canvas to measure with', async () => {
    const { centreInkBetween } = await load();
    const text = element('Centred text');
    text.style.transform = 'translateY(3px)';
    oneLine(100);

    centreInkBetween(text, 90, 203);

    expect(text.style.transform).toBe('');
  });

  it('sets letters drawn at a scale by the rows they cover and the whole pixels their baselines are painted on', async () => {
    stubCanvas(sized);
    const { centreInkBetween } = await load();
    /* Painted from 40 and drawn 1.25 times as tall, the lines from 50 and 59 stand on 70 and 81.25 */
    const title = element('DDDDD DDDD');
    title.style.width = '100px';
    title.getBoundingClientRect = () => new DOMRect(0, 40.3, 100, 20);
    twoLines(title, 50, 59);

    centreInkBetween(title, 0, 40.6, { across: 1.25, down: 1.25 });

    /* Painted on 19 and 31 they leave 5 and 5.6, set 0.3 high, which wins over 6 and 5.6, set 0.2 low, a pixel lower */
    expect(title.style.transform).toBe('translateY(-50.57px) scale(1.2500, 1.2500)');
  });

  it('centres the outlines of letters too thin to show when drawn at a scale', async () => {
    /* A dash 0.2 thick at 16px covers 0.4 of a pixel row when drawn twice as tall, which shows as no row at all */
    stubCanvas({ fontBoundingBoxAscent: 16, actualBoundingBoxAscent: 4.2, actualBoundingBoxDescent: -4 });
    const { centreInkBetween } = await load();
    const dash = element('-');
    dash.getBoundingClientRect = () => new DOMRect(0, 40, 100, 20);
    oneLine(50);

    centreInkBetween(dash, 0, 20, { across: 2, down: 2 });

    /* Its outline from 61.8 to 62, drawn twice as tall about the box's middle at 50, moves to centre on 10 */
    expect(dash.style.transform).toBe('translateY(-63.80px) scale(2.0000, 2.0000)');
  });
});

describe('paintedFillTop', () => {
  /* A box from 40.6, which the page paints from 41, with the top border given */
  const boxWith = (border: string) => {
    const box = element('');
    box.style.width = '100px';
    box.style.borderTop = border;
    box.getBoundingClientRect = () => new DOMRect(0, 40.6, 100, 30);
    return box;
  };

  it('starts a box\'s fill under its top border, from the whole pixel the box is painted from', async () => {
    const { paintedFillTop } = await load();
    const box = boxWith('1px solid');

    expect(paintedFillTop(box)).toBe(42);
  });

  it('paints a border thinner than a screen pixel one screen pixel deep', async () => {
    const { paintedFillTop } = await load();
    const box = boxWith('0.4px solid');

    expect(paintedFillTop(box)).toBe(42);
  });

  it('starts the fill at the box\'s top where it has no border', async () => {
    const { paintedFillTop } = await load();
    const box = boxWith('0px');

    expect(paintedFillTop(box)).toBe(41);
  });
});

describe('fillTop', () => {
  it('starts a box\'s fill under its top border, which the page\'s zoom draws deeper', async () => {
    const { fillTop } = await load();
    const box = element('');
    box.style.width = '100px';
    box.style.borderTop = '2px solid';
    box.getBoundingClientRect = () => new DOMRect(0, 40.6, 125, 30);

    /* Painted from 41 at a zoom of 1.25, which draws the border 2.5 deep */
    expect(fillTop(box)).toBe(43.5);
  });
});

describe('drawnExtent', () => {
  it('measures letters by the pixel rows they cover as drawn, counting a row only once it is half covered', async () => {
    /* Letters 11.6 above a baseline on 18 and 3.4 below cover 0.6 of their top row, which counts, and 0.4 of their bottom one */
    stubCanvas(text => ({
      fontBoundingBoxAscent: 16, actualBoundingBoxAscent: 11.6, actualBoundingBoxDescent: 3.4, actualBoundingBoxRight: 8 * text.length,
    }));
    const { drawnExtent } = await load();
    const text = element('Edit');
    oneLine(2);

    expect(drawnExtent(text)).toEqual({ top: 6, bottom: 21 });
  });
});

describe('laidExtent', () => {
  it('measures letters by their outlines from where their line falls, before it is painted on a whole pixel', async () => {
    /* A line box from 2.25 puts the baseline 16 below it at 18.25 */
    stubCanvas({ fontBoundingBoxAscent: 16, actualBoundingBoxAscent: 11.5, actualBoundingBoxDescent: 3.5 });
    const { laidExtent } = await load();
    const text = element('Edit');
    oneLine(2.25);

    expect(laidExtent(text)).toEqual({ top: 6.75, bottom: 21.75 });
  });

  it('measures letters in the case text-transform shows them in', async () => {
    /* Only letters with tails, such as a small y or g, reach below the baseline */
    stubCanvas(text => ({
      fontBoundingBoxAscent: 16, actualBoundingBoxAscent: 11.5, actualBoundingBoxDescent: /[gjpqy]/.test(text) ? 3.5 : 0,
    }));
    const { laidExtent } = await load();
    const label = element('Play Again');
    label.style.textTransform = 'uppercase';
    oneLine(2.25);

    expect(laidExtent(label)).toEqual({ top: 6.75, bottom: 18.25 });
  });
});

describe('spaceEvenly', () => {
  /* A panel from 0 to 110 within borders 5 deep, and items placed where the test says they show */
  const setUp = () => {
    const panel = document.createElement('div');
    panel.style.borderTop = '5px solid';
    panel.style.borderBottom = '5px solid';
    panel.getBoundingClientRect = () => new DOMRect(0, 0, 100, 110);
    const items = [0, 1, 2].map(() => panel.appendChild(document.createElement('div')));
    document.body.appendChild(panel);
    return { panel, items };
  };

  it('moves each item so the space above, between and below them is the same all the way down', async () => {
    const { spaceEvenly } = await load();
    const { panel, items } = setUp();
    const shown = [{ top: 10, bottom: 20 }, { top: 45, bottom: 55 }, { top: 60, bottom: 90 }];
    const extents = new Map<HTMLElement, { top: number; bottom: number }>(items.map((item, i) => [item, shown[i]]));

    spaceEvenly(panel, items, el => extents.get(el) ?? null);

    /* Fifty of the hundred within the borders are shown, leaving four spaces of 12.5, so the items start at 17.5, 40 and 62.5 */
    expect(items.map(item => item.style.transform)).toEqual(['translateY(7.50px)', 'translateY(-5.00px)', 'translateY(2.50px)']);
  });

  it('leaves every item where it is when one of them cannot be measured', async () => {
    const { spaceEvenly } = await load();
    const { panel, items } = setUp();
    items[0].style.transform = 'translateY(4px)';

    spaceEvenly(panel, items, el => (el === items[1] ? null : { top: 0, bottom: 10 }));

    expect(items.map(item => item.style.transform)).toEqual(['', '', '']);
  });
});

describe('fillBetween', () => {
  /* A title 100 wide from 40 to 60, its letters half their size wide on lines from 50, 20 apart until a height is set */
  const title = (text: string) => {
    const el = element(text);
    el.style.width = '100px';
    el.getBoundingClientRect = () => new DOMRect(0, 40, 100, 20);
    const space = text.indexOf(' ');
    layOut(at => {
      const line = space >= 0 && at > space ? 1 : 0;
      const size = parseFloat(el.style.fontSize);
      const height = el.style.lineHeight;
      const pitch = !height ? 20 : height.endsWith('px') ? parseFloat(height) : parseFloat(height) * size;
      return new DOMRect((at - (line ? space + 1 : 0)) * 0.5 * size, 50 + line * pitch, 0.5 * size, size);
    });
    return el;
  };

  it('sets a single line at the size that runs it across the element\'s width', async () => {
    stubCanvas(sized);
    const { fillBetween } = await load();
    const physics = title('Physics');

    fillBetween(physics, 0, 20, 18);

    /* Seven letters half their size wide run a quarter of a pixel short of the width at 28.5px */
    expect(physics.style.fontSize).toBe('28.5px');
  });

  it('keeps the height the element was laid out at', async () => {
    stubCanvas(sized);
    const { fillBetween } = await load();
    const physics = title('Physics');

    fillBetween(physics, 0, 20, 18);

    expect(physics.style.height).toBe('20px');
  });

  it('draws letters too tall for the room smaller and centres them in it', async () => {
    stubCanvas(sized);
    const { fillBetween } = await load();
    const physics = title('Physics');

    fillBetween(physics, 0, 20, 18);

    /* Letters 25.65 tall at 28.5px stand 18 tall at 0.7018, 14 rows above the baseline and 4 below, which moves onto 15 */
    expect(physics.style.transform).toBe('translateY(-55.35px) scale(0.7018, 0.7018)');
  });

  it('draws letters that already run the width narrower so they stand taller', async () => {
    stubCanvas(sized);
    const { fillBetween } = await load();
    const physics = title('Physics');

    fillBetween(physics, 0, 30, 28);

    /* Twenty-eight is room for letters 1.0916 times as tall as they are laid out */
    expect(physics.style.transform).toMatch(/scale\(1\.0025, 1\.0916\)$/);
  });

  it('draws letters no narrower than three fifths of their width', async () => {
    stubCanvas(sized);
    const { fillBetween } = await load();
    const physics = title('Physics');

    fillBetween(physics, 0, 60, 54);

    /* Fifty-four would take 2.105 times their height, which is further than three fifths of their width allows */
    expect(physics.style.transform).toMatch(/scale\(1\.0025, 1\.6708\)$/);
  });

  it('draws letters no wider than the share of the width it is given', async () => {
    stubCanvas(sized);
    const { fillBetween } = await load();
    const physics = title('Physics');

    fillBetween(physics, 0, 60, 54, 0.9);

    /* Nine tenths of the width is room for 0.9023 of the 99.75 they run across, and three fifths of that for 1.5038 down */
    expect(physics.style.transform).toMatch(/scale\(0\.9023, 1\.5038\)$/);
  });

  it('draws letters narrower than three fifths of their width where a lower limit is given', async () => {
    stubCanvas(sized);
    const { fillBetween } = await load();
    const physics = title('Physics');

    fillBetween(physics, 0, 60, 54, 1, 0.55);

    /* Down to 0.55 of their width, they stand 1.8227 times as tall where fifty-four would take 2.105 */
    expect(physics.style.transform).toMatch(/scale\(1\.0025, 1\.8227\)$/);
  });

  it('gives the scale the letters are drawn at and how tall they then stand, short of a room they cannot fill', async () => {
    stubCanvas(sized);
    const { fillBetween } = await load();
    const physics = title('Physics');

    const filled = fillBetween(physics, 0, 60, 54);

    /* Letters 25.65 tall drawn 100 / 99.75 times as wide and five thirds of that as tall */
    const across = 100 / 99.75;
    expect(filled).toEqual({
      across: expect.closeTo(across, 6),
      down: expect.closeTo(across / 0.6, 6),
      tall: expect.closeTo((25.65 * across) / 0.6, 6),
    });
  });

  it('keeps two lines at the size they were laid out at, the second two ninths of it below the first\'s letters', async () => {
    stubCanvas(sized);
    const { fillBetween } = await load();
    const deck = title('DDDDD DDDD');

    fillBetween(deck, 0, 30, 20);

    expect(deck.style.fontSize).toBe('16px');
    expect(parseFloat(deck.style.lineHeight)).toBeCloseTo(0.2 + 0.7 + 2 / 9, 6);
  });

  it('draws two lines as wide as the wider of them allows, and taller to fill the room', async () => {
    stubCanvas(sized);
    const { fillBetween } = await load();
    const deck = title('DDDD DDDDD');

    fillBetween(deck, 0, 100, 90);

    /* The second line's 40 across are drawn the width at 2.5 times, and the two lines' 32.356 drawn 90 tall */
    expect(deck.style.transform).toMatch(/scale\(2\.5000, 2\.7816\)$/);
  });

  it('leaves the element alone where there is no canvas to measure with', async () => {
    const { fillBetween } = await load();
    const physics = title('Physics');

    const filled = fillBetween(physics, 0, 100, 90);

    expect(filled).toBeNull();
    expect(physics.style.fontSize).toBe('16px');
    expect(physics.style.height).toBe('');
  });
});

describe('fontPlace', () => {
  /* A font reaching 15 above the baseline of its lines and 4 below */
  const font = () => stubCanvas({ fontBoundingBoxAscent: 15, fontBoundingBoxDescent: 4 });

  it('gives how far the font reaches above and below the baseline of its lines', async () => {
    font();
    const { fontPlace } = await load();

    const place = fontPlace(element('Text'));

    expect(place).toMatchObject({ ascent: 15, descent: 4 });
  });

  it('sets the baseline below the ascent and half the leading, rounding the half above down', async () => {
    /* In a line 24 tall the 5 of leading leaves 2 above the ascent, and in one 18 tall the 1 short takes 1 from above it */
    font();
    const { fontPlace } = await load();

    const place = fontPlace(element('Text'));

    expect([place?.baseline(24), place?.baseline(18)]).toEqual([17, 14]);
  });

  it('gives nothing where there is no canvas to measure with', async () => {
    const { fontPlace } = await load();

    expect(fontPlace(element('Text'))).toBeNull();
  });
});

describe('blockExtent', () => {
  /* A font reaching 15 above the baseline and 4 below, its letters 11 above it and 3 below */
  const font = () => stubCanvas({
    fontBoundingBoxAscent: 15, fontBoundingBoxDescent: 4, actualBoundingBoxAscent: 11, actualBoundingBoxDescent: 3,
  });

  it('places the first and last lines\' letters by the line height from the top of the content', async () => {
    font();
    const { blockExtent } = await load();
    const text = element('Deck One');
    text.style.lineHeight = '20px';
    text.getBoundingClientRect = () => new DOMRect(0, 100, 50, 40);
    twoLines(text, 100, 120.3);

    /* Lines 20 tall from 100 stand on 115 and 135, wherever the boxes of their letters stand */
    expect(blockExtent(text)).toEqual({ top: 104, bottom: 138 });
  });

  it('gives nothing where the element\'s line height is not set', async () => {
    font();
    const { blockExtent } = await load();
    const text = element('Deck One');
    twoLines(text, 100, 120.3);

    expect(blockExtent(text)).toBeNull();
  });

  it('gives nothing where there is no canvas to measure with', async () => {
    const { blockExtent } = await load();
    const text = element('Deck One');
    text.style.lineHeight = '20px';
    twoLines(text, 100, 120.3);

    expect(blockExtent(text)).toBeNull();
  });
});

describe('lineWidths', () => {
  it('gives how wide each line of letters runs, from its first letter\'s box to its last\'s', async () => {
    /* Letters 5 wide on two lines centred in a box 80 wide, four from 30 and three from 32.5 */
    const { lineWidths } = await load();
    const text = element('Deck One');
    layOut(at => (at < 4 ? new DOMRect(30 + at * 5, 100, 5, 20) : new DOMRect(32.5 + (at - 5) * 5, 120, 5, 20)));

    expect(lineWidths(text)).toEqual([20, 15]);
  });

  it('gives no lines where nothing is laid out, as under jsdom', async () => {
    const { lineWidths } = await load();

    expect(lineWidths(element('Deck One'))).toEqual([]);
  });
});

describe('reachOf', () => {
  it('gives how far some letters reach above and below their baseline as shares of the font size', async () => {
    /* Capitals reach 12 above the baseline at 16px and a g's tail 4 below it */
    stubCanvas(text => ({ actualBoundingBoxAscent: /[A-Z]/.test(text) ? 12 : 8, actualBoundingBoxDescent: /g/.test(text) ? 4 : 0 }));
    const { reachOf } = await load();

    expect(reachOf(element('name'), 'Hg')).toEqual({ up: 0.75, down: 0.25 });
  });

  it('gives nothing where there is no canvas to measure with', async () => {
    const { reachOf } = await load();

    expect(reachOf(element('name'), 'Hg')).toBeNull();
  });
});

describe('letterRun', () => {
  /* Letters 12 wide at 16px */
  const font = () => stubCanvas(text => ({ width: 12 * text.length }));

  it('gives how wide a letter runs and the spacing set after it, as shares of the font size', async () => {
    font();
    const { letterRun } = await load();
    const text = element('DDDD');
    text.style.letterSpacing = '0.24px';

    expect(letterRun(text, 'D')).toEqual({ per: 0.75, spacing: 0.015 });
  });

  it('counts no spacing where the letters are set without any', async () => {
    font();
    const { letterRun } = await load();

    expect(letterRun(element('DDDD'), 'D')).toEqual({ per: 0.75, spacing: 0 });
  });

  it('gives nothing where there is no canvas to measure with', async () => {
    const { letterRun } = await load();

    expect(letterRun(element('DDDD'), 'D')).toBeNull();
  });
});

describe('textWidth', () => {
  it('gives how wide some text runs in the element\'s font at a size', async () => {
    /* Letters half their size wide, six of them at 20px */
    stubCanvas(text => ({ width: 8 * text.length }));
    const { textWidth } = await load();

    expect(textWidth(element('Delete'), 'Delete', 20)).toBe(60);
  });

  it('gives nothing where there is no canvas to measure with', async () => {
    const { textWidth } = await load();

    expect(textWidth(element('Delete'), 'Delete', 20)).toBeNull();
  });
});

describe('drawnLetters', () => {
  it('sets the box on a whole pixel and its line on a whole pixel of the box, the letters about it as drawn', async () => {
    /* A box from 0.4 with its line's box 2 down it is drawn from 0, its line 18 below, so its letters show from 7 to 22 */
    drawnFont();
    const { drawnLetters } = await load();
    const text = element('Edit');
    text.getBoundingClientRect = () => new DOMRect(0, 0.4, 30, 20);
    oneLine(2.4);

    expect(drawnLetters(text)).toEqual({ top: 7, bottom: 22 });
  });

  it('sets each of two lines on a whole pixel of its own, from the top of the first\'s letters to the tails of the last', async () => {
    /* A box from 98.6, drawn from 99, with lines whose boxes start 1.4 and 21.7 down it, which stand on 116 and 136 */
    drawnFont();
    const { drawnLetters } = await load();
    const text = element('Deck One');
    text.getBoundingClientRect = () => new DOMRect(0, 98.6, 30, 40);
    twoLines(text, 100, 120.3);

    expect(drawnLetters(text)).toEqual({ top: 105, bottom: 140 });
  });

  it('measures the letters from where their line falls where transforms nest, as their pixels cannot be followed', async () => {
    drawnFont();
    const { drawnLetters } = await load();
    const outer = document.createElement('div');
    outer.style.transform = 'matrix(1.25, 0, 0, 1.25, 0, 0)';
    const inner = document.createElement('div');
    inner.style.transform = 'matrix(1.5, 0, 0, 1.5, 0, 0)';
    inner.getBoundingClientRect = () => new DOMRect(0, 90, 200, 100);
    document.body.appendChild(outer).appendChild(inner);
    const text = element('Edit');
    inner.appendChild(text);
    text.style.width = '64px';
    Object.defineProperty(text, 'currentCSSZoom', { value: 1 });
    text.getBoundingClientRect = () => new DOMRect(0, 100.25, 120, 37.5);
    oneLine(103.75);

    /* At 1.875 times, the line falls 30 below its box at 103.75, on 133.75, and its letters are 20.625 up and 7.5 down */
    expect(drawnLetters(text)).toEqual({ top: 134 - 20.625, bottom: 134 + 7.5 });
  });

  it('measures an element afresh when its text changes', async () => {
    /* Capitals reach 11 above the baseline and small letters without stems 8 */
    stubCanvas(text => ({ fontBoundingBoxAscent: 16, actualBoundingBoxAscent: /[A-Z]/.test(text) ? 11 : 8 }));
    const { drawnLetters } = await load();
    const text = element('ace');
    oneLine(2);
    drawnLetters(text);

    text.textContent = 'Ace';

    expect(drawnLetters(text)?.top).toBe(18 - 11);
  });

  it('gives nothing where there is no canvas to measure with', async () => {
    const { drawnLetters } = await load();

    expect(drawnLetters(element('Edit'))).toBeNull();
  });
});

describe('centreDrawnBetween', () => {
  it('moves the letters to show midway between two heights, their line on a whole pixel, the higher where two come close', async () => {
    /* Letters 15 tall on 18 would stand on 23.6 midway between 0 and 40.2, so on 23, 0.6 high, rather than 24, 0.4 low */
    drawnFont();
    const { centreDrawnBetween } = await load();
    const text = element('Edit');
    oneLine(2);

    centreDrawnBetween(text, 0, 40.2);

    expect(text.style.transform).toBe('translateY(5.00px)');
  });

  it('leaves the letters where they are when either height is not known', async () => {
    drawnFont();
    const { centreDrawnBetween } = await load();
    const text = element('Edit');
    text.style.transform = 'translateY(3px)';
    oneLine(2);

    centreDrawnBetween(text, null, 40);

    expect(text.style.transform).toBe('');
  });

  it('leaves the letters where they are when there is no canvas to measure with', async () => {
    const { centreDrawnBetween } = await load();
    const text = element('Edit');
    text.style.transform = 'translateY(3px)';
    oneLine(2);

    centreDrawnBetween(text, 0, 40, 0.9);

    expect(text.style.transform).toBe('');
  });

  it('draws the letters a share narrower about their middle where asked, standing where they would down the page', async () => {
    drawnFont();
    const { centreDrawnBetween } = await load();
    const text = element('Edit');
    oneLine(2);

    centreDrawnBetween(text, 0, 40, 0.9);

    expect(text.style.transform).toBe('translateY(5.00px) scaleX(0.9000)');
  });
});

describe('once a font finishes loading', () => {
  /* A page whose web font arrives after its letters are first measured, those letters 11 above the baseline until then */
  const beforeTheFont = async () => {
    const fonts = new EventTarget();
    Object.defineProperty(document, 'fonts', { value: fonts, configurable: true });
    const font = { fontBoundingBoxAscent: 16, actualBoundingBoxAscent: 11, actualBoundingBoxDescent: 4 };
    stubCanvas(() => font);
    const text = element('Edit');
    oneLine(2);
    const loaded = () => {
      font.actualBoundingBoxAscent = 12;
      fonts.dispatchEvent(new Event('loadingdone'));
    };
    return { ...(await load()), text, loaded };
  };

  it('measures where an element\'s lines are drawn afresh', async () => {
    const { drawnLetters, text, loaded } = await beforeTheFont();
    drawnLetters(text);

    loaded();

    expect(drawnLetters(text)?.top).toBe(18 - 12);
  });

  it('measures how far drawn letters reach afresh', async () => {
    const { drawnExtent, text, loaded } = await beforeTheFont();
    drawnExtent(text);

    loaded();

    expect(drawnExtent(text)?.top).toBe(18 - 12);
  });
});