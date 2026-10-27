import React, { useRef, useState, useEffect, useCallback } from 'react';

interface ScrollableBoxProps {
  className?: string;

  outerClassName?: string;
  outerStyle?: React.CSSProperties;
  children: React.ReactNode;

  sbWidth?: number;

  sbRight?: number;

  sbGap?: number;
}

/* Scroll container with an overlay scrollbar, so the bar can be styled and costs no width */
const ScrollableBox: React.FC<ScrollableBoxProps> = ({
  className, outerClassName, outerStyle, children,
  sbWidth = 5, sbRight = 5, sbGap = 3,
}) => {
  const innerRef  = useRef<HTMLDivElement>(null);
  const trackRef  = useRef<HTMLDivElement>(null);
  const thumbHRef = useRef(0);

  const [thumbTop,     setThumbTop]     = useState(0);
  const [thumbHeight,  setThumbHeight]  = useState(0);
  const [visible,      setVisible]      = useState(false);
  const [dragging,     setDragging]     = useState(false);
  const [thumbHovered, setThumbHovered] = useState(false);

  const dragOrigin = useRef({ y: 0, scrollTop: 0 });
  const releaseDrag = useRef<(() => void) | null>(null);

  /* Recomputes the thumb's size and position from wherever the content currently sits */
  const recalc = useCallback(() => {
    const el    = innerRef.current;
    const track = trackRef.current;
    if (!el || !track) return;

    const { scrollTop, scrollHeight, clientHeight } = el;
    if (scrollHeight <= clientHeight + 1) { setVisible(false); return; }
    setVisible(true);

    const trackH    = track.clientHeight;
    const th        = Math.max((clientHeight / scrollHeight) * trackH, 20);
    const maxThumb  = trackH - th;
    const maxScroll = scrollHeight - clientHeight;

    thumbHRef.current = th;
    setThumbHeight(th);
    setThumbTop(maxScroll > 0 ? (scrollTop / maxScroll) * maxThumb : 0);
  }, []);

  useEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    recalc();
    /* Content can change size or membership without ever scrolling, so both are watched */
    const ro = new ResizeObserver(recalc);
    ro.observe(el);
    const mo = new MutationObserver(recalc);
    mo.observe(el, { childList: true, subtree: true });
    return () => { ro.disconnect(); mo.disconnect(); };
  }, [recalc]);

  const scrollByArrow = useCallback((dir: 1 | -1) => {
    const el = innerRef.current;
    if (!el) return;
    el.scrollTop = Math.max(0,
      Math.min(el.scrollHeight - el.clientHeight, el.scrollTop + dir * 40)
    );
  }, []);

  /* Dragging maps how far the pointer travelled onto the full scrollable distance */
  const handleThumbMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const el = innerRef.current;
    if (!el) return;

    dragOrigin.current = { y: e.clientY, scrollTop: el.scrollTop };
    setDragging(true);

    const onMove = (ev: MouseEvent) => {
      const el2   = innerRef.current;
      const track = trackRef.current;
      if (!el2 || !track) return;
      const { scrollHeight, clientHeight } = el2;
      const maxScroll = scrollHeight - clientHeight;
      const maxThumb  = track.clientHeight - thumbHRef.current;
      if (maxThumb <= 0) return;
      /* Pointer positions come in the page's zoomed pixels and the track's height in its own, so the move is scaled back */
      const zoom = track.getBoundingClientRect().height / track.clientHeight || 1;
      const delta = (ev.clientY - dragOrigin.current.y) / zoom;
      el2.scrollTop = Math.max(0, Math.min(maxScroll,
        dragOrigin.current.scrollTop + (delta / maxThumb) * maxScroll
      ));
    };

    const onUp = () => {
      setDragging(false);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup',   onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
    releaseDrag.current = onUp;
  }, []);

  /* A drag that is still live when the box unmounts would leave its listeners on document */
  useEffect(() => () => releaseDrag.current?.(), []);

  const thumbActive  = dragging || thumbHovered;
  const accentNormal = 'rgba(56,189,248,0.30)';
  const accentHover  = 'rgba(56,189,248,0.58)';
  const arrowColor   = thumbActive ? 'rgba(56,189,248,0.72)' : 'rgba(56,189,248,0.36)';
  const ARROW_H      = 10;

  const arrowStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    height: ARROW_H, flexShrink: 0,
    fontSize: Math.max(4, sbWidth - 2), lineHeight: 1,
    color: arrowColor,
    cursor: 'default',
    userSelect: 'none',
    pointerEvents: 'all',
    transition: 'color 0.15s',
  };

  return (
    <div className={outerClassName} style={{ position: 'relative', ...outerStyle }}>

      <div
        ref={innerRef}
        className={`csb-inner${className ? ` ${className}` : ''}`}
        onScroll={recalc}
        style={{ overflowY: 'scroll', scrollbarWidth: 'none' } as React.CSSProperties}
      >
        {children}
      </div>

      {/* A full-screen shield keeps the drag alive when the pointer leaves the thumb */}
      {dragging && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9998, cursor: 'default' }} />
      )}

      <div style={{
        position: 'absolute',
        right: sbRight, top: 6, bottom: 6, width: sbWidth,
        zIndex: 9999,
        display: 'flex', flexDirection: 'column',
        visibility: visible ? 'visible' : 'hidden',
        pointerEvents: 'none',
      }}>

        <div
          style={{ ...arrowStyle, pointerEvents: visible ? 'all' : 'none' }}
          onMouseDown={(e) => { e.preventDefault(); scrollByArrow(-1); }}
        >▲</div>

        <div
          ref={trackRef}
          style={{
            flex: 1, position: 'relative', pointerEvents: 'none',
            marginTop: sbGap, marginBottom: sbGap,
          }}
        >
          <div
            onMouseDown={handleThumbMouseDown}
            onMouseEnter={() => setThumbHovered(true)}
            onMouseLeave={() => setThumbHovered(false)}
            style={{
              position: 'absolute',
              left: 0, right: 0,
              top: thumbTop,
              height: thumbHeight,
              borderRadius: 999,
              background: thumbActive ? accentHover : accentNormal,
              cursor: 'default',
              pointerEvents: visible ? 'all' : 'none',
              transition: 'background 0.15s' + (dragging ? '' : ', top 0.05s linear'),
            }}
          />
        </div>

        <div
          style={{ ...arrowStyle, pointerEvents: visible ? 'all' : 'none' }}
          onMouseDown={(e) => { e.preventDefault(); scrollByArrow(1); }}
        >▼</div>

      </div>
    </div>
  );
};

export default ScrollableBox;