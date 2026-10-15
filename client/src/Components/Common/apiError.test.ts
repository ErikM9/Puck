import { extractError } from './apiError';
import { apiRefusal, networkFailure } from '../../test/apiErrors';

describe('extractError', () => {
  it('gives the message the API sent with its refusal', () => {
    expect(extractError(apiRefusal(401, { message: 'Invalid email or password' }), 'Login failed.'))
      .toBe('Invalid email or password');
  });

  it('falls back to the given line when the answer carries no message, as a proxy\'s error page does not', () => {
    expect(extractError(apiRefusal(502, '<html><body>Bad Gateway</body></html>'), 'Login failed.'))
      .toBe('Login failed.');
  });

  it('falls back to the given line when no answer arrives at all', () => {
    expect(extractError(networkFailure(), 'Login failed.')).toBe('Login failed.');
  });
});