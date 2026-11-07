(() => {
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  const number = value => value == null ? 'Not tracked' : typeof value === 'string' ? value : new Intl.NumberFormat().format(value);
  const views = ['Overview', 'Users', 'Searches', 'System'];
  let active = 'Overview';

  async function get(path) {
    const response = await fetch(path, { credentials: 'same-origin' });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error?.message || 'Could not load admin information.');
    return data;
  }

  async function patch(path, body) {
    const response = await fetch(path, { method: 'PATCH', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error?.message || 'Could not save that change.');
    return data;
  }

  window.openAdminPanel = async function() {
    document.querySelector('#content').innerHTML = `<section class="page"><div class="page-title"><div><span class="eyebrow">Workspace controls</span><h1>Admin panel</h1><p>Manage accounts, search history, and service health.</p></div></div><nav class="admin-tabs">${views.map(name => `<button class="soft-btn ${name === active ? 'active' : ''}" data-admin-tab="${name}">${name}</button>`).join('')}</nav><div id="adminPanelContent" class="admin-panel-content"><div class="panel">Loading workspace information…</div></div><p class="source-note">YouTube search results are not saved as lead records. API secrets stay in Render’s server environment.</p></section>`;
    await loadActive();
  };

  async function loadActive() {
    const host = document.querySelector('#adminPanelContent');
    if (!host) return;
    host.innerHTML = '<div class="panel">Loading…</div>';
    try {
      if (active === 'Overview') {
        const d = await get('/api/admin/overview');
        host.innerHTML = `<div class="admin-metrics">${[
          ['Registered accounts', d.users], ['Active accounts', d.activeUsers], ['Searches recorded', d.searches],
          ['YouTube API calls today', d.apiCallsToday], ['API errors', d.apiErrors], ['Search completion', d.searchSuccessRate == null ? 'No data' : `${d.searchSuccessRate}%`],
          ['Discovered channels', d.discoveredChannels == null ? 'Not tracked' : d.discoveredChannels], ['Analyzed leads', d.analyzedLeads == null ? 'Not available' : d.analyzedLeads],
        ].map(([label, value]) => `<article class="panel"><small>${esc(label)}</small><strong>${esc(number(value))}</strong></article>`).join('')}</div><div class="panel" style="margin-top:14px"><h3>Service status</h3><p>YouTube: ${esc(d.system.youtube)} · Database: ${esc(d.system.database)} · Authentication: ${esc(d.system.auth)} · AI: ${esc(d.system.ai)} · Billing: ${esc(d.system.billing)}</p><p class="source-note">Account counts and search history come from this app. Channel and lead totals are not tracked because live YouTube responses are not stored.</p></div>`;
      } else if (active === 'Users') {
        const users = await get('/api/admin/users');
        host.innerHTML = `<div class="panel"><div class="panel-head"><div><h3>Accounts</h3><small>Only an administrator can change these settings.</small></div><input id="adminUserSearch" class="input" placeholder="Filter this list by email"></div><div class="table-wrap"><table class="admin-table"><thead><tr><th>Email</th><th>Role</th><th>Status</th><th>Plan</th><th>Searches today</th><th>Inspections today</th><th>Daily search limit override</th><th>Joined</th></tr></thead><tbody>${users.map(user => `<tr data-user-row="${esc(user.id)}"><td>${esc(user.email)}</td><td><select data-user-setting="role" aria-label="Role for ${esc(user.email)}"><option ${user.role === 'member' ? 'selected' : ''}>member</option><option ${user.role === 'admin' ? 'selected' : ''}>admin</option></select></td><td><select data-user-setting="status" aria-label="Status for ${esc(user.email)}"><option ${user.status === 'active' ? 'selected' : ''}>active</option><option ${user.status === 'suspended' ? 'selected' : ''}>suspended</option></select></td><td><select data-user-setting="plan" aria-label="Plan for ${esc(user.email)}">${['free','starter','pro','agency'].map(plan => `<option ${user.plan === plan ? 'selected' : ''}>${plan}</option>`).join('')}</select></td><td>${number(user.searches_today)} / ${number(user.search_limit_override || user.default_search_limit)}</td><td>${number(user.analyses_today)} / ${number(user.default_analysis_limit)}</td><td><input data-user-setting="search_limit_override" aria-label="Daily search limit override for ${esc(user.email)}" type="number" min="1" max="1000" placeholder="${esc(user.default_search_limit)}" value="${esc(user.search_limit_override ?? '')}" style="width:85px"></td><td>${esc(new Date(user.created_at).toLocaleDateString())}</td></tr>`).join('')}</tbody></table></div><p id="adminUserStatus" class="source-note">${users.length ? `${users.length} accounts shown (up to 200). Blank limit override uses the default.` : 'No accounts yet.'}</p></div>`;
      } else if (active === 'Searches') {
        const rows = await get('/api/admin/searches');
        host.innerHTML = `<div class="panel"><div class="panel-head"><div><h3>Recent searches</h3><small>Search phrases, filters, and whether the request finished.</small></div></div><div class="table-wrap"><table class="admin-table"><thead><tr><th>Started</th><th>User ID</th><th>Search words</th><th>Status</th><th>Error</th></tr></thead><tbody>${rows.map(item => `<tr><td>${esc(new Date(item.created_at).toLocaleString())}</td><td><code>${esc(item.user_id)}</code></td><td>${esc(item.query)}</td><td>${esc(item.status)}</td><td>${esc(item.error_code || '—')}</td></tr>`).join('')}</tbody></table></div>${rows.length ? '' : '<p>No searches recorded yet.</p>'}</div>`;
      } else {
        const [config, errors] = await Promise.all([get('/api/admin/config'), get('/api/admin/errors')]);
        host.innerHTML = `<div class="content-grid" style="grid-template-columns:repeat(auto-fit,minmax(260px,1fr))"><div class="panel"><h3>Server connections</h3><p>YouTube key: ${config.youtube.configured ? 'Added' : 'Not added'} (server only)</p><p>Database: ${config.database.configured ? 'Configured' : 'Not configured'}</p><p>Sign-in: ${config.auth.configured ? 'Configured' : 'Not configured'}</p><p>AI service: ${config.ai.configured ? 'Key detected but not used' : 'Not configured'}</p><p>Payments: Not configured</p></div><div class="panel"><h3>Usage limits</h3><p>YouTube search requests/day: ${number(config.limits.youtubeSearchCallsPerDay)}</p><p>Searches per account/day: ${number(config.limits.userSearchesPerDay)}</p><p>Channel inspections per account/day: ${number(config.limits.userChannelInspectionsPerDay)}</p><p>API requests/minute: ${number(config.limits.apiRequestsPerMinute)}</p><p class="source-note">A search or inspection may use multiple YouTube API quota units. Google quota totals are not available from this app.</p></div><div class="panel"><h3>Opportunity scoring</h3><p>Scores from YouTube API statistics are disabled. YouTube’s developer rules prohibit deriving new scores from its API data.</p><p class="source-note">Review the channel’s original public data and add your own notes. Payments and AI settings are not connected.</p></div></div><div class="panel" style="margin-top:14px"><h3>Recent server errors</h3><div class="table-wrap"><table class="admin-table"><thead><tr><th>Time</th><th>Code</th><th>Status</th><th>Route</th><th>Message</th></tr></thead><tbody>${errors.map(error => `<tr><td>${esc(new Date(error.created_at).toLocaleString())}</td><td>${esc(error.code)}</td><td>${esc(error.status)}</td><td>${esc(error.path)}</td><td>${esc(error.message)}</td></tr>`).join('')}</tbody></table></div>${errors.length ? '' : '<p>No server errors recorded.</p>'}</div>`;
      }
    } catch (error) { host.innerHTML = `<div class="panel"><p>${esc(error.message)}</p></div>`; }
  }

  document.addEventListener('click', event => {
    const tab = event.target.closest('[data-admin-tab]');
    if (!tab) return;
    active = tab.dataset.adminTab;
    window.openAdminPanel();
  });
  document.addEventListener('input', event => {
    if (event.target.id !== 'adminUserSearch') return;
    const value = event.target.value.toLowerCase();
    document.querySelectorAll('[data-user-row]').forEach(row => { row.hidden = !row.textContent.toLowerCase().includes(value); });
  });
  document.addEventListener('change', async event => {
    const field = event.target.closest('[data-user-setting]');
    if (!field) return;
    const row = field.closest('[data-user-row]');
    const status = document.querySelector('#adminUserStatus');
    const value = field.dataset.userSetting === 'search_limit_override' ? (field.value === '' ? null : Number(field.value)) : field.value;
    try { await patch(`/api/admin/users/${encodeURIComponent(row.dataset.userRow)}`, { [field.dataset.userSetting]: value }); if (status) status.textContent = 'Account updated.'; }
    catch (error) { if (status) status.textContent = error.message; await loadActive(); }
  });
  const style = document.createElement('style');
  style.textContent = `.admin-tabs{display:flex;gap:8px;flex-wrap:wrap;margin:14px 0}.admin-tabs .active{background:#e9edff;color:#3658cc}.admin-metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(155px,1fr));gap:10px}.admin-metrics .panel{display:grid;gap:10px}.admin-metrics small{color:#77777f}.admin-metrics strong{font-size:23px}.admin-table{width:100%;border-collapse:collapse;font-size:12px}.admin-table th,.admin-table td{text-align:left;padding:10px;border-bottom:1px solid #eee;vertical-align:middle}.admin-table th{color:#77777f;font-weight:600}.admin-table select,.admin-panel-content .input{border:1px solid #e8e6e1;border-radius:9px;padding:7px;background:white}.table-wrap{overflow:auto}`;
  document.head.append(style);
})();
