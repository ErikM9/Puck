export interface Deck {
  _id: string;
  userId: string;
  name: string;
  description: string;
  flashcards: Flashcard[];
}

/* The id comes from the server, so a card still being drafted in the form has none yet */
export interface Flashcard {
  _id: string;
  question: string;
  answer: string;
}