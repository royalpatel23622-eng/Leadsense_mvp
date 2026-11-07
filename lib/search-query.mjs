const COUNTRY_ALIASES = new Map([
  ['usa', 'US'], ['united states', 'US'], ['america', 'US'],
  ['uk', 'GB'], ['united kingdom', 'GB'], ['britain', 'GB'],
  ['canada', 'CA'], ['australia', 'AU'], ['new zealand', 'NZ'], ['ireland', 'IE'],
  ['germany', 'DE'], ['france', 'FR'], ['spain', 'ES'], ['netherlands', 'NL'],
  ['sweden', 'SE'], ['norway', 'NO'], ['denmark', 'DK'], ['singapore', 'SG'],
  ['india', 'IN'], ['japan', 'JP'], ['brazil', 'BR'], ['mexico', 'MX'],
]);

const SERVICES = [
  { label: 'Video editing', terms: /\b(video editor|video editing|editing service|edit(?:ing)? videos)\b/i },
  { label: 'Thumbnail design', terms: /\b(thumbnails?|thumbnail design|cover art)\b/i },
  { label: 'YouTube SEO', terms: /\b(youtube seo|seo service|search optimization)\b/i },
  { label: 'Channel management', terms: /\b(channel management|manage (?:a |their )?channel)\b/i },
  { label: 'Short-form editing', terms: /\b(short[- ]form|youtube shorts|shorts editing|reels editing)\b/i },
  { label: 'Content strategy', terms: /\b(content strategy|content planning|content strategist)\b/i },
  { label: 'Branding', terms: /\b(channel branding|branding service|brand identity)\b/i },
];

function countValue(value) {
  const parsed = Number(String(value).replaceAll(',', ''));
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

function numberToken(text) {
  const match = text.match(/\d+(?:,\d{3})*(?:\.\d+)?\s*[km]?/i);
  if (!match) return null;
  const raw = match[0].replaceAll(',', '').trim();
  const multiplier = /m$/i.test(raw) ? 1_000_000 : /k$/i.test(raw) ? 1_000 : 1;
  return Math.round(Number(raw.replace(/[km]$/i, '')) * multiplier);
}

function detectSubscriberRange(text) {
  const patterns = [
    /(?:between|from)\s+(\d[\d,.]*\s*[km]?)\s+(?:and|to|-)\s+(\d[\d,.]*\s*[km]?)\s*(?:subscribers?|subs?)?/i,
    /(\d[\d,.]*\s*[km]?)\s*(?:to|-)\s*(\d[\d,.]*\s*[km]?)\s*(?:subscribers?|subs?)/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return { min: numberToken(match[1]), max: numberToken(match[2]), matched: match[0] };
  }
  const minMatch = text.match(/(?:at least|over|more than|minimum(?: of)?)\s+(\d[\d,.]*\s*[km]?)\s*(?:subscribers?|subs?)/i);
  const maxMatch = text.match(/(?:under|below|less than|up to|maximum(?: of)?)\s+(\d[\d,.]*\s*[km]?)\s*(?:subscribers?|subs?)/i);
  return {
    min: minMatch ? numberToken(minMatch[1]) : null,
    max: maxMatch ? numberToken(maxMatch[1]) : null,
    matched: [minMatch?.[0], maxMatch?.[0]].filter(Boolean).join(' '),
  };
}

function detectCountries(text) {
  const normalized = text.toLowerCase();
  const found = [];
  const aliases = [...COUNTRY_ALIASES.entries()].sort((a, b) => b[0].length - a[0].length);
  for (const [alias, code] of aliases) {
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = new RegExp(`(?:^|[^a-z])${escaped}(?=$|[^a-z])`, 'i').exec(normalized);
    if (match && !found.some(item => item.code === code)) found.push({ code, index: match.index + match[0].length - alias.length });
  }
  const shortCodes = new Map([['US','US'],['UK','GB'],['GB','GB'],['CA','CA'],['AU','AU'],['NZ','NZ'],['IE','IE'],['DE','DE'],['FR','FR'],['ES','ES'],['NL','NL'],['SE','SE'],['NO','NO'],['DK','DK'],['SG','SG'],['IN','IN'],['JP','JP'],['BR','BR'],['MX','MX']]);
  for (const match of text.matchAll(/\b[A-Z]{2}\b/g)) {
    const code = shortCodes.get(match[0]);
    if (code && !found.some(item => item.code === code)) found.push({ code, index: match.index });
  }
  return found.sort((a, b) => a.index - b.index).map(item => item.code);
}

function cleanSearchTerms(text, service, countries, subscriberRange) {
  let terms = text;
  if (service) terms = terms.replace(SERVICES.find(item => item.label === service)?.terms, ' ');
  for (const alias of COUNTRY_ALIASES.keys()) {
    terms = terms.replace(new RegExp(`(?:^|[^a-z])${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^a-z])`, 'ig'), ' ');
  }
  terms = terms.replace(/\b(?:US|UK|GB|CA|AU|NZ|IE|DE|FR|ES|NL|SE|NO|DK|SG|IN|JP|BR|MX)\b/g, ' ');
  if (subscriberRange.matched) terms = terms.replace(subscriberRange.matched, ' ');
  terms = terms.replace(/\b(i am|i'm|we are|we're|find|discover|search for|look for|channels?|creators?|with|between|from|that|who|have|has|in|the|a|an|my service is|prioritize|prioritise|please|and|or|to|for|of)\b/gi, ' ');
  terms = terms.replace(/\b(declining views|inconsistent uploads|weak engagement|potential editing opportunities|growing|small|medium|large)\b/gi, ' ');
  terms = terms.replace(/[^\p{L}\p{N}\s&'-]/gu, ' ').replace(/\s+/g, ' ').trim();
  if (!terms) terms = text.trim();
  return terms.slice(0, 120);
}

/** Honest, deterministic draft parser. It does not call or claim to be an AI model. */
export function interpretSearchQuery(input) {
  if (typeof input !== 'string' || input.trim().length < 3 || input.trim().length > 1000) {
    throw Object.assign(new Error('Describe your target in 3 to 1,000 characters.'), { status: 400, code: 'INVALID_QUERY' });
  }
  const text = input.trim();
  const service = SERVICES.find(item => item.terms.test(text))?.label || null;
  const countries = detectCountries(text);
  const range = detectSubscriberRange(text);
  const requested = text.match(/\b(?:top|first|show me|give me|find)\s+(\d{1,2})(?:\s+[\p{L}-]+){0,3}\s+(?:leads?|channels?|creators?)\b/iu);
  const requestedCount = requested ? Math.max(1, Math.min(50, countValue(requested[1]))) : 20;
  const hasSignals = Boolean(service || countries.length || range.min != null || range.max != null);
  return {
    method: 'rule_based_preview',
    confidence: hasSignals ? 'medium' : 'low',
    filters: {
      searchTerms: cleanSearchTerms(text, service, countries, range),
      service,
      declaredCountries: countries,
      minSubscribers: range.min,
      maxSubscribers: range.max,
      requestedCount,
    },
    needsReview: true,
  };
}
