import React, { useRef, useState } from 'react';
import LoginForm from './LoginForm';
import RegisterForm from './RegisterForm';
import ForgotPasswordForm from './ForgotPasswordForm';
import FitText from '../Common/FitText';
import { centreLabel } from '../Common/textInk';
import { useColumnsScale } from './columnsScale';

interface AuthPageProps {
  onLogin: (token: string) => void;
}

/* Which form the card is showing, where recover is reached from the forgot link */
type AuthView = 'login' | 'register' | 'recover';

/* The signed-out page, with two columns of copy beside the card that holds the forms */
const AuthPage: React.FC<AuthPageProps> = ({ onLogin }) => {
  const [view, setView] = useState<AuthView>('login');
  const pageRef = useRef<HTMLDivElement>(null);
  /* Where the screen is wide enough for all three columns, they are drawn as large as the room allows */
  useColumnsScale(pageRef);

  return (
    <div className="auth-page" ref={pageRef}>

      <div className="auth-welcome">
        <h2 className="auth-col-title">Your Journey Begins</h2>
        <p className="auth-welcome-desc">
          Every great adventure begins with a little curiosity and the right guide. Puck is your enchanted
          study companion&nbsp;— a place where knowledge takes the shape of cards, and learning feels less
          like a chore and more like a game you want to play.
        </p>
        <p className="auth-welcome-desc">
          Create your own decks, fill them with whatever you wish to carry in your mind, and let Puck help you
          carry it there. Whether you are preparing for an exam, learning a new language, or simply indulging
          a hunger for knowledge&nbsp;— you are in the right place.
        </p>
        <p className="auth-welcome-desc">
          Sign in to pick up where you left off, or register to begin your first deck. It takes a minute to
          start and a lifetime to finish&nbsp;— your knowledge awaits.
        </p>
      </div>

      <div className="auth-games">
        <h2 className="auth-col-title">Three Ways to Study</h2>
        <div className="auth-game-entry">
          <h3 className="auth-game-name">FlashFlip</h3>
          <p className="auth-game-desc">
            Browse your deck one card at a time. Tap a card to reveal its answer, then step forwards or back
            through the deck at your own pace.
          </p>
        </div>
        <div className="auth-game-entry">
          <h3 className="auth-game-name">FlashChoice</h3>
          <p className="auth-game-desc">
            A question appears alongside a handful of options, and only one of them is true. Choose it, then
            work through every card to complete the round.
          </p>
        </div>
        <div className="auth-game-entry">
          <h3 className="auth-game-name">FlashMatch</h3>
          <p className="auth-game-desc">
            Questions on one side, shuffled answers on the other. Match each question to its answer and watch
            the pairs vanish until the board is clear.
          </p>
        </div>
      </div>

      <div className="auth-form-col">
        <h2 className="auth-form-heading">Welcome to Puck</h2>
        <div className="auth-form-container">
          {/* Recovery takes the whole card, so the tabs step aside while it is open */}
          {view !== 'recover' && (
          <div className="auth-tabs" role="tablist">
            <button
              role="tab"
              aria-selected={view === 'login'}
              className={`auth-tab ${view === 'login' ? 'active' : ''}`}
              onClick={() => setView('login')}
            >
              {/* Set at the size "Register" fits at, so both tabs' words match, each centred by its letters across and down */}
              <FitText className="auth-tab-label" axis="width" max={20} min={12} sizedAs="Register" onFit={centreLabel}>Login</FitText>
            </button>
            <button
              role="tab"
              aria-selected={view === 'register'}
              className={`auth-tab ${view === 'register' ? 'active' : ''}`}
              onClick={() => setView('register')}
            >
              <FitText className="auth-tab-label" axis="width" max={20} min={12} onFit={centreLabel}>Register</FitText>
            </button>
          </div>
          )}
          {view === 'login' && (
            <LoginForm onLogin={onLogin} onForgotPassword={() => setView('recover')} />
          )}
          {view === 'register' && (
            <RegisterForm onSwitchToLogin={() => setView('login')} />
          )}
          {view === 'recover' && (
            <ForgotPasswordForm onBackToLogin={() => setView('login')} />
          )}
        </div>
      </div>

    </div>
  );
};

export default AuthPage;