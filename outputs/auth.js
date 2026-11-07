(() => {
  const styles = document.createElement('style');
  styles.textContent = `
    #authGate{position:fixed;inset:0;z-index:10000;background:#f4f3ef;display:grid;place-items:center;padding:24px;color:#1b1b20;overflow:auto}
    .auth-layout{width:min(100%,980px);min-height:570px;display:grid;grid-template-columns:1.02fr .98fr;background:#fff;border:1px solid #e8e6e1;border-radius:28px;overflow:hidden;box-shadow:0 28px 90px #19182018;animation:auth-arrive .65s cubic-bezier(.2,.7,.2,1) both}
    @keyframes auth-arrive{from{opacity:0;transform:translateY(14px) scale(.99)}to{opacity:1;transform:translateY(0) scale(1)}}
    .auth-story{position:relative;isolation:isolate;overflow:hidden;padding:34px 38px;background:linear-gradient(145deg,#fdfcf9 0%,#f2f0ff 60%,#eaf8f0 100%);display:flex;flex-direction:column;justify-content:space-between}
    .auth-story:before{content:"";position:absolute;inset:0;z-index:-1;background:radial-gradient(ellipse at 15% 8%,#ffc8a88a,transparent 35%),radial-gradient(ellipse at 95% 94%,#8ee0ad77,transparent 38%)}
    .auth-brand{display:flex;align-items:center;gap:10px;font-size:22px;font-weight:800;letter-spacing:-.065em;position:relative;z-index:2}
    .auth-brandmark{position:relative;width:32px;height:28px;display:inline-block}.auth-brandmark:before,.auth-brandmark:after{content:"";position:absolute;top:2px;width:23px;height:23px;border-radius:50%}.auth-brandmark:before{left:0;background:#416cf6}.auth-brandmark:after{left:10px;background:#47bb86;mix-blend-mode:multiply}.auth-brandmark i{position:absolute;z-index:1;left:13px;top:7px;width:6px;height:14px;border-left:2px solid white;transform:rotate(45deg)}
    .auth-story-copy{position:relative;z-index:2;max-width:410px;margin:42px 0}.auth-story-copy small{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#64636b;font-weight:750}.auth-story-copy h2{font-size:clamp(36px,4.5vw,54px);line-height:.98;letter-spacing:-.075em;margin:14px 0}.auth-story-copy h2 span{position:relative;z-index:0}.auth-story-copy h2 span:after{content:"";height:10px;position:absolute;left:0;right:0;bottom:1px;background:#98e5b7;border-radius:9px;z-index:-1;transform:rotate(-1deg)}.auth-story-copy p{font-size:13px;color:#74737b;line-height:1.65;max-width:340px;margin:0}
    .auth-art{position:absolute;right:15px;bottom:34px;width:215px;height:220px;pointer-events:none}.auth-art-ring{position:absolute;right:6px;top:6px;width:182px;height:182px;border:1px solid #2a29342c;border-radius:50%;animation:auth-spin 28s linear infinite}.auth-art-ring:before,.auth-art-ring:after{content:"";position:absolute;inset:17px;border:1px solid #2a29342a;border-radius:50%}.auth-art-ring:after{inset:38px}.auth-art-core{position:absolute;right:64px;top:70px;width:66px;height:66px;border-radius:50%;background:#416cf6;color:white;display:grid;place-items:center;font-size:27px;box-shadow:0 10px 27px #416cf64a;animation:auth-float 4s ease-in-out infinite}.auth-art-core:after{content:"↗"}.auth-art-dot{position:absolute;width:34px;height:34px;border-radius:50%;background:#ff7b43;left:0;top:30px;animation:auth-float 4.7s .3s ease-in-out infinite}.auth-art-square{position:absolute;width:28px;height:28px;border-radius:6px;background:#ffc548;right:3px;bottom:8px;transform:rotate(45deg);animation:auth-diamond 9s linear infinite}
    @keyframes auth-spin{to{transform:rotate(360deg)}}@keyframes auth-float{0%,100%{translate:0 0}50%{translate:0 -9px}}@keyframes auth-diamond{to{transform:rotate(405deg)}}
    .auth-form-side{padding:42px;display:grid;place-items:center}.auth-card{width:min(100%,390px)}.auth-card h1{font-size:30px;letter-spacing:-.06em;margin:0 0 8px}.auth-card>p{font-size:13px;line-height:1.6;color:#77777f;margin:0 0 23px}.auth-card label{display:grid;gap:7px;margin:14px 0;font-size:12px;font-weight:650}.auth-card input{width:100%;min-height:45px;border:1px solid #e8e6e1;border-radius:11px;padding:12px;font:inherit;font-size:13px}.auth-card input:focus{border-color:#9eaeff;outline:3px solid #416cf620}.auth-actions{display:grid;gap:10px;margin-top:19px}.auth-actions button{width:100%;min-height:46px;justify-content:center;font-size:12px}.auth-switch{margin-top:19px;text-align:center;font-size:12px;color:#6d6c74}.auth-switch button{border:0;background:none;color:#416cf6;font-weight:700;cursor:pointer;padding:5px}.auth-footnote{font-size:10px!important;margin:20px 0 0!important;color:#939199!important;line-height:1.55!important}.auth-message{font-size:12px;line-height:1.5;color:#a8482b;background:#fff1eb;padding:10px 12px;border-radius:10px;margin-top:13px}.auth-message.success{color:#267852;background:#eaf8f0}
    @media(max-width:700px){#authGate{padding:12px;place-items:start center}.auth-layout{grid-template-columns:1fr;min-height:0;border-radius:22px}.auth-story{min-height:214px;padding:22px 23px}.auth-story-copy{margin:26px 0 13px;max-width:290px}.auth-story-copy h2{font-size:36px;margin:10px 0 7px}.auth-story-copy p{font-size:11px;max-width:260px}.auth-art{width:145px;height:145px;right:4px;bottom:8px;opacity:.72}.auth-art-ring{width:130px;height:130px}.auth-art-ring:before{inset:13px}.auth-art-ring:after{inset:29px}.auth-art-core{width:49px;height:49px;right:46px;top:50px;font-size:21px}.auth-art-dot{width:24px;height:24px;left:2px;top:20px}.auth-art-square{width:21px;height:21px}.auth-form-side{padding:24px 22px 27px}.auth-card h1{font-size:26px}.auth-card>p{font-size:12px;margin-bottom:16px}}
    @media(prefers-reduced-motion:reduce){.auth-layout,.auth-art-ring,.auth-art-core,.auth-art-dot,.auth-art-square{animation:none!important}}
    .account-tools{display:flex;align-items:center;gap:8px}.account-tools small{font-size:10px;color:#77777f;max-width:180px;overflow:hidden;text-overflow:ellipsis}.account-tools button{border:1px solid #e8e6e1;background:#fff;border-radius:10px;padding:8px 10px;font-size:11px}
  `;
  document.head.append(styles);
  let signupMode = false;

  function showGate(message = '') {
    let gate = document.querySelector('#authGate');
    if (!gate) { gate = document.createElement('div'); gate.id = 'authGate'; document.body.append(gate); }
    gate.innerHTML = `<div class="auth-layout"><aside class="auth-story"><div class="auth-brand"><span class="auth-brandmark"><i></i></span> LeadSense</div><div class="auth-story-copy"><small>Your creator research workspace</small><h2>Find creators.<br><span>Reach out well.</span></h2><p>Search by country and audience size. Review public channel details before you decide who to contact.</p></div><div class="auth-art" aria-hidden="true"><i class="auth-art-ring"></i><i class="auth-art-dot"></i><i class="auth-art-core"></i><i class="auth-art-square"></i></div></aside><main class="auth-form-side"><section class="auth-card"><h1>${signupMode ? 'Create your account' : 'Welcome back'}</h1><p>${signupMode ? 'Create a private workspace for channel research and follow-ups.' : 'Sign in to return to your saved searches and workspace.'}</p><form id="authForm"><label>Email<input name="email" type="email" autocomplete="email" required maxlength="254" placeholder="you@example.com"></label><label>Password<input name="password" type="password" autocomplete="${signupMode ? 'new-password' : 'current-password'}" required minlength="${signupMode ? '12' : '1'}" maxlength="256" placeholder="${signupMode ? 'At least 12 characters' : 'Your password'}"></label><div class="auth-actions"><button class="primary-btn blue" type="submit">${signupMode ? 'Create account' : 'Sign in'}</button></div></form>${message ? `<div class="auth-message ${message.startsWith('Account created') ? 'success' : ''}" role="status">${message}</div>` : ''}<div class="auth-switch">${signupMode ? 'Already registered?' : 'New to LeadSense?'} <button id="authModeSwitch" type="button">${signupMode ? 'Sign in' : 'Create an account'}</button></div><p class="auth-footnote">Sign up using email. Your workspace is private. YouTube audience retention is not available in public channel search.</p></section></main></div>`;
    gate.querySelector('#authModeSwitch').onclick = () => { signupMode = !signupMode; showGate(); };
    gate.querySelector('#authForm').onsubmit = async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const button = form.querySelector('button[type=submit]');
      button.disabled = true; button.textContent = signupMode ? 'Creating account…' : 'Signing in…';
      try {
        const response = await fetch(signupMode ? '/api/auth/signup' : '/api/auth/login', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(new FormData(form))) });
        const data = await response.json().catch(() => null);
        if (!response.ok) throw new Error(data?.error?.message || 'Could not sign in. Please try again.');
        if (signupMode) showGate(data.message || 'Account created. Sign in to continue.');
        else window.location.reload();
      } catch (error) { showGate(error.message); }
    };
  }

  async function start() {
    try {
      const response = await fetch('/api/auth/session', { credentials: 'same-origin' });
      const data = await response.json();
      if (!response.ok || !data.authenticated) { showGate(); return; }
      window.leadsenseUser = data.user;
      window.dispatchEvent(new CustomEvent('leadsense:authenticated', { detail: data.user }));
      const actions = document.querySelector('.top-actions');
      if (actions) {
        const tools = document.createElement('div'); tools.className = 'account-tools';
        tools.innerHTML = `<small>${String(data.user.email || '').replace(/[&<>"']/g, '')}</small><button type="button" id="signOutButton">Sign out</button>`;
        actions.prepend(tools);
        tools.querySelector('#signOutButton').onclick = async () => { await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }); window.location.reload(); };
      }
      if (data.user.role === 'admin') {
        const nav = document.querySelector('.nav');
        if (nav && !nav.querySelector('[data-admin-open]')) {
          const button = document.createElement('button'); button.className = 'nav-item'; button.dataset.adminOpen = 'true'; button.innerHTML = '<span class="ico">♙</span> Admin panel';
          button.onclick = () => window.openAdminPanel?.(); nav.append(button);
        }
      }
    } catch { showGate('The sign-in service could not be reached. Refresh the page and try again.'); }
  }
  start();
})();
