import { setTimeout } from 'timers/promises';
import { vi } from 'vitest';

export function useFakeTimers(): (time: number) => Promise<any> | any {
  if (vi.advanceTimersByTimeAsync) {
    vi.useFakeTimers();
    return vi.advanceTimersByTimeAsync;
  }
  return setTimeout;
}
