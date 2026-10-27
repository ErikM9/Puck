import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import apiClient from './api/client';
import { Deck } from './Components/CreateDecks/types';
import { networkFailure } from './test/apiErrors';

vi.mock('./api/client', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

const mockedGet = vi.mocked(apiClient.get);
const mockedPost = vi.mocked(apiClient.post);
const mockedPut = vi.mocked(apiClient.put);

/* App owns its BrowserRouter, so the entry point is set through the address bar */
const renderAt = (path: string) => {
  window.history.pushState({}, '', path);
  return render(<App />);
};

const asLoggedIn = () => localStorage.setItem('token', 'jwt-abc');

const DECK: Deck = {
  _id: 'd1',
  userId: 'u1',
  name: 'Capitals',
  description: 'Geography drills',
  flashcards: [
    { _id: 'f1', question: 'France', answer: 'Paris' },
    { _id: 'f2', question: 'Japan', answer: 'Tokyo' },
    { _id: 'f3', question: 'Peru', answer: 'Lima' },
  ],
};

/* A request that stays on its way until the test answers it, as one over a slow connection does */
const heldAnswer = <T,>() => {
  let resolve: (response: { data: T }) => void = () => {};
  const promise = new Promise<{ data: T }>(settle => { resolve = settle; });
  return { promise, answer: (data: T) => act(async () => resolve({ data })) };
};

type User = ReturnType<typeof userEvent.setup>;

const logIn = async (user: User) => {
  mockedPost.mockResolvedValueOnce({ data: { token: 'jwt-again' } });
  await user.type(await screen.findByLabelText('Email:'), 'muki@example.com');
  await user.type(screen.getByLabelText('Password:'), 'hunter22');
  await user.click(screen.getByRole('button', { name: 'Login' }));
};

const setDetail = async (user: User, button: string, field: string, value: string) => {
  await user.click(await screen.findByRole('button', { name: button }));
  await user.clear(screen.getByLabelText(field));
  await user.type(screen.getByLabelText(field), value);
  await user.click(screen.getByRole('button', { name: 'Done' }));
};

describe('App routing', () => {
  beforeEach(() => {
    mockedGet.mockResolvedValue({ data: [] });
  });

  it('shows the auth page to a signed-out visitor, with no log out and no request for decks', async () => {
    renderAt('/');

    expect(await screen.findByRole('heading', { name: 'Welcome to Puck' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Log out' })).not.toBeInTheDocument();
    expect(mockedGet).not.toHaveBeenCalled();
  });

  it.each(['/home', '/create-decks', '/edit-deck/d1', '/game-menu', '/flash-flip', '/flash-choice', '/flash-match', '/nonsense'])(
    'sends a signed-out visitor from %s to the auth page',
    async (path) => {
      renderAt(path);

      expect(await screen.findByRole('heading', { name: 'Welcome to Puck' })).toBeInTheDocument();
      expect(window.location.pathname).toBe('/');
    },
  );

  it.each([false, true])('opens the verification page from its link, signed in or not (%s)', async (signedIn) => {
    if (signedIn) asLoggedIn();
    mockedPost.mockResolvedValueOnce({ data: { message: 'Email verified! You can now log in.' } });

    renderAt('/verify-email?token=abc123');

    expect(await screen.findByText('Email verified! You can now log in.')).toBeInTheDocument();
    expect(mockedPost).toHaveBeenCalledWith('/auth/verify-email', { token: 'abc123' });
    expect(window.location.pathname).toBe('/verify-email');
  });

  it('sends a signed-in visitor from the auth page to their decks on home', async () => {
    mockedGet.mockResolvedValue({ data: [DECK] });
    asLoggedIn();

    renderAt('/');

    expect(await screen.findByRole('checkbox', { name: 'Select Capitals' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/home');
    expect(mockedGet).toHaveBeenCalledWith('/decks');
  });

  it('shows a spinner on home until the list of decks arrives', async () => {
    const list = heldAnswer<Deck[]>();
    mockedGet.mockReturnValueOnce(list.promise);
    asLoggedIn();
    renderAt('/home');
    expect(await screen.findByRole('status', { name: 'Loading your decks' })).toBeInTheDocument();

    await list.answer([]);

    expect(screen.queryByRole('status', { name: 'Loading your decks' })).not.toBeInTheDocument();
    expect(screen.getByText('You have no decks yet.')).toBeInTheDocument();
  });

  it.each(['/game-menu', '/flash-flip', '/flash-choice', '/flash-match', '/nonsense'])(
    'sends a signed-in visitor from %s to home while no deck is picked',
    async (path) => {
      asLoggedIn();

      renderAt(path);

      expect(await screen.findByRole('heading', { name: 'Home' })).toBeInTheDocument();
      expect(window.location.pathname).toBe('/home');
    },
  );

  it('opens the game menu once a deck is picked', async () => {
    mockedGet.mockResolvedValue({ data: [DECK] });
    asLoggedIn();
    const user = userEvent.setup();
    renderAt('/home');

    await user.click(await screen.findByRole('checkbox', { name: 'Select Capitals' }));
    await user.click(screen.getByRole('button', { name: /continue/i }));

    expect(await screen.findByRole('heading', { name: 'Game Menu' })).toBeInTheDocument();
  });

  it('unpicks a deck that is picked a second time', async () => {
    mockedGet.mockResolvedValue({ data: [DECK] });
    asLoggedIn();
    const user = userEvent.setup();
    renderAt('/home');
    const deck = await screen.findByRole('checkbox', { name: 'Select Capitals' });

    await user.click(deck);
    await user.click(deck);

    expect(deck).not.toBeChecked();
    expect(screen.getByRole('button', { name: /continue/i })).toBeDisabled();
  });

  it('logging in keeps the token and opens home', async () => {
    const user = userEvent.setup();
    renderAt('/');

    await logIn(user);

    expect(await screen.findByRole('heading', { name: 'Home' })).toBeInTheDocument();
    expect(localStorage.getItem('token')).toBe('jwt-again');
  });

  it('logging out clears the token and returns to the auth page', async () => {
    asLoggedIn();
    const user = userEvent.setup();
    renderAt('/home');

    await user.click(await screen.findByRole('button', { name: 'Log out' }));

    expect(localStorage.getItem('token')).toBeNull();
    expect(await screen.findByRole('heading', { name: 'Welcome to Puck' })).toBeInTheDocument();
  });

  it('logging out also forgets which decks were selected', async () => {
    mockedGet.mockResolvedValue({ data: [DECK] });
    asLoggedIn();
    const user = userEvent.setup();
    renderAt('/home');
    await user.click(await screen.findByRole('checkbox', { name: 'Select Capitals' }));
    expect(screen.getByRole('checkbox', { name: 'Select Capitals' })).toBeChecked();

    await user.click(screen.getByRole('button', { name: 'Log out' }));
    await logIn(user);

    expect(await screen.findByRole('checkbox', { name: 'Select Capitals' })).not.toBeChecked();
    expect(screen.getByRole('button', { name: /continue/i })).toBeDisabled();
  });

  it('drops a list of decks that arrives after its session has ended', async () => {
    const firstList = heldAnswer<Deck[]>();
    mockedGet.mockReturnValueOnce(firstList.promise);
    asLoggedIn();
    const user = userEvent.setup();
    renderAt('/home');

    await user.click(await screen.findByRole('button', { name: 'Log out' }));
    await firstList.answer([DECK]);
    await logIn(user);

    expect(await screen.findByText('You have no decks yet.')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Select Capitals' })).not.toBeInTheDocument();
  });

  it('shows an edited deck on home in place of its old copy, beside the decks left alone', async () => {
    const rivers: Deck = { ...DECK, _id: 'd2', name: 'Rivers' };
    mockedGet.mockImplementation(async (url: string) => ({ data: url === '/decks' ? [DECK, rivers] : DECK }));
    mockedPut.mockResolvedValueOnce({ data: { ...DECK, name: 'Countries' } });
    asLoggedIn();
    const user = userEvent.setup();
    renderAt('/home');
    await user.click((await screen.findAllByRole('button', { name: 'Edit' }))[0]);

    await setDetail(user, 'Edit deck name', 'Deck Name:', 'Countries');
    await user.click(screen.getByRole('button', { name: 'Save Deck' }));

    expect(await screen.findByRole('checkbox', { name: 'Select Countries' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Select Rivers' })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Select Capitals' })).not.toBeInTheDocument();
  });

  it('keeps a deck saved while the list of decks was still on its way', async () => {
    const list = heldAnswer<Deck[]>();
    mockedGet.mockReturnValueOnce(list.promise);
    mockedPost.mockResolvedValueOnce({ data: DECK });
    asLoggedIn();
    const user = userEvent.setup();
    renderAt('/create-decks');
    await setDetail(user, 'Edit deck name', 'Deck Name:', DECK.name);
    await setDetail(user, 'Edit description', 'Description:', DECK.description);
    for (const { question, answer } of DECK.flashcards) {
      await user.click(screen.getByRole('button', { name: 'Add Flashcard' }));
      await user.type(screen.getByLabelText('Question:'), question);
      await user.type(screen.getByLabelText('Answer:'), answer);
      await user.click(screen.getByRole('button', { name: 'Done' }));
    }

    await user.click(screen.getByRole('button', { name: 'Save Deck' }));
    /* The list asked for on signing in answers only once the deck is saved, and without it */
    await list.answer([]);

    expect(await screen.findByRole('checkbox', { name: 'Select Capitals' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/home');
  });

  it('keeps an edit saved while the list of decks was still on its way', async () => {
    const list = heldAnswer<Deck[]>();
    mockedGet.mockImplementation(async (url: string) => (url === '/decks' ? list.promise : { data: DECK }));
    mockedPut.mockResolvedValueOnce({ data: { ...DECK, name: 'Countries' } });
    asLoggedIn();
    const user = userEvent.setup();
    renderAt('/edit-deck/d1');

    await setDetail(user, 'Edit deck name', 'Deck Name:', 'Countries');
    await user.click(screen.getByRole('button', { name: 'Save Deck' }));
    /* The list answers once the edit is saved, still holding the deck under its old name */
    await list.answer([DECK]);

    expect(await screen.findByRole('checkbox', { name: 'Select Countries' })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Select Capitals' })).not.toBeInTheDocument();
  });

  it('survives a failed deck fetch without blanking the page', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockedGet.mockRejectedValueOnce(networkFailure());
    asLoggedIn();

    renderAt('/home');

    expect(await screen.findByRole('heading', { name: 'Home' })).toBeInTheDocument();
    await waitFor(() => expect(consoleError).toHaveBeenCalledWith('Error fetching decks:', expect.any(Error)));
    consoleError.mockRestore();
  });
});