const Deck = require('../models/decks');

/* Copies only each card's question and answer, read with ?. so that a null card fails validation instead of throwing */
const cleanFlashcards = (flashcards) =>
  flashcards.map(fc => ({ question: fc?.question, answer: fc?.answer }));

/* A bad id or a missing field is the caller's mistake, so those answer 400 rather than 500 */
const respondToError = (res, error, context) => {
  if (error.name === 'CastError') {
    return res.status(400).json({ message: 'Invalid deck id' });
  }
  if (error.name === 'ValidationError') {
    const cardProblem = Object.keys(error.errors).some(path => path.startsWith('flashcards'));
    return res.status(400).json({
      message: cardProblem ? 'Every card needs a question and an answer' : 'A deck needs a name and a description',
    });
  }
  console.error(`Error ${context}:`, error);
  return res.status(500).json({ message: 'Internal server error' });
};

exports.createDeck = async (req, res) => {
  try {
    const { name, description, flashcards } = req.body;

    if (!Array.isArray(flashcards)) {
      return res.status(400).json({ message: 'flashcards must be an array' });
    }

    const newDeck = new Deck({
      userId: req.userId,
      name,
      description,
      flashcards: cleanFlashcards(flashcards),
    });

    await newDeck.save();
    res.status(201).json(newDeck);
  } catch (error) {
    respondToError(res, error, 'creating deck');
  }
};

exports.getAllDecks = async (req, res) => {
  try {
    const decks = await Deck.find({ userId: req.userId });
    res.status(200).json(decks);
  } catch (error) {
    respondToError(res, error, 'fetching decks');
  }
};

/* Filtering on userId as well as id makes somebody else's deck look simply missing */
exports.getDeckById = async (req, res) => {
  try {
    const deck = await Deck.findOne({ _id: req.params.id, userId: req.userId });
    if (!deck) {
      return res.status(404).json({ message: 'Deck not found' });
    }
    res.status(200).json(deck);
  } catch (error) {
    respondToError(res, error, 'fetching deck');
  }
};

exports.updateDeck = async (req, res) => {
  try {
    const { name, description, flashcards } = req.body;

    if (flashcards !== undefined && !Array.isArray(flashcards)) {
      return res.status(400).json({ message: 'flashcards must be an array' });
    }

    const updatedDeck = await Deck.findOneAndUpdate(
      { _id: req.params.id, userId: req.userId },
      {
        name,
        description,
        /* Rebuilt the same way a new deck is, so an update cannot slip past what create rejects */
        ...(flashcards !== undefined && { flashcards: cleanFlashcards(flashcards) }),
      },
      /* Without runValidators an update could write a deck that create would have refused */
      { new: true, runValidators: true }
    );

    if (!updatedDeck) {
      return res.status(404).json({ message: 'Deck not found' });
    }

    res.status(200).json(updatedDeck);
  } catch (error) {
    respondToError(res, error, 'updating deck');
  }
};

exports.deleteDeck = async (req, res) => {
  try {
    const deletedDeck = await Deck.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    if (!deletedDeck) {
      return res.status(404).json({ message: 'Deck not found' });
    }
    res.status(200).json({ message: 'Deck deleted successfully' });
  } catch (error) {
    respondToError(res, error, 'deleting deck');
  }
};