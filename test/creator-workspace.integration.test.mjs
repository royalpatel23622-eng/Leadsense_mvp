import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

process.env.NODE_ENV = 'test';
process.env.APP_URL = '';
process.env.SUPABASE_URL = 'https://supabase.test';
process.env.SUPABASE_SECRET_KEY = 'sb_secret_test';
process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';

const userA = '11111111-1111-4111-8111-111111111111';
const userB = '22222222-2222-4222-8222-222222222222';
const leadId = '33333333-3333-4333-8333-333333333333';
const evidenceId = '44444444-4444-4444-8444-444444444444';
const contactId = '55555555-5555-4555-8555-555555555555';
const channelId = 'UC1234567890123456789012';
const users = [userA, userB].map(id => ({ id, email: `${id.slice(0, 3)}@example.test`, role: 'member', status: 'active', plan: 'free', search_limit_override: null }));
const tables = { creator_leads: [], creator_evidence: [], creator_contacts: [] };
let server;
let baseUrl;
const originalFetch = globalThis.fetch;

function jsonResponse(payload, status = 200) { return new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } }); }
function parseEq(params, field, row) { const expected = params.get(field); return !expected || row[field] === expected.replace(/^eq\./, ''); }
function rowMatches(params, row) { return ['id','user_id','channel_id','creator_lead_id'].every(field => parseEq(params, field, row)); }

globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input));
  if (url.hostname !== 'supabase.test') throw new Error(`Unexpected fetch: ${url}`);
  const token = String(init.headers?.Authorization || '').replace(/^Bearer\s+/, '');
  const user = token === 'user-b-token' ? users[1] : users[0];
  if (url.pathname === '/auth/v1/user') return jsonResponse({ id: user.id, email: user.email });
  if (!url.pathname.startsWith('/rest/v1/')) throw new Error(`Unexpected Supabase route: ${url.pathname}`);
  const table = url.pathname.replace('/rest/v1/', '');
  const method = init.method || 'GET';
  if (table === 'app_users') return jsonResponse(users.filter(item => item.id === (url.searchParams.get('id') || '').replace(/^eq\./, '')));
  if (table === 'rpc/save_creator_lead_profile') {
    const input = JSON.parse(init.body);
    let row = tables.creator_leads.find(item => item.user_id === input.p_user_id && item.channel_id === input.p_channel_id);
    if (row) Object.assign(row, { channel_url: input.p_channel_url, creator_name: input.p_creator_name, expires_at: input.p_expires_at });
    else {
      row = { id: leadId, user_id: input.p_user_id, channel_id: input.p_channel_id, channel_url: input.p_channel_url, creator_name: input.p_creator_name, service_category: 'Other', stage: 'Researching', notes: '', display_label: null, expires_at: input.p_expires_at, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      tables.creator_leads.push(row);
    }
    return jsonResponse([row]);
  }
  if (!tables[table]) return jsonResponse([]);
  const rows = tables[table];
  const matches = rows.filter(row => rowMatches(url.searchParams, row));
  if (method === 'POST') {
    const value = JSON.parse(init.body);
    if (table === 'creator_leads' && rows.some(row => row.user_id === value.user_id && row.channel_id === value.channel_id)) {
      const existing = rows.find(row => row.user_id === value.user_id && row.channel_id === value.channel_id);
      Object.assign(existing, value);
      return jsonResponse([existing]);
    }
    const result = { ...value, id: table === 'creator_leads' ? leadId : table === 'creator_evidence' ? evidenceId : contactId, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    if (table === 'creator_leads') result.expires_at = new Date(Date.now() + 29 * 86_400_000).toISOString();
    rows.push(result);
    return jsonResponse([result], 201);
  }
  if (method === 'PATCH') {
    const changes = JSON.parse(init.body);
    for (const row of matches) Object.assign(row, changes);
    return jsonResponse(matches);
  }
  if (method === 'DELETE') {
    const ids = new Set(matches.map(row => row.id));
    for (const id of ids) rows.splice(rows.findIndex(row => row.id === id), 1);
    if (table === 'creator_leads') {
      tables.creator_evidence = tables.creator_evidence.filter(row => !ids.has(row.creator_lead_id));
      tables.creator_contacts = tables.creator_contacts.filter(row => !ids.has(row.creator_lead_id));
    }
    return jsonResponse([]);
  }
  return jsonResponse(matches);
};

before(async () => {
  const { createAppServer } = await import('../server.mjs');
  server = createAppServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
beforeEach(() => { tables.creator_leads = []; tables.creator_evidence = []; tables.creator_contacts = []; });
after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  globalThis.fetch = originalFetch;
});

async function call(path, { user = 'user-a-token', method = 'GET', body } = {}) {
  const response = await originalFetch(`${baseUrl}${path}`, { method, headers: { cookie: `leadsense_at=${user}`, origin: baseUrl, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, body: await response.json() };
}

test('creator leads keep source-backed evidence and public contacts separate and explain evidence status', async () => {
  const create = await call('/api/creator-leads', { method: 'POST', body: { channel_id: channelId, creator_name: 'Creator One', channel_url: `https://www.youtube.com/channel/${channelId}`, service_category: 'Video editing' } });
  assert.equal(create.status, 200);
  assert.equal(create.body.expires_at !== undefined, true);
  assert.ok(Date.parse(create.body.expires_at) <= Date.now() + 30 * 86_400_000);
  tables.creator_leads[0].notes = 'My private research note';
  tables.creator_leads[0].stage = 'Follow-up';
  tables.creator_leads[0].display_label = 'Founder to contact';
  const duplicate = await call('/api/creator-leads', { method: 'POST', body: { channel_id: channelId, creator_name: 'Creator One (refreshed)', channel_url: `https://www.youtube.com/channel/${channelId}` } });
  assert.equal(duplicate.status, 200);
  assert.equal(duplicate.body.notes, 'My private research note');
  assert.equal(duplicate.body.stage, 'Follow-up');
  assert.equal(duplicate.body.display_label, 'Founder to contact');
  assert.equal(duplicate.body.creator_name, 'Creator One (refreshed)');

  const evidence = await call(`/api/creator-leads/${leadId}/evidence`, { method: 'POST', body: { service_category: 'Video editing', evidence_type: 'public_request', strength: 'strong', source_url: 'https://creator.example/jobs', excerpt: 'I am looking for a video editor to help with weekly uploads.' } });
  assert.equal(evidence.status, 201);
  assert.equal(evidence.body.extraction_method, 'manual');
  assert.equal(evidence.body.verification_status, 'unverified');
  const contact = await call(`/api/creator-leads/${leadId}/contacts`, { method: 'POST', body: { contact_type: 'business_email', contact_value: 'work@creator.example', source_url: 'https://creator.example/contact' } });
  assert.equal(contact.status, 201);
  assert.equal(contact.body.verification_status, 'unverified');
  assert.equal(contact.body.extraction_method, 'manual');

  let list = await call('/api/creator-leads');
  assert.equal(list.body[0].opportunity.classification, 'insufficient_evidence');
  assert.equal(list.body[0].evidence[0].source_url, 'https://creator.example/jobs');
  assert.equal(list.body[0].contacts[0].contact_value, 'work@creator.example');
  const verified = await call(`/api/creator-evidence/${evidenceId}`, { method: 'PATCH', body: { verification_status: 'manually_verified' } });
  assert.equal(verified.status, 200);
  list = await call('/api/creator-leads');
  assert.equal(list.body[0].opportunity.classification, 'explicit_opportunity');
  assert.match(list.body[0].opportunity.reason, /user marked/i);
});

test('creator evidence and contact inputs reject missing provenance and fabricated email formats', async () => {
  await call('/api/creator-leads', { method: 'POST', body: { channel_id: channelId, creator_name: 'Creator One', channel_url: `https://www.youtube.com/channel/${channelId}` } });
  const invalidChannel = await call('/api/creator-leads', { method: 'POST', body: { channel_id: 'UCshort', creator_name: 'Nope' } });
  assert.equal(invalidChannel.status, 400);
  const untrustedHost = await call('/api/creator-leads', { method: 'POST', body: { channel_id: channelId, creator_name: 'Nope', channel_url: 'https://youtube.com.attacker.example/channel/x' } });
  assert.equal(untrustedHost.status, 400);
  const invalidEmail = await call(`/api/creator-leads/${leadId}/contacts`, { method: 'POST', body: { contact_type: 'business_email', contact_value: 'not-an-email', source_url: 'https://creator.example/contact' } });
  assert.equal(invalidEmail.status, 400);
  const missingSource = await call(`/api/creator-leads/${leadId}/contacts`, { method: 'POST', body: { contact_type: 'business_email', contact_value: 'guess@creator.example' } });
  assert.equal(missingSource.status, 400);
});

test('creator workspace and child records are isolated by account ownership', async () => {
  const ownLead = await call('/api/creator-leads', { method: 'POST', body: { channel_id: channelId, creator_name: 'Owner A', channel_url: `https://www.youtube.com/channel/${channelId}` } });
  const ownEvidence = await call(`/api/creator-leads/${leadId}/evidence`, { method: 'POST', body: { service_category: 'Editing', evidence_type: 'context_note', strength: 'weak', source_url: 'https://creator.example/about', excerpt: 'The creator posts several videos each week.' } });
  assert.equal(ownEvidence.status, 201);
  const otherList = await call('/api/creator-leads', { user: 'user-b-token' });
  assert.deepEqual(otherList.body, []);
  assert.equal((await call(`/api/creator-leads/${ownLead.body.id}`, { user: 'user-b-token', method: 'PATCH', body: { stage: 'Contacted' } })).status, 404);
  assert.equal((await call(`/api/creator-evidence/${ownEvidence.body.id}`, { user: 'user-b-token', method: 'PATCH', body: { verification_status: 'manually_verified' } })).status, 404);
  assert.equal((await call(`/api/creator-leads/${leadId}/contacts`, { user: 'user-b-token', method: 'POST', body: { contact_type: 'website', contact_value: 'https://creator.example', source_url: 'https://creator.example' } })).status, 404);
  const ownList = await call('/api/creator-leads');
  assert.equal(ownList.body[0].opportunity.classification, 'context_only');
});

test('deleting a saved creator removes its linked evidence and contacts', async () => {
  await call('/api/creator-leads', { method: 'POST', body: { channel_id: 'UCabcdefghijklmnopqrstuv', creator_name: 'Creator Two', channel_url: 'https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv' } });
  const response = await call(`/api/creator-leads/${leadId}`, { method: 'DELETE' });
  assert.equal(response.status, 200);
  assert.equal((await call('/api/creator-leads')).body.length, 0);
  assert.equal(tables.creator_evidence.length, 0);
  assert.equal(tables.creator_contacts.length, 0);
});

test('expired YouTube fields are hidden while saved creator notes, evidence, and contacts remain', async () => {
  await call('/api/creator-leads', { method: 'POST', body: { channel_id: channelId, creator_name: 'Creator One', channel_url: `https://www.youtube.com/channel/${channelId}` } });
  await call(`/api/creator-leads/${leadId}/evidence`, { method: 'POST', body: { service_category: 'Editing', evidence_type: 'context_note', strength: 'weak', source_url: 'https://creator.example/about', excerpt: 'A user-authored note from independent research.' } });
  await call(`/api/creator-leads/${leadId}/contacts`, { method: 'POST', body: { contact_type: 'website', contact_value: 'https://creator.example', source_url: 'https://creator.example/about' } });
  const saved = tables.creator_leads[0];
  saved.notes = 'A user-authored note that must remain';
  saved.stage = 'Contacted';
  saved.display_label = 'Keep this label';
  saved.expires_at = new Date(Date.now() - 1).toISOString();
  saved.channel_id = null;
  saved.channel_url = null;
  saved.creator_name = null;

  const response = await call('/api/creator-leads');
  assert.equal(response.status, 200);
  assert.equal(response.body.length, 1);
  assert.equal(response.body[0].youtube_data_expired, true);
  assert.equal(response.body[0].channel_id, null);
  assert.equal(response.body[0].channel_url, null);
  assert.equal(response.body[0].creator_name, null);
  assert.equal(response.body[0].notes, 'A user-authored note that must remain');
  assert.equal(response.body[0].stage, 'Contacted');
  assert.equal(response.body[0].display_label, 'Keep this label');
  assert.equal(response.body[0].evidence.length, 1);
  assert.equal(response.body[0].contacts.length, 1);
  assert.equal(tables.creator_leads.length, 1);
});
