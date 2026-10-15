import apiClient from './client';
import { apiRefusal } from '../test/apiErrors';

const adapter = vi.fn();

const okResponse = (config: unknown) => ({
  data: {},
  status: 200,
  statusText: 'OK',
  headers: {},
  config,
});

/* Rejects the next request as axios does when the API answers with an error status, carrying that request's config */
const refuseNext = (status: number, message: string) =>
  adapter.mockImplementationOnce(async (config) => { throw apiRefusal(status, { message }, config); });

/* jsdom cannot navigate, so a stand-in records every assignment to href and the real location is always put back */
const withStandInLocation = async (href: string, run: (navigations: string[]) => Promise<void>) => {
  const target = window as { location?: unknown };
  const realLocation = window.location;
  const navigations: string[] = [];
  delete target.location;
  target.location = {
    get href() { return navigations.at(-1) ?? href; },
    set href(next: string) { navigations.push(next); },
  };
  try {
    await run(navigations);
  } finally {
    target.location = realLocation;
  }
};

describe('apiClient interceptors', () => {
  beforeEach(() => {
    apiClient.defaults.adapter = adapter;
  });

  it('attaches the stored JWT as a Bearer header on every request', async () => {
    localStorage.setItem('token', 'jwt-abc');
    adapter.mockImplementationOnce(async (config) => okResponse(config));

    await apiClient.get('/decks');

    expect(adapter.mock.calls[0][0].headers.Authorization).toBe('Bearer jwt-abc');
  });

  it('sends no Authorization header when no token is stored', async () => {
    adapter.mockImplementationOnce(async (config) => okResponse(config));

    await apiClient.get('/decks');

    expect(adapter.mock.calls[0][0].headers.Authorization).toBeUndefined();
  });

  it('a 401 response clears the token and redirects to the auth page', async () => {
    localStorage.setItem('token', 'expired');
    refuseNext(401, 'Invalid or expired token');

    await withStandInLocation('/home', async (navigations) => {
      await expect(apiClient.get('/decks')).rejects.toMatchObject({ response: { status: 401 } });

      expect(localStorage.getItem('token')).toBeNull();
      expect(navigations).toEqual(['/']);
    });
  });

  /* On GitHub Pages the app lives under /Puck/, and a redirect to / would leave it for the site's root */
  it('redirects to the path the app is served from, not the site root', async () => {
    vi.stubEnv('BASE_URL', '/Puck/');
    localStorage.setItem('token', 'expired');
    refuseNext(401, 'Invalid or expired token');

    await withStandInLocation('/Puck/home', async (navigations) => {
      await expect(apiClient.get('/decks')).rejects.toMatchObject({ response: { status: 401 } });

      expect(navigations).toEqual(['/Puck/']);
    });
    vi.unstubAllEnvs();
  });

  /* The login form already lives at /, so only the absence of any navigation shows the page is left alone */
  it('a 401 from an auth call leaves the page and the session alone so the form can show the error', async () => {
    localStorage.setItem('token', 'untouched');
    refuseNext(401, 'Invalid email or password');

    await withStandInLocation('/', async (navigations) => {
      await expect(apiClient.post('/auth/login', {})).rejects.toMatchObject({ response: { status: 401 } });

      expect(navigations).toEqual([]);
      expect(localStorage.getItem('token')).toBe('untouched');
    });
  });

  it('non-401 failures leave the token and the location untouched', async () => {
    localStorage.setItem('token', 'still-valid');
    refuseNext(500, 'Internal server error');

    await withStandInLocation('/home', async (navigations) => {
      await expect(apiClient.get('/decks')).rejects.toMatchObject({ response: { status: 500 } });

      expect(localStorage.getItem('token')).toBe('still-valid');
      expect(navigations).toEqual([]);
    });
  });
});