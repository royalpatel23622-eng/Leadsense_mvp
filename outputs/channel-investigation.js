(() => {
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  const number = value => value == null ? 'Not public' : new Intl.NumberFormat().format(Number(value));
  const date = value => value ? new Date(value).toLocaleDateString() : 'Date not available';
  const modalRoot = document.querySelector('#modalRoot');
  if (!modalRoot) return;

  function show(title, message, details = '') {
    modalRoot.innerHTML = `<div class="modal-backdrop" data-inspect-close="true"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="inspectTitle"><div class="modal-head"><div><h2 id="inspectTitle">${esc(title)}</h2><p>${esc(message)}</p></div><button class="close" data-inspect-close="true" aria-label="Close">×</button></div><div id="inspectContent" class="inspect-content">${details}</div><div class="modal-actions"><button class="soft-btn" data-inspect-close="true">Close</button></div></section></div>`;
  }

  function resultMarkup(data) {
    const c = data.channel;
    return `<div class="inspect-grid"><div><small>Subscribers</small><b>${number(c.subscribers)}</b></div><div><small>Total views</small><b>${number(c.totalViews)}</b></div><div><small>Public videos</small><b>${number(c.videoCount)}</b></div><div><small>Declared country</small><b>${esc(c.countryCode || 'Unknown')}</b></div></div><p class="inspect-description">${esc(c.description || 'No public channel description.')}</p><div class="inspect-heading"><div><h3>Latest public uploads</h3><small>Showing up to ${data.videos.length} recent videos</small></div><a class="link-btn" href="${esc(c.channelUrl)}" target="_blank" rel="noopener noreferrer">Open channel ↗</a></div>${data.videos.length ? `<div class="inspect-videos">${data.videos.map(video => `<article class="inspect-video">${video.thumbnail ? `<img src="${esc(video.thumbnail)}" alt="" loading="lazy">` : ''}<div class="inspect-video-body"><a href="${esc(video.videoUrl)}" target="_blank" rel="noopener noreferrer"><b>${esc(video.title)}</b></a><small>Published ${date(video.publishedAt)}</small><div class="inspect-stats"><span>${number(video.views)} views</span><span>${number(video.likes)} likes</span><span>${number(video.comments)} comments</span></div></div></article>`).join('')}</div>` : '<div class="panel">No public uploads were available from this channel.</div>'}<p class="inspect-note">These are YouTube’s public fields, fetched ${esc(new Date(data.fetchedAt).toLocaleString())}. Like and view counts may be hidden. The app does not calculate trends, engagement scores, click-through rate, or watch time from these fields.</p>`;
  }

  document.addEventListener('click', async event => {
    if (event.target.closest('[data-inspect-close]')) { modalRoot.innerHTML = ''; return; }
    const button = event.target.closest('[data-inspect-channel]');
    if (!button) return;
    const channelId = button.dataset.inspectChannel;
    button.disabled = true;
    show('Recent public uploads', 'Loading channel details and recent video fields from YouTube…', '<div class="loadingline run"><i></i></div><p class="source-note">This request uses YouTube API quota. Daily inspections are limited per account.</p>');
    try {
      const response = await fetch('/api/youtube/inspect', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channelId }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error?.message || 'Could not load this channel. Try again later.');
      const content = document.querySelector('#inspectContent');
      if (content) content.innerHTML = resultMarkup(data) + `<p class="source-note">Inspections today: ${number(data.usage?.analysesToday)} / ${number(data.usage?.dailyLimit)}</p>`;
    } catch (error) {
      const content = document.querySelector('#inspectContent');
      if (content) content.innerHTML = `<div class="search-error">${esc(error.message)}</div>`;
    } finally { button.disabled = false; }
  });

  const style = document.createElement('style');
  style.textContent = `.inspect-content{max-height:min(70vh,700px);overflow:auto}.inspect-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.inspect-grid>div{background:#f8f8fb;border:1px solid #eee;border-radius:12px;padding:10px;display:grid;gap:6px}.inspect-grid small,.inspect-heading small,.inspect-video small{font-size:10px;color:#77777f}.inspect-grid b{font-size:12px}.inspect-description{font-size:12px;color:#676771;line-height:1.6;white-space:pre-wrap}.inspect-heading{display:flex;justify-content:space-between;gap:12px;align-items:center;margin:18px 0 10px}.inspect-heading h3{margin:0 0 4px;font-size:14px}.inspect-videos{display:grid;gap:9px}.inspect-video{display:grid;grid-template-columns:150px 1fr;gap:12px;padding:9px;border:1px solid #eee;border-radius:13px}.inspect-video img{width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:9px}.inspect-video-body{display:grid;gap:6px;align-content:center}.inspect-video-body a{font-size:12px;line-height:1.4}.inspect-stats{display:flex;gap:10px;flex-wrap:wrap;color:#65656d;font-size:10px}.inspect-note{font-size:10px;line-height:1.55;color:#77777f;margin:14px 0}@media(max-width:600px){.inspect-grid{grid-template-columns:repeat(2,1fr)}.inspect-video{grid-template-columns:105px 1fr}.inspect-heading{align-items:flex-start;flex-direction:column}}`;
  document.head.append(style);
})();
