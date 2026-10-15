import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import FlashFlip from './FlashFlip';
import { Deck } from '../CreateDecks/types';

const DECKS: Deck[] = [
  {
    _id: 'd1',
    userId: 'u1',
    name: 'Deck',
    description: 'desc',
    flashcards: [
      { _id: 'f1', question: 'Q1', answer: 'A1' },
      { _id: 'f2', question: 'Q2', answer: 'A2' },
      { _id: 'f3', question: 'Q3', answer: 'A3' },
    ],
  },
];

const renderGame = (decks: Deck[] = DECKS) =>
  render(
    <MemoryRouter>
      <FlashFlip selectedDecks={decks} />
    </MemoryRouter>
  );

/* The card is a button named by the face it shows, as the other face is hidden from screen readers */
const card = (face: string) => screen.getByRole('button', { name: face });
const press = (name: 'Next' | 'Prev') => fireEvent.click(screen.getByRole('button', { name }));

describe('FlashFlip', () => {
  it('shows the empty-state hint when no decks are selected', () => {
    renderGame([]);
    expect(
      screen.getByText('No flashcards available. Please select a deck from the home page.')
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to Home' })).toHaveAttribute('href', '/home');
  });

  it('starts on the first question with the counter and flip hint', () => {
    renderGame();
    expect(card('Q1')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('1 / 3')).toBeInTheDocument();
    expect(screen.getByText('Tap to reveal the answer')).toBeInTheDocument();
  });

  it('turns the card over to its answer and back with a click', () => {
    renderGame();

    fireEvent.click(card('Q1'));
    expect(card('A1')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Tap to see the question')).toBeInTheDocument();

    fireEvent.click(card('A1'));
    expect(card('Q1')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('Tap to reveal the answer')).toBeInTheDocument();
  });

  it('draws its cards from every selected deck at once', () => {
    renderGame([
      DECKS[0],
      {
        _id: 'd2', userId: 'u1', name: 'Second', description: 'desc',
        flashcards: [{ _id: 'f4', question: 'Q4', answer: 'A4' }],
      },
    ]);

    expect(screen.getByText('1 / 4')).toBeInTheDocument();
  });

  it('a single-card deck wraps around to itself in both directions', () => {
    renderGame([
      {
        _id: 'd1', userId: 'u1', name: 'Solo', description: 'desc',
        flashcards: [{ _id: 'f1', question: 'Only', answer: 'A' }],
      },
    ]);

    press('Next');
    expect(screen.getByText('1 / 1')).toBeInTheDocument();

    press('Prev');
    expect(screen.getByText('1 / 1')).toBeInTheDocument();
    expect(card('Only')).toBeInTheDocument();
  });

  it('steps forward with Next and back with Prev', () => {
    renderGame();

    press('Next');
    expect(card('Q2')).toBeInTheDocument();
    expect(screen.getByText('2 / 3')).toBeInTheDocument();

    press('Prev');
    expect(card('Q1')).toBeInTheDocument();
    expect(screen.getByText('1 / 3')).toBeInTheDocument();
  });

  it('wraps past either end of the deck', () => {
    renderGame();

    press('Prev');
    expect(card('Q3')).toBeInTheDocument();
    expect(screen.getByText('3 / 3')).toBeInTheDocument();

    press('Next');
    expect(card('Q1')).toBeInTheDocument();
    expect(screen.getByText('1 / 3')).toBeInTheDocument();
  });

  it('shows the question side of each card it moves to, in either direction', () => {
    renderGame();

    fireEvent.click(card('Q1'));
    press('Next');
    expect(card('Q2')).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(card('Q2'));
    press('Prev');
    expect(card('Q1')).toHaveAttribute('aria-pressed', 'false');
  });
});

describe('keyboard and screen readers', () => {
  it('flips like a button, with Enter and with Space', () => {
    renderGame();
    expect(card('Q1')).toHaveAttribute('tabindex', '0');

    fireEvent.keyDown(card('Q1'), { key: 'Enter' });
    expect(card('A1')).toHaveAttribute('aria-pressed', 'true');

    fireEvent.keyDown(card('A1'), { key: ' ' });
    expect(card('Q1')).toHaveAttribute('aria-pressed', 'false');
  });
});