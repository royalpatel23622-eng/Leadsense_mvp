export function normalizeSubscriberRange(minimum, maximum) {
  const min = minimum == null || minimum === '' ? null : Number(minimum);
  const max = maximum == null || maximum === '' ? null : Number(maximum);
  if ((min !== null && (!Number.isSafeInteger(min) || min < 0)) || (max !== null && (!Number.isSafeInteger(max) || max < 0))) {
    throw Object.assign(new Error('Subscriber limits must be whole numbers zero or higher.'), { status: 400, code: 'INVALID_SUBSCRIBER_RANGE' });
  }
  if (min !== null && max !== null && min > max) {
    throw Object.assign(new Error('Minimum subscribers must be less than or equal to maximum subscribers.'), { status: 400, code: 'INVALID_SUBSCRIBER_RANGE' });
  }
  return { min, max };
}

export function filterByPublicSubscribers(items, { min = null, max = null } = {}, includeUnknown = true) {
  return items.filter(item => {
    const raw = item?.subscribers;
    const subscribers = raw == null || raw === '' ? null : Number(raw);
    // Bad or malformed API values are unknown, never an automatic range match.
    if (subscribers === null || !Number.isSafeInteger(subscribers) || subscribers < 0) return includeUnknown;
    return (min === null || subscribers >= min) && (max === null || subscribers <= max);
  });
}

export function filterByDeclaredCountry(items, countryCodes = [], includeUnknown = true, unknownOnly = false) {
  const wanted = new Set(countryCodes);
  return items.filter(item => {
    const rawCode = item?.countryCode;
    const code = typeof rawCode === 'string' && /^[A-Za-z]{2}$/.test(rawCode) ? rawCode.toUpperCase() : null;
    if (unknownOnly) return code === null;
    if (code === null) return includeUnknown;
    return wanted.size === 0 || wanted.has(code);
  });
}

export function describeFilterMisses(item, { countryCodes = [], includeUnknown = true, unknownOnly = false, excludeIndia = false, min = null, max = null, includeUnknownSubscribers = true } = {}) {
  const reasons = [];
  const rawCode = item?.countryCode;
  const code = typeof rawCode === 'string' && /^[A-Za-z]{2}$/.test(rawCode) ? rawCode.toUpperCase() : null;
  if (excludeIndia && code === 'IN') reasons.push('Country excluded by your filters');
  else if (unknownOnly && code !== null) reasons.push('Country is listed; you asked for unknown country');
  else if (code === null && !includeUnknown) reasons.push('Country is not listed publicly');
  else if (code !== null && countryCodes.length && !countryCodes.includes(code)) reasons.push('Declared country is outside your selection');

  const rawSubscribers = item?.subscribers;
  const parsedSubscribers = rawSubscribers == null || rawSubscribers === '' ? null : Number(rawSubscribers);
  const subscribers = Number.isSafeInteger(parsedSubscribers) && parsedSubscribers >= 0 ? parsedSubscribers : null;
  if (subscribers === null && !includeUnknownSubscribers && (min !== null || max !== null)) reasons.push('Subscriber count is not public');
  else if (subscribers !== null && ((min !== null && subscribers < min) || (max !== null && subscribers > max))) reasons.push('Subscriber count is outside your range');
  return reasons.length ? reasons : ['Not an exact match for the selected filters'];
}

export function dedupeChannelsById(items) {
  const unique = new Map();
  for (const item of items) {
    if (!item?.channelId) continue;
    if (!unique.has(item.channelId)) unique.set(item.channelId, item);
  }
  return [...unique.values()];
}
