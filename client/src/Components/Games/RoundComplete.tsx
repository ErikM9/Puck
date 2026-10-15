import React, { useLayoutEffect, useRef } from 'react';
import { Extent, drawnExtent, spaceEvenly } from '../Common/textInk';

interface RoundCompleteProps {
  score: string;
  message: string;
  onRestart: () => void;
}

/* Play Again's icon starts two of its drawing's 24 units down its box, at the top of the arrow's circle */
const ICON_TOP = 2 / 24;

/* Play Again shows from the top of its icon to the bottom of its label, and the score and the line by their letters */
const extentOf = (el: HTMLElement): Extent | null => {
  const letters = drawnExtent(el);
  if (!letters || !el.classList.contains('play-again')) return letters;
  const style = getComputedStyle(el);
  const box = el.getBoundingClientRect();
  const zoom = box.height / parseFloat(style.height);
  if (!(zoom > 0)) return null;
  const icon = parseFloat(getComputedStyle(el, '::before').height) || 0;
  return { top: box.top + ((parseFloat(style.borderTopWidth) || 0) + icon * ICON_TOP) * zoom, bottom: letters.bottom };
};

/* The panel a round ends on, with the same space above, between and below the score, the line and Play Again */
const RoundComplete: React.FC<RoundCompleteProps> = ({ score, message, onRestart }) => {
  const panelRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const space = () => spaceEvenly(panel, Array.from(panel.children) as HTMLElement[], extentOf);
    space();
    window.addEventListener('resize', space);
    document.fonts?.ready.then(space).catch(() => {});
    return () => window.removeEventListener('resize', space);
  }, [score, message]);

  return (
    <div className="completion" ref={panelRef}>
      <div className="completion-score">{score}</div>
      <p>{message}</p>
      <button onClick={onRestart} className="play-again">Play Again</button>
    </div>
  );
};

export default RoundComplete;