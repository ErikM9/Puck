import React, { useState } from 'react';
import { isAxiosError } from 'axios';
import apiClient from '../../api/client';
import FitText from '../Common/FitText';
import { centreLabel } from '../Common/textInk';
import { extractError } from '../Common/apiError';
import { credentialsMissing } from './credentialsMissing';
import { labelSize } from './labelSize';

interface LoginFormProps {
  onLogin: (token: string) => void;
  onForgotPassword: () => void;
}

/* The refusal an unverified account gets, which carries the flag that offers a new link */
const needsVerification = (err: unknown) =>
  isAxiosError(err) && err.response?.status === 403 && err.response.data?.verificationPending === true;

/* Hands the token up to App on success, which is what flips the whole app to signed in */
const LoginForm: React.FC<LoginFormProps> = ({ onLogin, onForgotPassword }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [unverified, setUnverified] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setUnverified(false);

    /* Caught here, as the server would only call a blank form's credentials wrong */
    const missing = credentialsMissing(email, password);
    if (missing) {
      setError(missing);
      return;
    }
    setIsLoading(true);

    try {
      const response = await apiClient.post('/auth/login', { email, password });
      onLogin(response.data.token);
    } catch (err) {
      setUnverified(needsVerification(err));
      setError(extractError(err, 'Login failed. Please try again.'));
    } finally {
      setIsLoading(false);
    }
  };

  /* Asks for another verification email for the address in the form, and reports the server's reply */
  const resendVerification = async () => {
    setIsLoading(true);
    try {
      const response = await apiClient.post('/auth/resend-verification', { email });
      setError(null);
      setUnverified(false);
      setNotice(response.data.message);
    } catch (err) {
      setError(extractError(err, 'Could not send a new link. Please try again.'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form className="auth-form" onSubmit={handleSubmit} noValidate>
      <label htmlFor="login-email" className="auth-label">Email:</label>
      <input
        id="login-email"
        className="auth-input"
        type="email"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoComplete="email"
        required
      />
      <label htmlFor="login-password" className="auth-label">Password:</label>
      <input
        id="login-password"
        className="auth-input"
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="current-password"
        required
      />
      {error && (
        <p className="error-message" role="alert">
          {error}
          {/* The offer sits inside the message, as the message is a bubble under the card rather than a line in the form */}
          {unverified && (
            <>
              {' '}
              <button type="button" className="auth-inline-link" onClick={resendVerification} disabled={isLoading}>
                Resend the link
              </button>
            </>
          )}
        </p>
      )}
      {notice && <p className="success-message" role="status">{notice}</p>}
      <button className="auth-button button" type="submit" disabled={isLoading}>
        <FitText className="auth-btn-label login" axis="width" heavier="600" max={labelSize('Login')} min={10} onFit={centreLabel}>Login</FitText>
      </button>
      <button type="button" className="auth-link center" onClick={onForgotPassword}>
        Forgot your password?
      </button>
    </form>
  );
};

export default LoginForm;