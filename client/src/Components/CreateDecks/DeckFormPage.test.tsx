import { StrictMode } from 'react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import DeckFormPage from './DeckFormPage';
import { Deck } from './types';
import apiClient from '../../api/client';
import { networkFailure } from '../../test/apiErrors';

vi.mock('../../api/client', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

const mockNavigate = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => mockNavigate,
}));

const mockedGet = vi.mocked(apiClient.get);
const mockedPost = vi.mocked(apiClient.post);
const mockedPut = vi.mocked(apiClient.put);

const EDIT_DECK: Deck = {
  _id: 'd7',
  userId: 'u1',
  name: 'Old Name',
  description: 'Old desc',
  flashcards: [
    { _id: 'f1', question: 'Q1', answer: 'A1' },
    { _id: 'f2', question: 'Q2', answer: 'A2' },
    { _id: 'f3', question: 'Q3', answer: 'A3' },
  ],
};

/* The question each tile shows, in the order the tiles stand */
const tileQuestions = () => screen.getAllByText(/^Q\d/).map(tile => tile.textContent);

describe('DeckFormPage', () => {
  const onDeckSaved = vi.fn();

  const renderCreate = () =>
    render(
      <MemoryRouter initialEntries={['/create-decks']}>
        <Routes>
          <Route path="/create-decks" element={<DeckFormPage onDeckSaved={onDeckSaved} />} />
        </Routes>
      </MemoryRouter>
    );

  const renderEdit = ({ strict = false } = {}) => {
    const page = (
      <MemoryRouter initialEntries={['/edit-deck/d7']}>
        <Routes>
          <Route path="/edit-deck/:id" element={<DeckFormPage onDeckSaved={onDeckSaved} />} />
        </Routes>
      </MemoryRouter>
    );
    return render(strict ? <StrictMode>{page}</StrictMode> : page);
  };

  const setMeta = async (
    user: ReturnType<typeof userEvent.setup>,
    which: 'name' | 'description',
    value: string
  ) => {
    const label = which === 'name' ? 'Edit deck name' : 'Edit description';
    await user.click(screen.getByRole('button', { name: label }));
    const field = screen.getByLabelText(which === 'name' ? 'Deck Name:' : 'Description:');
    await user.clear(field);
    await user.type(field, value);
    await user.click(screen.getByRole('button', { name: 'Done' }));
  };

  const addCard = async (
    user: ReturnType<typeof userEvent.setup>,
    question: string,
    answer: string
  ) => {
    await user.click(screen.getByRole('button', { name: 'Add Flashcard' }));
    await user.type(screen.getByLabelText('Question:'), question);
    await user.type(screen.getByLabelText('Answer:'), answer);
    await user.click(screen.getByRole('button', { name: 'Done' }));
  };

  const buildDeck = async (user: ReturnType<typeof userEvent.setup>) => {
    await setMeta(user, 'name', 'My Deck');
    await setMeta(user, 'description', 'Desc');
    await addCard(user, 'Q1', 'A1');
    await addCard(user, 'Q2', 'A2');
    await addCard(user, 'Q3', 'A3');
  };

  it('lets a deck name run to twenty characters and no further', async () => {
    const user = userEvent.setup();
    renderCreate();

    await user.click(screen.getByRole('button', { name: 'Edit deck name' }));
    await user.type(screen.getByLabelText('Deck Name:'), 'Organic Chemistry IIIII');

    expect(screen.getByLabelText('Deck Name:')).toHaveValue('Organic Chemistry II');
    expect(screen.getByText('20 / 20')).toBeInTheDocument();
  });

  it('cancelling the name editor keeps the name as it was', async () => {
    const user = userEvent.setup();
    renderCreate();
    await setMeta(user, 'name', 'Capitals');
    await user.click(screen.getByRole('button', { name: 'Edit deck name' }));
    await user.type(screen.getByLabelText('Deck Name:'), ' and Rivers');

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByLabelText('Deck Name:')).not.toBeInTheDocument();
    expect(screen.getByText('Capitals')).toBeInTheDocument();
  });

  it.each([
    ['name', 'Edit deck name', 'Deck Name:'],
    ['card', 'Add Flashcard', 'Question:'],
  ])('closes the %s editor without keeping its draft when the backdrop around it is clicked', async (_, opener, field) => {
    const user = userEvent.setup();
    renderCreate();
    await user.click(screen.getByRole('button', { name: opener }));
    await user.type(screen.getByLabelText(field), 'Capitals');

    /* The backdrop is only the dimmed page around the editor, so it has no role or name to find it by */
    await user.click(document.querySelector('.fc-overlay') as HTMLElement);

    expect(screen.queryByLabelText(field)).not.toBeInTheDocument();
    expect(screen.queryByText('Capitals')).not.toBeInTheDocument();
  });

  it.each([
    ['a name but no description', 'name'],
    ['a description but no name', 'description'],
  ] as const)('refuses to save a deck with %s', async (_, given) => {
    const user = userEvent.setup();
    renderCreate();
    await setMeta(user, given, 'Capitals');
    await addCard(user, 'Q1', 'A1');
    await addCard(user, 'Q2', 'A2');
    await addCard(user, 'Q3', 'A3');

    await user.click(screen.getByRole('button', { name: 'Save Deck' }));

    expect(screen.getByText('Please add a deck name and a description.')).toBeInTheDocument();
    expect(mockedPost).not.toHaveBeenCalled();
  });

  it('keeps Save Deck disabled until the deck holds 3 flashcards', async () => {
    const user = userEvent.setup();
    renderCreate();
    await setMeta(user, 'name', 'My Deck');
    await setMeta(user, 'description', 'Desc');

    await addCard(user, 'Q1', 'A1');
    await addCard(user, 'Q2', 'A2');
    expect(screen.getByRole('button', { name: 'Save Deck' })).toBeDisabled();

    await addCard(user, 'Q3', 'A3');
    expect(screen.getByRole('button', { name: 'Save Deck' })).toBeEnabled();
  });

  it('a card cannot be added until both of its faces carry something', async () => {
    const user = userEvent.setup();
    renderCreate();

    await user.click(screen.getByRole('button', { name: 'Add Flashcard' }));
    expect(screen.getByRole('button', { name: 'Done' })).toBeDisabled();

    await user.type(screen.getByLabelText('Answer:'), 'A1');
    expect(screen.getByRole('button', { name: 'Done' })).toBeDisabled();

    await user.type(screen.getByLabelText('Question:'), 'Q1');
    expect(screen.getByRole('button', { name: 'Done' })).toBeEnabled();
  });

  it('whitespace alone does not count as an answer', async () => {
    const user = userEvent.setup();
    renderCreate();

    await user.click(screen.getByRole('button', { name: 'Add Flashcard' }));
    await user.type(screen.getByLabelText('Question:'), 'Q1');
    await user.type(screen.getByLabelText('Answer:'), '   ');

    expect(screen.getByRole('button', { name: 'Done' })).toBeDisabled();
  });

  it('cancelling a new card leaves it out of the deck', async () => {
    const user = userEvent.setup();
    renderCreate();
    await user.click(screen.getByRole('button', { name: 'Add Flashcard' }));
    await user.type(screen.getByLabelText('Question:'), 'Q1');
    await user.type(screen.getByLabelText('Answer:'), 'A1');

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.getByText('Your deck has no cards yet.')).toBeInTheDocument();
  });

  it('turns a tile between its question and its answer with Q and A', async () => {
    const user = userEvent.setup();
    renderCreate();
    await addCard(user, 'What is the capital of France?', 'Paris');

    await user.click(screen.getByRole('button', { name: 'Show answer 1' }));
    expect(screen.getByText('Paris')).toBeInTheDocument();
    expect(screen.queryByText('What is the capital of France?')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Show question 1' }));
    expect(screen.getByText('What is the capital of France?')).toBeInTheDocument();
    expect(screen.queryByText('Paris')).not.toBeInTheDocument();
  });

  it('editing a card changes that card and leaves the others alone', async () => {
    const user = userEvent.setup();
    renderCreate();
    await addCard(user, 'Q1', 'A1');
    await addCard(user, 'Q2', 'A2');

    await user.click(screen.getAllByRole('button', { name: 'Edit' })[1]);
    expect(screen.getByLabelText('Question:')).toHaveValue('Q2');
    await user.clear(screen.getByLabelText('Question:'));
    await user.type(screen.getByLabelText('Question:'), 'Q2 edited');
    await user.click(screen.getByRole('button', { name: 'Done' }));

    expect(tileQuestions()).toEqual(['Q1', 'Q2 edited']);
  });

  it.each([
    ['Move right', 0],
    ['Move left', 1],
  ] as const)('%s swaps a card with its neighbour', async (arrow, tile) => {
    const user = userEvent.setup();
    renderCreate();
    await addCard(user, 'Q1', 'A1');
    await addCard(user, 'Q2', 'A2');

    await user.click(screen.getAllByRole('button', { name: arrow })[tile]);

    expect(tileQuestions()).toEqual(['Q2', 'Q1']);
  });

  it('numbers the tiles from 1, with no move offered past either end', async () => {
    const user = userEvent.setup();
    renderCreate();
    await addCard(user, 'Q1', 'A1');
    await addCard(user, 'Q2', 'A2');

    expect(screen.getByText('#1')).toBeInTheDocument();
    expect(screen.getByText('#2')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Move left' })[0]).toBeDisabled();
    expect(screen.getAllByRole('button', { name: 'Move right' })[1]).toBeDisabled();
  });

  it.each([
    ['moved', 'Move right'],
    ['deleted', 'Delete'],
  ])('turns every tile back to its question once a card is %s', async (_, control) => {
    const user = userEvent.setup();
    renderCreate();
    await addCard(user, 'Q1', 'A1');
    await addCard(user, 'Q2', 'A2');
    await addCard(user, 'Q3', 'A3');
    await user.click(screen.getByRole('button', { name: 'Show answer 2' }));
    expect(screen.getByText('A2')).toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: control })[0]);

    expect(screen.queryByText(/^A\d$/)).not.toBeInTheDocument();
  });

  it('deleting a card removes that card and no other', async () => {
    const user = userEvent.setup();
    renderCreate();
    await addCard(user, 'Q1', 'A1');
    await addCard(user, 'Q2', 'A2');

    await user.click(screen.getAllByRole('button', { name: 'Delete' })[0]);

    expect(tileQuestions()).toEqual(['Q2']);
  });

  it('create mode submits a 3-card deck, reports it upward, and returns home', async () => {
    const savedDeck: Deck = {
      _id: 'new1',
      userId: 'u1',
      name: 'My Deck',
      description: 'Desc',
      flashcards: [
        { _id: 'nf1', question: 'Q1', answer: 'A1' },
        { _id: 'nf2', question: 'Q2', answer: 'A2' },
        { _id: 'nf3', question: 'Q3', answer: 'A3' },
      ],
    };
    mockedPost.mockResolvedValueOnce({ data: savedDeck });
    const user = userEvent.setup();
    renderCreate();
    await buildDeck(user);

    await user.click(screen.getByRole('button', { name: 'Save Deck' }));

    expect(mockedPost).toHaveBeenCalledWith('/decks', {
      name: 'My Deck',
      description: 'Desc',
      flashcards: [
        { question: 'Q1', answer: 'A1' },
        { question: 'Q2', answer: 'A2' },
        { question: 'Q3', answer: 'A3' },
      ],
    });
    expect(onDeckSaved).toHaveBeenCalledWith(savedDeck);
    expect(mockNavigate).toHaveBeenCalledWith('/home');
  });

  it('disables Save Deck while the deck is on its way to the server', async () => {
    mockedPost.mockReturnValueOnce(new Promise(() => {}));
    const user = userEvent.setup();
    renderCreate();
    await buildDeck(user);

    await user.click(screen.getByRole('button', { name: 'Save Deck' }));

    expect(screen.getByRole('button', { name: 'Save Deck' })).toBeDisabled();
  });

  it('a failed save keeps the deck that was built and says so', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockedPost.mockRejectedValueOnce(networkFailure());
    const user = userEvent.setup();
    renderCreate();
    await buildDeck(user);

    await user.click(screen.getByRole('button', { name: 'Save Deck' }));

    expect(await screen.findByText('Error saving deck. Please try again.')).toBeInTheDocument();
    expect(onDeckSaved).not.toHaveBeenCalled();
    expect(screen.getByText('My Deck')).toBeInTheDocument();
    expect(tileQuestions()).toEqual(['Q1', 'Q2', 'Q3']);
    expect(screen.getByRole('button', { name: 'Save Deck' })).toBeEnabled();
    expect(consoleError).toHaveBeenCalledWith('Error saving deck:', expect.any(Error));
    consoleError.mockRestore();
  });

  it('edit mode shows a spinner, and no form, while the deck is on its way', () => {
    mockedGet.mockReturnValueOnce(new Promise(() => {}));

    renderEdit();

    expect(screen.getByRole('status', { name: 'Loading the deck' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save Deck' })).not.toBeInTheDocument();
  });

  it('edit mode fills the form with the deck it loads', async () => {
    mockedGet.mockResolvedValueOnce({ data: EDIT_DECK });

    renderEdit();

    expect(await screen.findByText('Old Name')).toBeInTheDocument();
    expect(mockedGet).toHaveBeenCalledWith('/decks/d7');
    expect(screen.getByText('Old desc')).toBeInTheDocument();
    expect(tileQuestions()).toEqual(['Q1', 'Q2', 'Q3']);
  });

  it('edit mode saves changes via PUT and returns home', async () => {
    mockedGet.mockResolvedValueOnce({ data: EDIT_DECK });
    mockedPut.mockResolvedValueOnce({ data: { ...EDIT_DECK, name: 'New Name' } });
    const user = userEvent.setup();
    renderEdit();
    await screen.findByText('Old Name');

    await setMeta(user, 'name', 'New Name');
    await user.click(screen.getByRole('button', { name: 'Save Deck' }));

    expect(mockedPut).toHaveBeenCalledWith('/decks/d7', {
      name: 'New Name',
      description: 'Old desc',
      flashcards: [
        { question: 'Q1', answer: 'A1' },
        { question: 'Q2', answer: 'A2' },
        { question: 'Q3', answer: 'A3' },
      ],
    });
    expect(onDeckSaved).toHaveBeenCalledWith({ ...EDIT_DECK, name: 'New Name' });
    expect(mockNavigate).toHaveBeenCalledWith('/home');
  });

  it('edit mode keeps a name typed after the deck loads, however late an earlier request for it answers', async () => {
    /* StrictMode asks for the deck twice, and the first request, superseded, answers last as a slow one can */
    let answerFirst: (response: { data: Deck }) => void = () => {};
    mockedGet
      .mockImplementationOnce(() => new Promise(resolve => { answerFirst = resolve; }))
      .mockResolvedValueOnce({ data: EDIT_DECK });
    mockedPut.mockResolvedValueOnce({ data: { ...EDIT_DECK, name: 'New Name' } });
    const user = userEvent.setup();
    renderEdit({ strict: true });

    expect(await screen.findByText('Old Name')).toBeInTheDocument();
    await setMeta(user, 'name', 'New Name');
    await act(async () => answerFirst({ data: { ...EDIT_DECK, name: 'Stale Name' } }));
    await user.click(screen.getByRole('button', { name: 'Save Deck' }));

    expect(mockedGet).toHaveBeenCalledTimes(2);
    expect(mockedPut).toHaveBeenCalledWith('/decks/d7', expect.objectContaining({ name: 'New Name' }));
  });

  it('edit mode shows no error when an earlier, superseded request for the deck fails late', async () => {
    let failFirst: (reason: unknown) => void = () => {};
    mockedGet
      .mockImplementationOnce(() => new Promise((_, reject) => { failFirst = reject; }))
      .mockResolvedValueOnce({ data: EDIT_DECK });
    renderEdit({ strict: true });
    await screen.findByText('Old Name');

    await act(async () => failFirst(networkFailure()));

    expect(screen.queryByText('Could not load the deck. Please go back and try again.')).not.toBeInTheDocument();
    expect(mockedGet).toHaveBeenCalledTimes(2);
  });

  it('edit mode says when the deck cannot be loaded, and offers the way back', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockedGet.mockRejectedValueOnce(networkFailure());

    renderEdit();

    expect(
      await screen.findByText('Could not load the deck. Please go back and try again.')
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to Home' })).toBeInTheDocument();
    expect(consoleError).toHaveBeenCalledWith('Error fetching deck:', expect.any(Error));
    consoleError.mockRestore();
  });
});