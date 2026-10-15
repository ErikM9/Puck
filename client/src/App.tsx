import React, { useState, useEffect, useMemo } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import AuthPage from './Components/Auth/AuthPage';
import VerifyEmailPage from './Components/Auth/VerifyEmailPage';
import HomePage from './Components/Home/HomePage';
import DeckFormPage from './Components/CreateDecks/DeckFormPage';
import FlashFlip from './Components/Games/FlashFlip';
import GameMenu from './Components/Games/GameMenu';
import FlashChoice from './Components/Games/FlashChoice';
import FlashMatch from './Components/Games/FlashMatch';
import Navbar from './Components/Navbar/Navbar';
import ScrollableBox from './Components/Common/ScrollableBox';
import apiClient from './api/client';
import './App.css';
import { Deck } from './Components/CreateDecks/types';

/* Holds the session, the decks and the selection, since more than one page needs each of them */
const App: React.FC = () => {
  const [isLoggedIn, setIsLoggedIn] = useState(!!localStorage.getItem('token'));
  const [decks, setDecks] = useState<Deck[]>([]);
  const [selectedDecks, setSelectedDecks] = useState<string[]>([]);
  /* True until the first list arrives, so the home page shows a spinner rather than an empty table */
  const [decksLoading, setDecksLoading] = useState(!!localStorage.getItem('token'));

  useEffect(() => {
    if (!isLoggedIn) return;

    /* Dropped if the session ends before the request lands, so a stale list cannot arrive */
    let active = true;
    setDecksLoading(true);

    const fetchDecks = async () => {
      try {
        const response = await apiClient.get('/decks');
        /* A deck saved while the list is on its way is newer than the list's copy of it, or missing from it */
        if (active) {
          const listed: Deck[] = response.data;
          setDecks(saved => [
            ...listed.map(deck => saved.find(newer => newer._id === deck._id) ?? deck),
            ...saved.filter(deck => !listed.some(older => older._id === deck._id)),
          ]);
        }
      } catch (error) {
        console.error('Error fetching decks:', error);
      } finally {
        if (active) setDecksLoading(false);
      }
    };

    fetchDecks();
    return () => { active = false; };
  }, [isLoggedIn]);

  const handleLogin = (token: string) => {
    localStorage.setItem('token', token);
    setIsLoggedIn(true);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setIsLoggedIn(false);
    setDecks([]);
    setSelectedDecks([]);
  };

  /* One handler for both creating and editing, told apart by whether the id is already known */
  const handleDeckSaved = (savedDeck: Deck) => {
    setDecks(prev => {
      const exists = prev.some(d => d._id === savedDeck._id);
      return exists
        ? prev.map(d => d._id === savedDeck._id ? savedDeck : d)
        : [...prev, savedDeck];
    });
  };

  const handleSelectDeck = (deckId: string) => {
    setSelectedDecks(prev =>
      prev.includes(deckId) ? prev.filter(id => id !== deckId) : [...prev, deckId]
    );
  };

  /* Memoised as well as counted, since a game resets whenever this array changes identity */
  const filteredDecks = useMemo(
    () => decks.filter(deck => selectedDecks.includes(deck._id)),
    [decks, selectedDecks]
  );
  const hasSelectedDecks = filteredDecks.length > 0;

  return (
    <Router basename={import.meta.env.BASE_URL}>
      <div className="app">
        <div className="background" />
        <Navbar isLoggedIn={isLoggedIn} onLogout={handleLogout} />
        {/* Everything under the navbar scrolls in the app's own bar rather than the browser's */}
        <ScrollableBox className="app-scroll" outerClassName="app-scroll-outer" sbWidth={6} sbRight={5} sbGap={4}>
          <div className="app-scroll-content">
            {/* Signed out sends you to the login page, and no decks picked sends you home */}
            <Routes>
              <Route path="/" element={isLoggedIn ? <Navigate to="/home" /> : <AuthPage onLogin={handleLogin} />} />
              {/* Opened from the verification email, signed in or not */}
              <Route path="/verify-email" element={<VerifyEmailPage />} />
              <Route path="/home" element={isLoggedIn ? (
                <HomePage decks={decks} loading={decksLoading} onSelectDeck={handleSelectDeck} selectedDecks={selectedDecks} setDecks={setDecks} setSelectedDecks={setSelectedDecks} />
              ) : <Navigate to="/" />} />
              <Route path="/create-decks" element={isLoggedIn ? <DeckFormPage onDeckSaved={handleDeckSaved} /> : <Navigate to="/" />} />
              <Route path="/edit-deck/:id"  element={isLoggedIn ? <DeckFormPage onDeckSaved={handleDeckSaved} /> : <Navigate to="/" />} />
              <Route path="/game-menu"      element={isLoggedIn ? (hasSelectedDecks ? <GameMenu /> : <Navigate to="/home" />) : <Navigate to="/" />} />
              <Route path="/flash-flip"     element={isLoggedIn ? (hasSelectedDecks ? <FlashFlip selectedDecks={filteredDecks} /> : <Navigate to="/home" />) : <Navigate to="/" />} />
              <Route path="/flash-choice"   element={isLoggedIn ? (hasSelectedDecks ? <FlashChoice selectedDecks={filteredDecks} /> : <Navigate to="/home" />) : <Navigate to="/" />} />
              <Route path="/flash-match"    element={isLoggedIn ? (hasSelectedDecks ? <FlashMatch selectedDecks={filteredDecks} /> : <Navigate to="/home" />) : <Navigate to="/" />} />
              <Route path="*" element={<Navigate to={isLoggedIn ? '/home' : '/'} />} />
            </Routes>
          </div>
        </ScrollableBox>
      </div>
    </Router>
  );
};

export default App;