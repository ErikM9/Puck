import type React from 'react';

/* Gives a tile a button's role, focus and Enter or Space keys, since tiles stay divs so FitText can size their text */
export const pressable = (onActivate: () => void, { disabled = false }: { disabled?: boolean } = {}) => ({
  role: 'button' as const,
  tabIndex: disabled ? -1 : 0,
  'aria-disabled': disabled || undefined,
  onClick: () => {
    if (!disabled) onActivate();
  },
  onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => {
    if (disabled || (event.key !== 'Enter' && event.key !== ' ')) return;
    event.preventDefault();
    onActivate();
  },
});