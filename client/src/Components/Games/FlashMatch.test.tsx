import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import FlashMatch from './FlashMatch';
import { Deck } from '../CreateDecks/types';

const DECKS: Deck[] = [
  {
    _id: 'd1', userId: 'u1', name: 'Deck', description: 'desc',
    flashcards: [
      { _id: 'f1', question: 'Q1', answer: 'A1' },
      { _id: 'f2', question: 'Q2', answer: 'A2' },
    ],
  },
];

const THREE_CARDS: Deck[] = [
  {
    _id: 'd1', userId: 'u1', name: 'Deck', description: 'desc',
    flashcards: [
      { _id: 'f1', question: 'Q1', answer: 'A1' },
      { _id: 'f2', question: 'Q2', answer: 'A2' },
      { _id: 'f3', question: 'Q3', answer: 'A3' },
    ],
  },
];

const renderGame = (decks: Deck[] = DECKS) =>
  render(<MemoryRouter><FlashMatch selectedDecks={decks} /></MemoryRouter>);

/* Questions and answers are both tiles named by their text */
const tile = (text: string) => screen.getByRole('button', { name: text });

const pair = (question: string, answer: string) => {
  fireEvent.click(tile(question));
  fireEvent.click(tile(answer));
};

/* Pairs Q1 with A2 and lets the red flash run its course */
const missOnce = () => {
  pair('Q1', 'A2');
  act(() => { vi.advanceTimersByTime(700); });
};

const totals = () => screen.getByRole('status');
const mistakes = () => totals().textContent?.split('Mistakes:')[1];

/* Stubs a width where Element defines it, as jsdom lays nothing out */
const stubWidth = (property: 'clientWidth' | 'scrollWidth', width: number) =>
  vi.spyOn(Element.prototype, property, 'get').mockReturnValue(width);

/* Lays the prompt's question out on one line this wide, under a return control 200 wide */
const questionRuns = (width: number) =>
  vi.spyOn(Element.prototype, 'scrollWidth', 'get').mockImplementation(function (this: Element) {
    return this.classList.contains('fm-prompt') ? width : 200;
  });

/* Stands in for the FontFaceSet jsdom lacks, with the web font loading until the test lets it arrive */
const fontStillLoading = () => {
  let arrive = () => {};
  const ready = new Promise<void>(resolve => { arrive = resolve; });
  Object.defineProperty(document, 'fonts', { configurable: true, value: { status: 'loading', ready } });
  return arrive;
};

const LONG = 'Mitosis runs through prophase, metaphase, anaphase and telophase, so what is the name of the whole process?';
const LONG_DECK: Deck[] = [{ ...DECKS[0], flashcards: [{ _id: 'f1', question: LONG, answer: 'A1' }, { _id: 'f2', question: `${LONG} Again?`, answer: 'A2' }] }];
const wholeToggle = () => screen.queryByRole('button', { name: 'Whole question' });

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  delete (document as { fonts?: unknown }).fonts;
});

describe('FlashMatch', () => {
  it('shows the empty-state hint when no decks are selected', () => {
    renderGame([]);
    expect(
      screen.getByText('No flashcards available. Please select a deck from the home page.')
    ).toBeInTheDocument();
  });

  it('deals every question and every answer with nothing matched yet', () => {
    renderGame();

    for (const text of ['Q1', 'Q2', 'A1', 'A2']) expect(tile(text)).toBeInTheDocument();
    expect(totals()).toHaveTextContent('Matched:0 / 2');
  });

  it('lays each column out in rows as wide as it holds, the remainder last', () => {
    /* 300px holds two 132px cards per row, so three cards split 2 + 1 in both columns */
    stubWidth('clientWidth', 300);

    const { container } = renderGame(THREE_CARDS);

    for (const column of container.querySelectorAll('.fm-col-cards')) {
      const counts = Array.from(column.querySelectorAll('.card-row')).map(
        row => row.querySelectorAll('.flashcard').length
      );
      expect(counts).toEqual([2, 1]);
    }
  });

  it('deals every answer exactly once, in an order the shuffle decides', () => {
    /* Math.random pinned to 0 makes Fisher-Yates deterministic, so the deal is known in advance */
    vi.spyOn(Math, 'random').mockReturnValue(0);

    renderGame(THREE_CARDS);

    const answers = screen.getAllByRole('button', { name: /^A\d$/ }).map(answer => answer.textContent);
    expect(answers).toEqual(['A2', 'A3', 'A1']);
  });

  it('selects a picked question and asks for its match, and lets it go when picked again', () => {
    renderGame();

    fireEvent.click(tile('Q1'));
    expect(tile('Q1')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Match:')).toHaveTextContent('Match: Q1');

    fireEvent.click(tile('Q1'));
    expect(tile('Q1')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByText('Match:')).not.toBeInTheDocument();
  });

  it('offers a way out of a pick, and only once one has been made', () => {
    renderGame();

    expect(screen.queryByRole('button', { name: 'Unsure? Pick another card' })).not.toBeInTheDocument();

    fireEvent.click(tile('Q1'));
    fireEvent.click(screen.getByRole('button', { name: 'Unsure? Pick another card' }));

    expect(tile('Q1')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByText('Match:')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Unsure? Pick another card' })).not.toBeInTheDocument();
  });

  it('counts mistakes with a face that sours as they mount', () => {
    vi.useFakeTimers();
    renderGame();
    const shown = [mistakes()];

    for (let mistake = 1; mistake <= 10; mistake += 1) {
      missOnce();
      shown.push(mistakes());
    }

    expect(shown).toEqual(['N/A', '1 🙂', '2 🙂', '3 😕', '4 😕', '5 😕', '6 😣', '7 😣', '8 😣', '9 😣', '10 🔥']);
  });

  it('offers no toggle for a question that fits on the line under the return control', () => {
    questionRuns(150);
    renderGame();

    fireEvent.click(tile('Q1'));

    expect(wholeToggle()).not.toBeInTheDocument();
  });

  it('shows the whole of a long question, and one line of it under the return control once toggled', () => {
    questionRuns(900);
    renderGame(LONG_DECK);
    fireEvent.click(tile(LONG));
    expect(screen.getByText('Match:')).toHaveTextContent(`Match: ${LONG}`);
    expect(wholeToggle()).toHaveAttribute('aria-expanded', 'true');
    expect(wholeToggle()).toHaveAttribute('aria-controls', screen.getByText('Match:').id);

    fireEvent.click(wholeToggle()!);
    expect(wholeToggle()).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(wholeToggle()!);
    expect(wholeToggle()).toHaveAttribute('aria-expanded', 'true');
  });

  it('keeps the one-line prompt for the next question picked', () => {
    questionRuns(900);
    renderGame(LONG_DECK);
    fireEvent.click(tile(LONG));
    fireEvent.click(wholeToggle()!);

    fireEvent.click(tile(`${LONG} Again?`));

    expect(screen.getByText('Match:')).toHaveTextContent(`Match: ${LONG} Again?`);
    expect(wholeToggle()).toHaveAttribute('aria-expanded', 'false');
  });

  it('offers the toggle once the web font arrives and sets the question wider than the line', async () => {
    const fontArrives = fontStillLoading();
    questionRuns(150);
    renderGame(LONG_DECK);
    fireEvent.click(tile(LONG));
    expect(wholeToggle()).not.toBeInTheDocument();
    questionRuns(900);

    await act(async () => fontArrives());

    expect(wholeToggle()).toBeInTheDocument();
  });

  it('offers the toggle once a narrower window sets the question wider than the line', () => {
    questionRuns(150);
    renderGame(LONG_DECK);
    fireEvent.click(tile(LONG));
    questionRuns(900);

    act(() => { window.dispatchEvent(new Event('resize')); });

    expect(wholeToggle()).toBeInTheDocument();
  });

  it('a correct answer removes the pair from both columns', () => {
    renderGame();

    pair('Q1', 'A1');

    expect(screen.queryByRole('button', { name: 'Q1' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'A1' })).not.toBeInTheDocument();
    expect(totals()).toHaveTextContent('Matched:1 / 2');
    expect(screen.queryByText('Match:')).not.toBeInTheDocument();
  });

  it('ignores an answer picked before a question', () => {
    renderGame();

    fireEvent.click(tile('A1'));

    expect(totals()).toHaveTextContent('Matched:0 / 2');
    expect(totals()).toHaveTextContent('Mistakes:N/A');
    expect(tile('A1')).toBeInTheDocument();
  });

  it('a wrong answer flashes red, counts a mistake, then releases the selection', () => {
    vi.useFakeTimers();
    renderGame();

    pair('Q1', 'A2');

    expect(tile('A2')).toHaveClass('wrong-flash');
    expect(totals()).toHaveTextContent('Mistakes:1');

    act(() => { vi.advanceTimersByTime(700); });

    expect(tile('Q1')).toHaveAttribute('aria-pressed', 'false');
    expect(tile('A2')).not.toHaveClass('wrong-flash');
    expect(totals()).toHaveTextContent('Matched:0 / 2');
  });

  it('ignores every pick while a wrong pair is flashing', () => {
    vi.useFakeTimers();
    renderGame();
    pair('Q1', 'A2');

    fireEvent.click(tile('A1'));
    fireEvent.click(tile('Q2'));

    expect(totals()).toHaveTextContent('Matched:0 / 2');
    expect(tile('Q1')).toHaveAttribute('aria-pressed', 'true');
    expect(tile('Q2')).toHaveAttribute('aria-pressed', 'false');
  });

  describe('a deck where two cards share an answer', () => {
    const DUPES: Deck[] = [
      {
        _id: 'd1', userId: 'u1', name: 'Dupes', description: 'desc',
        flashcards: [
          { _id: 'f1', question: 'Capital of France?', answer: 'Paris' },
          { _id: 'f2', question: 'Where is the Louvre?', answer: 'Paris' },
          { _id: 'f3', question: 'Capital of Japan?', answer: 'Tokyo' },
        ],
      },
    ];

    /* Math.random pinned to 0 deals the Louvre's Paris first, so France is paired with the other card's answer */
    beforeEach(() => { vi.spyOn(Math, 'random').mockReturnValue(0); });

    it('retires one question and one answer per match, not every card that reads alike', () => {
      renderGame(DUPES);

      fireEvent.click(tile('Capital of France?'));
      fireEvent.click(screen.getAllByRole('button', { name: 'Paris' })[0]);

      expect(screen.queryByRole('button', { name: 'Capital of France?' })).not.toBeInTheDocument();
      expect(tile('Where is the Louvre?')).toBeInTheDocument();
      expect(screen.getAllByRole('button', { name: 'Paris' })).toHaveLength(1);
      expect(totals()).toHaveTextContent('Matched:1 / 3');
    });

    it('reaches the end of the round', () => {
      renderGame(DUPES);

      for (const [question, answer] of [
        ['Capital of France?', 'Paris'],
        ['Where is the Louvre?', 'Paris'],
        ['Capital of Japan?', 'Tokyo'],
      ]) {
        fireEvent.click(tile(question));
        fireEvent.click(screen.getAllByRole('button', { name: answer })[0]);
      }

      expect(screen.getByText('3 / 3')).toBeInTheDocument();
      expect(screen.getByText('All pairs matched!')).toBeInTheDocument();
    });
  });

  it('cancels a pending flash when the board is left', () => {
    vi.useFakeTimers();
    const view = renderGame();
    pair('Q1', 'A2');
    expect(vi.getTimerCount()).toBe(1);

    view.unmount();

    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    ['no mistakes', 0, 'All pairs matched!'],
    ['one mistake', 1, 'All pairs matched — with 1 mistake'],
    ['two mistakes', 2, 'All pairs matched — with 2 mistakes'],
  ])('sums up a round finished with %s', (_, count, summary) => {
    vi.useFakeTimers();
    renderGame();

    for (let mistake = 0; mistake < count; mistake += 1) missOnce();
    pair('Q1', 'A1');
    pair('Q2', 'A2');

    expect(screen.getByText('2 / 2')).toBeInTheDocument();
    expect(screen.getByText(summary)).toBeInTheDocument();
  });

  it('deals a fresh round from Play Again', () => {
    vi.useFakeTimers();
    renderGame();
    missOnce();
    pair('Q1', 'A1');
    pair('Q2', 'A2');

    fireEvent.click(screen.getByRole('button', { name: 'Play Again' }));

    expect(totals()).toHaveTextContent('Matched:0 / 2');
    expect(totals()).toHaveTextContent('Mistakes:N/A');
    for (const text of ['Q1', 'Q2', 'A1', 'A2']) expect(tile(text)).toBeInTheDocument();
  });
});

describe('keyboard and screen readers', () => {
  it('plays a whole pair from the keyboard', () => {
    renderGame();

    fireEvent.keyDown(tile('Q1'), { key: 'Enter' });
    expect(tile('Q1')).toHaveAttribute('aria-pressed', 'true');

    fireEvent.keyDown(tile('A1'), { key: ' ' });

    expect(screen.queryByRole('button', { name: 'Q1' })).not.toBeInTheDocument();
    expect(totals()).toHaveTextContent(/Matched:\s*1 \/ 2/);
  });

  it('keeps the answers out of the tab order until a question is picked', () => {
    renderGame();
    expect(tile('A1')).toHaveAttribute('tabindex', '-1');
    expect(tile('A1')).toHaveAttribute('aria-disabled', 'true');

    fireEvent.click(tile('Q1'));

    expect(tile('A1')).toHaveAttribute('tabindex', '0');
    expect(tile('A1')).not.toHaveAttribute('aria-disabled');
  });

  it('moves focus to the next question after a match, and to Play Again after the last', () => {
    renderGame();

    fireEvent.keyDown(tile('Q1'), { key: 'Enter' });
    fireEvent.keyDown(tile('A1'), { key: 'Enter' });
    expect(tile('Q2')).toHaveFocus();

    fireEvent.keyDown(tile('Q2'), { key: 'Enter' });
    fireEvent.keyDown(tile('A2'), { key: 'Enter' });
    expect(screen.getByRole('button', { name: 'Play Again' })).toHaveFocus();
  });
});