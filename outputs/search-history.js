(() => {
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  let lastHost = null;
  async function mountHistory() {
    const title = document.querySelector('#crumbName')?.textContent || '';
    const host = document.querySelector('#content .page');
    if (!host || !title.toLowerCase().includes('saved searches') || host === lastHost || host.querySelector('#recentSearchHistory')) return;
    lastHost = host;
    const panel = document.createElement('section');
    panel.id = 'recentSearchHistory';
    panel.className = 'panel';
    panel.style.marginTop = '14px';
    panel.innerHTML = '<div class="panel-head"><div><h3>Recent search activity</h3><small>Your recent searches and whether they finished</small></div></div><p>Loading your history…</p>';
    host.append(panel);
    try {
      const response = await fetch('/api/searches', { credentials: 'same-origin' });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error?.message || 'Could not load search history.');
      panel.innerHTML = `<div class="panel-head"><div><h3>Recent search activity</h3><small>Search words and status only. Channel results are not saved.</small></div></div>${data.length ? `<div class="table-wrap"><table class="admin-table"><thead><tr><th>Started</th><th>Search</th><th>Status</th><th>Note</th></tr></thead><tbody>${data.map(item => `<tr><td>${esc(new Date(item.created_at).toLocaleString())}</td><td>${esc(item.query)}</td><td>${esc(item.status)}</td><td>${esc(item.error_code || '—')}</td></tr>`).join('')}</tbody></table></div>` : '<p>You have not run a search yet.</p>'}`;
    } catch (error) { panel.innerHTML = `<div class="panel-head"><div><h3>Recent search activity</h3><small>${esc(error.message)}</small></div></div>`; }
  }
  const content = document.querySelector('#content');
  if (content) new MutationObserver(mountHistory).observe(content, { childList: true, subtree: true });
})();
