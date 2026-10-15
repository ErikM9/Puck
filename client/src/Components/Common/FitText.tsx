import React, { useRef } from 'react';
import { useFitFont, FitOptions } from './useFitFont';

interface FitTextProps extends FitOptions {
  children: string;
  className?: string;
  onClick?: () => void;
  /* Native tooltip on hover, for a box that has to shrink its text a long way */
  title?: string;
}

/* A div whose text is sized to fill, but never to overflow, the box the CSS gives it */
const FitText: React.FC<FitTextProps> = ({ children, className, onClick, title, ...options }) => {
  const ref = useRef<HTMLDivElement>(null);
  useFitFont(ref, children, options);

  return (
    <div ref={ref} className={className} onClick={onClick} title={title}>
      {children}
    </div>
  );
};

export default FitText;