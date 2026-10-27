import { act, render, fireEvent, screen, waitFor } from '@testing-library/react';
import ScrollableBox from './ScrollableBox';

/* jsdom lays nothing out, so the box's geometry is stubbed and a scroll event makes it measure again */
const setupGeometry = (
  container: HTMLElement,
  { scrollHeight = 400, clientHeight = 200, trackHeight = 192 } = {}
) => {
  const inner = container.querySelector('.csb-inner') as HTMLElement;
  const track = screen.getByText('▼').previousElementSibling as HTMLElement;
  const thumb = track.firstElementChild as HTMLElement;

  Object.defineProperty(inner, 'scrollHeight', { configurable: true, value: scrollHeight });
  Object.defineProperty(inner, 'clientHeight', { configurable: true, value: clientHeight });
  let scrollTop = 0;
  Object.defineProperty(inner, 'scrollTop', {
    configurable: true,
    get: () => scrollTop,
    set: v => { scrollTop = v; },
  });
  Object.defineProperty(track, 'clientHeight', { configurable: true, value: trackHeight });

  fireEvent.scroll(inner);
  return { inner, thumb };
};

const renderBox = () =>
  render(
    <ScrollableBox className="probe">
      <div>content</div>
    </ScrollableBox>
  );

describe('ScrollableBox', () => {
  it('keeps the scrollbar hidden while content fits, shows it when it overflows', () => {
    const { container } = renderBox();
    expect(screen.getByText('▲')).not.toBeVisible();

    setupGeometry(container, { scrollHeight: 400, clientHeight: 200 });

    expect(screen.getByText('▲')).toBeVisible();
  });

  it('shows the scrollbar once added content overflows, without waiting for a scroll', async () => {
    const { container, rerender } = render(<ScrollableBox><p>One card</p></ScrollableBox>);
    const { inner } = setupGeometry(container, { scrollHeight: 200, clientHeight: 200 });
    expect(screen.getByText('▲')).not.toBeVisible();
    Object.defineProperty(inner, 'scrollHeight', { configurable: true, value: 400 });

    rerender(<ScrollableBox><p>One card</p><p>Another card</p></ScrollableBox>);

    await waitFor(() => expect(screen.getByText('▲')).toBeVisible());
  });

  it('shows the scrollbar once the box shrinks under its content, without waiting for a scroll', () => {
    const watched: Array<() => void> = [];
    /* Keeps the callback of each element observed, as a real observer fires it when the box changes size */
    vi.stubGlobal('ResizeObserver', class {
      callback: () => void;
      constructor(callback: () => void) { this.callback = callback; }
      observe() { watched.push(this.callback); }
      unobserve() {}
      disconnect() {}
    });
    try {
      const { container } = renderBox();
      const { inner } = setupGeometry(container, { scrollHeight: 400, clientHeight: 400 });
      expect(screen.getByText('▲')).not.toBeVisible();
      Object.defineProperty(inner, 'clientHeight', { configurable: true, value: 200 });

      act(() => { watched.forEach(callback => callback()); });

      expect(screen.getByText('▲')).toBeVisible();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('sizes the thumb to the share of the content in view', () => {
    const { container } = renderBox();

    const { thumb } = setupGeometry(container, { scrollHeight: 600 });

    /* 200 of the 600px of content in view takes a third of the 192px track */
    expect(thumb.style.height).toBe('64px');
  });

  it('keeps the thumb at least 20px tall, however long the content', () => {
    const { container } = renderBox();

    const { thumb } = setupGeometry(container, { scrollHeight: 20000 });

    expect(thumb.style.height).toBe('20px');
  });

  it('moves the thumb down the track as the content scrolls', () => {
    const { container } = renderBox();
    const { inner, thumb } = setupGeometry(container);
    inner.scrollTop = 100;

    fireEvent.scroll(inner);

    /* Halfway down the 200px the content scrolls puts the thumb halfway down the 96px it can travel */
    expect(thumb.style.top).toBe('48px');
  });

  it('scrolls the content in step with the thumb as it is dragged', () => {
    const { container } = renderBox();
    const { inner, thumb } = setupGeometry(container);
    inner.scrollTop = 40;

    fireEvent.mouseDown(thumb, { clientY: 50 });
    fireEvent.mouseMove(document, { clientY: 98 });

    /* 48px of the 96px the thumb can travel is half the 200px the content scrolls, on from the 40 it started at */
    expect(inner.scrollTop).toBe(140);
  });

  it('keeps the thumb under the pointer on a zoomed page', () => {
    const { container } = renderBox();
    const { inner, thumb } = setupGeometry(container);
    /* At a zoom of 1.25 the 192px track is drawn 240 tall, and the pointer moves in those drawn pixels */
    vi.spyOn(thumb.parentElement as HTMLElement, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 5, 240));

    fireEvent.mouseDown(thumb, { clientY: 50 });
    fireEvent.mouseMove(document, { clientY: 110 });

    /* 60 drawn pixels are 48 of the track's own, half the 96px the thumb can travel and so half of the 200px of content */
    expect(inner.scrollTop).toBe(100);
  });

  it.each([
    ['foot', 1000, 200],
    ['top', -1000, 0],
  ])('stops the content at its %s however far the thumb is dragged', (_, clientY, to) => {
    const { container } = renderBox();
    const { inner, thumb } = setupGeometry(container);
    inner.scrollTop = 100;
    fireEvent.mouseDown(thumb, { clientY: 50 });

    fireEvent.mouseMove(document, { clientY });

    expect(inner.scrollTop).toBe(to);
  });

  it('lets go of the content once the thumb is released', () => {
    const { container } = renderBox();
    const { inner, thumb } = setupGeometry(container);
    fireEvent.mouseDown(thumb, { clientY: 50 });
    fireEvent.mouseUp(document);

    fireEvent.mouseMove(document, { clientY: 98 });

    expect(inner.scrollTop).toBe(0);
  });

  it('shields the page for as long as the thumb is dragged', () => {
    const { container } = renderBox();
    const { thumb } = setupGeometry(container);
    fireEvent.mouseDown(thumb, { clientY: 50 });
    expect(container.querySelector('div[style*="fixed"]')).toBeInTheDocument();

    fireEvent.mouseUp(document);

    expect(container.querySelector('div[style*="fixed"]')).not.toBeInTheDocument();
  });

  it('leaves the content where it is when the thumb fills the whole track', () => {
    const { container } = renderBox();
    /* A 20px track leaves the thumb, at its least 20px, nowhere to travel */
    const { inner, thumb } = setupGeometry(container, { trackHeight: 20 });

    fireEvent.mouseDown(thumb, { clientY: 50 });
    fireEvent.mouseMove(document, { clientY: 98 });

    expect(inner.scrollTop).toBe(0);
  });

  it('lights the thumb up while the pointer is over it', () => {
    const { container } = renderBox();
    const { thumb } = setupGeometry(container);
    const unlit = thumb.style.background;

    fireEvent.mouseEnter(thumb);
    const lit = thumb.style.background;
    fireEvent.mouseLeave(thumb);

    expect(lit).not.toBe(unlit);
    expect(thumb.style.background).toBe(unlit);
  });

  it('keeps the thumb lit through a drag that strays off it', () => {
    const { container } = renderBox();
    const { thumb } = setupGeometry(container);
    const unlit = thumb.style.background;
    fireEvent.mouseEnter(thumb);
    fireEvent.mouseDown(thumb, { clientY: 50 });

    fireEvent.mouseLeave(thumb);

    expect(thumb.style.background).not.toBe(unlit);
  });

  it('takes its drag listeners off the document when it unmounts mid-drag', () => {
    const add = vi.spyOn(document, 'addEventListener');
    const remove = vi.spyOn(document, 'removeEventListener');
    const { container, unmount } = renderBox();
    const { thumb } = setupGeometry(container);
    fireEvent.mouseDown(thumb, { clientY: 50 });
    const added = add.mock.calls.filter(([type]) => type === 'mousemove' || type === 'mouseup');

    unmount();

    const removed = remove.mock.calls.filter(([type]) => type === 'mousemove' || type === 'mouseup');
    add.mockRestore();
    remove.mockRestore();
    expect(added).toHaveLength(2);
    expect(removed).toEqual(added);
  });

  it('scrolls the content 40px for each press of an arrow', () => {
    const { container } = renderBox();
    const { inner } = setupGeometry(container);
    inner.scrollTop = 100;

    fireEvent.mouseDown(screen.getByText('▼'));
    fireEvent.mouseDown(screen.getByText('▼'));
    fireEvent.mouseDown(screen.getByText('▲'));

    expect(inner.scrollTop).toBe(140);
  });

  it.each([
    ['down', '▼', 180, 200],
    ['up', '▲', 20, 0],
  ])('stops the %s arrow at the end of the content', (_, arrow, from, to) => {
    const { container } = renderBox();
    const { inner } = setupGeometry(container);
    inner.scrollTop = from;

    fireEvent.mouseDown(screen.getByText(arrow));

    expect(inner.scrollTop).toBe(to);
  });
});