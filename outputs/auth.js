(() => {
  const styles = document.createElement('style');
  styles.textContent = `
    #authGate{position:fixed;inset:0;z-index:10000;background:#f6f5f1;display:grid;place-items:center;padding:20px;color:#1b1b20}
    .auth-card{width:min(100%,440px);background:white;border:1px solid #e8e6e1;border-radius:24px;padding:30px;box-shadow:0 22px 70px #19182014}
    .auth-brand{font-size:21px;font-weight:800;letter-spacing:-.06em;margin-bottom:22px}.auth-brand span{color:#416cf6}.auth-card h1{font-size:27px;letter-spacing:-.055em;margin:0 0 8px}.auth-card p{font-size:13px;line-height:1.6;color:#77777f;margin:0 0 20px}.auth-card label{display:grid;gap:7px;margin:13px 0;font-size:12px;font-weight:650}.auth-card input{border:1px solid #e8e6e1;border-radius:11px;padding:12px;font:inherit}.auth-actions{display:grid;gap:10px;margin-top:17px}.auth-actions button{width:100%;justify-content:center}.auth-switch{margin-top:17px;text-align:center;font-size:12px}.auth-switch button{border:0;background:none;color:#416cf6;font-weight:700;cursor:pointer}.auth-message{font-size:12px;line-height:1.5;color:#a8482b;background:#fff1eb;padding:10px 12px;border-radius:10px;margin-top:13px}.auth-message.success{color:#267852;background:#eaf8f0}.account-tools{display:flex;align-items:center;gap:8px}.account-tools small{font-size:10px;color:#77777f;max-width:180px;overflow:hidden;text-overflow:ellipsis}.account-tools button{border:1px solid #e8e6e1;background:#fff;border-radius:10px;padding:8px 10px;font-size:11px}
  `;
  document.head.append(styles);
  let signupMode = false;

  function showGate(message = '') {
    let gate = document.querySelector('#authGate');
    if (!gate) { gate = document.createElement('div'); gate.id = 'authGate'; document.body.append(gate); }
    gate.innerHTML = `<section class="auth-card"><div class="auth-brand"><span>◉</span> LeadSense</div><h1>${signupMode ? 'Create your account' : 'Welcome back'}</h1><p>${signupMode ? 'Start your own private workspace for YouTube research and business follow-ups.' : 'Sign in to view your saved searches and workspace.'}</p><form id="authForm"><label>Email<input name="email" type="email" autocomplete="email" required maxlength="254" placeholder="you@example.com"></label><label>Password<input name="password" type="password" autocomplete="${signupMode ? 'new-password' : 'current-password'}" required minlength="${signupMode ? '12' : '1'}" maxlength="256" placeholder="${signupMode ? 'At least 12 characters' : 'Your password'}"></label><div class="auth-actions"><button class="primary-btn blue" type="submit">${signupMode ? 'Create account' : 'Sign in'}</button></div></form>${message ? `<div class="auth-message ${message.startsWith('Account created') ? 'success' : ''}" role="status">${message}</div>` : ''}<div class="auth-switch">${signupMode ? 'Already registered?' : 'New to LeadSense?'} <button id="authModeSwitch" type="button">${signupMode ? 'Sign in' : 'Create an account'}</button></div><p style="font-size:10px;margin:16px 0 0">Accounts and private workspaces require the Supabase migration. The site administrator is assigned separately and cannot be selected here.</p></section>`;
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
