import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Navbar from './Navbar';

const mockNavigate = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => mockNavigate,
}));

describe('Navbar', () => {
  const renderNavbar = (isLoggedIn: boolean, onLogout = vi.fn()) =>
    render(
      <MemoryRouter>
        <Navbar isLoggedIn={isLoggedIn} onLogout={onLogout} />
      </MemoryRouter>
    );

  it('shows the brand but no logout button when logged out', () => {
    renderNavbar(false);

    expect(screen.getByText('Puck')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Log out' })).not.toBeInTheDocument();
  });

  it('shows the logout button when logged in', () => {
    renderNavbar(true);

    expect(screen.getByRole('button', { name: 'Log out' })).toBeInTheDocument();
  });

  it('hides the decorative fairies from assistive technology', () => {
    renderNavbar(true);

    expect(screen.getAllByRole('img', { hidden: true })).toHaveLength(2);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('logging out invokes onLogout and navigates to the auth page', async () => {
    const onLogout = vi.fn();
    const user = userEvent.setup();
    renderNavbar(true, onLogout);

    await user.click(screen.getByRole('button', { name: 'Log out' }));

    expect(onLogout).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });
});