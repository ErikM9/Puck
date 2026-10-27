import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Deck } from '../CreateDecks/types';
import FitText from '../Common/FitText';
import FillText, { FillTier } from '../Common/FillText';
import Spinner from '../Common/Spinner';
import apiClient from '../../api/client';
import ScrollableBox from '../Common/ScrollableBox';
import { useRowsThatFit } from '../Common/rowLayout';
import { centreLabel } from '../Common/textInk';
import { LABEL_MOST, useDeckLayout } from './deckLayout';

interface HomePageProps {
  decks: Deck[];
  /* Set while the first list is on its way, so the table shows a spinner rather than claiming there are no decks */
  loading?: boolean;
  onSelectDeck: (deckId: string) => void;
  selectedDecks: string[];
  setDecks: React.Dispatch<React.SetStateAction<Deck[]>>;
  setSelectedDecks: React.Dispatch<React.SetStateAction<string[]>>;
}

/* One line at a readable size where the table is wide enough, otherwise two lines that each run its width */
const DESC_TIERS: FillTier[] = [
  { lines: 1, min: 16, max: 24 },
  { lines: 2, min: 12, max: 26 },
];

/* Marks the middle of a name with no spaces as its one place to break, so a name split over two lines breaks evenly */
const breakable = (name: string) => {
  const letters = Array.from(name);
  if (/\s/.test(name) || letters.length < 2) return name;
  const half = Math.ceil(letters.length / 2);
  return <>{letters.slice(0, half).join('')}<wbr />{letters.slice(half).join('')}</>;
};

/* The deck table, where decks are picked for a game and created, edited or deleted */
const HomePage: React.FC<HomePageProps> = ({ decks, loading = false, onSelectDeck, selectedDecks, setDecks, setSelectedDecks }) => {
  const navigate = useNavigate();
  const [deleteError, setDeleteError] = useState<string | null>(null);
  /* The deck whose Delete has been pressed, which stays until the overlay confirms or cancels */
  const [deckToDelete, setDeckToDelete] = useState<Deck | null>(null);
  /* The Delete that opened the question, which takes the focus back when the question closes */
  const opener = useRef<HTMLButtonElement | null>(null);
  /* Where a deleted deck sat, so the focus can move on to the deck which takes its place */
  const deletedAt = useRef<number | null>(null);
  const createLink = useRef<HTMLAnchorElement>(null);
  /* Decks whose deletion is on its way, whose Delete asks nothing until the answer comes */
  const deleting = useRef(new Set<string>());

  const askToDelete = (deck: Deck, button: HTMLButtonElement) => {
    if (deleting.current.has(deck._id)) return;
    opener.current = button;
    setDeckToDelete(deck);
  };

  const closeQuestion = () => {
    setDeckToDelete(null);
    opener.current?.focus();
  };

  /* Escape closes the overlay, as it does any dialog */
  useEffect(() => {
    if (!deckToDelete) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setDeckToDelete(null);
      opener.current?.focus();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [deckToDelete]);

  const pageRef = useRef<HTMLDivElement>(null);
  /* The table holds as many whole rows of decks as the screen has room for */
  useRowsThatFit(pageRef, '.deck-list');
  /* Lays every deck out alike for the longest name and description the deck form allows, whatever its own */
  useDeckLayout(pageRef, decks);

  /* A deleted deck's Delete goes with it, so the focus moves to the next deck's, the new last one's or Create Deck */
  useEffect(() => {
    const at = deletedAt.current;
    if (at === null) return;
    deletedAt.current = null;
    /* A question opened meanwhile keeps the focus, which returns to its own Delete when it closes */
    if (deckToDelete) return;
    const deletes = Array.from(pageRef.current?.querySelectorAll<HTMLButtonElement>('.delete-btn-deck') ?? []);
    (deletes[Math.min(at, deletes.length - 1)] ?? createLink.current)?.focus();
  }, [decks, deckToDelete]);

  /* Dropped from the selection as well as the list, or a game could open on nothing */
  const handleDeleteDeck = async (deckId: string) => {
    closeQuestion();
    setDeleteError(null);
    deleting.current.add(deckId);
    try {
      await apiClient.delete(`/decks/${deckId}`);
      deletedAt.current = decks.findIndex(deck => deck._id === deckId);
      setDecks(prev => prev.filter(deck => deck._id !== deckId));
      setSelectedDecks(prev => prev.filter(id => id !== deckId));
    } catch (error) {
      console.error('Error deleting deck:', error);
      setDeleteError('Failed to delete the deck. Please try again.');
    } finally {
      deleting.current.delete(deckId);
    }
  };

  /* Tab and Shift+Tab go round the question's buttons, as the page behind it is out of reach while it is open */
  const keepFocusInside = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') return;
    const buttons = Array.from(event.currentTarget.querySelectorAll('button'));
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (event.shiftKey && at <= 0) {
      event.preventDefault();
      buttons[buttons.length - 1].focus();
    } else if (!event.shiftKey && at === buttons.length - 1) {
      event.preventDefault();
      buttons[0].focus();
    }
  };

  const handleContinue = () => {
    if (selectedDecks.length === 0) return;
    navigate('/game-menu');
  };

  const totalSelectedFlashcards = decks
    .filter(deck => selectedDecks.includes(deck._id))
    .reduce((total, deck) => total + deck.flashcards.length, 0);

  return (
    <div className="home-page" ref={pageRef}>
      <h2 className="page-heading">Home</h2>
      <FillText className="home-desc" as="p" tiers={DESC_TIERS}>Select one or more decks, then continue to the Game Menu.</FillText>
      {deleteError && <p className="error-message">{deleteError}</p>}
      <ScrollableBox
        className="deck-list"
        outerClassName="deck-list-outer"
        outerStyle={{ width: 'calc(118px * 5 + 14px * 4 + 32px)', margin: '0 auto 24px' }}
        sbRight={6}
      >
        {loading && <Spinner label="Loading your decks" />}
        {/* Stands in for the grid until the first deck exists */}
        {!loading && decks.length === 0 && (
          <div className="flashcard-empty-state">
            <p>You have no decks yet.</p>
            <p>Use <strong>Create Deck</strong> below to build your first set of flashcards.</p>
          </div>
        )}
        {decks.map((deck) => (
          <div
            key={deck._id}
            className={`deck-item ${selectedDecks.includes(deck._id) ? 'selected' : ''}`}
            onClick={() => onSelectDeck(deck._id)}
          >
            {/* A real checkbox carries the selection for keyboards and screen readers, while a click anywhere on the tile toggles it */}
            <input
              type="checkbox"
              className="deck-select sr-only"
              checked={selectedDecks.includes(deck._id)}
              onChange={() => onSelectDeck(deck._id)}
              onClick={e => e.stopPropagation()}
              aria-label={`Select ${deck.name}`}
            />
            <h3><div className="deck-title-text">{breakable(deck.name)}</div></h3>
            {/* Set with every other deck's at the one size the longest fits, between the underline and the card count */}
            <div className="deck-desc">{deck.description}</div>
            <p className="deck-card-count">
              {deck.flashcards.length} card{deck.flashcards.length !== 1 ? 's' : ''}
            </p>
            <div className="deck-item-actions" onClick={e => e.stopPropagation()}>
              <button
                className="update-btn-deck"
                onClick={() => navigate(`/edit-deck/${deck._id}`)}
              >
                <FitText className="mini-btn-label" axis="width" max={LABEL_MOST} min={7} exact onFit={centreLabel}>Edit</FitText>
              </button>
              <button
                className="delete-btn-deck"
                onClick={(event) => askToDelete(deck, event.currentTarget)}
              >
                <FitText className="mini-btn-label" axis="width" max={LABEL_MOST} min={7} exact onFit={centreLabel}>Delete</FitText>
              </button>
            </div>
          </div>
        ))}
      </ScrollableBox>
      <div className="actions">
        <div className="buttons">
          <Link to="/create-decks" className="button" ref={createLink}><FitText className="page-btn-label" axis="width" max={28} min={10}>Create Deck</FitText></Link>
          <button
            onClick={handleContinue}
            className="button"
            disabled={selectedDecks.length === 0}
            title={selectedDecks.length === 0 ? 'Select at least one deck' : ''}
          >
            {/* Well above Create Deck's size, as Continue is the shorter word and the page's way on */}
            <FitText className="page-btn-label" axis="width" max={34} min={10}>Continue</FitText>
          </button>
        </div>
        <p className="total-flashcards">
          {selectedDecks.length > 0
            ? `${totalSelectedFlashcards} flashcard${totalSelectedFlashcards !== 1 ? 's' : ''} selected`
            : '\u00A0'}
        </p>
      </div>

      {/* Deleting asks first, in the overlay the deck form edits in, as a deck cannot be brought back */}
      {deckToDelete && (
        <div className="fc-overlay" onClick={closeQuestion}>
          {/* An alert dialog, which screen readers announce with its sentence, and which holds the focus while it is open */}
          <div
            className="fc-overlay-panel confirm-panel"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-deck-title"
            aria-describedby="delete-deck-text"
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={keepFocusInside}
          >
            <h3 id="delete-deck-title" className="confirm-title">Delete this deck?</h3>
            <p id="delete-deck-text" className="confirm-text">
              <strong>{deckToDelete.name}</strong> and its {deckToDelete.flashcards.length} card{deckToDelete.flashcards.length !== 1 ? 's' : ''} will be gone for good.
            </p>
            <div className="fc-overlay-actions">
              <button type="button" className="overlay-btn overlay-delete" onClick={() => handleDeleteDeck(deckToDelete._id)}>
                Delete
              </button>
              {/* Focus starts on Cancel, so Enter pressed out of habit deletes nothing */}
              <button type="button" className="overlay-btn" onClick={closeQuestion} autoFocus>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HomePage;
export type { HomePageProps };