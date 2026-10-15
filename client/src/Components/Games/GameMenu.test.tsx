import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import GameMenu from './GameMenu';

describe('GameMenu', () => {
  it('lists all three games with Play links to the right routes, plus a way home', () => {
    render(
      <MemoryRouter>
        <GameMenu />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: 'FlashFlip' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'FlashChoice' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'FlashMatch' })).toBeInTheDocument();

    expect(screen.getByRole('link', { name: 'Play FlashFlip' })).toHaveAttribute('href', '/flash-flip');
    expect(screen.getByRole('link', { name: 'Play FlashChoice' })).toHaveAttribute('href', '/flash-choice');
    expect(screen.getByRole('link', { name: 'Play FlashMatch' })).toHaveAttribute('href', '/flash-match');

    expect(screen.getByRole('link', { name: 'Back to Home' })).toHaveAttribute('href', '/home');
  });
});