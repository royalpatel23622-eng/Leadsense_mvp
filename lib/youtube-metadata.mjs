// YouTube returns ISO 8601 durations (for example PT1M30S).
export function durationSeconds(duration) {
  if (typeof duration !== 'string') return null;
  const match = duration.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/);
  if (!match || !match.slice(1).some(value => value !== undefined)) return null;
  return (Number(match[1]) || 0) * 86400 + (Number(match[2]) || 0) * 3600 + (Number(match[3]) || 0) * 60 + (Number(match[4]) || 0);
}

// This is only a duration hint. The public API fields used by LeadSense do not
// confirm whether YouTube displays a video in the Shorts player.
export function isShortDurationCandidate(duration) {
  const seconds = durationSeconds(duration);
  return seconds !== null && seconds <= 180;
}
