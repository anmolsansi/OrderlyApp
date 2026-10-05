/** Browser policy can deny the Storage property itself, before any method runs. */
export function getBrowserStorage(kind: 'localStorage' | 'sessionStorage'): Storage | undefined {
  try {
    return window[kind];
  } catch {
    return undefined;
  }
}
