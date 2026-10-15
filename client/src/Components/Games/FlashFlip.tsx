import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import FitText from '../Common/FitText';
import { pressable } from '../Common/pressable';
import { Deck } from '../CreateDecks/types';

interface FlashFlipProps {
  selectedDecks: Deck[];
}

/* One card at a time, tapped to turn over, stepped through with the controls below */
const FlashFlip: React.FC<FlashFlipProps> = ({ selectedDecks }) => {
  const [cardIndex, setCardIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);

  const allFlashcards = selectedDecks.flatMap(deck => deck.flashcards);
  const total = allFlashcards.length;

  if (total === 0) {
    return (
      <div className="flashflip">
        <Link to="/home" className="back-link">Back to Home</Link>
        <h2 className="page-heading">FlashFlip</h2>
        <p>No flashcards available. Please select a deck from the home page.</p>
      </div>
    );
  }

  /* Clamped, so a deck that shrinks underneath the game cannot leave the index past its end */
  const safeIndex = Math.min(cardIndex, total - 1);
  const currentCard = allFlashcards[safeIndex];

  /* Both directions wrap around the deck and always land back on the question face */
  const nextCard = () => {
    setCardIndex(safeIndex === total - 1 ? 0 : safeIndex + 1);
    setFlipped(false);
  };

  const prevCard = () => {
    setCardIndex(safeIndex === 0 ? total - 1 : safeIndex - 1);
    setFlipped(false);
  };

  return (
    <div className="flashflip">
      <Link to="/game-menu" className="back-link page-back">Back to Game Menu</Link>
      <h2 className="page-heading">FlashFlip</h2>
      <div className="game-stage">
        <div className="stage-above">
          <p className="card-counter">{safeIndex + 1} / {total}</p>
        </div>
        <div className="ff-flip-card" {...pressable(() => setFlipped(prev => !prev))} aria-pressed={flipped}>
          {/* Both faces are always rendered and the CSS rotates whichever is showing, so the hidden face is kept from screen readers */}
          <div className={`ff-flip-card-inner ${flipped ? 'flipped' : ''}`}>
            <div className="ff-flip-card-front" aria-hidden={flipped}>
              <FitText className="card-text" max={46} min={9} centreBox basePad={3} clampToBox fillRuns>{currentCard.question}</FitText>
            </div>
            <div className="ff-flip-card-back" aria-hidden={!flipped}>
              <FitText className="card-text" max={46} min={9} centreBox basePad={3} clampToBox fillRuns>{currentCard.answer}</FitText>
            </div>
          </div>
        </div>
        <div className="stage-below">
          <p className="flip-hint">
            {flipped ? 'Tap to see the question' : 'Tap to reveal the answer'}
          </p>
          <div className="prev-next">
            <button onClick={prevCard} className="button ff-prev">Prev</button>
            <button onClick={nextCard} className="button ff-next">Next</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FlashFlip;