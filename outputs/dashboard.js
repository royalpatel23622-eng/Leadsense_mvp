(() => {
  const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  let recentSearches = [];

  function dashboard() {
    const records = typeof prospects === 'undefined' ? [] : prospects;
    const tasks = typeof taskRecords === 'undefined' ? [] : taskRecords;
    const presets = typeof searchPresets === 'undefined' ? [] : searchPresets;
    const activeTasks = tasks.filter(task => !task.done);
    const metric = (label, value, note, icon) => `<article class="dash-metric"><span class="dash-metric-icon">${icon}</span><small>${label}</small><strong>${value}</strong><span class="dash-metric-note">${note}</span></article>`;
    const history = recentSearches.length
      ? recentSearches.slice(0, 4).map(item => `<article class="dash-search-row"><span class="dash-search-icon">⌕</span><span><b>${esc(item.query)}</b><small>${esc(new Date(item.created_at).toLocaleString())}</small></span><em class="dash-status ${esc(item.status)}">${esc(item.status)}</em></article>`).join('')
      : '<div class="dash-empty"><b>Your search activity will show here.</b><span>Try YouTube discovery to start finding public channels.</span><button class="primary-btn blue" data-view="discover">Search channels ↗</button></div>';

    return `<section class="page dash-page"><header class="dash-welcome"><div><span class="eyebrow">Your LeadSense workspace</span><h1>Make your next step clear.</h1><p>Search public YouTube channels, then keep your own business research and follow-ups in one place.</p></div><button class="primary-btn blue" data-view="discover">Find YouTube channels ↗</button></header><div class="dash-metrics">${metric('Independent CRM records', records.length, 'Added by you', '▤')}${metric('Open follow-ups', activeTasks.length, 'Your next actions', '◷')}${metric('Saved searches', presets.length, 'Your search settings', '⌕')}${metric('Searches', recentSearches.length, 'Recorded in your account', '↗')}</div><div class="dash-columns"><section class="panel"><div class="panel-head"><div><h2>Recent searches</h2><small>Only your search words and status are saved.</small></div><button class="link-btn" data-view="saved">View saved searches ↗</button></div><div class="dash-history">${history}</div></section><aside class="panel dash-next"><span class="dash-next-orb">✳</span><h2>Two clear workspaces</h2><p>YouTube results are temporary and stay separate from CRM records. Add a business to your CRM only when you have researched it independently.</p><button class="soft-btn" data-view="crm">Open your CRM</button><button class="soft-btn" data-view="tasks">View follow-ups</button></aside></div><p class="source-note">Counts come from your account. LeadSense does not invent business records, search activity, or YouTube opportunity scores.</p></section>`;
  }

  window.overview = dashboard;
  window.loadDashboardHistory = async function() {
    try {
      const response = await fetch('/api/searches', { credentials: 'same-origin' });
      const data = await response.json();
      if (!response.ok || !Array.isArray(data)) return;
      recentSearches = data;
      if (document.querySelector('#crumbName')?.textContent === 'Overview') window.render();
    } catch { /* Show the real empty state when history cannot be loaded. */ }
  };
  window.addEventListener('leadsense:authenticated', window.loadDashboardHistory);

  const style = document.createElement('style');
  style.textContent = `.dash-page{animation:dash-in .55s cubic-bezier(.2,.7,.2,1) both}.dash-welcome{display:flex;justify-content:space-between;align-items:flex-end;gap:22px;padding:24px 26px;border-radius:23px;background:linear-gradient(120deg,#fff 0%,#f6f5ff 55%,#e9f8f0 100%);border:1px solid #eeedf1}.dash-welcome h1{font-size:clamp(26px,4vw,40px);letter-spacing:-.055em;margin:8px 0}.dash-welcome p{max-width:610px;color:#77777f;line-height:1.55;margin:0;font-size:13px}.dash-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:16px 0}.dash-metric{display:grid;gap:8px;padding:17px;background:#fff;border:1px solid #ebe9e4;border-radius:17px;box-shadow:0 5px 15px #17172008}.dash-metric-icon{width:30px;height:30px;display:grid;place-items:center;border-radius:10px;background:#edf0ff;color:#416cf6}.dash-metric small,.dash-metric-note{font-size:10px;color:#77777f}.dash-metric strong{font-size:24px;letter-spacing:-.04em}.dash-columns{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(230px,.8fr);gap:14px}.dash-columns .panel{margin:0}.dash-history{display:grid}.dash-search-row{display:flex;align-items:center;gap:11px;padding:12px 0;border-bottom:1px solid #f0eff2}.dash-search-row>span:nth-child(2){display:grid;gap:4px;min-width:0;flex:1}.dash-search-row b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px}.dash-search-row small{color:#82818a;font-size:10px}.dash-search-icon{width:31px;height:31px;display:grid;place-items:center;background:#f1f2ff;color:#416cf6;border-radius:10px}.dash-status{font-size:10px;font-style:normal;padding:5px 8px;border-radius:99px;background:#f1f1f3;color:#65656d}.dash-status.completed{background:#eaf8f0;color:#23774e}.dash-status.failed{background:#fff0eb;color:#b44d30}.dash-empty{min-height:170px;display:flex;align-items:flex-start;justify-content:center;flex-direction:column;gap:9px;color:#77777f;font-size:12px}.dash-empty b{color:#25252c}.dash-empty .primary-btn{margin-top:4px}.dash-next{display:flex;flex-direction:column;align-items:flex-start;gap:10px;background:linear-gradient(150deg,#fff,#f8f7ff)}.dash-next h2{font-size:16px;margin:2px 0}.dash-next p{color:#77777f;font-size:12px;line-height:1.6;margin:0 0 6px}.dash-next-orb{width:35px;height:35px;border-radius:12px;display:grid;place-items:center;background:#eaf8f0;color:#35a773}@keyframes dash-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}@media(max-width:850px){.dash-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.dash-columns{grid-template-columns:1fr}.dash-welcome{align-items:flex-start;flex-direction:column}}@media(prefers-reduced-motion:reduce){.dash-page{animation:none}}`;
  document.head.append(style);
  window.render();
})();
