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
    const subscribers = item.subscribers == null ? null : Number(item.subscribers);
    if (subscribers === null) return includeUnknown;
    return (min === null || subscribers >= min) && (max === null || subscribers <= max);
  });
}

export function filterByDeclaredCountry(items, countryCodes = [], includeUnknown = true, unknownOnly = false) {
  const wanted = new Set(countryCodes);
  return items.filter(item => {
    const code = item.countryCode || null;
    if (unknownOnly) return code === null;
    if (code === null) return includeUnknown;
    return wanted.size === 0 || wanted.has(code);
  });
}

export function dedupeChannelsById(items) {
  const unique = new Map();
  for (const item of items) {
    if (!item?.channelId) continue;
    if (!unique.has(item.channelId)) unique.set(item.channelId, item);
  }
  return [...unique.values()];
}
