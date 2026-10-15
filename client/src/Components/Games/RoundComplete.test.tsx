import { act, fireEvent, render, screen } from '@testing-library/react';
import RoundComplete from './RoundComplete';
import { drawnExtent, Extent } from '../Common/textInk';

/* Stands in for where each item's letters are drawn, as jsdom has no canvas to measure them with */
vi.mock('../Common/textInk', async importOriginal => ({
  ...(await importOriginal<typeof import('../Common/textInk')>()),
  drawnExtent: vi.fn(() => null),
}));

const renderPanel = (onRestart = () => {}) =>
  render(<RoundComplete score="4 / 5" message="Round complete!" onRestart={onRestart} />);

describe('RoundComplete', () => {
  it('shows the score and the line about the round', () => {
    renderPanel();
    expect(screen.getByText('4 / 5')).toBeInTheDocument();
    expect(screen.getByText('Round complete!')).toBeInTheDocument();
  });

  it('starts the round again from Play Again', () => {
    const onRestart = vi.fn();
    renderPanel(onRestart);
    fireEvent.click(screen.getByRole('button', { name: 'Play Again' }));
    expect(onRestart).toHaveBeenCalledTimes(1);
  });

  describe('spacing', () => {
    let letters: Record<string, Extent>;
    let panelBottom: number;

    const shifts = () => ['4 / 5', 'Round complete!', 'Play Again'].map(text => screen.getByText(text).style.transform);

    /* Stands in for the FontFaceSet jsdom lacks, with the web font loading until the test lets it arrive */
    const fontStillLoading = () => {
      let arrive = () => {};
      const ready = new Promise<void>(resolve => { arrive = resolve; });
      Object.defineProperty(document, 'fonts', { configurable: true, value: { status: 'loading', ready } });
      return arrive;
    };

    /* A borderless panel from 0 to panelBottom at a zoom of 1.25, with Play Again's box at 190 and its icon 5px down it */
    beforeEach(() => {
      letters = {
        '4 / 5': { top: 20, bottom: 60 },
        'Round complete!': { top: 100, bottom: 120 },
        'Play Again': { top: 200, bottom: 220 },
      };
      panelBottom = 300;
      vi.mocked(drawnExtent).mockImplementation(el => letters[el.textContent ?? ''] ?? null);
      vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
        return (this.classList.contains('play-again')
          ? { top: 190, bottom: 240, height: 50, width: 125 }
          : { top: 0, bottom: panelBottom, height: panelBottom, width: 125 }) as DOMRect;
      });
      const computed = window.getComputedStyle.bind(window);
      vi.spyOn(window, 'getComputedStyle').mockImplementation((el, pseudo) => {
        const own = pseudo ? { height: '24px' }
          : el.classList.contains('play-again') ? { width: '100px', height: '40px', borderTopWidth: '2px' }
          : { width: '100px' };
        return Object.defineProperties(computed(el), Object.fromEntries(Object.entries(own).map(([key, value]) => [key, { value }])));
      });
    });

    afterEach(() => {
      vi.restoreAllMocks();
      delete (document as { fonts?: unknown }).fonts;
    });

    it('spaces its items evenly, measuring Play Again from the top of its icon', () => {
      renderPanel();

      /* Play Again shows from 195, so 85 of the 300 show, leaving spaces of 53.75 and shifts given in unzoomed pixels */
      expect(shifts()).toEqual(['translateY(27.00px)', 'translateY(38.00px)', 'translateY(21.00px)']);
    });

    it('spaces them again when the window is resized', () => {
      renderPanel();
      panelBottom = 385;

      fireEvent(window, new Event('resize'));

      expect(shifts()).toEqual(['translateY(44.00px)', 'translateY(72.00px)', 'translateY(72.00px)']);
    });

    it('spaces them again once the web font has arrived', async () => {
      const fontArrives = fontStillLoading();
      renderPanel();
      /* The web font draws the line 5px taller than the fallback font */
      letters['Round complete!'] = { top: 100, bottom: 125 };

      await act(async () => fontArrives());

      expect(shifts()).toEqual(['translateY(26.00px)', 'translateY(36.00px)', 'translateY(22.00px)']);
    });
  });
});