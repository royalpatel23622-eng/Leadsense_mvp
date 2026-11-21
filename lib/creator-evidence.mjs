const FRESH_SOURCE_DAYS = 90;
const FRESH_CHECK_DAYS = 30;
const EXPLICIT_TYPES = new Set(['public_request', 'creator_statement', 'hiring_post', 'service_request']);
const DAY_MS = 24 * 60 * 60 * 1000;

function dateValue(value) {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function evidenceFreshness(item, now = Date.now()) {
  if (item.verification_status === 'no_longer_available') {
    return { status: 'unavailable', needsRecheck: false, reason: 'The source was marked unavailable. Do not rely on this evidence.' };
  }

  const publishedAt = dateValue(item.published_at);
  const discoveredAt = dateValue(item.discovered_at);
  const checkedAt = dateValue(item.last_checked_at);
  const sourceDate = publishedAt ?? discoveredAt;
  const checkedRecently = item.verification_status === 'manually_verified' && checkedAt != null && now - checkedAt <= FRESH_CHECK_DAYS * DAY_MS;
  const reasons = [];

  if (sourceDate == null) reasons.push('No publication or discovery date is recorded.');
  else if (sourceDate > now + DAY_MS) reasons.push('The recorded source date is in the future.');
  else if (now - sourceDate > FRESH_SOURCE_DAYS * DAY_MS && !checkedRecently) reasons.push('The source is more than 90 days old and needs a fresh manual check.');

  if (item.verification_status === 'manually_verified') {
    if (checkedAt == null) reasons.push('There is no recorded check date.');
    else if (now - checkedAt > FRESH_CHECK_DAYS * DAY_MS) reasons.push('The source has not been rechecked in the last 30 days.');
  } else if (discoveredAt == null || now - discoveredAt > FRESH_CHECK_DAYS * DAY_MS) {
    reasons.push('Unverified evidence must be checked within 30 days of discovery.');
  }

  if (reasons.length) return { status: sourceDate == null && checkedAt == null ? 'unknown' : 'stale', needsRecheck: true, reason: reasons.join(' ') };
  return { status: 'fresh', needsRecheck: item.verification_status !== 'manually_verified', reason: item.verification_status === 'manually_verified' ? 'Source date and manual check are within the freshness windows.' : 'Recently recorded, but still unverified.' };
}

export function classifyCreatorEvidence(evidence, now = Date.now()) {
  const states = evidence.map(item => ({ id: item.id, ...evidenceFreshness(item, now) }));
  const stateById = new Map(states.map(item => [item.id, item]));
  const usable = evidence.filter(item => stateById.get(item.id)?.status === 'fresh' && item.verification_status === 'manually_verified');
  const explicit = usable.find(item => item.strength === 'strong' && EXPLICIT_TYPES.has(item.evidence_type));
  if (explicit) return {
    classification: 'explicit_opportunity',
    reason: 'A current source-backed request was manually checked. Open the source to confirm it still applies.',
    evidenceCount: usable.length,
    evidenceId: explicit.id,
    evidenceStates: states,
  };

  const potential = usable.find(item => item.strength !== 'weak' && item.evidence_type !== 'context_note');
  if (potential) return {
    classification: 'potential_opportunity',
    reason: 'Current relevant evidence was manually checked, but it is not a confirmed explicit request to buy this service.',
    evidenceCount: usable.length,
    evidenceId: potential.id,
    evidenceStates: states,
  };

  const currentContext = evidence.some(item => item.verification_status === 'manually_verified' && stateById.get(item.id)?.status === 'fresh' && (item.strength === 'weak' || item.evidence_type === 'context_note'));
  const hasStale = states.some(item => item.status === 'stale' || item.status === 'unknown');
  const hasUnavailable = states.some(item => item.status === 'unavailable');
  const hasUnverified = evidence.some(item => item.verification_status !== 'manually_verified' && item.verification_status !== 'no_longer_available');

  if (currentContext) return {
    classification: 'context_only',
    reason: 'Only current weak or contextual evidence is recorded. It does not show buying intent.',
    evidenceCount: evidence.length,
    evidenceStates: states,
  };
  if (hasStale) return {
    classification: 'insufficient_evidence',
    reason: 'Evidence is stale or undated. Recheck the original source before relying on it.',
    evidenceCount: evidence.length,
    evidenceStates: states,
  };
  if (hasUnavailable) return {
    classification: 'insufficient_evidence',
    reason: 'The recorded source is unavailable. Add a current public source before relying on this evidence.',
    evidenceCount: evidence.length,
    evidenceStates: states,
  };
  if (hasUnverified) return {
    classification: 'insufficient_evidence',
    reason: 'Sources are recorded but not manually checked. Review each original source first.',
    evidenceCount: evidence.length,
    evidenceStates: states,
  };
  return {
    classification: 'insufficient_evidence',
    reason: 'No fresh, manually checked evidence of a service need is recorded.',
    evidenceCount: evidence.length,
    evidenceStates: states,
  };
}
