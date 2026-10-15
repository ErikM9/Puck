import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ForgotPasswordForm from './ForgotPasswordForm';

import apiClient from '../../api/client';
import { drawnExtent } from '../Common/textInk';
import { apiRefusal } from '../../test/apiErrors';

vi.mock('../../api/client', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

/* jsdom draws no letters, so where the heading's and the label's show is given by the test that needs it */
vi.mock('../Common/textInk', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../Common/textInk')>()),
  drawnExtent: vi.fn(() => null),
}));

const mockedPost = vi.mocked(apiClient.post);
const GENERIC = 'If that email is registered, a recovery code has been sent.';

describe('ForgotPasswordForm', () => {
  const onBackToLogin = vi.fn();

  const renderForm = () => render(<ForgotPasswordForm onBackToLogin={onBackToLogin} />);

  const reachCodeStep = async (user: ReturnType<typeof userEvent.setup>) => {
    mockedPost.mockResolvedValueOnce({ data: { message: GENERIC } });
    await user.type(screen.getByLabelText('Email:'), 'muki@example.com');
    await user.click(screen.getByRole('button', { name: 'Get Code' }));
    await act(async () => {});
  };

  it('sets the copy\'s bubble midway between the heading\'s letters above it and the label\'s below', () => {
    /* The heading's letters end at 40 and the label's start at 200, so a bubble 100 tall standing at 50 moves down 20 */
    vi.mocked(drawnExtent).mockImplementation(el => (el.classList.contains('recover-title') ? { top: 20, bottom: 40 }
      : el.classList.contains('auth-label') ? { top: 200, bottom: 215 } : null));
    const realBox = HTMLElement.prototype.getBoundingClientRect;
    const box = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (!this.classList.contains('recover-desc')) return realBox.call(this);
      const top = 50 + (parseFloat(this.style.marginTop) || 0);
      return { top, bottom: top + 100, left: 0, right: 300, width: 300, height: 100 } as DOMRect;
    });
    const width = vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (this: HTMLElement) {
      return this.classList.contains('recover-desc') ? 300 : 0;
    });
    onTestFinished(() => {
      box.mockRestore();
      width.mockRestore();
      vi.mocked(drawnExtent).mockImplementation(() => null);
    });

    renderForm();

    expect(parseFloat((document.querySelector('.recover-desc') as HTMLElement).style.marginTop)).toBe(20);
  });

  it('walks the full recovery flow: email, then code, then the new password', async () => {
    const user = userEvent.setup();
    renderForm();

    await reachCodeStep(user);
    expect(mockedPost).toHaveBeenLastCalledWith('/auth/forgot-password', { email: 'muki@example.com' });
    expect(screen.getByText(/a 6-⁠digit code is on its way to it/)).toBeInTheDocument();

    mockedPost.mockResolvedValueOnce({ data: { message: 'Code verified.' } });
    await user.type(screen.getByLabelText('Recovery Code:'), '123456');
    await user.click(screen.getByRole('button', { name: 'Verify' }));
    await act(async () => {});
    expect(mockedPost).toHaveBeenLastCalledWith('/auth/verify-reset-code', {
      email: 'muki@example.com',
      code: '123456',
    });

    mockedPost.mockResolvedValueOnce({
      data: { message: 'Password reset successful! Please log in.' },
    });
    await user.type(screen.getByLabelText('New Password:'), 'newpass1');
    await user.click(screen.getByRole('button', { name: 'Reset' }));
    await act(async () => {});

    expect(mockedPost).toHaveBeenLastCalledWith('/auth/reset-password', {
      email: 'muki@example.com',
      code: '123456',
      newPassword: 'newpass1',
    });
    expect(onBackToLogin).toHaveBeenCalledTimes(1);
    /* The panel hands straight back to login, so its control stays pressed rather than being offered again */
    expect(screen.getByRole('button', { name: 'Reset' })).toBeDisabled();
  });

  it('"Back to Login" leaves recovery without sending anything', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole('button', { name: 'Back to Login' }));

    expect(onBackToLogin).toHaveBeenCalledTimes(1);
    expect(mockedPost).not.toHaveBeenCalled();
  });

  /* --- The email step --- */
  it.each(['muki.example.com', 'muki@example'])('refuses the malformed address %s without troubling the server', async (address) => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText('Email:'), address);
    await user.click(screen.getByRole('button', { name: 'Get Code' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Please enter a valid email address.');
    expect(mockedPost).not.toHaveBeenCalled();
  });

  it('keeps the visitor on the first step when the request itself fails', async () => {
    const user = userEvent.setup();
    renderForm();

    mockedPost.mockRejectedValueOnce(apiRefusal(500, { message: 'Internal server error' }));
    await user.type(screen.getByLabelText('Email:'), 'muki@example.com');
    await user.click(screen.getByRole('button', { name: 'Get Code' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Internal server error');
    expect(screen.queryByLabelText('Recovery Code:')).not.toBeInTheDocument();
  });

  /* --- The code step --- */
  it('shows the API error and stays on the code step when verification fails', async () => {
    const user = userEvent.setup();
    renderForm();
    await reachCodeStep(user);

    mockedPost.mockRejectedValueOnce(apiRefusal(429, { message: 'Too many attempts. Please request a new code.' }));
    await user.type(screen.getByLabelText('Recovery Code:'), '000000');
    await user.click(screen.getByRole('button', { name: 'Verify' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Too many attempts. Please request a new code.');
    expect(screen.getByLabelText('Recovery Code:')).toBeInTheDocument();
    expect(screen.queryByLabelText('New Password:')).not.toBeInTheDocument();
  });

  it('"Resend" requests a fresh code without leaving the code step', async () => {
    const user = userEvent.setup();
    renderForm();
    await reachCodeStep(user);

    mockedPost.mockResolvedValueOnce({ data: { message: GENERIC } });
    await user.click(screen.getByRole('button', { name: 'Resend' }));

    expect(mockedPost).toHaveBeenCalledTimes(2);
    expect(mockedPost).toHaveBeenLastCalledWith('/auth/forgot-password', {
      email: 'muki@example.com',
    });
    expect(screen.getByLabelText('Recovery Code:')).toBeInTheDocument();
  });

  it('keeps only the digits of whatever is typed as the code', async () => {
    const user = userEvent.setup();
    renderForm();
    await reachCodeStep(user);

    await user.type(screen.getByLabelText('Recovery Code:'), '12ab34');

    expect(screen.getByLabelText('Recovery Code:')).toHaveValue('1234');
  });

  it('holds Verify closed at five digits and opens it at six', async () => {
    const user = userEvent.setup();
    renderForm();
    await reachCodeStep(user);
    const field = screen.getByLabelText('Recovery Code:');

    await user.type(field, '12345');
    expect(screen.getByRole('button', { name: 'Verify' })).toBeDisabled();

    await user.type(field, '6');
    expect(screen.getByRole('button', { name: 'Verify' })).toBeEnabled();
  });

  it('stops at six digits however many are typed', async () => {
    const user = userEvent.setup();
    renderForm();
    await reachCodeStep(user);
    const field = screen.getByLabelText('Recovery Code:');

    await user.type(field, '1234567890');
    expect(field).toHaveValue('123456');
  });

  /* --- The password step --- */
  it('a rejected reset reports the reason and lets the visitor try again', async () => {
    const user = userEvent.setup();
    renderForm();
    await reachCodeStep(user);
    mockedPost.mockResolvedValueOnce({ data: { message: 'Code verified.' } });
    await user.type(screen.getByLabelText('Recovery Code:'), '123456');
    await user.click(screen.getByRole('button', { name: 'Verify' }));
    await act(async () => {});

    mockedPost.mockRejectedValueOnce(apiRefusal(400, { message: 'Password must be at least 6 characters long' }));
    await user.type(await screen.findByLabelText('New Password:'), 'abc');
    await user.click(screen.getByRole('button', { name: 'Reset' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('at least 6 characters');
    expect(screen.getByRole('button', { name: 'Reset' })).toBeEnabled();
    expect(onBackToLogin).not.toHaveBeenCalled();
  });
});