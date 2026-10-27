import { useState } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AxiosError, AxiosHeaders, AxiosResponse } from 'axios';
import HomePage from './HomePage';
import { Deck } from '../CreateDecks/types';
import apiClient from '../../api/client';

vi.mock('../../api/client', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

const mockNavigate = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => mockNavigate,
}));

const mockedDelete = vi.mocked(apiClient.delete);

/* What the server answers once a deck is deleted */
const DELETED: AxiosResponse = {
  data: { message: 'Deck deleted successfully' },
  status: 200,
  statusText: 'OK',
  headers: {},
  config: { headers: new AxiosHeaders() },
};

const DECKS: Deck[] = [
  {
    _id: 'd1',
    userId: 'u1',
    name: 'Deck One',
    description: 'First deck',
    flashcards: [{ _id: 'f1', question: 'Q1', answer: 'A1' }],
  },
  {
    _id: 'd2',
    userId: 'u1',
    name: 'Deck Two',
    description: 'Second deck',
    flashcards: [
      { _id: 'f2', question: 'Q2', answer: 'A2' },
      { _id: 'f3', question: 'Q3', answer: 'A3' },
      { _id: 'f4', question: 'Q4', answer: 'A4' },
    ],
  },
];

/* HomePage takes its setters as props, so a stateful wrapper is needed to assert outcomes */
const Harness = ({ initialDecks, loading = false }: { initialDecks: Deck[]; loading?: boolean }) => {
  const [decks, setDecks] = useState<Deck[]>(initialDecks);
  const [selectedDecks, setSelectedDecks] = useState<string[]>([]);
  const onSelectDeck = (deckId: string) =>
    setSelectedDecks(prev =>
      prev.includes(deckId) ? prev.filter(id => id !== deckId) : [...prev, deckId]
    );

  return (
    <MemoryRouter>
      <HomePage
        decks={decks}
        loading={loading}
        onSelectDeck={onSelectDeck}
        selectedDecks={selectedDecks}
        setDecks={setDecks}
        setSelectedDecks={setSelectedDecks}
      />
    </MemoryRouter>
  );
};

const checkboxOf = (name: string) => screen.getByRole('checkbox', { name: `Select ${name}` });

/* Presses a deck's Delete and confirms it in the overlay */
const deleteDeck = async (user: ReturnType<typeof userEvent.setup>, index: number) => {
  await user.click(screen.getAllByRole('button', { name: 'Delete' })[index]);
  await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' }));
};

describe('HomePage', () => {
  it('shows the empty-state hint when there are no decks', () => {
    render(<Harness initialDecks={[]} />);
    expect(screen.getByText('You have no decks yet.')).toBeInTheDocument();
    expect(screen.getByText(/build your first set of flashcards/)).toBeInTheDocument();
  });

  it('shows a spinner, not the empty-state hint, while the decks are still on their way', () => {
    render(<Harness initialDecks={[]} loading />);
    expect(screen.getByRole('status', { name: 'Loading your decks' })).toBeInTheDocument();
    expect(screen.queryByText('You have no decks yet.')).not.toBeInTheDocument();
  });

  it('renders each deck with its description and a pluralised card count', () => {
    render(<Harness initialDecks={DECKS} />);

    expect(screen.getByText('First deck')).toBeInTheDocument();
    expect(screen.getByText('1 card')).toBeInTheDocument();
    expect(screen.getByText('3 cards')).toBeInTheDocument();
  });

  it('shows a deck\'s changed description after the layout has rewritten the text of the old one', () => {
    const props = { onSelectDeck: () => {}, selectedDecks: [], setDecks: () => {}, setSelectedDecks: () => {} };
    const { rerender } = render(<MemoryRouter><HomePage decks={DECKS} {...props} /></MemoryRouter>);
    /* Rewrites the text as the deck layout does when it shares a long run out over its lines */
    screen.getByText('First deck').textContent = 'First\u200Bdeck';

    rerender(<MemoryRouter><HomePage decks={[{ ...DECKS[0], description: 'Changed' }, DECKS[1]]} {...props} /></MemoryRouter>);

    expect(screen.getByText('Changed')).toBeInTheDocument();
  });

  it('marks the middle of a name with no spaces as the one place it may break, and leaves one with spaces alone', () => {
    render(<Harness initialDecks={[{ ...DECKS[0], name: 'Biology' }, DECKS[1]]} />);

    const single = screen.getByText('Biology');
    expect(single.querySelectorAll('wbr')).toHaveLength(1);
    expect(single.firstChild?.textContent).toBe('Biol');
    expect(screen.getByText('Deck Two').querySelector('wbr')).toBeNull();
  });

  it('totals the flashcards across the selected decks', async () => {
    const user = userEvent.setup();
    render(<Harness initialDecks={DECKS} />);

    await user.click(screen.getByText('Deck One'));
    await user.click(screen.getByText('Deck Two'));

    expect(screen.getByText('4 flashcards selected')).toBeInTheDocument();
  });

  it('gives the total of a single flashcard in the singular', async () => {
    const user = userEvent.setup();
    render(<Harness initialDecks={DECKS} />);

    await user.click(screen.getByText('Deck One'));

    expect(screen.getByText('1 flashcard selected')).toBeInTheDocument();
  });

  it('keeps Continue disabled until a deck is selected', async () => {
    const user = userEvent.setup();
    render(<Harness initialDecks={DECKS} />);
    const continueButton = screen.getByRole('button', { name: 'Continue' });
    expect(continueButton).toBeDisabled();

    await user.click(screen.getByText('Deck One'));

    expect(continueButton).toBeEnabled();
  });

  it('Continue navigates to the game menu once a deck is selected', async () => {
    const user = userEvent.setup();
    render(<Harness initialDecks={DECKS} />);

    await user.click(screen.getByText('Deck One'));
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(mockNavigate).toHaveBeenCalledWith('/game-menu');
  });

  it('Edit navigates to the edit route without toggling deck selection', async () => {
    const user = userEvent.setup();
    render(<Harness initialDecks={DECKS} />);

    await user.click(screen.getAllByRole('button', { name: 'Edit' })[0]);

    expect(mockNavigate).toHaveBeenCalledWith('/edit-deck/d1');
    expect(checkboxOf('Deck One')).not.toBeChecked();
  });

  it('Delete asks first, naming the deck and its cards to screen readers too, with the focus on Cancel', async () => {
    const user = userEvent.setup();
    render(<Harness initialDecks={DECKS} />);

    await user.click(screen.getAllByRole('button', { name: 'Delete' })[1]);

    const dialog = screen.getByRole('alertdialog', { name: 'Delete this deck?' });
    expect(dialog).toHaveAccessibleDescription('Deck Two and its 3 cards will be gone for good.');
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
    expect(mockedDelete).not.toHaveBeenCalled();
    expect(checkboxOf('Deck Two')).not.toBeChecked();
  });

  it('counts a single card in the singular when it asks', async () => {
    const user = userEvent.setup();
    render(<Harness initialDecks={DECKS} />);

    await user.click(screen.getAllByRole('button', { name: 'Delete' })[0]);

    expect(screen.getByRole('alertdialog')).toHaveTextContent('Deck One and its 1 card will be gone for good.');
  });

  it.each([
    ['Cancel', async (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole('button', { name: 'Cancel' }))],
    ['Escape', async (user: ReturnType<typeof userEvent.setup>) => user.keyboard('{Escape}')],
    ['a click on the backdrop', async (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole('alertdialog').parentElement as HTMLElement)],
  ])('%s closes the question, deletes nothing and gives the focus back to the deck\'s Delete', async (_label, dismiss) => {
    const user = userEvent.setup();
    render(<Harness initialDecks={DECKS} />);
    await user.click(screen.getAllByRole('button', { name: 'Delete' })[0]);

    await dismiss(user);

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(mockedDelete).not.toHaveBeenCalled();
    expect(screen.getByText('Deck One')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Delete' })[0]).toHaveFocus();
  });

  it('keeps Tab and Shift+Tab inside the question while it is open', async () => {
    const user = userEvent.setup();
    render(<Harness initialDecks={DECKS} />);
    await user.click(screen.getAllByRole('button', { name: 'Delete' })[0]);
    const dialog = screen.getByRole('alertdialog');
    const confirm = within(dialog).getByRole('button', { name: 'Delete' });
    const cancel = within(dialog).getByRole('button', { name: 'Cancel' });

    await user.tab();
    expect(confirm).toHaveFocus();
    await user.tab();
    expect(cancel).toHaveFocus();
    await user.tab({ shift: true });
    expect(confirm).toHaveFocus();
    await user.tab({ shift: true });
    expect(cancel).toHaveFocus();
  });

  it('a click inside the question leaves it open', async () => {
    const user = userEvent.setup();
    render(<Harness initialDecks={DECKS} />);
    await user.click(screen.getAllByRole('button', { name: 'Delete' })[0]);

    await user.click(screen.getByText('Delete this deck?'));

    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });

  it('confirming removes the deck from the list and closes the question', async () => {
    mockedDelete.mockResolvedValueOnce(DELETED);
    const user = userEvent.setup();
    render(<Harness initialDecks={DECKS} />);

    await deleteDeck(user, 0);

    expect(mockedDelete).toHaveBeenCalledWith('/decks/d1');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Deck One')).not.toBeInTheDocument());
    expect(screen.getByText('Deck Two')).toBeInTheDocument();
  });

  it('moves the focus to the next deck\'s Delete after a delete, and to Create Deck once the last deck is gone', async () => {
    mockedDelete.mockResolvedValueOnce(DELETED).mockResolvedValueOnce(DELETED);
    const user = userEvent.setup();
    render(<Harness initialDecks={DECKS} />);

    await deleteDeck(user, 0);
    await waitFor(() => expect(screen.queryByText('Deck One')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveFocus();

    await deleteDeck(user, 0);
    await waitFor(() => expect(screen.queryByText('Deck Two')).not.toBeInTheDocument());
    expect(screen.getByRole('link', { name: 'Create Deck' })).toHaveFocus();
  });

  it('asks nothing about a deck whose deletion is still on its way', async () => {
    let answer: (response: AxiosResponse) => void = () => {};
    mockedDelete.mockReturnValueOnce(new Promise(resolve => { answer = resolve; }));
    const user = userEvent.setup();
    render(<Harness initialDecks={DECKS} />);

    await deleteDeck(user, 0);
    await user.keyboard('{Enter}');

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    answer(DELETED);
    await waitFor(() => expect(screen.queryByText('Deck One')).not.toBeInTheDocument());
    expect(mockedDelete).toHaveBeenCalledTimes(1);
  });

  it('keeps the focus in a question opened while another deck\'s deletion is on its way', async () => {
    let answer: (response: AxiosResponse) => void = () => {};
    mockedDelete.mockReturnValueOnce(new Promise(resolve => { answer = resolve; }));
    const user = userEvent.setup();
    render(<Harness initialDecks={DECKS} />);
    await deleteDeck(user, 0);
    await user.click(screen.getAllByRole('button', { name: 'Delete' })[1]);
    const cancel = within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancel' });

    answer(DELETED);
    await waitFor(() => expect(screen.queryByText('Deck One')).not.toBeInTheDocument());

    expect(cancel).toHaveFocus();
  });

  it('drops a deleted deck from the selection, so a game cannot open on it', async () => {
    mockedDelete.mockResolvedValueOnce(DELETED);
    const user = userEvent.setup();
    render(<Harness initialDecks={DECKS} />);
    await user.click(screen.getByText('Deck One'));

    await deleteDeck(user, 0);

    await waitFor(() => expect(screen.queryByText('Deck One')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
  });

  it('a failed delete keeps the deck, shows an error message and can be tried again', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failure = new AxiosError('Network Error', AxiosError.ERR_NETWORK);
    mockedDelete.mockRejectedValueOnce(failure);
    const user = userEvent.setup();
    render(<Harness initialDecks={DECKS} />);

    await deleteDeck(user, 0);

    expect(
      await screen.findByText('Failed to delete the deck. Please try again.')
    ).toBeInTheDocument();
    expect(screen.getByText('Deck One')).toBeInTheDocument();
    expect(consoleError).toHaveBeenCalledWith('Error deleting deck:', failure);
    consoleError.mockRestore();

    await user.click(screen.getAllByRole('button', { name: 'Delete' })[0]);
    expect(screen.getByRole('alertdialog', { name: 'Delete this deck?' })).toBeInTheDocument();
  });
});

describe('keyboard and screen readers', () => {
  it('selects a deck from the keyboard through its checkbox', async () => {
    const user = userEvent.setup();
    render(<Harness initialDecks={DECKS} />);

    await user.tab();
    await user.keyboard(' ');

    expect(checkboxOf('Deck One')).toHaveFocus();
    expect(checkboxOf('Deck One')).toBeChecked();
  });

  it('still toggles a deck, and its checkbox, when the tile itself is clicked', async () => {
    const user = userEvent.setup();
    render(<Harness initialDecks={DECKS} />);

    await user.click(screen.getByText('First deck'));
    expect(checkboxOf('Deck One')).toBeChecked();

    await user.click(screen.getByText('First deck'));
    expect(checkboxOf('Deck One')).not.toBeChecked();
  });
});