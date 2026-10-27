import '@testing-library/jest-dom/vitest';

/* jsdom implements no ResizeObserver, so a stub that observes nothing stands in for it */
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = globalThis.ResizeObserver ?? (ResizeObserverStub as never);

afterEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

/* Testing Library advances fake timers itself only when it finds a global jest, so Vitest's vi is offered under that name */
(globalThis as unknown as { jest: typeof vi }).jest = vi;