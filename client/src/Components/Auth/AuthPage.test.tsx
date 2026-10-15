import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AuthPage from './AuthPage';
import apiClient from '../../api/client';

vi.mock('../../api/client', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

describe('AuthPage', () => {
  const onLogin = vi.fn();

  const renderPage = () => render(<AuthPage onLogin={onLogin} />);

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the login form with both tabs by default', () => {
    renderPage();

    expect(screen.getByRole('tab', { name: 'Login' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Register' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('button', { name: 'Login' })).toBeInTheDocument();
  });

  it('switches to the register form when the Register tab is clicked', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('tab', { name: 'Register' }));

    expect(screen.getByRole('tab', { name: 'Register' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Login' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('button', { name: 'Register' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Login' })).not.toBeInTheDocument();
  });

  it('switches back to the login form when the Login tab is clicked', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('tab', { name: 'Register' }));

    await user.click(screen.getByRole('tab', { name: 'Login' }));

    expect(screen.getByRole('tab', { name: 'Login' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('button', { name: 'Login' })).toBeInTheDocument();
  });

  it('hands over to the login form once a new account is confirmed', async () => {
    vi.useFakeTimers();
    vi.mocked(apiClient.post).mockResolvedValueOnce({ data: { message: 'Registration successful! Please log in.' } });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderPage();
    await user.click(screen.getByRole('tab', { name: 'Register' }));
    await user.type(screen.getByLabelText('Email:'), 'new@example.com');
    await user.type(screen.getByLabelText('Password:'), 'secret9');

    await user.click(screen.getByRole('button', { name: 'Register' }));
    await act(async () => {});
    act(() => { vi.advanceTimersByTime(2000); });

    expect(screen.getByRole('tab', { name: 'Login' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('button', { name: 'Login' })).toBeInTheDocument();
  });

  it('entering recovery hides the tabs and shows the recovery header instead', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Forgot your password?' }));

    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Password Recovery' })).toBeInTheDocument();
  });

  it('"Back to Login" restores the tabs and the login form', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: 'Forgot your password?' }));

    await user.click(screen.getByRole('button', { name: 'Back to Login' }));

    expect(screen.getByRole('tab', { name: 'Login' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('button', { name: 'Login' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Password Recovery' })).not.toBeInTheDocument();
  });
});