import React, { RefObject, useRef } from 'react';
import { useFillLines, FillTier } from './useFillLines';

export type { FillTier } from './useFillLines';

interface FillTextProps {
  children: string;
  className?: string;
  as?: 'div' | 'p';
  /* Tried in order until the text fills a tier's line count at a size no smaller than its minimum */
  tiers: FillTier[];
}

/* Text that fills its lines edge to edge, for the lines a page keeps to a known count */
const FillText: React.FC<FillTextProps> = ({ children, className, as = 'div', tiers }) => {
  const ref = useRef<HTMLElement>(null);
  useFillLines(ref, children, tiers);
  const Tag = as;

  return (
    <Tag ref={ref as RefObject<HTMLDivElement & HTMLParagraphElement>} className={className}>
      {children}
    </Tag>
  );
};

export default FillText;