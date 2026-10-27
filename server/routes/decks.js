const express = require('express');
const decksRouter = express.Router();
const decksCo = require('../controllers/decksCo');
const authMiddleware = require('../middleware/authMiddleware');

/* Mounted ahead of the routes, so no deck endpoint can be reached without a valid token */
decksRouter.use(authMiddleware);

decksRouter.post('/', decksCo.createDeck);
decksRouter.get('/', decksCo.getAllDecks);
decksRouter.get('/:id', decksCo.getDeckById);
decksRouter.put('/:id', decksCo.updateDeck);
decksRouter.delete('/:id', decksCo.deleteDeck);

module.exports = decksRouter;