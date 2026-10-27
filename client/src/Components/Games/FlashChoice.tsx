import React, { useState, useRef, useEffect } from 'react';
import { Deck } from '../CreateDecks/types';
import { Link } from 'react-router-dom';
import FitText from '../Common/FitText';
import { fillRows, useRowCapacity, useCardFit, useOptionsFit, cardTextMax, shuffle } from '../Common/rowLayout';
import { pressable } from '../Common/pressable';
import RoundComplete from './RoundComplete';

interface FlashChoiceProps {
  selectedDecks: Deck[];
}

/* Every card on the board at once, each answered through a three-option overlay */
const FlashChoice: React.FC<FlashChoiceProps> = ({ selectedDecks }) => {
  const allFlashcards = selectedDecks.flatMap(deck => deck.flashcards);

  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [options, setOptions]           = useState<string[]>([]);
  const [correctCount, setCorrectCount] = useState(0);
  /* Keyed by card id and holding whether the card's answer is right, which is what colours the tile */
  const [answered, setAnswered]         = useState<Map<string, boolean>>(new Map());

  /* The cards are sized to the room the stage has, and the rows are then measured on the board itself */
  const pageRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const cardWidth = useCardFit(pageRef, stageRef, allFlashcards.length, { boardPadding: 16 });
  const rowCapacity = useRowCapacity(boardRef, cardWidth ?? 132, 12, 16);

  const firstOptionRef = useRef<HTMLDivElement>(null);
  /* The answers are as large as the overlay has room for under the question */
  const optionsRef = useRef<HTMLDivElement>(null);
  const optionWidth = useOptionsFit(optionsRef, activeCardId);
  const returnFocusTo = useRef<string | null>(null);

  /* Focus moves into the options when they open, then back to the question tile, or to Play Again once the round is over */
  useEffect(() => {
    if (activeCardId) {
      firstOptionRef.current?.focus();
    } else if (returnFocusTo.current) {
      const tile = document.getElementById(`choice-card-${returnFocusTo.current}`);
      (tile ?? pageRef.current?.querySelector<HTMLElement>('.completion button'))?.focus();
      returnFocusTo.current = null;
    }
  }, [activeCardId]);

  const isComplete = answered.size === allFlashcards.length && allFlashcards.length > 0;

  if (allFlashcards.length === 0) {
    return (
      <div className="flash-choice">
        <h2 className="page-heading">FlashChoice</h2>
        <p>No flashcards available. Please select a deck from the home page.</p>
        <Link to="/home" className="back-link">Back to Home</Link>
      </div>
    );
  }

  /* Two wrong answers borrowed from other cards, shuffled in with the right one */
  const buildOptions = (correctAnswer: string): string[] => {
    const pool = [...new Set(allFlashcards.map(fc => fc.answer).filter(a => a !== correctAnswer))];
    const distractors = shuffle(pool).slice(0, Math.min(2, pool.length));
    return shuffle([...distractors, correctAnswer]);
  };

  const handleFlashcardClick = (cardId: string, answer: string) => {
    if (answered.has(cardId)) return;
    returnFocusTo.current = cardId;
    setActiveCardId(cardId);
    setOptions(buildOptions(answer));
  };

  const handleOptionClick = (selectedOption: string) => {
    const activeCard = allFlashcards.find(fc => fc._id === activeCardId);
    if (!activeCard) return;
    const isCorrect = selectedOption === activeCard.answer;
    if (isCorrect) setCorrectCount(prev => prev + 1);
    setAnswered(prev => new Map([...prev, [activeCard._id, isCorrect]]));
    setActiveCardId(null);
  };

  const handleRestart = () => {
    setActiveCardId(null);
    setOptions([]);
    setCorrectCount(0);
    setAnswered(new Map());
  };

  const activeCard = allFlashcards.find(fc => fc._id === activeCardId) ?? null;

  return (
    <div className="flash-choice" ref={pageRef}>
      <Link to="/game-menu" className="back-link page-back">Back to Game Menu</Link>
      <h2 className="page-heading">FlashChoice</h2>
      {!isComplete && (
        <div className="game-topline">
          <p className="choicematch" role="status">Correct: {correctCount} / {allFlashcards.length}</p>
        </div>
      )}
      <div className="game-stage" ref={stageRef}>
        <div className="stage-above" />
        {isComplete ? (
          <RoundComplete score={`${correctCount} / ${allFlashcards.length}`} message="Round complete!" onRestart={handleRestart} />
        ) : (
          <div className="flashcard-grid" ref={boardRef}>
            {fillRows(allFlashcards, rowCapacity).map((row, rowIndex) => (
              <div className="card-row" key={rowIndex}>
                {row.map(flashcard => {
                  const result = answered.get(flashcard._id);
                  const cls = result === undefined
                    ? 'flashcard'
                    : result ? 'flashcard answered-correct' : 'flashcard answered-wrong';
                  return (
                    <div
                      key={flashcard._id}
                      id={`choice-card-${flashcard._id}`}
                      {...pressable(() => handleFlashcardClick(flashcard._id, flashcard.answer), { disabled: result !== undefined })}
                      className={cls}
                    >
                      <FitText className="card-text" max={cardTextMax(cardWidth)} min={6} centreBox basePad={2} clampToBox fillRuns>{flashcard.question}</FitText>
                      {/* The tile's colour shows the result, and this says it for anyone who cannot see the colour */}
                      {result !== undefined && (
                        <span className="sr-only">{result ? '(answered correctly)' : '(answered wrongly)'}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
        <div className="stage-below" />
      </div>

      {/* The picked question and its options sit above the board rather than replacing it */}
      {activeCard && (
        <div className="fc-overlay" onClick={() => setActiveCardId(null)}>
          <div
            className="choice-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="choice-question"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => { if (e.key === 'Escape') setActiveCardId(null); }}
          >
            {/* Grouped above the options so the row of answers sits where a row of the board would */}
            <div className="choice-overlay-head">
              <button type="button" className="back-link" onClick={() => setActiveCardId(null)}>
                Return to questions
              </button>
              <p className="choice-overlay-q" id="choice-question">Question: <strong>{activeCard.question}</strong></p>
            </div>
            <div className="fc-options-row" ref={optionsRef}>
              {options.map((option, index) => (
                <div
                  key={option}
                  ref={index === 0 ? firstOptionRef : undefined}
                  {...pressable(() => handleOptionClick(option))}
                  className="option"
                >
                  <FitText className="card-text" max={cardTextMax(optionWidth ?? cardWidth)} min={6} centreBox basePad={2} clampToBox fillRuns>{option}</FitText>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FlashChoice;