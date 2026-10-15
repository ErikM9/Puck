import React, { useRef } from 'react';
import { Link } from 'react-router-dom';
import { useFillList } from '../Common/useFillLines';

/* Choice of the three games, reached once at least one deck has been selected */
const GameMenu: React.FC = () => {
  /* Sets every description at one shared size that fills three lines, narrowing the list where the screen is too short */
  const listRef = useRef<HTMLDivElement>(null);
  useFillList(listRef, '.game-item-info p', 3, 9, 30);

  return (
    <div className="game-menu">
      <Link to="/home" className="back-link page-back">Back to Home</Link>
      <h2 className="page-heading">Game Menu</h2>
      <div className="game-list" ref={listRef}>
        {/* Each Play link is named after its game, as links called Play say nothing out of context and the CSS adds PLAY */}
        <div className="game-item">
          <div className="game-item-info">
            <h3>FlashFlip</h3>
            <p>Flip through each card at your own pace and reveal the answer that waits quietly hidden behind it whenever you feel ready.</p>
          </div>
          <Link to="/flash-flip" className="game-play" aria-label="Play FlashFlip">Play</Link>
        </div>
        <div className="game-item">
          <div className="game-item-info">
            <h3>FlashChoice</h3>
            <p>Pick the correct answer from three options on every card and score each one as you work steadily through the whole deck.</p>
          </div>
          <Link to="/flash-choice" className="game-play" aria-label="Play FlashChoice">Play</Link>
        </div>
        <div className="game-item">
          <div className="game-item-info">
            <h3>FlashMatch</h3>
            <p>Pair each question with its matching answer across two shuffled columns of cards until absolutely none of them remain unpaired.</p>
          </div>
          <Link to="/flash-match" className="game-play" aria-label="Play FlashMatch">Play</Link>
        </div>
      </div>
    </div>
  );
};

export default GameMenu;