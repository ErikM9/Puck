import { StrictMode } from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import VerifyEmailPage from './VerifyEmailPage';
import apiClient from '../../api/client';
import { apiRefusal, networkFailure } from '../../test/apiErrors';

vi.mock('../../api/client', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

const mockedPost = vi.mocked(apiClient.post);

const renderAt = (search: string, { strict = false } = {}) => {
  const page = (
    <MemoryRouter initialEntries={[`/verify-email${search}`]}>
      <Routes>
        <Route path="/verify-email" element={<VerifyEmailPage />} />
      </Routes>
    </MemoryRouter>
  );
  return render(strict ? <StrictMode>{page}</StrictMode> : page);
};

describe('VerifyEmailPage', () => {
  it('spends the token from the link and reports the account unlocked, with the way to the form', async () => {
    mockedPost.mockResolvedValueOnce({ data: { message: 'Email verified! You can now log in.' } });

    renderAt('?token=abc123');

    expect(screen.getByRole('status', { name: 'Verifying your email' })).toBeInTheDocument();
    expect(await screen.findByText('Email verified! You can now log in.')).toBeInTheDocument();
    expect(mockedPost).toHaveBeenCalledWith('/auth/verify-email', { token: 'abc123' });
    expect(screen.getByRole('link', { name: 'Go to login' })).toHaveAttribute('href', '/');
    expect(screen.queryByText(/A link can be used once/)).not.toBeInTheDocument();
  });

  /* The first request spends the token, so the second mount StrictMode makes must send nothing */
  it('sends the token once, however many times the page mounts', async () => {
    mockedPost.mockResolvedValueOnce({ data: { message: 'Email verified! You can now log in.' } });

    renderAt('?token=abc123', { strict: true });

    expect(await screen.findByText('Email verified! You can now log in.')).toBeInTheDocument();
    expect(mockedPost).toHaveBeenCalledTimes(1);
  });

  it('shows why a link was refused, and how to get another', async () => {
    mockedPost.mockRejectedValueOnce(apiRefusal(400, { message: 'This verification link is invalid or has expired.' }));

    renderAt('?token=stale');

    expect(await screen.findByText('This verification link is invalid or has expired.')).toBeInTheDocument();
    expect(screen.getByText('A link can be used once and lasts 24 hours. Log in to ask for a new one.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to login' })).toBeInTheDocument();
  });

  it('falls back to a generic message when the request never reaches the server', async () => {
    mockedPost.mockRejectedValueOnce(networkFailure());

    renderAt('?token=abc123');

    expect(await screen.findByText('Could not verify the link. Please try again.')).toBeInTheDocument();
  });

  it('refuses a link with no token without asking the server', () => {
    renderAt('');

    expect(screen.getByText('This verification link is invalid or has expired.')).toBeInTheDocument();
    expect(mockedPost).not.toHaveBeenCalled();
  });
});