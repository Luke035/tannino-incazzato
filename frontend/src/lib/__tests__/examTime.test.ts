import { describe, it, expect } from 'vitest';
import { formatDuration } from '../examTime';

// The clock on the Exam screen. Playwright sees that it runs; these cover the
// shapes a two-minute test run never reaches.
describe('formatDuration', () => {
  it('shows minutes and seconds, zero-padded', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(9)).toBe('0:09');
    expect(formatDuration(65)).toBe('1:05');
    expect(formatDuration(600)).toBe('10:00');
  });

  it('grows an hours field past the hour', () => {
    expect(formatDuration(3600)).toBe('1:00:00');
    expect(formatDuration(3661)).toBe('1:01:01');
    expect(formatDuration(7325)).toBe('2:02:05');
  });

  it('never shows a negative clock', () => {
    // a phone whose clock is behind the server's must not read -0:03
    expect(formatDuration(-3)).toBe('0:00');
  });
});
