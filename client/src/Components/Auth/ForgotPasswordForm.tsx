import React, { useState } from 'react';
import apiClient from '../../api/client';
import FitText from '../Common/FitText';
import { extractError } from '../Common/apiError';
import { centreLabel, drawnExtent } from '../Common/textInk';
import { labelSize } from './labelSize';

interface ForgotPasswordFormProps {
  onBackToLogin: () => void;
}

/* The recovery steps, which ask for a code, prove it and then spend it on a new password */
type Step = 'email' | 'code' | 'password';

/* One block of copy per step, each as long as the others, so all three fill the bubble at the same size and line count */
const STEP_COPY: Record<Step, string> = {
  /* A word joiner keeps "6-digit" whole across the end of a line, here and in the code step */
  email:
    'Forgot your password? Just enter the email address linked to your account below and we\u2019ll send you ' +
    'a one-time 6-\u2060digit code, valid for 15 minutes, so that you can set a new password. It usually ' +
    'arrives within a minute or two; if it doesn\u2019t, check your spam folder.',
  code:
    'If that email address is registered, a 6-\u2060digit code is on its way to it. Type it into the box ' +
    'below to prove that the account is yours. It lasts 15 minutes and works just once, and five wrong tries ' +
    'cancel it. Your account stays as it is until you choose a new password.',
  password:
    'That code is correct, so the account is back in your hands. All that is left is to choose a strong ' +
    'password at least six characters long and ideally one that you have never used anywhere else. Your old ' +
    'password will stop working the moment you save the new one.',
};

/* The bubble is sized for every step's copy at once, so its text stays one size from step to step */
const ALL_COPY = Object.values(STEP_COPY);

/* Pixels kept clear between the bubble and the heading's letters above it, and the label's below it */
const BUBBLE_GAP = 8;
/* The share of the room left between those gaps that the bubble takes, the rest split evenly above and below it */
const BUBBLE_SHARE = 0.93;

/* Finds where the heading's letters above the bubble and the label's letters below it are drawn */
const bubbleBounds = (bubble: HTMLElement) => {
  const root = bubble.parentElement;
  const title = root?.querySelector<HTMLElement>('.recover-title');
  const label = root?.querySelector<HTMLElement>('.auth-form .auth-label');
  const above = title ? drawnExtent(title) : null;
  const below = label ? drawnExtent(label) : null;
  return above && below && bubble.offsetWidth > 0 ? { above, below } : null;
};

/* Gives the height the bubble may take in its own unzoomed pixels, or null where the letters cannot be measured */
const bubbleRoom = (bubble: HTMLElement) => {
  const bounds = bubbleBounds(bubble);
  if (!bounds) return null;
  const zoom = bubble.getBoundingClientRect().width / bubble.offsetWidth;
  return ((bounds.below.top - bounds.above.bottom) / zoom - 2 * BUBBLE_GAP) * BUBBLE_SHARE;
};

/* Sets the bubble midway between the heading's letters and the label's, so the space above and below it looks the same */
const centreBubble = (bubble: HTMLElement) => {
  const bounds = bubbleBounds(bubble);
  if (!bounds) return;
  const box = bubble.getBoundingClientRect();
  const zoom = box.width / bubble.offsetWidth;
  const shift = ((bounds.above.bottom + bounds.below.top - box.height) / 2 - box.top) / zoom;
  /* A shift under a twentieth of a pixel is left alone, or each nudge would move the box and call for another */
  if (Math.abs(shift) < 0.05) return;
  const margin = parseFloat(getComputedStyle(bubble).marginTop) || 0;
  bubble.style.marginTop = `${(margin + shift).toFixed(2)}px`;
};

/* Caught here as well as on the server, since there is nothing to send to a bad address */
const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

/* Password recovery, where the heading and the bubble stay put and only the form beneath them changes per step */
const ForgotPasswordForm: React.FC<ForgotPasswordFormProps> = ({ onBackToLogin }) => {
  const [step, setStep]               = useState<Step>('email');
  const [email, setEmail]             = useState('');
  const [code, setCode]               = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError]             = useState<string | null>(null);
  const [isLoading, setIsLoading]     = useState(false);

  const requestCode = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError(null);

    if (!isValidEmail(email)) {
      setError('Please enter a valid email address.');
      return;
    }
    setIsLoading(true);
    try {
      await apiClient.post('/auth/forgot-password', { email });
      setStep('code');
    } catch (err) {
      setError(extractError(err, 'Could not request a code. Please try again.'));
    } finally {
      setIsLoading(false);
    }
  };

  const verifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      await apiClient.post('/auth/verify-reset-code', { email, code });
      setStep('password');
    } catch (err) {
      setError(extractError(err, 'Invalid or expired code.'));
    } finally {
      setIsLoading(false);
    }
  };

  const resetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      await apiClient.post('/auth/reset-password', { email, code, newPassword });
      /* Left loading on purpose, so the control stays pressed until login takes the panel */
      onBackToLogin();
    } catch (err) {
      setError(extractError(err, 'Could not reset the password. Please try again.'));
      setIsLoading(false);
    }
  };

  const renderStep = () => {
    if (step === 'email') {
      return (
        <form className="auth-form" onSubmit={requestCode} noValidate>
          <label htmlFor="recover-email" className="auth-label">Email:</label>
          <input
            id="recover-email"
            className="auth-input"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
          {error && <p className="error-message" role="alert">{error}</p>}
          <button className="auth-recovery-btn" type="submit" disabled={isLoading}>
            <FitText className="auth-btn-label" axis="width" heavier="600" max={labelSize('Get Code')} min={10} onFit={centreLabel}>Get Code</FitText>
          </button>
          <button type="button" className="auth-backlink" onClick={onBackToLogin}>
            Back to Login
          </button>
        </form>
      );
    }

    if (step === 'code') {
      return (
        <form className="auth-form" onSubmit={verifyCode} noValidate>
          <label htmlFor="recover-code" className="auth-label">Recovery Code:</label>
          <input
            id="recover-code"
            className="auth-input"
            type="text"
            inputMode="numeric"
            placeholder="6-digit code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            autoComplete="one-time-code"
            required
          />
          {error && <p className="error-message" role="alert">{error}</p>}
          <div className="auth-recovery-row">
            <button className="auth-recovery-btn" type="submit"
              disabled={isLoading || code.length !== 6}>
              <FitText className="auth-btn-label" axis="width" heavier="600" max={labelSize('Verify')} min={10} onFit={centreLabel}>Verify</FitText>
            </button>
            <button type="button" className="auth-recovery-btn"
              onClick={() => requestCode()} disabled={isLoading}>
              <FitText className="auth-btn-label" axis="width" heavier="600" max={labelSize('Resend')} min={10} onFit={centreLabel}>Resend</FitText>
            </button>
          </div>
          <button type="button" className="auth-backlink" onClick={onBackToLogin}>
            Back to Login
          </button>
        </form>
      );
    }

    return (
      <form className="auth-form" onSubmit={resetPassword} noValidate>
        <label htmlFor="recover-password" className="auth-label">New Password:</label>
        <input
          id="recover-password"
          className="auth-input"
          type="password"
          placeholder="At least 6 characters"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          autoComplete="new-password"
          required
        />
        {error && <p className="error-message" role="alert">{error}</p>}
        <button className="auth-recovery-btn" type="submit" disabled={isLoading}>
          <FitText className="auth-btn-label" axis="width" heavier="600" max={labelSize('Reset')} min={10} onFit={centreLabel}>Reset</FitText>
        </button>
        <button type="button" className="auth-backlink" onClick={onBackToLogin}>
          Back to Login
        </button>
      </form>
    );
  };

  return (
    <div className="recover-root">
      <h3 className="recover-title">Password Recovery</h3>
      <FitText className="recover-desc" max={20} min={9} spanBox alike={ALL_COPY} room={bubbleRoom} onFit={centreBubble}>
        {STEP_COPY[step]}
      </FitText>
      {renderStep()}
    </div>
  );
};

export default ForgotPasswordForm;