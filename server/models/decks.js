const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/* Cards are embedded rather than given their own collection, as they are only read via a deck */
const flashcardSchema = new Schema({
  question: { type: String, required: true },
  answer: { type: String, required: true },
});

const deckSchema = new Schema(
  {
    /* Every deck belongs to somebody, and each query filters on this to keep them apart */
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true },
    description: { type: String, required: true },
    flashcards: [flashcardSchema],
  },
  { timestamps: true }
);

const Deck = mongoose.model('Deck', deckSchema);
module.exports = Deck;