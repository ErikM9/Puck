import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import FlashChoice from './FlashChoice';
import { Deck } from '../CreateDecks/types';

const DECKS: Deck[] = [
  {
    _id: 'd1', userId: 'u1', name: 'Deck', description: 'desc',
    flashcards: [
      { _id: 'f1', question: 'Q1', answer: 'A1' },
      { _id: 'f2', question: 'Q2', answer: 'A2' },
      { _id: 'f3', question: 'Q3', answer: 'A3' },
      { _id: 'f4', question: 'Q4', answer: 'A4' },
    ],
  },
];

const renderGame = (decks: Deck[] = DECKS) =>
  render(<MemoryRouter><FlashChoice selectedDecks={decks} /></MemoryRouter>);

/* The answers on offer, which are named A1 to A4 where the dialog's other control is not */
const options = () => within(screen.getByRole('dialog')).getAllByRole('button', { name: /^A\d$/ });

/* Answers the card for a question either correctly or with the first wrong option */
const answer = (question: string, correctly: boolean) => {
  fireEvent.click(screen.getByRole('button', { name: question }));
  const right = `A${question.slice(1)}`;
  fireEvent.click(options().find(option => (option.textContent === right) === correctly)!);
};

/* Stubs the board's width where Element defines it, as jsdom lays nothing out */
const stubWidth = (width: number) => vi.spyOn(Element.prototype, 'clientWidth', 'get').mockReturnValue(width);

afterEach(() => { vi.restoreAllMocks(); });

describe('FlashChoice', () => {
  it('shows the empty-state hint when no decks are selected', () => {
    renderGame([]);
    expect(
      screen.getByText('No flashcards available. Please select a deck from the home page.')
    ).toBeInTheDocument();
  });

  it('puts every question on the board with the score at zero', () => {
    renderGame();

    for (const question of ['Q1', 'Q2', 'Q3', 'Q4']) {
      expect(screen.getByRole('button', { name: question })).toBeInTheDocument();
    }
    expect(screen.getByRole('status')).toHaveTextContent('Correct: 0 / 4');
  });

  it('lays the board out in rows as wide as it holds, the remainder last', () => {
    /* 300px of board holds two 132px cards, so three cards make a row of two and a row of one */
    stubWidth(300);

    const { container } = renderGame([{ ...DECKS[0], flashcards: DECKS[0].flashcards.slice(0, 3) }]);

    const counts = Array.from(container.querySelectorAll<HTMLElement>('.card-row')).map(
      row => within(row).getAllByRole('button').length
    );
    expect(counts).toEqual([2, 1]);
  });

  it('offers only as many options as the deck has distinct answers', () => {
    renderGame([
      {
        _id: 'd1', userId: 'u1', name: 'Repeats', description: 'desc',
        flashcards: [
          { _id: 'f1', question: 'Q1', answer: 'A1' },
          { _id: 'f2', question: 'Q2', answer: 'A2' },
          { _id: 'f3', question: 'Q3', answer: 'A2' },
        ],
      },
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'Q1' }));

    expect(options().map(option => option.textContent).sort()).toEqual(['A1', 'A2']);
  });

  it('mixes the right answer in with two wrong ones drawn from the deck', () => {
    /* Math.random pinned to 0 makes Fisher-Yates deterministic, so the draw and the mix are known in advance */
    vi.spyOn(Math, 'random').mockReturnValue(0);
    renderGame();

    fireEvent.click(screen.getByRole('button', { name: 'Q1' }));

    expect(options().map(option => option.textContent)).toEqual(['A4', 'A1', 'A3']);
  });

  it('opens a picked question in a dialog named after it', () => {
    renderGame();

    fireEvent.click(screen.getByRole('button', { name: 'Q2' }));

    expect(screen.getByRole('dialog', { name: 'Question: Q2' })).toBeInTheDocument();
  });

  it('closes the dialog from its backdrop but not from the dialog itself, without scoring', () => {
    const { container } = renderGame();
    fireEvent.click(screen.getByRole('button', { name: 'Q1' }));

    fireEvent.click(screen.getByText('Question:'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.click(container.querySelector('.fc-overlay') as HTMLElement);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Correct: 0 / 4');
    expect(screen.getByRole('button', { name: 'Q1' })).not.toHaveAttribute('aria-disabled');
  });

  it('"Return to questions" closes the dialog without scoring', () => {
    renderGame();
    fireEvent.click(screen.getByRole('button', { name: 'Q1' }));

    fireEvent.click(screen.getByRole('button', { name: 'Return to questions' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Correct: 0 / 4');
    expect(screen.getByRole('button', { name: 'Q1' })).not.toHaveAttribute('aria-disabled');
  });

  it('a correct pick scores the card, marks it green, and locks it', () => {
    renderGame();

    answer('Q1', true);

    expect(screen.getByRole('status')).toHaveTextContent('Correct: 1 / 4');
    const card = screen.getByRole('button', { name: 'Q1 (answered correctly)' });
    expect(card).toHaveClass('answered-correct');

    fireEvent.click(card);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('a wrong pick marks the card red with no retry and no score', () => {
    renderGame();

    answer('Q2', false);

    expect(screen.getByRole('status')).toHaveTextContent('Correct: 0 / 4');
    const card = screen.getByRole('button', { name: 'Q2 (answered wrongly)' });
    expect(card).toHaveClass('answered-wrong');

    fireEvent.click(card);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('ends the round with its score once every card is answered', () => {
    renderGame();

    answer('Q1', false);
    answer('Q2', true);
    answer('Q3', true);
    answer('Q4', true);

    expect(screen.getByText('3 / 4')).toBeInTheDocument();
    expect(screen.getByText('Round complete!')).toBeInTheDocument();
  });

  it('starts a fresh round from Play Again', () => {
    renderGame();
    for (const question of ['Q1', 'Q2', 'Q3', 'Q4']) answer(question, true);

    fireEvent.click(screen.getByRole('button', { name: 'Play Again' }));

    expect(screen.getByRole('status')).toHaveTextContent('Correct: 0 / 4');
    for (const question of ['Q1', 'Q2', 'Q3', 'Q4']) {
      expect(screen.getByRole('button', { name: question })).not.toHaveAttribute('aria-disabled');
    }
  });
});

describe('keyboard and screen readers', () => {
  it('opens a question with Enter and puts focus on the first option', () => {
    renderGame();

    fireEvent.keyDown(screen.getByRole('button', { name: 'Q1' }), { key: 'Enter' });

    expect(screen.getByRole('dialog', { name: 'Question: Q1' })).toBeInTheDocument();
    expect(options()[0]).toHaveFocus();
  });

  it('answers from the keyboard, says how it went, and hands focus back to the question', () => {
    renderGame();
    fireEvent.keyDown(screen.getByRole('button', { name: 'Q1' }), { key: 'Enter' });

    fireEvent.keyDown(screen.getByRole('button', { name: 'A1' }), { key: ' ' });

    const tile = screen.getByRole('button', { name: 'Q1 (answered correctly)' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(tile).toHaveAttribute('aria-disabled', 'true');
    expect(tile).toHaveFocus();
  });

  it('closes the options with Escape without answering', () => {
    renderGame();
    fireEvent.keyDown(screen.getByRole('button', { name: 'Q2' }), { key: 'Enter' });

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Q2' })).not.toHaveAttribute('aria-disabled');
  });

  it('moves focus to Play Again once the last question is answered', () => {
    renderGame();

    for (const question of ['Q1', 'Q2', 'Q3', 'Q4']) {
      fireEvent.keyDown(screen.getByRole('button', { name: question }), { key: 'Enter' });
      fireEvent.keyDown(screen.getByRole('button', { name: `A${question.slice(1)}` }), { key: 'Enter' });
    }

    expect(screen.getByRole('button', { name: 'Play Again' })).toHaveFocus();
  });
});