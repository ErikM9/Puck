import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LoginForm from './LoginForm';
import apiClient from '../../api/client';
import { apiRefusal, networkFailure } from '../../test/apiErrors';

vi.mock('../../api/client', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

const mockedPost = vi.mocked(apiClient.post);

describe('LoginForm', () => {
  const onLogin = vi.fn();
  const onForgotPassword = vi.fn();

  const renderForm = () =>
    render(<LoginForm onLogin={onLogin} onForgotPassword={onForgotPassword} />);

  const fillCredentials = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.type(screen.getByLabelText('Email:'), 'muki@example.com');
    await user.type(screen.getByLabelText('Password:'), 'hunter22');
  };

  it('submits the entered credentials and passes the returned token to onLogin', async () => {
    mockedPost.mockResolvedValueOnce({ data: { token: 'jwt-123' } });
    const user = userEvent.setup();
    renderForm();

    await fillCredentials(user);
    await user.click(screen.getByRole('button', { name: 'Login' }));

    expect(mockedPost).toHaveBeenCalledWith('/auth/login', {
      email: 'muki@example.com',
      password: 'hunter22',
    });
    expect(onLogin).toHaveBeenCalledWith('jwt-123');
  });

  it.each([
    ['both fields', '', '', 'Please enter your email and password.'],
    ['the email', '', 'hunter22', 'Please enter your email.'],
    ['the password', 'muki@example.com', '', 'Please enter your password.'],
  ])('asks for %s when it is left empty, without sending anything', async (_label, email, password, message) => {
    const user = userEvent.setup();
    renderForm();

    if (email) await user.type(screen.getByLabelText('Email:'), email);
    if (password) await user.type(screen.getByLabelText('Password:'), password);
    await user.click(screen.getByRole('button', { name: 'Login' }));

    expect(screen.getByRole('alert')).toHaveTextContent(message);
    expect(mockedPost).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Login' })).toBeEnabled();
  });

  it('shows why a sign-in was refused and lets the visitor try again', async () => {
    mockedPost.mockRejectedValueOnce(apiRefusal(401, { message: 'Invalid email or password' }));
    const user = userEvent.setup();
    renderForm();

    await fillCredentials(user);
    await user.click(screen.getByRole('button', { name: 'Login' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password');
    expect(screen.getByRole('button', { name: 'Login' })).toBeEnabled();
    expect(onLogin).not.toHaveBeenCalled();
  });

  it('offers a new verification link when the account is still unverified, and reports the reply', async () => {
    mockedPost.mockRejectedValueOnce(apiRefusal(403, { message: 'Please verify your email address first.', verificationPending: true }));
    mockedPost.mockResolvedValueOnce({ data: { message: 'If that email is registered and still unverified, a new link has been sent.' } });
    const user = userEvent.setup();
    renderForm();
    await fillCredentials(user);
    await user.click(screen.getByRole('button', { name: 'Login' }));
    const refusal = await screen.findByRole('alert');
    expect(refusal).toHaveTextContent('Please verify your email address first.');

    await user.click(within(refusal).getByRole('button', { name: 'Resend the link' }));

    expect(mockedPost).toHaveBeenLastCalledWith('/auth/resend-verification', { email: 'muki@example.com' });
    expect(await screen.findByRole('status')).toHaveTextContent('If that email is registered and still unverified, a new link has been sent.');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(onLogin).not.toHaveBeenCalled();
  });

  it('offers no new link for any other refusal', async () => {
    mockedPost.mockRejectedValueOnce(apiRefusal(403, { message: 'Too many requests from this IP, please try again later.' }));
    const user = userEvent.setup();
    renderForm();

    await fillCredentials(user);
    await user.click(screen.getByRole('button', { name: 'Login' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Too many requests');
    expect(screen.queryByRole('button', { name: 'Resend the link' })).not.toBeInTheDocument();
  });

  it('says when a new link could not be asked for', async () => {
    mockedPost.mockRejectedValueOnce(apiRefusal(403, { message: 'Please verify your email address first.', verificationPending: true }));
    mockedPost.mockRejectedValueOnce(networkFailure());
    const user = userEvent.setup();
    renderForm();
    await fillCredentials(user);
    await user.click(screen.getByRole('button', { name: 'Login' }));

    await user.click(await screen.findByRole('button', { name: 'Resend the link' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not send a new link. Please try again.');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('falls back to a generic message when the request never reaches the server', async () => {
    mockedPost.mockRejectedValueOnce(networkFailure());
    const user = userEvent.setup();
    renderForm();

    await fillCredentials(user);
    await user.click(screen.getByRole('button', { name: 'Login' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Login failed. Please try again.');
  });

  it('disables the button while the request is on its way', async () => {
    mockedPost.mockReturnValueOnce(new Promise(() => {}));
    const user = userEvent.setup();
    renderForm();

    await fillCredentials(user);
    await user.click(screen.getByRole('button', { name: 'Login' }));

    expect(screen.getByRole('button', { name: 'Login' })).toBeDisabled();
  });

  it('clicking "Forgot your password?" invokes onForgotPassword without submitting', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole('button', { name: 'Forgot your password?' }));

    expect(onForgotPassword).toHaveBeenCalledTimes(1);
    expect(mockedPost).not.toHaveBeenCalled();
  });
});