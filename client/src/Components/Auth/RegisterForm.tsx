import React, { useState, useEffect, useRef } from 'react';
import apiClient from '../../api/client';
import FitText from '../Common/FitText';
import { centreLabel } from '../Common/textInk';
import { extractError } from '../Common/apiError';
import { credentialsMissing } from './credentialsMissing';
import { labelSize } from './labelSize';

interface RegisterFormProps {
  onSwitchToLogin: () => void;
}

/* Creates the account, then hands over to the login tab once the message has been read, unless a verification link is on its way */
const RegisterForm: React.FC<RegisterFormProps> = ({ onSwitchToLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  /* Held so the handover can be cancelled if the form goes away before it fires */
  const switchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (switchTimer.current) clearTimeout(switchTimer.current);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    /* Caught here, as the server would only call a blank address malformed */
    const missing = credentialsMissing(email, password);
    if (missing) {
      setError(missing);
      return;
    }
    setIsLoading(true);

    try {
      const response = await apiClient.post('/auth/register', { email, password });
      setSuccess(response.data.message);
      /* A visitor who has to open an email first keeps the message, and the tabs, until they come back */
      if (!response.data.verificationPending) {
        switchTimer.current = setTimeout(() => onSwitchToLogin(), 2000);
      }
    } catch (err) {
      setError(extractError(err, 'Registration failed. Please try again.'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form className="auth-form" onSubmit={handleSubmit} noValidate>
      <label htmlFor="register-email" className="auth-label">Email:</label>
      <input
        id="register-email"
        className="auth-input"
        type="email"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoComplete="email"
        required
      />
      <label htmlFor="register-password" className="auth-label">Password:</label>
      <input
        id="register-password"
        className="auth-input"
        type="password"
        placeholder="At least 6 characters"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="new-password"
        required
      />
      {error && <p className="error-message" role="alert">{error}</p>}
      {success && <p className="success-message" role="status">{success}</p>}
      {/* Stays disabled after success, as the account exists and a second press would only be refused */}
      <button className="auth-button button" type="submit" disabled={isLoading || !!success}>
        <FitText className="auth-btn-label reg" axis="width" heavier="600" max={labelSize('Register')} min={10} onFit={centreLabel}>Register</FitText>
      </button>
      <p className="auth-form-tip">
        <span className="auth-tip-key">Tip:</span> mix letters, numbers &amp; symbols.
      </p>
    </form>
  );
};

export default RegisterForm;