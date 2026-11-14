import { describe, expect, it } from 'vitest';
import { passwordStrength } from './password-strength';

describe('passwordStrength', () => {
  it('returns score 0 with empty label for empty input', () => {
    expect(passwordStrength('')).toEqual({ score: 0, label: '' });
  });

  it('scores short passwords as weak even with variety', () => {
    expect(passwordStrength('aB1!').score).toBe(0);
  });

  it('reaches score 1 at 8 chars', () => {
    expect(passwordStrength('abcdefgh').score).toBe(1);
  });

  it('reaches score 2 with length plus letter case mix', () => {
    expect(passwordStrength('Abcdefghijklm').score).toBe(2);
  });

  it('reaches score 3 with digits and symbols on a long mixed password', () => {
    expect(passwordStrength('Abcdefghij12!@').score).toBe(3);
  });

  it('always returns a non-empty label for non-empty input', () => {
    expect(passwordStrength('aB1!').label).not.toBe('');
  });
});
