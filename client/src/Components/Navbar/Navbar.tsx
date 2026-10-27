import React from 'react';
import { useNavigate } from 'react-router-dom';

interface NavbarProps {
  isLoggedIn: boolean;
  onLogout: () => void;
}

/* Served from public/, so the path follows the base the site is built for */
const fairy = `${import.meta.env.BASE_URL}fairy.svg`;

/* Fixed header carrying the wordmark, and the log out control once there is a session */
const Navbar: React.FC<NavbarProps> = ({ isLoggedIn, onLogout }) => {
  const navigate = useNavigate();

  const handleLogout = () => {
    onLogout();
    navigate('/');
  };

  return (
    <nav className="navbar" aria-label="Main navigation">
      {isLoggedIn && (
        <button onClick={handleLogout} className="navbar-logout button" aria-label="Log out">
          Log out
        </button>
      )}
      <div className="navbar-brand">
        {/* Decorative, so both fairies stay hidden from anything reading the page aloud */}
        <img src={fairy} alt="" aria-hidden="true" className="navbar-fairy" />
        <span className="navbar-logo">Puck</span>
        <img src={fairy} alt="" aria-hidden="true" className="navbar-fairy navbar-fairy-right" />
      </div>
    </nav>
  );
};

export default Navbar;