(() => {
  const countries = [
    ['United States', 'US'], ['United Kingdom', 'GB'], ['Canada', 'CA'], ['Australia', 'AU'],
    ['India', 'IN'], ['Germany', 'DE'], ['France', 'FR'], ['Spain', 'ES'], ['Italy', 'IT'],
    ['Netherlands', 'NL'], ['Sweden', 'SE'], ['Norway', 'NO'], ['Denmark', 'DK'],
    ['Ireland', 'IE'], ['Japan', 'JP'], ['Singapore', 'SG'], ['Brazil', 'BR'], ['Mexico', 'MX'],
  ];
  const countryLabel = code => countries.find(([, value]) => value === code)?.[0] || code || 'Unknown';
  const escHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  const number = value => value == null ? 'Not public' : new Intl.NumberFormat().format(Number(value));
  const selectOptions = (items, selected = '') => items.map(([label, value]) => `<option value="${value}" ${value === selected ? 'selected' : ''}>${label}</option>`).join('');
  let activeSearch = null;
  let inspectedChannelIds = [];

  const styles = document.createElement('style');
  styles.textContent = `
    .discovery-flow{display:grid;gap:16px}.discovery-flow .discovery-hero{min-height:225px}
    .lead-search{display:grid;gap:15px}.lead-search-top{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px}
    .lead-search-top .searchbox{min-width:0}.lead-filter-grid{display:grid;grid-template-columns:1.3fr 1fr 1fr;gap:10px}
    .lead-filter{display:grid;gap:6px;min-width:0}.lead-filter label{font-size:10px;font-weight:680;color:#77767d}
    .lead-filter select,.lead-filter input{width:100%;min-width:0;border:1px solid #e8e6e1;background:#fbfaf8;border-radius:11px;padding:11px 12px;color:#292930;font:inherit;font-size:12px}
    .lead-range{display:grid;grid-template-columns:1fr 1fr;gap:7px}.lead-checks{display:flex;gap:18px;flex-wrap:wrap;align-items:center}.lead-check{display:flex;align-items:center;gap:7px;font-size:11px;color:#6e6d75}.lead-check input{accent-color:#416cf6;width:15px;height:15px}
    .lead-search-note,.lead-policy-note{font-size:10px;line-height:1.6;color:#828189;margin:0}.lead-search-note{padding:10px 12px;background:#f8f7f5;border-radius:11px}
    .lead-results{display:grid;gap:12px}.lead-result{animation:card-arrive .4s cubic-bezier(.2,.7,.2,1) both}.lead-result:nth-child(2){animation-delay:.04s}.lead-result:nth-child(3){animation-delay:.08s}.lead-result:nth-child(4){animation-delay:.12s}
    .lead-result-top{display:flex;gap:11px;align-items:center}.lead-channel-avatar{width:48px;height:48px;flex:none;border-radius:50%;object-fit:cover;background:#edf0ff}.lead-result-title{min-width:0;flex:1}.lead-result-title h3{font-size:14px;margin:0 0 4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.lead-result-title a{color:#62616a;font-size:10px}.lead-fit{font-size:9px;padding:6px 8px;border-radius:20px;background:#e8f7ee;color:#27895d;white-space:nowrap}.lead-related .lead-fit{background:#fff3de;color:#a36913}.lead-topic-tags{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin:0 0 10px}.lead-topic-tags small{font-size:9px;color:#8a8990}.lead-topic-tags span{font-size:9px;padding:4px 7px;background:#f2efff;color:#7254bd;border-radius:99px}
    .lead-result-desc{font-size:11px;line-height:1.55;color:#696870;margin:12px 0}.lead-reasons{display:grid;gap:6px;padding:10px 11px;background:#f8f8fb;border-radius:11px}.lead-reasons strong{font-size:10px}.lead-reasons span{font-size:10px;color:#696870;line-height:1.45}.lead-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin:11px 0}.lead-stat{padding:9px;border:1px solid #f0efed;border-radius:10px}.lead-stat small{display:block;font-size:9px;color:#85848c;margin-bottom:5px}.lead-stat b{font-size:11px}.lead-card-actions{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:10px}.lead-card-actions>div{display:flex;gap:7px;flex-wrap:wrap}.lead-card-actions .soft-btn{padding:8px 10px}.lead-manual-review{display:grid;gap:8px;padding:12px;border-radius:13px;background:linear-gradient(135deg,#fff8ee,#f7f4ff);margin-top:10px}.lead-manual-review b{font-size:11px}.lead-manual-review p{font-size:10px;line-height:1.55;color:#74737c;margin:0}
    .lead-loading{height:4px;border-radius:8px;overflow:hidden;background:#efedf4;margin-top:10px}.lead-loading i{display:block;width:35%;height:100%;background:linear-gradient(90deg,#416cf6,#9770ef,#ff7b43,#47bb86);animation:lead-scan 1.1s ease-in-out infinite alternate}@keyframes lead-scan{to{transform:translateX(185%)}}
    .lead-empty{padding:28px 18px;background:#fff;border:1px dashed #dfdce5;border-radius:16px;text-align:center}.lead-empty b{display:block;font-size:13px}.lead-empty p{max-width:510px;margin:7px auto 0;font-size:11px;line-height:1.6;color:#7e7d84}
    .lead-reach-note{font-size:9px;line-height:1.5;color:#85848b;margin:7px 0 0}
    .lead-youtube-source{display:inline-flex;align-items:center;gap:8px;margin-top:7px;padding:7px 10px;border-radius:9px;background:#1b1b20;color:#fff;font-size:9px}
    .lead-youtube-source img{display:block;width:72px;height:auto}
    .creator-workspace{display:grid;gap:12px;margin-top:24px}.creator-workspace-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:11px}.creator-workspace-card{background:#fff;border:1px solid #eceae8;border-radius:15px;padding:13px;box-shadow:0 8px 28px #22210d07}.creator-workspace-card h3{font-size:13px;margin:0}.creator-workspace-card p,.creator-workspace-card small{font-size:10px;line-height:1.55;color:#77767d}.creator-workspace-card .toolbar{display:flex;gap:7px;flex-wrap:wrap}.creator-workspace-title{display:flex;justify-content:space-between;gap:10px;align-items:center}.creator-workspace-item{padding:9px 0;border-top:1px solid #f0efed}.creator-workspace-item a{font-size:10px;overflow-wrap:anywhere}.creator-workspace-item .toolbar{margin-top:6px}.creator-classification{display:inline-flex;padding:5px 8px;border-radius:99px;background:#f2efff;color:#7055b3;font-size:9px}.creator-workspace-empty{padding:20px;border:1px dashed #e4e1e7;border-radius:14px;background:#fff;color:#777;font-size:11px}.creator-expiry{color:#9b6b24!important}
    @media(max-width:760px){.discovery-flow{gap:12px}.discovery-flow .discovery-hero{min-height:215px;padding:24px 19px}.discovery-flow .discovery-hero h1{font-size:38px}.lead-search-top{grid-template-columns:1fr}.lead-search-top .primary-btn{width:100%;min-height:48px}.lead-filter-grid{grid-template-columns:1fr}.lead-range{grid-template-columns:1fr 1fr}.lead-checks{display:grid;gap:11px}.lead-result-top{align-items:flex-start}.lead-fit{margin-left:auto}.lead-card-actions{align-items:flex-start;flex-direction:column}.lead-card-actions>div{width:100%}.lead-card-actions .soft-btn{flex:1}.lead-stats{grid-template-columns:repeat(3,minmax(0,1fr))}.lead-stat{padding:8px 6px}.lead-stat b{font-size:10px}.lead-policy-note{font-size:9px}.creator-workspace-grid{grid-template-columns:1fr}.creator-workspace-title{align-items:flex-start;flex-direction:column}}
    @media(prefers-reduced-motion:reduce){.lead-result{animation:none!important}.lead-loading i{animation:none!important;width:100%}}
  `;
  document.head.append(styles);

  window.discover = function discoverLeads() {
    const activeChannels = liveDiscovery ? channels : [];
    return `<section class="page discovery-page discovery-flow">
      <div class="discovery-hero"><div class="discovery-copy"><span class="discovery-kicker"><i class="pulse-dot"></i> YouTube channel finder</span><h1>Find creators<br><span>to reach out to.</span></h1><p>Choose a topic, country, and subscriber range. We’ll show public channels that match those choices.</p></div><div class="discovery-illustration" aria-hidden="true"><div class="disco-ring"></div><div class="disco-leaf"></div><div class="disco-core"></div><div class="disco-sun"></div><div class="disco-diamond"></div><div class="disco-tag"><b>Country</b> · selected<br><b>Subscribers</b> · your range</div></div></div>
      <div class="discovery-box"><div class="discovery-box-head"><strong>Set your search</strong><span>Pick the channels you want to find</span></div>
        <form class="lead-search" id="leadSearchForm">
          <div class="lead-search-top"><label class="searchbox"><span aria-hidden="true">⌕</span><input id="creatorQuery" maxlength="120" placeholder="Topic or channel phrase · e.g. gaming tutorials" required></label><button class="primary-btn blue" id="searchBtn" type="submit">Find channels <span aria-hidden="true">↗</span></button></div>
          <div class="lead-filter-grid">
            <div class="lead-filter"><label for="countryFilter">Country</label><select id="countryFilter"><option value="all">Any country</option>${selectOptions(countries)}<option value="unknown">Country not listed</option></select></div>
            <div class="lead-filter"><label for="minSubscriberFilter">Subscriber range</label><div class="lead-range"><input id="minSubscriberFilter" type="number" min="0" step="1" inputmode="numeric" placeholder="Minimum" aria-label="Minimum subscribers"><input id="maxSubscriberFilter" type="number" min="0" step="1" inputmode="numeric" placeholder="Maximum" aria-label="Maximum subscribers"></div></div>
            <div class="lead-filter"><label for="regionFilter">Search region</label><select id="regionFilter"><option value="US">United States</option>${selectOptions(countries.filter(([, code]) => code !== 'US'))}</select></div>
            <div class="lead-filter"><label for="requestedCountFilter">Exact matches wanted</label><select id="requestedCountFilter">${[5,10,20,30,50].map(count => `<option value="${count}" ${count===20?'selected':''}>${count} channels</option>`).join('')}</select></div>
          </div>
          <div class="lead-checks"><label class="lead-check"><input id="includeUnknown" type="checkbox"> Include channels with no public country</label><label class="lead-check"><input id="includeUnknownSubscribersFilter" type="checkbox"> Include channels with hidden subscriber counts</label></div>
          <p class="lead-search-note">Country is included only when the creator lists it publicly. Subscriber counts are rounded by YouTube. Search region changes what YouTube shows; it does not prove where a creator lives.</p>
        </form>
        <div class="search-suggestions"><span class="hint">Try one of these</span><button class="tag" data-query="gaming tutorials">Gaming tutorials</button><button class="tag" data-query="business podcast">Business podcasts</button><button class="tag" data-query="design tutorials">Design tutorials</button><button class="tag" data-query="technology explainers">Tech explainers</button></div>
        <div id="searchProgress" aria-live="polite"></div>
      </div>
      <div class="results-heading"><div><h2>Channels to review</h2><p id="resultsSub">Choose your filters, then search YouTube.</p><a class="lead-youtube-source" href="https://www.youtube.com/" target="_blank" rel="noopener noreferrer" aria-label="Channel details are from YouTube"><span>Source</span><img src="https://developers.google.com/youtube/images/YouTube_logo_standard_white.png" alt="YouTube"></a></div><span class="result-count-pill" id="resultCount">No search yet</span></div>
      <section class="result-group"><h3>Exact matches</h3><div class="creator-grid lead-results" id="creatorGrid">${activeChannels.filter(channel => !channel.isRelated).map(channelCard).join('')}</div></section><section class="result-group" id="relatedResultsRoot" hidden><h3>Related candidates</h3><p>These matched the topic, but missed one or more selected filters.</p><div class="creator-grid lead-results" id="relatedCreatorGrid"></div></section><div class="empty" id="noResults" hidden></div><div id="loadMoreRoot"></div>
      <div class="lead-manual-review"><b>What LeadSense can and can’t tell you</b><p>We explain why a channel matches your filters. You can inspect recent public uploads and review the thumbnails and editing yourself. Retention data is private to the channel owner, so we cannot flag low retention or claim a creator has poor quality. Reach out through contact options the creator has made public on their channel.</p></div>
      <section class="creator-workspace" aria-labelledby="creatorWorkspaceTitle"><div class="creator-workspace-title"><div><h2 id="creatorWorkspaceTitle">Saved creator leads</h2><small>Keep notes, source-backed evidence, and public contact routes together.</small></div><button class="soft-btn" type="button" data-action="refreshCreatorWorkspace">Refresh saved leads</button></div><div id="creatorWorkspaceStatus" class="lead-policy-note" aria-live="polite"></div><div id="creatorWorkspaceGrid" class="creator-workspace-grid"><div class="creator-workspace-empty">Your saved creator leads will appear here. Save a live channel after searching.</div></div><p class="lead-policy-note">Saved YouTube channel identifiers and user notes expire after 29 days. Refresh a saved channel by inspecting it. Evidence and contacts are entered by you; LeadSense does not crawl or verify the source automatically.</p></section>
      <p class="lead-policy-note">YouTube is the source of channel details. LeadSense shows public subscriber counts and declared country without estimating creator needs or collecting email addresses. Results are refreshed when you search. By using these YouTube-powered features, you agree to the <a href="https://www.youtube.com/t/terms" target="_blank" rel="noopener noreferrer">YouTube Terms of Service</a>.</p>
    </section>`;
  };

  window.channelCard = function channelCard(c) {
    const country = c.countryCode ? countryLabel(c.countryCode) : 'Country not listed';
    const low = $('#minSubscriberFilter')?.value;
    const high = $('#maxSubscriberFilter')?.value;
    const range = low || high ? `${low ? number(low) : '0'}–${high ? number(high) : 'no maximum'}` : 'No subscriber range selected';
    const reasons = c.isRelated ? [`YouTube returned this for “${escHtml(lastSearchPayload?.query || '')}”.`, ...(c.relatedReasons || ['This channel missed one or more selected filters.'])] : [
      `YouTube returned this channel for “${escHtml(lastSearchPayload?.query || '')}”.`,
      c.countryCode ? `The channel lists ${escHtml(country)} as its country.` : 'The creator has not listed a country on the channel.',
      c.subs == null ? 'The subscriber count is hidden or unavailable.' : `${number(c.subs)} public subscribers; selected range: ${range}.`,
    ];
    const topicLabels = (c.topicCategories || []).slice(0, 3).map(url => { try { return decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop() || '').replaceAll('_', ' '); } catch { return ''; } }).filter(Boolean);
    const openUrl = c.channelUrl || `https://www.youtube.com/channel/${encodeURIComponent(c.channelId || '')}`;
    const thumb = c.thumbnail ? `<img class="lead-channel-avatar" src="${escHtml(c.thumbnail)}" alt="" loading="lazy">` : `<span class="lead-channel-avatar creator-avatar">${escHtml(c.initials || '?')}</span>`;
    return `<article class="creator lead-result ${c.isRelated ? 'lead-related' : ''}"><div class="lead-result-top">${thumb}<div class="lead-result-title"><h3>${escHtml(c.name)}</h3><a href="${escHtml(openUrl)}" target="_blank" rel="noopener noreferrer">${escHtml(c.customUrl ? `@${c.customUrl.replace(/^@/, '')}` : 'Open YouTube channel')} ↗</a></div><span class="lead-fit">${c.isRelated ? 'Related topic' : 'Matches filters'}</span></div>
      <p class="lead-result-desc">${escHtml(c.desc || 'This channel has no public description.')}</p>
      <div class="lead-stats"><div class="lead-stat"><small>Subscribers</small><b>${c.subs == null ? 'Not public' : number(c.subs)}</b></div><div class="lead-stat"><small>Country</small><b>${escHtml(country)}</b></div><div class="lead-stat"><small>Public videos</small><b>${number(c.videos)}</b></div></div>
      ${topicLabels.length ? `<div class="lead-topic-tags"><small>YouTube topic tags</small>${topicLabels.map(label => `<span>${escHtml(label)}</span>`).join('')}</div>` : ''}
      <div class="lead-reasons"><strong>Why it showed up</strong>${reasons.map(reason => `<span>• ${escHtml(reason)}</span>`).join('')}</div>
      <div class="lead-card-actions"><small>${escHtml(c.fresh || 'Fetched just now')} · Public YouTube data</small><div>${c.channelId ? `<button class="soft-btn" type="button" data-action="saveCreator" data-channel-id="${escHtml(c.channelId)}">Save creator</button><button class="soft-btn" type="button" data-inspect-channel="${escHtml(c.channelId)}">Review recent uploads</button>` : ''}<a class="soft-btn" href="${escHtml(openUrl)}" target="_blank" rel="noopener noreferrer">Check public contact links ↗</a></div></div>
      <p class="lead-reach-note">Contact details are not collected by LeadSense. Check the links the creator shares on YouTube.</p></article>`;
  };

  window.renderChannelGrid = function renderLeadResults(append = false) {
    const grid = $('#creatorGrid');
    if (!grid) return;
    const exact = channels.filter(channel => !channel.isRelated);
    const related = channels.filter(channel => channel.isRelated);
    grid.innerHTML = exact.map(window.channelCard).join('');
    const relatedGrid = $('#relatedCreatorGrid');
    const relatedRoot = $('#relatedResultsRoot');
    if (relatedGrid) relatedGrid.innerHTML = related.map(window.channelCard).join('');
    if (relatedRoot) relatedRoot.hidden = related.length === 0;
    const more = $('#loadMoreRoot');
    if (more) more.innerHTML = liveDiscovery && nextPageToken ? '<div style="text-align:center;margin:18px"><button class="soft-btn" type="button" data-action="loadMore">Load more channels</button></div>' : '';
  };

  const creatorStageOptions = ['Researching','Contact ready','Contacted','Follow-up','Closed'];
  const creatorEvidenceLabels = { explicit_opportunity: 'Explicit public request · manually checked', potential_opportunity: 'Potential opportunity · manually checked', context_only: 'Context only', insufficient_evidence: 'No verified need evidence' };
  function creatorWorkspaceCard(lead) {
    const evidence = (lead.evidence || []).map(item => `<div class="creator-workspace-item"><b>${escHtml(item.service_category)} · ${escHtml(item.strength)} evidence</b><p>${escHtml(item.excerpt)}</p><a href="${escHtml(item.source_url)}" target="_blank" rel="noopener noreferrer">Open source ↗</a><div class="toolbar"><small>${escHtml(item.verification_status)} · entered by you</small>${item.verification_status !== 'manually_verified' && item.verification_status !== 'no_longer_available' ? `<button class="soft-btn" type="button" data-action="verifyCreatorEvidence" data-id="${escHtml(item.id)}">I checked this source</button>` : ''}<button class="soft-btn" type="button" data-action="deleteCreatorEvidence" data-id="${escHtml(item.id)}">Remove</button></div></div>`).join('');
    const contacts = (lead.contacts || []).map(item => `<div class="creator-workspace-item"><b>${escHtml(item.contact_type.replaceAll('_',' '))}</b><p>${escHtml(item.contact_value)}</p><a href="${escHtml(item.source_url)}" target="_blank" rel="noopener noreferrer">Where it was published ↗</a><div class="toolbar"><small>${escHtml(item.verification_status)} · manually added</small>${item.verification_status !== 'link_checked' && item.verification_status !== 'manually_verified' ? `<button class="soft-btn" type="button" data-action="verifyCreatorContact" data-id="${escHtml(item.id)}">I checked this link</button>` : ''}<button class="soft-btn" type="button" data-action="deleteCreatorContact" data-id="${escHtml(item.id)}">Remove</button></div></div>`).join('');
    const expiry = lead.expires_at ? new Date(lead.expires_at).toLocaleDateString() : 'within 29 days';
    return `<article class="creator-workspace-card" data-creator-lead="${escHtml(lead.id)}"><div class="creator-workspace-title"><div><h3>${escHtml(lead.creator_name)}</h3><a href="${escHtml(lead.channel_url)}" target="_blank" rel="noopener noreferrer">Open YouTube channel ↗</a></div><span class="creator-classification">${escHtml(creatorEvidenceLabels[lead.opportunity?.classification] || 'No verified need evidence')}</span></div><p>${escHtml(lead.service_category)} · ${escHtml(lead.stage)}<br>${escHtml(lead.notes || 'No private notes yet.')}</p><small class="creator-expiry">YouTube-linked record expires ${escHtml(expiry)}.</small><div class="toolbar"><button class="soft-btn" type="button" data-action="editCreatorLead" data-id="${escHtml(lead.id)}">Edit lead</button><button class="soft-btn" type="button" data-action="addCreatorEvidence" data-id="${escHtml(lead.id)}">＋ Add evidence</button><button class="soft-btn" type="button" data-action="addCreatorContact" data-id="${escHtml(lead.id)}">＋ Add contact</button><button class="soft-btn" type="button" data-action="deleteCreatorLead" data-id="${escHtml(lead.id)}">Remove lead</button></div><details><summary>Evidence (${evidence ? lead.evidence.length : 0})</summary>${evidence || '<p>No evidence added. No verified service-need evidence found.</p>'}</details><details><summary>Contact routes (${contacts ? lead.contacts.length : 0})</summary>${contacts || '<p>No public contact route has been added.</p>'}</details></article>`;
  }

  window.refreshCreatorWorkspace = async function refreshCreatorWorkspace() {
    const grid = $('#creatorWorkspaceGrid');
    const status = $('#creatorWorkspaceStatus');
    if (!grid || currentView !== 'discover') return;
    if (backendState !== 'connected') { grid.innerHTML = '<div class="creator-workspace-empty">Connect the database and sign in to save creator leads privately.</div>'; return; }
    try {
      const leads = await apiRequest('/api/creator-leads');
      window.creatorWorkspaceRows = leads;
      grid.innerHTML = leads.length ? leads.map(creatorWorkspaceCard).join('') : '<div class="creator-workspace-empty">No saved creator leads yet. Save a live channel, then add only evidence and contact details you checked yourself.</div>';
      if (status) status.textContent = `${leads.length} saved creator lead${leads.length === 1 ? '' : 's'} · private to your account`;
    } catch (error) { grid.innerHTML = `<div class="creator-workspace-empty">Could not load saved creator leads: ${escHtml(error.message)}</div>`; }
  };

  async function saveCreatorLead(channelId) {
    const channel = channels.find(item => item.channelId === channelId);
    if (!channel || !liveDiscovery || backendState !== 'connected') { toast('Run a live search and connect your account database before saving this creator.'); return; }
    try {
      const result = await apiRequest('/api/creator-leads', { method: 'POST', body: JSON.stringify({ channel_id: channel.channelId, creator_name: channel.name, channel_url: channel.channelUrl, service_category: 'Other' }) });
      toast(result.id ? 'Creator saved to your private workspace. It expires within 29 days.' : 'Creator saved.');
      await window.refreshCreatorWorkspace();
    } catch (error) { toast(error.message); }
  }

  function openCreatorLeadEditor(id) {
    const card = document.querySelector(`[data-creator-lead="${CSS.escape(id)}"]`);
    const lead = window.creatorWorkspaceRows?.find(item => item.id === id);
    if (!lead || !card) return;
    modal('Edit saved creator','Update your private service category, follow-up stage, and notes.',`<div class="field"><label>Service category</label><input name="service" required value="${escHtml(lead.service_category)}"></div><div class="field"><label>Stage</label><select name="stage">${creatorStageOptions.map(stage => `<option ${stage === lead.stage ? 'selected' : ''}>${stage}</option>`).join('')}</select></div><div class="field full"><label>Your notes</label><textarea name="notes">${escHtml(lead.notes || '')}</textarea></div>`,`Save changes`,async data=>{try{await apiRequest(`/api/creator-leads/${lead.id}`,{method:'PATCH',body:JSON.stringify({service_category:data.service,stage:data.stage,notes:data.notes})});await window.refreshCreatorWorkspace();toast('Saved creator updated')}catch(error){toast(error.message)}});
  }

  function openCreatorEvidenceForm(id) {
    modal('Add source-backed evidence','Paste a public source you checked and a short excerpt. New notes start unverified.',`<div class="field"><label>Service</label><input name="service_category" required placeholder="Video editing"></div><div class="field"><label>Evidence type</label><select name="evidence_type"><option value="public_request">Public service request</option><option value="creator_statement">Creator statement</option><option value="hiring_post">Hiring post</option><option value="service_request">Related service request</option><option value="context_note">Context only</option></select></div><div class="field"><label>Strength</label><select name="strength"><option value="strong">Strong · explicit request</option><option value="moderate">Moderate · relevant statement</option><option value="weak">Weak · context only</option></select></div><div class="field"><label>Published date (if known)</label><input type="date" name="published_at"></div><div class="field full"><label>Original public source URL</label><input type="url" name="source_url" required placeholder="https://"></div><div class="field full"><label>Short excerpt or faithful summary</label><textarea name="excerpt" required maxlength="1500"></textarea></div>`,`Save evidence`,async data=>{try{await apiRequest(`/api/creator-leads/${id}/evidence`,{method:'POST',body:JSON.stringify(data)});await window.refreshCreatorWorkspace();toast('Evidence saved as unverified.')}catch(error){toast(error.message)}});
  }

  function openCreatorContactForm(id) {
    modal('Add a public contact route','Add a contact method only when you found it on a public creator source. Never guess an email.',`<div class="field"><label>Contact type</label><select name="contact_type"><option value="business_email">Public business email</option><option value="website">Creator website</option><option value="contact_form">Contact form</option><option value="professional_profile">Professional profile</option></select></div><div class="field full"><label>Contact value or URL</label><input name="contact_value" required placeholder="name@example.com or https://"></div><div class="field full"><label>Where the creator published it</label><input name="source_url" type="url" required placeholder="https://"></div><div class="field full"><label>Notes</label><textarea name="notes" maxlength="1000"></textarea></div>`,`Save contact`,async data=>{try{await apiRequest(`/api/creator-leads/${id}/contacts`,{method:'POST',body:JSON.stringify(data)});await window.refreshCreatorWorkspace();toast('Contact saved as unverified.')}catch(error){toast(error.message)}});
  }

  window.runDiscovery = async function runLeadSearch(pageToken = null, append = false) {
    const progress = $('#searchProgress');
    const button = $('#searchBtn');
    const query = ($('#creatorQuery')?.value || '').trim();
    const minValue = $('#minSubscriberFilter')?.value.trim() || '';
    const maxValue = $('#maxSubscriberFilter')?.value.trim() || '';
    if (!query) { toast('Add a topic or phrase to search for.'); $('#creatorQuery')?.focus(); return; }
    const min = minValue === '' ? null : Number(minValue);
    const max = maxValue === '' ? null : Number(maxValue);
    if ((min != null && (!Number.isSafeInteger(min) || min < 0)) || (max != null && (!Number.isSafeInteger(max) || max < 0))) { toast('Enter a whole number for subscribers.'); return; }
    if (min != null && max != null && min > max) { toast('Minimum subscribers must be lower than the maximum.'); return; }

    const countryCode = $('#countryFilter')?.value || 'all';
    const regionCode = $('#regionFilter')?.value || 'US';
    const payload = { query: query.slice(0, 120), pageSize: 50, requestedCount: Number($('#requestedCountFilter')?.value) || 20, regionCode, includeUnknown: $('#includeUnknown')?.checked === true, includeUnknownSubscribers: $('#includeUnknownSubscribersFilter')?.checked === true };
    if (min != null) payload.minSubscribers = min;
    if (max != null) payload.maxSubscribers = max;
    if (countryCode === 'unknown') payload.unknownCountryOnly = true;
    else if (countryCode !== 'all') payload.declaredCountries = [countryCode];
    if (pageToken) {
      const exactAlreadyFound = channels.filter(channel => !channel.isRelated).length;
      Object.assign(payload, lastSearchPayload, { pageToken, excludeChannelIds: inspectedChannelIds, requestedCount: Math.max(1, (lastSearchPayload?.requestedCount || payload.requestedCount) - exactAlreadyFound) });
    } else { lastSearchPayload = { ...payload }; inspectedChannelIds = []; }

    if (activeSearch) activeSearch.abort();
    activeSearch = new AbortController();
    button.disabled = true; button.textContent = 'Searching…';
    progress.innerHTML = `<div class="search-running"><span><i class="pulse-dot"></i> Searching YouTube for “${escHtml(query)}” …</span><span>Checking a page of up to 50 channels</span></div><div class="lead-loading"><i></i></div>`;
    try {
      const data = await apiRequest('/api/youtube/search', { method: 'POST', body: JSON.stringify(payload), signal: activeSearch.signal });
      liveDiscovery = true;
      nextPageToken = data.nextPageToken || null;
      inspectedChannelIds = [...new Set([...inspectedChannelIds, ...(data.inspectedChannelIds || [])])].slice(-250);
      searchUsage = data.usage || null;
      const mapChannel = (channel, isRelated = false) => ({
        channelId: channel.channelId, name: channel.name, desc: channel.description, customUrl: channel.customUrl,
        channelUrl: channel.channelUrl, countryCode: channel.countryCode, thumbnail: channel.thumbnail,
        subs: channel.subscribers == null ? null : Number(channel.subscribers), views: channel.totalViews, videos: channel.videoCount,
        topicCategories: channel.topicCategories || [],
        fresh: 'Fetched just now', isRelated, relatedReasons: channel.relatedReasons || [], initials: channel.name.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase(),
      });
      const exact = (data.items || []).map(channel => mapChannel(channel));
      const related = (data.relatedItems || []).map(channel => mapChannel(channel, true));
      const mapped = [...exact, ...related];
      const combined = append ? [...channels, ...mapped] : mapped;
      const seen = new Set();
      const exactIds = new Set([...channels.filter(channel => !channel.isRelated), ...exact].map(channel => channel.channelId));
      channels.splice(0, channels.length, ...combined.filter(channel => { if (seen.has(channel.channelId)) return false; seen.add(channel.channelId); return true; }).map(channel => exactIds.has(channel.channelId) ? { ...channel, isRelated: false } : channel));
      renderChannelGrid(false);
      const resultCount = $('#resultCount');
      const exactTotal = channels.filter(channel => !channel.isRelated).length;
      const relatedTotal = channels.length - exactTotal;
      if (resultCount) resultCount.textContent = `${exactTotal} exact · ${relatedTotal} related`;
      const subtitle = $('#resultsSub');
      if (subtitle) subtitle.textContent = `Exact filter matches appear first. Related channels match the topic but miss a selected filter.`;
      const diagnostics = `${data.inspectedCount ?? data.candidateCount ?? 0} inspected · ${data.excludedCount ?? 0} excluded · ${data.searchPages ?? 0} API page${data.searchPages === 1 ? '' : 's'}`;
      const searchStatus = `${data.searchWarning || `Found ${exactTotal} exact match${exactTotal === 1 ? '' : 'es'}${relatedTotal ? ` and ${relatedTotal} related channel${relatedTotal === 1 ? '' : 's'}` : ''}.`} ${diagnostics}${data.complete === false ? ' · Partial search' : ' · Search complete'}`;
      progress.innerHTML = `<div class="search-done">${escHtml(searchStatus)}${relatedTotal ? ' Related topic channels are also shown below.' : ''}${searchUsage ? ` YouTube search calls used today: ${searchUsage.calls}/${searchUsage.limit}.` : ''}${data.userApiUsage ? ` Your YouTube API requests today: ${data.userApiUsage.calls}/${data.userApiUsage.limit}.` : ''}</div>`;
      const empty = $('#noResults');
      if (empty) {
        empty.hidden = channels.length > 0;
        if (!channels.length) empty.innerHTML = `<b>YouTube did not return channels for this search.</b><p>${escHtml(data.searchWarning || 'Try a shorter topic or another search region.')}</p>`;
        else empty.innerHTML = '';
      }
      const more = $('#loadMoreRoot');
      if (more) more.innerHTML = nextPageToken ? `<div style="text-align:center;margin:18px"><button class="soft-btn" type="button" data-action="loadMore">Load more channels</button></div>` : '';
      if (searchUsage) window.updateServiceStatus?.();
    } catch (error) {
      if (error.name === 'AbortError') return;
      liveDiscovery = true; channels.splice(0, channels.length); renderChannelGrid(false);
      const empty = $('#noResults'); if (empty) { empty.hidden = false; empty.innerHTML = `<b>Search could not finish.</b><p>${escHtml(error.message || 'Please try again.')}</p>`; }
      const resultCount = $('#resultCount'); if (resultCount) resultCount.textContent = '0 channels';
      progress.innerHTML = '';
      toast(error.message || 'Search could not finish.');
    } finally {
      button.disabled = false; button.innerHTML = 'Find channels <span aria-hidden="true">↗</span>';
      activeSearch = null;
    }
  };

  window.bindViewEvents = (function (bindOriginal) {
    return function bindProductEvents() {
      bindOriginal();
      const form = $('#leadSearchForm');
      if (form) form.onsubmit = event => { event.preventDefault(); window.runDiscovery(); };
      const oldSearchButton = $('#searchBtn');
      if (oldSearchButton) oldSearchButton.onclick = null;
      const queryInput = $('#creatorQuery');
      if (queryInput) queryInput.oninput = null;
      document.querySelectorAll('[data-query]').forEach(tag => { tag.onclick = () => { $('#creatorQuery').value = tag.dataset.query; document.querySelectorAll('[data-query]').forEach(other => other.classList.toggle('selected', other === tag)); $('#creatorQuery').focus(); }; });
      // Creator-declared country and YouTube's relevance region are separate controls.
    };
  })(window.bindViewEvents);

  const renderOriginal = window.render;
  let firstProductRender = true;
  window.render = function renderWithSearchPreserved(...args) {
    const shouldRestore = !firstProductRender && currentView === 'discover';
    const values = shouldRestore ? Object.fromEntries(['creatorQuery', 'countryFilter', 'minSubscriberFilter', 'maxSubscriberFilter', 'regionFilter', 'requestedCountFilter'].map(id => [id, document.getElementById(id)?.value])) : {};
    const checks = shouldRestore ? Object.fromEntries(['includeUnknown', 'includeUnknownSubscribersFilter'].map(id => [id, document.getElementById(id)?.checked])) : {};
    const result = renderOriginal.apply(this, args);
    firstProductRender = false;
    if (currentView === 'discover' && shouldRestore) {
      for (const [id, value] of Object.entries(values)) { const element = document.getElementById(id); if (element && value != null && [...element.options || []].some(option => option.value === value) || (element && !element.options)) element.value = value; }
      for (const [id, checked] of Object.entries(checks)) { const element = document.getElementById(id); if (element && checked != null) element.checked = checked; }
      window.bindViewEvents();
    }
    if (currentView === 'discover') setTimeout(() => window.refreshCreatorWorkspace?.(), 0);
    return result;
  };

  document.addEventListener('click', event => {
    const actionButton = event.target.closest('[data-action]');
    const action = actionButton?.dataset.action;
    if (action === 'saveCreator') { event.preventDefault(); saveCreatorLead(actionButton.dataset.channelId); return; }
    if (action === 'refreshCreatorWorkspace') { window.refreshCreatorWorkspace(); return; }
    if (action === 'addCreatorEvidence') { openCreatorEvidenceForm(actionButton.dataset.id); return; }
    if (action === 'addCreatorContact') { openCreatorContactForm(actionButton.dataset.id); return; }
    if (action === 'editCreatorLead') { openCreatorLeadEditor(actionButton.dataset.id); return; }
    if (action === 'deleteCreatorLead') { const id = actionButton.dataset.id; if (confirm('Remove this saved creator and its evidence and contacts?')) apiRequest(`/api/creator-leads/${id}`,{method:'DELETE'}).then(()=>window.refreshCreatorWorkspace()).then(()=>toast('Saved creator removed')).catch(error=>toast(error.message)); return; }
    if (action === 'verifyCreatorEvidence') { apiRequest(`/api/creator-evidence/${actionButton.dataset.id}`,{method:'PATCH',body:JSON.stringify({verification_status:'manually_verified'})}).then(()=>window.refreshCreatorWorkspace()).then(()=>toast('Marked as manually checked')).catch(error=>toast(error.message)); return; }
    if (action === 'verifyCreatorContact') { apiRequest(`/api/creator-contacts/${actionButton.dataset.id}`,{method:'PATCH',body:JSON.stringify({verification_status:'link_checked'})}).then(()=>window.refreshCreatorWorkspace()).then(()=>toast('Marked as link checked')).catch(error=>toast(error.message)); return; }
    if (action === 'deleteCreatorEvidence') { apiRequest(`/api/creator-evidence/${actionButton.dataset.id}`,{method:'DELETE'}).then(()=>window.refreshCreatorWorkspace()).catch(error=>toast(error.message)); return; }
    if (action === 'deleteCreatorContact') { apiRequest(`/api/creator-contacts/${actionButton.dataset.id}`,{method:'DELETE'}).then(()=>window.refreshCreatorWorkspace()).catch(error=>toast(error.message)); return; }
    const loadMore = event.target.closest('[data-action="loadMore"]');
    if (loadMore && nextPageToken) window.runDiscovery(nextPageToken, true);
  });

  window.render();
})();
