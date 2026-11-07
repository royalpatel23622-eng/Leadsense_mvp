const countryCodes = new Map([
  ['us', 'US'], ['usa', 'US'], ['united states', 'US'], ['america', 'US'],
  ['uk', 'GB'], ['united kingdom', 'GB'], ['britain', 'GB'],
  ['canada', 'CA'], ['australia', 'AU'], ['new zealand', 'NZ'], ['ireland', 'IE'],
  ['germany', 'DE'], ['france', 'FR'], ['spain', 'ES'], ['netherlands', 'NL'],
  ['sweden', 'SE'], ['norway', 'NO'], ['denmark', 'DK'], ['singapore', 'SG'],
  ['india', 'IN'], ['japan', 'JP'], ['brazil', 'BR'], ['mexico', 'MX'],
]);
const services = ['Video editing', 'Thumbnail design', 'YouTube SEO', 'Channel management', 'Short-form editing', 'Content strategy', 'Branding'];

function html(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function mount() {
  const box = document.querySelector('.discovery-box');
  if (!box || box.querySelector('#searchPreviewTools')) return;
  const suggestions = box.querySelector('.search-suggestions');
  if (!suggestions) return;
  const heading = box.querySelector('.discovery-box-head strong');
  if (heading) heading.textContent = 'Search words';
  const form = box.querySelector('.discover-form');
  if (form) form.insertAdjacentHTML('beforebegin', '<label class="natural-search-label">Describe your ideal customer<textarea id="searchDescription" maxlength="1000" placeholder="Example: I edit videos. Find gaming creators in the US and UK with 5,000–100,000 subscribers." rows="2"></textarea></label>');
  suggestions.insertAdjacentHTML('afterend', `
    <section id="searchPreviewTools" class="search-preview-tools" aria-label="Review your search filters">
      <div class="search-preview-heading"><div><strong>Make your search more specific</strong><p>Describe your ideal customer, then review the draft filters before searching.</p></div><button id="interpretSearch" class="soft-btn" type="button">Review my search</button></div>
      <div id="interpretedFilters" class="interpreted-filters" hidden>
        <div class="draft-note"><b>Draft filters</b><span>This is a simple text helper, not an AI result. Check and change each field before you search.</span></div>
        <div class="draft-grid">
          <label>Your service (context only)<select id="serviceFilter"><option value="">Choose a service</option>${services.map(service => `<option>${service}</option>`).join('')}</select></label>
          <label>Search words<input id="searchTermsFilter" maxlength="120" placeholder="e.g. gaming"></label>
          <label>Minimum subscribers<input id="minSubscriberFilter" type="number" min="0" step="1" placeholder="No minimum"></label>
          <label>Maximum subscribers<input id="maxSubscriberFilter" type="number" min="0" step="1" placeholder="No maximum"></label>
          <label>Creators’ declared countries<input id="declaredCountriesFilter" maxlength="120" placeholder="United States, Canada"></label>
          <label>Channels to show<input id="requestedCountFilter" type="number" min="1" max="50" value="20"></label>
          <label class="unknown-subscriber-option"><input id="includeUnknownSubscribersFilter" type="checkbox" checked> Include channels with hidden subscriber counts</label>
        </div>
        <p class="draft-help">The search region is set below. A creator’s country is shown only when they declared it. Public YouTube metrics are displayed as provided; this app does not calculate opportunity scores from them.</p>
        <div id="unsupportedSearchNeeds" class="draft-help" hidden></div>
      </div>
    </section>`);
  const style = document.createElement('style');
  style.textContent = `
    .natural-search-label{display:grid;gap:7px;margin:0 0 10px;font-size:12px;font-weight:650}.natural-search-label textarea{resize:vertical;min-height:54px;border:1px solid #e8e6e1;background:white;border-radius:12px;padding:11px 13px;font:inherit;font-size:12px;line-height:1.5;color:#292930}
    .search-preview-tools{margin-top:18px;padding:16px 17px;border:1px solid #e8e6e1;border-radius:17px;background:linear-gradient(135deg,#fbfbff,#fff 60%,#f3fbf7)}
    .search-preview-heading{display:flex;justify-content:space-between;align-items:center;gap:14px}.search-preview-heading strong{font-size:13px}.search-preview-heading p,.draft-help{font-size:11px;line-height:1.55;color:#77777f;margin:5px 0 0}
    .interpreted-filters{border-top:1px solid #eceaf0;margin-top:13px;padding-top:12px}.draft-note{display:flex;gap:9px;align-items:baseline;font-size:11px;margin-bottom:10px}.draft-note b{color:#416cf6;white-space:nowrap}.draft-note span{color:#77777f}
    .draft-grid{display:grid;grid-template-columns:repeat(3,minmax(130px,1fr));gap:10px}.draft-grid label{display:grid;gap:5px;font-size:10px;font-weight:650;color:#60606a}.draft-grid input,.draft-grid select{width:100%;min-width:0;border:1px solid #e8e6e1;background:#fff;border-radius:10px;padding:9px 10px;color:#292930;font-size:11px}.draft-help{margin-top:9px}
    @media(max-width:760px){.draft-grid{grid-template-columns:repeat(2,minmax(120px,1fr))}.search-preview-heading{align-items:flex-start;flex-direction:column}.search-preview-heading .soft-btn{width:100%}}
  `;
  document.head.append(style);
  const output = box.querySelector('#interpretedFilters');
  const statusButton = box.querySelector('#interpretSearch');
  statusButton.addEventListener('click', async () => {
    const query = (box.querySelector('#searchDescription')?.value || box.querySelector('#creatorQuery')?.value || '').trim();
    if (!query) { window.toast?.('Write a short description first.'); box.querySelector('#creatorQuery')?.focus(); return; }
    statusButton.disabled = true;
    statusButton.textContent = 'Reading your description…';
    try {
      const response = await fetch('/api/search/interpret', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error?.message || 'Could not read that description. Try a shorter phrase.');
      const filters = data.filters;
      output.hidden = false;
      box.querySelector('#serviceFilter').value = filters.service || '';
      box.querySelector('#searchTermsFilter').value = filters.searchTerms || '';
      box.querySelector('#creatorQuery').value = filters.searchTerms || '';
      box.querySelector('#minSubscriberFilter').value = filters.minSubscribers ?? '';
      box.querySelector('#maxSubscriberFilter').value = filters.maxSubscribers ?? '';
      box.querySelector('#declaredCountriesFilter').value = filters.declaredCountries.map(code => ({ US: 'United States', GB: 'United Kingdom', CA: 'Canada', AU: 'Australia', NZ: 'New Zealand', IE: 'Ireland', DE: 'Germany', FR: 'France', ES: 'Spain', NL: 'Netherlands', SE: 'Sweden', NO: 'Norway', DK: 'Denmark', SG: 'Singapore', IN: 'India', JP: 'Japan', BR: 'Brazil', MX: 'Mexico' })[code] || code).join(', ');
      box.querySelector('#requestedCountFilter').value = filters.requestedCount || 20;
      const unsupported = box.querySelector('#unsupportedSearchNeeds');
      const requestedAnalysis = /declin(?:e|ing)|weak engagement|average views|upload frequency|inconsistent uploads|growth|stagnat/i.test(query);
      unsupported.hidden = !requestedAnalysis;
      unsupported.textContent = requestedAnalysis ? 'Performance trends, engagement ratings, and opportunity scores are not calculated from YouTube API data. The results will show the public channel details so you can review them yourself.' : '';
      statusButton.textContent = 'Filters ready';
    } catch (error) {
      window.toast?.(error.message);
      statusButton.textContent = 'Try again';
    } finally { statusButton.disabled = false; }
  });

  const nativeFetch = window.fetch.bind(window);
  if (!window.__leadsenseSearchFiltersInstalled) {
    window.__leadsenseSearchFiltersInstalled = true;
    window.fetch = (input, init = {}) => {
      const url = typeof input === 'string' ? input : input?.url;
      const isSearch = url?.endsWith('/api/youtube/search');
      const isPresetSave = url?.endsWith('/api/search-presets') && init.method === 'POST';
      if ((isSearch || isPresetSave) && typeof init.body === 'string') {
        try {
          const body = JSON.parse(init.body);
          const terms = document.querySelector('#searchTermsFilter')?.value.trim();
          const service = document.querySelector('#serviceFilter')?.value;
          const min = document.querySelector('#minSubscriberFilter')?.value;
          const max = document.querySelector('#maxSubscriberFilter')?.value;
          const countries = document.querySelector('#declaredCountriesFilter')?.value.split(',').map(name => countryCodes.get(name.trim().toLowerCase()) || (/^[A-Z]{2}$/.test(name.trim()) ? name.trim() : null)).filter(Boolean) || [];
          const countryFilter = document.querySelector('#countryFilter')?.value;
          const includeUnknownCountry = document.querySelector('#includeUnknown')?.checked !== false;
          const count = Number(document.querySelector('#requestedCountFilter')?.value);
          const includeUnknownSubscribers = document.querySelector('#includeUnknownSubscribersFilter')?.checked !== false;
          if (isSearch) {
            if (terms) body.query = terms.slice(0, 120);
            if (service) body.service = service;
            if (min) body.minSubscribers = Number(min);
            if (max) body.maxSubscribers = Number(max);
            body.includeUnknownSubscribers = includeUnknownSubscribers;
            if (countryFilter === 'unknown') { body.unknownCountryOnly = true; body.declaredCountries = []; body.includeUnknown = false; }
            else {
              const selectedCountry = countryCodes.get(String(countryFilter || '').trim().toLowerCase()) || (/^[A-Z]{2}$/.test(String(countryFilter || '')) ? countryFilter : null);
              const allCountries = [...new Set([...countries, ...(selectedCountry ? [selectedCountry] : [])])];
              if (allCountries.length) body.declaredCountries = allCountries;
              body.includeUnknown = includeUnknownCountry;
            }
            if (Number.isInteger(count) && count >= 1 && count <= 50) body.maxResults = count;
          } else {
            body.filters = { service: service || null, searchTerms: terms || null, minSubscribers: min ? Number(min) : null, maxSubscribers: max ? Number(max) : null, declaredCountries: [...new Set(countries)], requestedCount: Number.isInteger(count) && count >= 1 && count <= 50 ? count : 20, includeUnknownSubscribers };
          }
          init = { ...init, body: JSON.stringify(body) };
        } catch { /* Leave the original request intact; the server returns the validation message. */ }
      }
      return nativeFetch(input, init);
    };
  }

  document.addEventListener('click', event => {
    const button = event.target.closest('[data-run-preset][data-filter-config]');
    if (!button) return;
    let filters;
    try { filters = JSON.parse(button.dataset.filterConfig); } catch { return; }
    setTimeout(() => {
      const set = (selector, value) => { const field = document.querySelector(selector); if (field) field.value = value ?? ''; };
      set('#serviceFilter', filters.service);
      set('#searchTermsFilter', filters.searchTerms);
      set('#minSubscriberFilter', filters.minSubscribers);
      set('#maxSubscriberFilter', filters.maxSubscribers);
      set('#requestedCountFilter', filters.requestedCount || 20);
      const unknownSubscribers = document.querySelector('#includeUnknownSubscribersFilter');
      if (unknownSubscribers) unknownSubscribers.checked = filters.includeUnknownSubscribers !== false;
      const names = { US: 'United States', GB: 'United Kingdom', CA: 'Canada', AU: 'Australia', NZ: 'New Zealand', IE: 'Ireland', DE: 'Germany', FR: 'France', ES: 'Spain', NL: 'Netherlands', SE: 'Sweden', NO: 'Norway', DK: 'Denmark', SG: 'Singapore', IN: 'India', JP: 'Japan', BR: 'Brazil', MX: 'Mexico' };
      set('#declaredCountriesFilter', (filters.declaredCountries || []).map(code => names[code] || code).join(', '));
    }, 15);
  }, true);
}

const content = document.querySelector('#content');
const searchProgress = document.querySelector('#searchProgress');
if (searchProgress) new MutationObserver(() => {
  const error = searchProgress.querySelector('.search-error');
  const liveDone = searchProgress.querySelector('.search-done') && liveDiscovery === true;
  if (error) {
    channels.splice(0, channels.length);
    window.renderChannelGrid?.(false);
    const banner = document.querySelector('#demoBanner');
    if (banner) banner.hidden = true;
    const subtitle = document.querySelector('#resultsSub');
    if (subtitle) subtitle.textContent = 'The live search did not return results. Fix the message above and try again.';
  } else if (liveDone) {
    const banner = document.querySelector('#demoBanner');
    if (banner) banner.hidden = true;
    const subtitle = document.querySelector('#resultsSub');
    if (subtitle) subtitle.textContent = channels.length ? 'Live public channels returned by YouTube for this search.' : 'No public channels matched this page of results. Try broader search words or load another page.';
  }
}).observe(searchProgress, { childList: true, subtree: true });
if (content) {
  new MutationObserver(mount).observe(content, { childList: true, subtree: true });
  mount();
}
