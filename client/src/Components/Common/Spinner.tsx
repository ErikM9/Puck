import React from 'react';

interface SpinnerProps {
  /* Read out in place of the ring, which says nothing on its own */
  label?: string;
}

/* A ring turning in the app's blue, centred in whatever space the page gives it while that page loads */
const Spinner: React.FC<SpinnerProps> = ({ label = 'Loading' }) => (
  <div className="spinner" role="status" aria-live="polite" aria-label={label}>
    <span className="spinner-ring" aria-hidden="true" />
  </div>
);

export default Spinner;