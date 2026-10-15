import { credentialsMissing } from './credentialsMissing';

describe('credentialsMissing', () => {
  it('asks for both fields when both are empty', () => {
    expect(credentialsMissing('', '')).toBe('Please enter your email and password.');
  });

  it('asks for the one field that is empty', () => {
    expect(credentialsMissing('', 'hunter22')).toBe('Please enter your email.');
    expect(credentialsMissing('muki@example.com', '')).toBe('Please enter your password.');
  });

  it('counts an email of spaces alone as empty, but not a password of spaces', () => {
    expect(credentialsMissing('   ', 'hunter22')).toBe('Please enter your email.');
    expect(credentialsMissing('muki@example.com', '   ')).toBeNull();
  });

  it('finds nothing missing once both are filled in', () => {
    expect(credentialsMissing('muki@example.com', 'hunter22')).toBeNull();
  });
});