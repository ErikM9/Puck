import { labelSize } from './labelSize';

describe('labelSize', () => {
  it('sets the longest labels at 20px', () => {
    expect(labelSize('Register')).toBe(20);
    expect(labelSize('Get Code')).toBe(20);
  });

  it('sets a shorter word larger, the shorter the larger', () => {
    expect(labelSize('Verify')).toBe(23.5);
    expect(labelSize('Login')).toBe(26);
    expect(labelSize('Reset')).toBe(labelSize('Login'));
  });

  it('rounds to the nearest quarter pixel', () => {
    /* 20 x (8 / 2) ^ 0.55 is about 42.87 */
    expect(labelSize('Go')).toBe(42.75);
  });
});