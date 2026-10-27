import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RegisterForm from './RegisterForm';
import apiClient from '../../api/client';
import { apiRefusal, networkFailure } from '../../test/apiErrors';

vi.mock('../../api/client', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

const mockedPost = vi.mocked(apiClient.post);

describe('RegisterForm', () => {
  const onSwitchToLogin = vi.fn();

  const renderForm = () => render(<RegisterForm onSwitchToLogin={onSwitchToLogin} />);

  const fillForm = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.type(screen.getByLabelText('Email:'), 'new@example.com');
    await user.type(screen.getByLabelText('Password:'), 'secret9');
  };

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    ['both fields', '', '', 'Please enter your email and password.'],
    ['the email', '', 'secret9', 'Please enter your email.'],
    ['the password', 'new@example.com', '', 'Please enter your password.'],
  ])('asks for %s when it is left empty, without sending anything', async (_label, email, password, message) => {
    const user = userEvent.setup();
    renderForm();

    if (email) await user.type(screen.getByLabelText('Email:'), email);
    if (password) await user.type(screen.getByLabelText('Password:'), password);
    await user.click(screen.getByRole('button', { name: 'Register' }));

    expect(screen.getByRole('alert')).toHaveTextContent(message);
    expect(mockedPost).not.toHaveBeenCalled();
  });

  it('keeps the message, and the button locked, while a verification link is on its way', async () => {
    vi.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mockedPost.mockResolvedValueOnce({
      data: { message: 'Registration successful! Open the link we have emailed you, then log in.', verificationPending: true },
    });
    renderForm();

    await fillForm(user);
    await user.click(screen.getByRole('button', { name: 'Register' }));
    await act(async () => {});
    act(() => { vi.advanceTimersByTime(5000); });

    expect(screen.getByRole('status')).toHaveTextContent('Open the link we have emailed you');
    expect(screen.getByRole('button', { name: 'Register' })).toBeDisabled();
    expect(onSwitchToLogin).not.toHaveBeenCalled();
  });

  it('confirms the account, locks the button and hands over to login two seconds later when no link is needed', async () => {
    vi.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mockedPost.mockResolvedValueOnce({
      data: { message: 'Registration successful! Please log in.', verificationPending: false },
    });
    renderForm();

    await fillForm(user);
    await user.click(screen.getByRole('button', { name: 'Register' }));
    await act(async () => {});

    expect(mockedPost).toHaveBeenCalledWith('/auth/register', {
      email: 'new@example.com',
      password: 'secret9',
    });
    expect(screen.getByRole('status')).toHaveTextContent('Registration successful! Please log in.');
    expect(screen.getByRole('button', { name: 'Register' })).toBeDisabled();

    act(() => { vi.advanceTimersByTime(1999); });
    expect(onSwitchToLogin).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(1); });
    expect(onSwitchToLogin).toHaveBeenCalledTimes(1);
  });

  it('does not hand over to login if the form is dismissed before the pause elapses', async () => {
    vi.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mockedPost.mockResolvedValueOnce({
      data: { message: 'Registration successful! Please log in.', verificationPending: false },
    });
    const view = renderForm();

    await fillForm(user);
    await user.click(screen.getByRole('button', { name: 'Register' }));
    await act(async () => {});
    expect(screen.getByRole('status')).toBeInTheDocument();

    view.unmount();
    act(() => { vi.advanceTimersByTime(2000); });

    expect(onSwitchToLogin).not.toHaveBeenCalled();
  });

  it('shows why a registration was refused and lets the visitor try again', async () => {
    mockedPost.mockRejectedValueOnce(apiRefusal(400, { message: 'This email is already in use' }));
    const user = userEvent.setup();
    renderForm();

    await fillForm(user);
    await user.click(screen.getByRole('button', { name: 'Register' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('This email is already in use');
    expect(screen.getByRole('button', { name: 'Register' })).toBeEnabled();
    expect(onSwitchToLogin).not.toHaveBeenCalled();
  });

  it('falls back to a generic message when the request never reaches the server', async () => {
    mockedPost.mockRejectedValueOnce(networkFailure());
    const user = userEvent.setup();
    renderForm();

    await fillForm(user);
    await user.click(screen.getByRole('button', { name: 'Register' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Registration failed. Please try again.'
    );
  });
});