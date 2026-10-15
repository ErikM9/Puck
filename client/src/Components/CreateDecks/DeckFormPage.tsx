import React, { useEffect, useState, useRef } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { Deck, Flashcard } from './types';
import FitText from '../Common/FitText';
import Spinner from '../Common/Spinner';
import { useFitFont } from '../Common/useFitFont';
import apiClient from '../../api/client';
import ScrollableBox from '../Common/ScrollableBox';
import { useRowsThatFit } from '../Common/rowLayout';
import { boxBottom, centreInkBetween, centreLabel, fillTop } from '../Common/textInk';

interface DeckFormPageProps {
  onDeckSaved: (deck: Deck) => void;
}

const MIN_FLASHCARDS = 3;
const CHAR_LIMIT = 200;
const NAME_LIMIT = 20;
const DESC_LIMIT = 60;
/* A face as long as the limit allows in ordinary words, so tiles grow their text past the cap only where this still fits */
const LONGEST_CARD_TEXT = 'Mitosis runs through prophase, metaphase, anaphase and telophase: chromosomes condense, line up across the middle, are pulled apart to either pole and are wrapped in two new nuclei as the cell splits.';

type CardDraft = Omit<Flashcard, '_id'>;

/* Centres a tile's text between its Q/A toggle and the fill of its buttons, as their faint border does not read as an edge */
const centreCardText = (el: HTMLElement) => {
  const toggle = el.previousElementSibling;
  const button = el.nextElementSibling?.firstElementChild;
  if (toggle && button instanceof HTMLElement) centreInkBetween(el, boxBottom(toggle), fillTop(button));
};

/* Builds a deck or edits one, told apart by whether the route carried an id */
const DeckFormPage: React.FC<DeckFormPageProps> = ({ onDeckSaved }) => {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const isEditing = !!id;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [flashcards, setFlashcards] = useState<CardDraft[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(isEditing);

  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const [metaEditor, setMetaEditor] = useState<'name' | 'description' | null>(null);
  const [draftMeta, setDraftMeta] = useState('');
  const [draftQuestion, setDraftQuestion] = useState('');
  const [draftAnswer, setDraftAnswer] = useState('');

  const questionRef = useRef<HTMLTextAreaElement>(null);
  const answerRef = useRef<HTMLTextAreaElement>(null);
  const metaRef = useRef<HTMLTextAreaElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  /* The table holds as many whole rows of cards as the screen has room for, once there is a deck to show */
  useRowsThatFit(pageRef, '.flashcards-container', !isFetching);

  /* The editor fields size their own text, so the counter always lands inside the box */
  const editorFit = { max: 15, min: 9, centreBox: true, basePad: 7 } as const;
  useFitFont(questionRef, draftQuestion, editorFit);
  useFitFont(answerRef, draftAnswer, editorFit);
  useFitFont(metaRef, draftMeta, editorFit);

  /* Which face each tile shows, cleared whenever the order changes underneath it */
  const [tileFaces, setTileFaces] = useState<Record<number, 'q' | 'a'>>({});

  useEffect(() => {
    if (!id) return;
    /* Dropped once the page closes or asks again, as StrictMode does in development, so a stale deck cannot undo edits */
    let active = true;
    const fetchDeck = async () => {
      try {
        const response = await apiClient.get(`/decks/${id}`);
        if (!active) return;
        const deck: Deck = response.data;
        setName(deck.name);
        setDescription(deck.description);
        setFlashcards(deck.flashcards.map(({ question, answer }) => ({ question, answer })));
      } catch (err) {
        if (!active) return;
        console.error('Error fetching deck:', err);
        setError('Could not load the deck. Please go back and try again.');
      } finally {
        if (active) setIsFetching(false);
      }
    };
    fetchDeck();
    return () => { active = false; };
  }, [id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !description.trim()) {
      setError('Please add a deck name and a description.');
      return;
    }
    setError(null);
    setIsLoading(true);
    try {
      const payload = { name, description, flashcards };
      const response = isEditing
        ? await apiClient.put(`/decks/${id}`, payload)
        : await apiClient.post('/decks', payload);
      onDeckSaved(response.data);
      /* Home shows the saved deck, new or changed, so the form has nothing more to do */
      navigate('/home');
    } catch (err) {
      console.error('Error saving deck:', err);
      setError('Error saving deck. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const [cardEditorOpen, setCardEditorOpen] = useState(false);

  /* Opens a blank draft, and the card joins the deck only once Done is pressed */
  const handleAddFlashcard = () => {
    setDraftQuestion('');
    setDraftAnswer('');
    setEditingIndex(null);
    setCardEditorOpen(true);
  };

  const handleOpenEditor = (index: number) => {
    setDraftQuestion(flashcards[index].question);
    setDraftAnswer(flashcards[index].answer);
    setEditingIndex(index);
    setCardEditorOpen(true);
  };

  const handleCancelEditor = () => {
    setCardEditorOpen(false);
    setEditingIndex(null);
  };

  /* Both faces must carry something, as the server refuses a blank card and the page shows only a generic error */
  const draftIsComplete = draftQuestion.trim().length > 0 && draftAnswer.trim().length > 0;

  const handleSaveEditor = () => {
    if (!draftIsComplete) return;
    if (editingIndex === null) {
      setFlashcards(prev => [...prev, { question: draftQuestion, answer: draftAnswer }]);
    } else {
      setFlashcards(prev =>
        prev.map((fc, i) =>
          i === editingIndex ? { question: draftQuestion, answer: draftAnswer } : fc
        )
      );
    }
    setCardEditorOpen(false);
    setEditingIndex(null);
  };

  const openMetaEditor = (which: 'name' | 'description') => {
    setDraftMeta(which === 'name' ? name : description);
    setMetaEditor(which);
  };

  const saveMetaEditor = () => {
    if (metaEditor === 'name') setName(draftMeta.trim());
    else if (metaEditor === 'description') setDescription(draftMeta.trim());
    setMetaEditor(null);
  };

  const handleDeleteFlashcard = (index: number) => {
    setFlashcards(prev => prev.filter((_, i) => i !== index));
    setTileFaces({});
  };

  const setTileFace = (index: number, face: 'q' | 'a') => {
    setTileFaces(prev => ({ ...prev, [index]: face }));
  };

  /* Swaps a card with its neighbour, and that order is the one the games read */
  const handleMoveFlashcard = (index: number, dir: -1 | 1) => {
    setFlashcards(prev => {
      const target = index + dir;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    setTileFaces({});
  };

  if (isFetching) {
    return (
      <div className="deck-form-page">
        <Spinner label="Loading the deck" />
      </div>
    );
  }

  const preview = (text: string) => (text.trim() ? text : '—');

  return (
    <div className="deck-form-page" ref={pageRef}>
      <Link to="/home" className="back-link page-back">Back to Home</Link>
      <h2 className="page-heading">Build Your Deck</h2>
      <form onSubmit={handleSubmit} className="deck-form">

        <div className="deck-fields">
          <div className="deck-meta-row">
            <div className="deck-meta-col">
              <span className="fc-row-key">Deck Name:</span>
              <span className={name ? 'deck-meta-val' : 'deck-meta-val placeholder'}>
                {name || 'Add a deck name…'}
              </span>
            </div>
            <button
              type="button"
              className="meta-edit"
              aria-label="Edit deck name"
              onClick={() => openMetaEditor('name')}
            />
          </div>
          <div className="deck-meta-row">
            <div className="deck-meta-col">
              <span className="fc-row-key">Description:</span>
              <span className={description ? 'deck-meta-val' : 'deck-meta-val placeholder'}>
                {description || 'Add a description…'}
              </span>
            </div>
            <button
              type="button"
              className="meta-edit"
              aria-label="Edit description"
              onClick={() => openMetaEditor('description')}
            />
          </div>
        </div>

        <ScrollableBox className="flashcards-container" outerClassName="flashcards-container-outer" outerStyle={{ margin: '0 auto 12px' }} sbWidth={5} sbRight={6}>
          {flashcards.length === 0 ? (
            <div className="flashcard-empty-state">
              <p>Your deck has no cards yet.</p>
              <p>Click <strong>Add Flashcard</strong> below to begin filling it with questions and answers.</p>
            </div>
          ) : (
            flashcards.map((flashcard, index) => (
              <div key={index} className="fc-tile">
                <div className="fc-tile-top">
                  <button
                    type="button"
                    className="fc-tile-move"
                    aria-label="Move left"
                    disabled={index === 0}
                    onClick={() => handleMoveFlashcard(index, -1)}
                  >‹</button>
                  <span className="fc-tile-num">#{index + 1}</span>
                  <button
                    type="button"
                    className="fc-tile-move"
                    aria-label="Move right"
                    disabled={index === flashcards.length - 1}
                    onClick={() => handleMoveFlashcard(index, 1)}
                  >›</button>
                </div>
                <div className="fc-tile-tabs">
                  <button
                    type="button"
                    className={(tileFaces[index] ?? 'q') === 'q' ? 'fc-tile-tab active' : 'fc-tile-tab'}
                    aria-label={`Show question ${index + 1}`}
                    onClick={() => setTileFace(index, 'q')}
                  >Q</button>
                  <button
                    type="button"
                    className={tileFaces[index] === 'a' ? 'fc-tile-tab active' : 'fc-tile-tab'}
                    aria-label={`Show answer ${index + 1}`}
                    onClick={() => setTileFace(index, 'a')}
                  >A</button>
                </div>
                <FitText
                  className="fc-tile-text"
                  max={12.5}
                  min={7}
                  clampToBox
                  centreBox
                  basePad={1}
                  growTo={LONGEST_CARD_TEXT}
                  onFit={centreCardText}
                >
                  {preview((tileFaces[index] ?? 'q') === 'q' ? flashcard.question : flashcard.answer)}
                </FitText>
                <div className="fc-tile-actions">
                  {/* Set no larger than Delete fits the same width at, so the pair's labels come out the same size */}
                  <button type="button" className="fc-row-edit" onClick={() => handleOpenEditor(index)}>
                    <FitText className="mini-btn-label" axis="width" max={20} min={7} exact sizedAs="Delete" onFit={centreLabel}>Edit</FitText>
                  </button>
                  <button
                    type="button"
                    className="delete-flashcard"
                    onClick={() => handleDeleteFlashcard(index)}
                  >
                    <FitText className="mini-btn-label" axis="width" max={20} min={7} exact onFit={centreLabel}>Delete</FitText>
                  </button>
                </div>
              </div>
            ))
          )}
        </ScrollableBox>

        <p className="char-limit-note">
          {`At least ${MIN_FLASHCARDS} flashcards per deck — questions and answers up to ${CHAR_LIMIT} characters.`}
        </p>

        <div className="deck-form-actions">
          <button type="button" className="button add-card-btn" onClick={handleAddFlashcard}>
            <FitText className="page-btn-label" axis="width" max={25} min={10} exact>Add Flashcard</FitText>
          </button>
          <button
            type="submit"
            className="button save-deck-btn"
            disabled={isLoading || flashcards.length < MIN_FLASHCARDS}
          >
            {/* Well above Add Flashcard's size, as Save Deck is the shorter label and the page's way on */}
            <FitText className="page-btn-label" axis="width" max={31} min={10} exact>Save Deck</FitText>
          </button>
        </div>
        {error && <p className="error-message">{error}</p>}
      </form>

      {/* Name and description are edited through their own single-face overlay */}
      {metaEditor !== null && (
        <div className="fc-overlay" onClick={() => setMetaEditor(null)}>
          <div className="fc-overlay-panel" onClick={(e) => e.stopPropagation()}>
            <div className="fc-overlay-cards">
              <div className={metaEditor === 'name'
                ? 'fc-edit-face question meta-name'
                : 'fc-edit-face answer meta-desc'}>
                <label htmlFor="draft-meta">
                  {metaEditor === 'name' ? 'Deck Name:' : 'Description:'}
                </label>
                <textarea
                  ref={metaRef}
                  id="draft-meta"
                  value={draftMeta}
                  maxLength={metaEditor === 'name' ? NAME_LIMIT : DESC_LIMIT}
                  onChange={(e) => setDraftMeta(e.target.value)}
                  autoFocus
                />
                <span className="fc-edit-count">
                  {draftMeta.length} / {metaEditor === 'name' ? NAME_LIMIT : DESC_LIMIT}
                </span>
              </div>
            </div>
            <p className="field-tip overlay-tip">
              {`Up to ${metaEditor === 'name' ? NAME_LIMIT : DESC_LIMIT} characters.`}
            </p>
            <div className="fc-overlay-actions">
              <button type="button" className="overlay-btn overlay-done" onClick={saveMetaEditor}>
                <span className="overlay-done-label">Done</span>
              </button>
              <button type="button" className="overlay-btn" onClick={() => setMetaEditor(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {cardEditorOpen && (
        <div className="fc-overlay" onClick={handleCancelEditor}>
          <div className="fc-overlay-panel" onClick={(e) => e.stopPropagation()}>
            <div className="fc-overlay-cards">
              <div className="fc-edit-face question">
                <label htmlFor="draft-question">Question:</label>
                <textarea
                  ref={questionRef}
                  id="draft-question"
                  value={draftQuestion}
                  maxLength={CHAR_LIMIT}
                  onChange={(e) => setDraftQuestion(e.target.value)}
                  autoFocus
                />
                <span className="fc-edit-count">{draftQuestion.length} / {CHAR_LIMIT}</span>
              </div>
              <div className="fc-edit-face answer">
                <label htmlFor="draft-answer">Answer:</label>
                <textarea
                  ref={answerRef}
                  id="draft-answer"
                  value={draftAnswer}
                  maxLength={CHAR_LIMIT}
                  onChange={(e) => setDraftAnswer(e.target.value)}
                />
                <span className="fc-edit-count">{draftAnswer.length} / {CHAR_LIMIT}</span>
              </div>
            </div>
            <div className="fc-overlay-actions">
              <button
                type="button"
                className="overlay-btn overlay-done"
                onClick={handleSaveEditor}
                disabled={!draftIsComplete}
              ><span className="overlay-done-label">Done</span></button>
              <button type="button" className="overlay-btn" onClick={handleCancelEditor}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DeckFormPage;