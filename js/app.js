/* ============================================================
   Crafty Central — app.js
   Shell: auth gate (cloud mode), nav, role-based routing,
   notifications, identity box / demo role switcher.
   ============================================================ */

const App = (() => {
  let currentView = null;
  let started = false;
  let authMode = 'signin'; // 'signin' | 'signup'

  const NAV = [
    { id: 'dashboard', label: 'Dashboard', icon: 'dashboard', roles: ['admin', 'moderator'] },
    { id: 'calendar', label: 'Calendar', icon: 'calendar', roles: ['admin', 'moderator', 'crew'] },
    { id: 'schedule', label: 'My Schedule', icon: 'schedule', roles: ['admin', 'moderator', 'crew'] },
    { id: 'menus', label: 'Menus', icon: 'menu', roles: ['admin', 'moderator'] },
    { id: 'chat', label: 'Chat', icon: 'chat', roles: ['admin', 'moderator', 'crew'] },
    { id: 'directory', label: 'Directory', icon: 'directory', roles: ['admin', 'moderator', 'crew'] },
    { id: 'finances', label: 'Finances', icon: 'finances', roles: ['admin'] },
  ];

  function allowedNav() {
    const r = Store.role();
    return NAV.filter(n => n.roles.includes(r));
  }

  function go(viewId) {
    const allowed = allowedNav();
    if (viewId !== 'brief' && !allowed.some(n => n.id === viewId)) viewId = allowed[0].id;
    currentView = viewId;
    UI.closeJobPanel();
    document.getElementById('topbarTitle').textContent = Views[viewId].title;
    renderNav();
    refreshView();
    closeNotifDrawer();
    window.scrollTo({ top: 0 });
    document.querySelector('.main-col')?.scrollTo({ top: 0 });
  }

  function refreshView() {
    if (!currentView) return;
    Views[currentView].render(document.getElementById('content'));
    refreshBadges();
    if (UI.panelJobId || UI.panelDate) UI.renderPanel();
  }

  /* ---------- nav ---------- */
  function renderNav() {
    const wrap = document.getElementById('navLinks');
    const pendingTO = (Store.can('approveTimeOff')
      ? Store.get().timeOff.filter(t => t.status === 'pending').length : 0)
      + (Store.can('createJob') ? Store.newInquiries().length : 0);
    const chans = Store.myChannels();
    const unreadChat = [chans.company, ...chans.dms].some(c => Store.unread(c));

    wrap.innerHTML = allowedNav().map(n => `
      <button class="nav-link ${currentView === n.id ? 'active' : ''}" data-nav="${n.id}">
        ${ICONS[n.icon]}
        <span>${n.label}</span>
        ${n.id === 'dashboard' && pendingTO ? `<span class="nav-badge">${pendingTO}</span>` : ''}
        ${n.id === 'chat' && unreadChat ? '<span class="nav-badge" style="min-width:8px;height:8px;padding:0;border-radius:50%"></span>' : ''}
      </button>`).join('');

    wrap.querySelectorAll('[data-nav]').forEach(b => b.onclick = () => go(b.dataset.nav));
  }

  function refreshBadges() {
    renderNav();
    renderTopbarUser();
    const unread = Store.myNotifications().some(n => !n.read);
    document.getElementById('notifDot').hidden = !unread;
  }

  /* ---------- topbar user + identity box ---------- */
  function renderTopbarUser() {
    const p = Store.me();
    const el = document.getElementById('topbarUser');
    el.innerHTML = `
      <div class="u-meta">
        <span class="u-name">${UI.esc(p.name)}</span>
        <span class="u-role">${p.role} · ${UI.esc(p.position)}</span>
      </div>
      ${UI.avatar(p)}`;
    if (Store.isCloud()) {
      el.style.cursor = 'pointer';
      el.title = 'Sign out';
      el.onclick = () => { if (confirm('Sign out of Crafty Central?')) Cloud.signOut(); };
    }
  }

  /* Sidebar foot: demo role switcher (local mode) or the signed-in
     account with a sign-out button (cloud mode). */
  function renderRoleSwitch() {
    const el = document.getElementById('roleSwitch');

    if (Store.isCloud()) {
      const p = Store.me();
      el.innerHTML = `
        <div class="account-box">
          ${UI.avatar(p, 'sm')}
          <div class="ab-meta">
            <span class="ab-name">${UI.esc(p.name)}</span>
            <span class="ab-role">${p.role}</span>
          </div>
          <button class="icon-btn" id="signOutBtn" title="Sign out" aria-label="Sign out" style="width:30px;height:30px">${ICONS.x}</button>
        </div>`;
      el.querySelector('#signOutBtn').onclick = () => {
        if (confirm('Sign out of Crafty Central?')) Cloud.signOut();
      };
      return;
    }

    const people = Store.get().people;
    el.innerHTML = `
      <span class="role-switch-label">Viewing as</span>
      <select id="roleSelect">
        ${people.map(p => `<option value="${p.id}" ${p.id === Store.me().id ? 'selected' : ''}>${UI.esc(p.name)} — ${p.role}</option>`).join('')}
      </select>`;
    el.querySelector('#roleSelect').onchange = (e) => {
      Store.setUser(e.target.value);
      UI.toast(`Now viewing as ${Store.me().name.split(' ')[0]} (${Store.role()})`, 'people');
      go(currentView);
    };

    // mobile: mirror the switcher into the topbar (sidebar foot is hidden there)
    let mob = document.getElementById('mobileRoleBtn');
    if (!mob) {
      mob = document.createElement('button');
      mob.id = 'mobileRoleBtn';
      mob.className = 'icon-btn';
      mob.title = 'Switch user (demo)';
      mob.innerHTML = ICONS.people;
      mob.style.display = 'none';
      document.querySelector('.topbar-actions').prepend(mob);
      mob.onclick = () => {
        const ppl = Store.get().people;
        const i = ppl.findIndex(p => p.id === Store.me().id);
        const next = ppl[(i + 1) % ppl.length];
        Store.setUser(next.id);
        renderRoleSwitch();
        UI.toast(`Now viewing as ${next.name.split(' ')[0]} (${next.role})`, 'people');
        go(currentView);
      };
      const mq = window.matchMedia('(max-width: 900px)');
      const sync = () => { mob.style.display = mq.matches ? 'grid' : 'none'; };
      mq.addEventListener('change', sync); sync();
    }
  }

  /* ---------- notifications drawer ---------- */
  function renderNotifDrawer() {
    const list = document.getElementById('notifList');
    const notifs = Store.myNotifications();
    list.innerHTML = notifs.length ? notifs.map(n => `
      <div class="notif-item ${n.read ? '' : 'unread'}">
        <span class="n-icon">${ICONS[n.icon] || ICONS.bell}</span>
        <div>
          <div>${UI.esc(n.text)}</div>
          <div class="n-time">${UI.fmtAgo(n.at)}</div>
        </div>
      </div>`).join('')
      : `<div class="empty" style="border:none">${ICONS.bell}<div class="e-title">All caught up</div><div class="e-sub">Nothing new for you right now.</div></div>`;
  }
  function closeNotifDrawer() { document.getElementById('notifDrawer').hidden = true; }

  /* ---------- auth screen (cloud mode) ---------- */
  const AUTH_ERRORS = {
    'auth/invalid-credential': 'Wrong email or password.',
    'auth/wrong-password': 'Wrong email or password.',
    'auth/user-not-found': 'No account with that email — tap "Create your account" below.',
    'auth/invalid-email': 'That email address does not look right.',
    'auth/email-already-in-use': 'That email already has an account — sign in instead.',
    'auth/weak-password': 'Password needs at least 6 characters.',
    'auth/too-many-requests': 'Too many attempts — wait a minute and try again.',
    'auth/network-request-failed': 'No connection — check your internet and try again.',
  };

  function setAuthState(mode, msg) {
    const form = document.getElementById('authForm');
    const loading = document.getElementById('authLoading');
    const toggle = document.getElementById('authToggle');
    if (mode === 'loading') {
      form.hidden = true; toggle.hidden = true; loading.hidden = false;
      document.getElementById('authLoadingText').textContent = msg || 'Connecting…';
    } else {
      form.hidden = false; toggle.hidden = false; loading.hidden = true;
    }
  }

  function setAuthError(msg) {
    const err = document.getElementById('authErr');
    err.textContent = msg || '';
    err.hidden = !msg;
  }

  function renderAuthMode() {
    const signup = authMode === 'signup';
    document.getElementById('authTitle').textContent = signup ? 'Create your account' : 'Sign in';
    document.getElementById('authSub').textContent = signup
      ? 'Use the email your admin has on file so your role and schedule connect automatically.'
      : 'Log in with your Crafty account.';
    document.getElementById('authNameField').hidden = !signup;
    document.getElementById('authSubmitText').textContent = signup ? 'Create account' : 'Sign in';
    document.getElementById('authToggle').textContent = signup
      ? 'Already have an account? Sign in'
      : 'First time here? Create your account';
    document.getElementById('authPass').autocomplete = signup ? 'new-password' : 'current-password';
    setAuthError('');
  }

  function wireAuthScreen() {
    renderAuthMode();
    document.getElementById('authToggle').onclick = () => {
      authMode = authMode === 'signup' ? 'signin' : 'signup';
      renderAuthMode();
    };
    document.getElementById('authForm').onsubmit = async (e) => {
      e.preventDefault();
      const email = document.getElementById('authEmail').value.trim();
      const pass = document.getElementById('authPass').value;
      const name = document.getElementById('authName').value.trim();
      if (!email || !pass) return;
      setAuthError('');
      const btn = document.getElementById('authSubmit');
      btn.disabled = true;
      try {
        if (authMode === 'signup') await Cloud.signUp(email, pass, name);
        else await Cloud.signIn(email, pass);
        // onAuth callback takes it from here
      } catch (err) {
        setAuthError(AUTH_ERRORS[err.code] || 'Could not sign in: ' + (err.code || err.message));
      } finally {
        btn.disabled = false;
      }
    };
  }

  /* ---------- boot ---------- */
  function startUI() {
    if (started) { renderRoleSwitch(); go(currentView || allowedNav()[0].id); return; }
    started = true;

    renderRoleSwitch();

    document.getElementById('notifBtn').onclick = () => {
      const d = document.getElementById('notifDrawer');
      if (d.hidden) {
        renderNotifDrawer();
        d.hidden = false;
        Store.markNotifsRead();
        refreshBadges();
      } else d.hidden = true;
    };
    document.getElementById('notifClearBtn').onclick = () => {
      Store.markNotifsRead(); renderNotifDrawer(); refreshBadges();
    };
    document.addEventListener('click', (e) => {
      const d = document.getElementById('notifDrawer');
      if (!d.hidden && !d.contains(e.target) && !document.getElementById('notifBtn').contains(e.target)) {
        d.hidden = true;
      }
    });

    // release queued chat messages once a minute (the 7am send)
    setInterval(() => {
      if (Store.releaseQueued() && currentView === 'chat') refreshView();
    }, 60 * 1000);

    // service worker (PWA install + offline shell)
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }

    go(allowedNav()[0].id);
  }

  function init() {
    if (window.FIREBASE_CONFIG && window.Cloud) {
      const scr = document.getElementById('authScreen');
      scr.hidden = false;
      wireAuthScreen();
      setAuthState('loading');

      Cloud.onAuth(async (user) => {
        if (user) {
          setAuthState('loading', 'Loading your workspace…');
          try {
            await Store.enterCloud(user);
            scr.hidden = true;
            startUI();
          } catch (e) {
            console.error(e);
            setAuthState('form');
            setAuthError('Signed in, but could not load data — check your Firestore rules. (' + (e.code || e.message) + ')');
          }
        } else {
          if (started) { location.reload(); return; } // signed out mid-session
          setAuthState('form');
        }
      });
    } else {
      if (window.FIREBASE_CONFIG && !window.Cloud) {
        console.warn('Firebase config found but the SDK failed to load — running in local demo mode.');
      }
      startUI();
    }
  }

  /* Boot once both the DOM and the (possible) Firebase module are ready.
     cloud.js loads the SDK with top-level await, which DOMContentLoaded
     does not wait for — so when a config exists, wait for its signal. */
  function boot() {
    if (window.FIREBASE_CONFIG && !window.CLOUD_READY) {
      document.addEventListener('cloud-ready', init, { once: true });
    } else {
      init();
    }
  }
  document.addEventListener('DOMContentLoaded', boot);

  /* Job brief: a full-page, read-first call sheet for one job.
     Reachable from any job sheet; not a nav item. */
  function openBrief(jobId, date) {
    Views.brief.setJob(jobId, date);
    go('brief');
  }

  return {
    go, openBrief, refreshView, refreshBadges, renderRoleSwitch,
    get started() { return started; },
  };
})();
