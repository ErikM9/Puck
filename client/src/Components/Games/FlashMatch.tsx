import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { Deck } from '../CreateDecks/types';
import { Link } from 'react-router-dom';
import FitText from '../Common/FitText';
import { fillRows, useRowCapacity, useCardFit, cardTextMax, shuffle } from '../Common/rowLayout';
import { pressable } from '../Common/pressable';
import RoundComplete from './RoundComplete';

interface FlashMatchProps {
  selectedDecks: Deck[];
}

/* Carries the id of its source card, since two cards can share one answer text */
interface AnswerCard {
  id: string;
  answer: string;
}

/* How wide the question runs on one line, read while the prompt is held to one line as wide as its text */
const oneLineWidth = (prompt: HTMLElement) => {
  const { whiteSpace, width, maxWidth } = prompt.style;
  Object.assign(prompt.style, { whiteSpace: 'nowrap', width: 'max-content', maxWidth: 'none' });
  const line = prompt.scrollWidth;
  Object.assign(prompt.style, { whiteSpace, width, maxWidth });
  return line;
};

const FlashMatch: React.FC<FlashMatchProps> = ({ selectedDecks }) => {
  const allFlashcards = selectedDecks.flatMap(deck => deck.flashcards);

  /* Tracked by id on both sides, so one match retires one question and one answer */
  const [matchedQuestionIds, setMatchedQuestionIds] = useState<Set<string>>(new Set());
  const [matchedAnswerIds, setMatchedAnswerIds] = useState<Set<string>>(new Set());

  const [activeQuestion, setActiveQuestion] = useState<{ id: string; answer: string; question: string } | null>(null);
  /* The whole question over its lines, or one line as wide as the return control, which keeps the board in place */
  const [wholeQuestion, setWholeQuestion] = useState(true);
  const [wrongAnswerId, setWrongAnswerId] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [wrongPairs, setWrongPairs] = useState(0);
  const [shuffledAnswers, setShuffledAnswers] = useState<AnswerCard[]>([]);

  /* Held so leaving the board cancels the flash rather than letting it wake a dead component */
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (flashTimer.current) clearTimeout(flashTimer.current);
  }, []);

  const returnRef = useRef<HTMLButtonElement>(null);
  const promptRef = useRef<HTMLParagraphElement>(null);
  const [lineWidth, setLineWidth] = useState<number | null>(null);
  const [cut, setCut] = useState(false);

  /* The control's width and the question's on one line depend on the font, so both are measured rather than assumed */
  useLayoutEffect(() => {
    const measure = () => {
      const control = returnRef.current;
      const prompt = promptRef.current;
      /* scrollWidth, since the rendered width is the one this effect sets */
      const width = control ? Math.ceil(control.scrollWidth) : null;
      setLineWidth(width);
      setCut(!!prompt && width !== null && oneLineWidth(prompt) > width + 1);
    };
    measure();
    window.addEventListener('resize', measure);
    if (document.fonts && document.fonts.status !== 'loaded') {
      document.fonts.ready.then(measure).catch(() => {});
    }
    return () => window.removeEventListener('resize', measure);
  }, [activeQuestion]);

  /* Reads as a reaction rather than a bare number, souring as the mistakes mount */
  const mistakeLabel = (count: number) => {
    if (count === 0) return 'N/A';
    if (count <= 2) return `${count} \u{1F642}`;
    if (count <= 5) return `${count} \u{1F615}`;
    if (count <= 9) return `${count} \u{1F623}`;
    return `${count} \u{1F525}`;
  };

  useEffect(() => {
    setShuffledAnswers(shuffle(allFlashcards.map(fc => ({ id: fc._id, answer: fc.answer }))));
    setMatchedQuestionIds(new Set());
    setMatchedAnswerIds(new Set());
    setActiveQuestion(null);
    setWrongPairs(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDecks]);

  const pageRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  /* Sized for the full deck rather than the cards left, so matching a pair never regrows the rest */
  const cardWidth = useCardFit(pageRef, stageRef, allFlashcards.length, { maxBoardWidth: 1000, reserve: 36 });
  const questionColRef = useRef<HTMLDivElement>(null);
  const answerColRef = useRef<HTMLDivElement>(null);
  const questionCapacity = useRowCapacity(questionColRef, cardWidth ?? 132, 12);
  const answerCapacity = useRowCapacity(answerColRef, cardWidth ?? 132, 12);

  /* A matched pair leaves the board, so focus moves on to the next question, or to Play Again once none are left */
  const focusAfterMatch = useRef(false);
  useEffect(() => {
    if (!focusAfterMatch.current) return;
    focusAfterMatch.current = false;
    const next = questionColRef.current?.querySelector<HTMLElement>('[role="button"]')
      ?? document.querySelector<HTMLElement>('.flash-match .completion button');
    next?.focus();
  }, [matchedQuestionIds]);

  const totalPairs = allFlashcards.length;
  const correctPairs = matchedQuestionIds.size;
  const isComplete = correctPairs === totalPairs && totalPairs > 0;

  const handleQuestionClick = (card: { _id: string; answer: string; question: string }) => {
    if (isChecking || matchedQuestionIds.has(card._id)) return;
    setActiveQuestion(prev =>
      prev?.id === card._id ? null : { id: card._id, answer: card.answer, question: card.question }
    );
  };

  /* The right answer is judged on its text, but the card that leaves is the one clicked */
  const handleAnswerClick = (entry: AnswerCard) => {
    if (isChecking || !activeQuestion || matchedAnswerIds.has(entry.id)) return;

    if (entry.answer === activeQuestion.answer) {
      focusAfterMatch.current = true;
      setMatchedQuestionIds(prev => new Set([...prev, activeQuestion.id]));
      setMatchedAnswerIds(prev => new Set([...prev, entry.id]));
      setActiveQuestion(null);
    } else {
      /* A wrong pick flashes red and holds the board for a moment before releasing */
      setWrongAnswerId(entry.id);
      setWrongPairs(prev => prev + 1);
      setIsChecking(true);
      flashTimer.current = setTimeout(() => {
        setWrongAnswerId(null);
        setActiveQuestion(null);
        setIsChecking(false);
      }, 700);
    }
  };

  const handleRestart = () => {
    setMatchedQuestionIds(new Set());
    setMatchedAnswerIds(new Set());
    setActiveQuestion(null);
    setWrongAnswerId(null);
    setIsChecking(false);
    setWrongPairs(0);
    setShuffledAnswers(shuffle(allFlashcards.map(fc => ({ id: fc._id, answer: fc.answer }))));
  };

  if (allFlashcards.length === 0) {
    return (
      <div className="flash-match">
        <h2 className="page-heading">FlashMatch</h2>
        <p>No flashcards available. Please select a deck from the home page.</p>
        <Link to="/home" className="back-link">Back to Home</Link>
      </div>
    );
  }

  const remainingQuestions = allFlashcards.filter(fc => !matchedQuestionIds.has(fc._id));
  const remainingAnswers = shuffledAnswers.filter(entry => !matchedAnswerIds.has(entry.id));

  return (
    <div className="flash-match" ref={pageRef}>
      <Link to="/game-menu" className="back-link page-back">Back to Game Menu</Link>
      <h2 className="page-heading">FlashMatch</h2>
      {!isComplete && (
        <div className="game-topline">
          <p className="matchhead" role="status">
            {/* Label and value are separate elements, so the two rows line up as a table */}
            <span><i>Matched:</i><b>{correctPairs} / {totalPairs}</b></span>
            <span><i>Mistakes:</i><b>{mistakeLabel(wrongPairs)}</b></span>
          </p>
          {activeQuestion && (
            <div
              className={wholeQuestion ? 'fm-active whole' : 'fm-active'}
              style={lineWidth ? ({ '--fm-line': `${lineWidth}px` } as React.CSSProperties) : undefined}
            >
              <button ref={returnRef} type="button" className="back-link fm-return" onClick={() => setActiveQuestion(null)}>
                Unsure? Pick another card
              </button>
              <div className="fm-prompt-row">
                <p className="fm-prompt" id="fm-prompt" ref={promptRef}>Match: <strong>{activeQuestion.question}</strong></p>
                {/* Only offered for a question the control's width cuts, as a shorter one shows whole either way */}
                {cut && (
                  <button
                    type="button"
                    className="fm-whole-btn"
                    aria-label="Whole question"
                    aria-expanded={wholeQuestion}
                    aria-controls="fm-prompt"
                    onClick={() => setWholeQuestion(whole => !whole)}
                  >
                    {wholeQuestion ? '\u25B4' : '\u25BE'}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
      <div className="game-stage" ref={stageRef}>
        <div className="stage-above" />
        {isComplete ? (
          <RoundComplete
            score={`${correctPairs} / ${totalPairs}`}
            message={`All pairs matched${wrongPairs > 0 ? ` — with ${wrongPairs} mistake${wrongPairs !== 1 ? 's' : ''}` : '!'}`}
            onRestart={handleRestart}
          />
        ) : (
          <div className="fm-columns">
            <div className="fm-col">
              <p className="game-subhead">Questions:</p>
              <div className="fm-col-cards" ref={questionColRef}>
                {fillRows(remainingQuestions, questionCapacity).map((row, rowIndex) => (
                  <div className="card-row" key={rowIndex}>
                    {row.map(flashcard => (
                      <div
                        key={flashcard._id}
                        className={activeQuestion?.id === flashcard._id ? 'flashcard selected-q' : 'flashcard'}
                        {...pressable(() => handleQuestionClick(flashcard))}
                        aria-pressed={activeQuestion?.id === flashcard._id}
                      >
                        <FitText className="question card-text" max={cardTextMax(cardWidth)} min={6} centreBox basePad={2} clampToBox fillRuns>{flashcard.question}</FitText>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
            <div className="fm-col">
              <p className="game-subhead">Answers:</p>
              {/* Only shown once a question is picked, as fm-awaiting hides the whole column until then */}
              <div className={activeQuestion ? 'fm-col-cards' : 'fm-col-cards fm-awaiting'} ref={answerColRef}>
                {fillRows(remainingAnswers, answerCapacity).map((row, rowIndex) => (
                  <div className="card-row" key={rowIndex}>
                    {row.map(entry => (
                      <div
                        key={entry.id}
                        className={wrongAnswerId === entry.id ? 'flashcard wrong-flash' : 'flashcard'}
                        {...pressable(() => handleAnswerClick(entry), { disabled: !activeQuestion || isChecking })}
                      >
                        <FitText className="answer card-text" max={cardTextMax(cardWidth)} min={6} centreBox basePad={2} clampToBox fillRuns>{entry.answer}</FitText>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        <div className="stage-below" />
      </div>
    </div>
  );
};

export default FlashMatch;