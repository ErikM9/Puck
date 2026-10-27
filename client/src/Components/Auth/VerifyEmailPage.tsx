import React, { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import apiClient from '../../api/client';
import Spinner from '../Common/Spinner';
import { extractError } from '../Common/apiError';

/* Waiting on the server, verified, or refused, with the message the visitor reads for the last two */
type Outcome = { state: 'checking' } | { state: 'verified' | 'failed'; message: string };

const NO_TOKEN = 'This verification link is invalid or has expired.';

/* The page the link in the verification email opens, which spends the link's token and says how it went */
const VerifyEmailPage: React.FC = () => {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [outcome, setOutcome] = useState<Outcome>(token ? { state: 'checking' } : { state: 'failed', message: NO_TOKEN });
  /* A token is sent once, as the first request spends it and a second, as StrictMode would make, could only be refused */
  const sent = useRef<string | null>(null);

  useEffect(() => {
    if (!token || sent.current === token) return;
    sent.current = token;
    apiClient.post('/auth/verify-email', { token })
      .then(response => setOutcome({ state: 'verified', message: response.data.message }))
      .catch(err => setOutcome({ state: 'failed', message: extractError(err, 'Could not verify the link. Please try again.') }));
  }, [token]);

  return (
    <div className="verify-page">
      <h2 className="page-heading">Email Verification</h2>
      {outcome.state === 'checking' ? (
        <Spinner label="Verifying your email" />
      ) : (
        <>
          <p className={outcome.state === 'verified' ? 'verify-result verified' : 'verify-result'} role="status">
            {outcome.message}
          </p>
          {outcome.state === 'failed' && (
            <p className="verify-hint">A link can be used once and lasts 24 hours. Log in to ask for a new one.</p>
          )}
          <Link to="/" className="button verify-login">Go to login</Link>
        </>
      )}
    </div>
  );
};

export default VerifyEmailPage;