import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { pressable } from './pressable';

const Tile = ({ onActivate, disabled }: { onActivate: () => void; disabled?: boolean }) => (
  <div {...pressable(onActivate, { disabled })}>Paris</div>
);

describe('pressable', () => {
  it('makes a tile reachable with Tab and pressable with a click, Enter or Space', async () => {
    const onActivate = vi.fn();
    const user = userEvent.setup();
    render(<Tile onActivate={onActivate} />);

    await user.tab();
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    await user.click(screen.getByRole('button', { name: 'Paris' }));

    expect(screen.getByRole('button', { name: 'Paris' })).toHaveFocus();
    expect(onActivate).toHaveBeenCalledTimes(3);
  });

  it('leaves other keys alone, so tabbing past a tile does not press it', async () => {
    const onActivate = vi.fn();
    const user = userEvent.setup();
    render(<><Tile onActivate={onActivate} /><button>Next</button></>);

    await user.tab();
    await user.keyboard('a');
    await user.tab();

    expect(screen.getByRole('button', { name: 'Next' })).toHaveFocus();
    expect(onActivate).not.toHaveBeenCalled();
  });

  it('keeps Space from scrolling the page', () => {
    render(<Tile onActivate={vi.fn()} />);

    /* fireEvent answers false when a listener cancels the event's default action */
    const scrolls = fireEvent.keyDown(screen.getByRole('button', { name: 'Paris' }), { key: ' ' });

    expect(scrolls).toBe(false);
  });

  it('takes a disabled tile out of the tab order and marks it unavailable', async () => {
    const user = userEvent.setup();
    render(<><Tile onActivate={vi.fn()} disabled /><button>Next</button></>);

    await user.tab();

    expect(screen.getByRole('button', { name: 'Next' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Paris' })).toHaveAttribute('aria-disabled', 'true');
  });

  it('ignores clicks and keys on a disabled tile', async () => {
    const onActivate = vi.fn();
    const user = userEvent.setup();
    render(<Tile onActivate={onActivate} disabled />);
    const tile = screen.getByRole('button', { name: 'Paris' });

    await user.click(tile);
    tile.focus();
    await user.keyboard('{Enter}');
    await user.keyboard(' ');

    expect(onActivate).not.toHaveBeenCalled();
  });
});