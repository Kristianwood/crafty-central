/* ============================================================
   Crafty Central — ui.js
   Shared render helpers: formatting, avatars, modal, toasts,
   and the job detail side panel (used by dashboard + calendar).
   ============================================================ */

const UI = (() => {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------- formatting ---------- */
  const D = (isoStr) => new Date(isoStr + 'T00:00:00');
  const fmtShort = (isoStr) => D(isoStr).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
  const fmtLong = (isoStr) => D(isoStr).toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' });
  const fmtRange = (a, b) => (a === b ? fmtShort(a) : `${fmtShort(a)} – ${fmtShort(b)}`);
  const fmtDays = (days) => {
    if (!days || !days.length) return '—';
    return days.length === 1 ? fmtLong(days[0]) : `${fmtShort(days[0])} – ${fmtShort(days[days.length - 1])} · ${days.length} days`;
  };
  const fmtMoney = (n) => '$' + n.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtTime12 = (t) => {
    if (!t) return '—';
    const [h, m] = t.split(':').map(Number);
    const ap = h >= 12 ? 'PM' : 'AM';
    return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${ap}`;
  };
  const fmtClock = (ts) => new Date(ts).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' });
  const fmtAgo = (ts) => {
    const s = (Date.now() - ts) / 1000;
    if (s < 60) return 'now';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    return Math.floor(s / 86400) + 'd ago';
  };

  /* ---------- avatars ---------- */
  const AV_COLORS = ['#34688c', '#2a7d84', '#5a6e8c', '#a3824f', '#a05c6e', '#6b8c7a', '#4f7d78', '#8c7a5a', '#446e63'];
  function avatar(p, size) {
    if (!p) return '';
    const initials = p.name.split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
    let h = 0;
    for (const c of p.id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    const bg = AV_COLORS[h % AV_COLORS.length];
    return `<span class="avatar ${size || ''}" style="background:${bg}" title="${esc(p.name)}">${initials}</span>`;
  }
  function avatarStack(ids, max) {
    max = max || 4;
    const shown = ids.slice(0, max);
    const extra = ids.length - shown.length;
    let html = '<span class="avatar-stack">';
    shown.forEach(id => { html += avatar(Store.person(id), 'sm'); });
    if (extra > 0) html += `<span class="avatar sm" style="background:#a8a29e">+${extra}</span>`;
    return html + '</span>';
  }

  const STATUS_LABELS = { estimate: 'Hold' };
  const statusPill = (s) => `<span class="pill ${s}"><span class="pip"></span>${STATUS_LABELS[s] || (s[0].toUpperCase() + s.slice(1))}</span>`;

  /* ---------- toasts ---------- */
  function toast(text, icon) {
    const rail = document.getElementById('toastRail');
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = (icon ? ICONS[icon] : ICONS.check) + esc(text);
    rail.appendChild(el);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 320); }, 2600);
  }

  /* ---------- modal ---------- */
  function openModal(html) {
    const scrim = document.getElementById('modalScrim');
    const modal = document.getElementById('modal');
    modal.innerHTML = html;
    scrim.hidden = false;
    requestAnimationFrame(() => scrim.classList.add('open'));
  }
  function closeModal() {
    const scrim = document.getElementById('modalScrim');
    scrim.classList.remove('open');
    setTimeout(() => { scrim.hidden = true; }, 260);
  }
  document.addEventListener('click', (e) => {
    if (e.target.id === 'modalScrim') closeModal();
  });

  /* ============================================================
     Job detail side panel
     ============================================================ */
  let panelJobId = null;
  let panelHideTimer = null;
  let panelDayIdx = 0;
  let lastPanelDay = null; // activeDate at the previous render, for open-state restore

  function openJobPanel(jobId) {
    panelJobId = jobId;
    panelDayIdx = 0;
    lastPanelDay = null;
    document.getElementById('panelInner').innerHTML = ''; // fresh open-states for a new job
    renderPanel();
    const panel = document.getElementById('panel');
    const scrim = document.getElementById('panelScrim');
    clearTimeout(panelHideTimer);
    panel.hidden = false; scrim.hidden = false;
    requestAnimationFrame(() => { panel.classList.add('open'); scrim.classList.add('open'); });
    document.querySelectorAll('.cal-job').forEach(el =>
      el.classList.toggle('selected', el.dataset.job === jobId));
  }
  function closeJobPanel() {
    panelJobId = null;
    const panel = document.getElementById('panel');
    const scrim = document.getElementById('panelScrim');
    panel.classList.remove('open'); scrim.classList.remove('open');
    clearTimeout(panelHideTimer);
    panelHideTimer = setTimeout(() => { panel.hidden = true; scrim.hidden = true; }, 380);
    document.querySelectorAll('.cal-job.selected').forEach(el => el.classList.remove('selected'));
  }

  function renderPanel() {
    if (!panelJobId) return;
    const j = Store.job(panelJobId);
    if (!j) { closeJobPanel(); return; }
    const inner = document.getElementById('panelInner');
    // remember which dropdown sections were open before re-rendering (by key)
    const openStates = {};
    inner.querySelectorAll('.miss-block[data-block]').forEach(d => { openStates[d.dataset.block] = d.open; });
    const canEdit = Store.can('editJob');
    const miss = Store.missing(j);
    const people = Store.get().people;

    /* --- per-day context (multi-day jobs get tabs at the top) --- */
    const multiDay = j.shootDays.length > 1;
    if (panelDayIdx >= j.shootDays.length) panelDayIdx = 0;
    const activeDate = j.shootDays[panelDayIdx] || j.shootDays[0];
    const dv = (f) => Store.dayVal(j, activeDate, f);
    const di = (j.dayInfo && j.dayInfo[activeDate]) || {};
    const dayMenu = multiDay ? Store.menuFor(j, activeDate) : j.menu;
    const dayHasMenuOverride = multiDay && Array.isArray(di.menu);
    const menuDate = multiDay ? activeDate : null;

    const dayTabs = !multiDay ? '' : `
      <div class="day-tabs">
        ${j.shootDays.map((d, i) => {
          const info = j.dayInfo && j.dayInfo[d];
          const needsMenu = !Store.menuFor(j, d).length;
          return `
          <button class="seg ${i === panelDayIdx ? 'active' : ''} ${needsMenu ? 'needs-menu' : (info && Object.keys(info).length ? 'has-info' : '')}" data-day-tab="${i}">
            Day ${i + 1} <span class="seg-sub">${fmtShort(d)}</span>
          </button>`;
        }).join('')}
      </div>`;

    /* --- missing-info dropdown blocks (top of panel) --- */
    const crewOpen = miss.includes('crew');
    const menuOpen = multiDay ? !dayMenu.length : miss.includes('menu');

    const canCrew = Store.can('assignCrew');
    const hasTimeOff = (pid) => Store.get().timeOff.some(t =>
      t.personId === pid && t.status !== 'denied' &&
      j.shootDays.some(d => d >= t.start && d <= t.end));

    const crewBlock = `
      <details class="miss-block ${crewOpen ? 'incomplete' : ''}" data-block="crew" ${crewOpen ? 'open' : ''}>
        <summary>
          <span class="ms-icon">${ICONS.people}</span>
          Crew on this job
          <span class="ms-state">
            ${crewOpen
              ? '<span class="missing-chip">' + ICONS.alert + 'None assigned</span>'
              : avatarStack(Store.crewIds(j), 5)}
            <span class="chev">${ICONS.chevDown}</span>
          </span>
        </summary>
        <div class="miss-body">
          ${j.crew.length ? `<div class="check-list">
            ${j.crew.map((c, i) => {
              const p = Store.person(c.personId);
              if (!p) return '';
              return `
              <div class="check-item">
                <span class="crew-role-tag">${esc(c.role)}</span>
                ${avatar(p, 'sm')}
                <span>${esc(p.name)}</span>
                <span class="ci-sub">${hasTimeOff(p.id) ? '<span class="pill warn">Time off</span>' : esc(p.position)}</span>
                ${canCrew ? `<button class="crew-remove" data-crew-del="${i}" aria-label="Remove ${esc(p.name)}">${ICONS.x}</button>` : ''}
              </div>`;
            }).join('')}
          </div>` : '<p style="font-size:12.5px;color:var(--ink-3);padding-top:8px">Nobody booked yet.</p>'}
          ${canCrew ? `
          <div class="crew-add">
            <select id="crewRoleSel" aria-label="Role">
              ${Store.CREW_ROLES.map(r => `<option value="${r}">${r}</option>`).join('')}
            </select>
            <select id="crewPersonSel" aria-label="Person"></select>
            <button class="btn sm" id="crewAddBtn" type="button">${ICONS.plus} Add</button>
          </div>` : ''}
        </div>
      </details>`;

    const menuBlock = `
      <details class="miss-block ${miss.includes('menu') ? 'incomplete' : ''}" data-block="menu" ${menuOpen ? 'open' : ''}>
        <summary>
          <span class="ms-icon">${ICONS.menu}</span>
          Menu${multiDay ? ` <span class="seg-sub">Day ${panelDayIdx + 1} · ${fmtShort(activeDate)}</span>` : ''}
          <span class="ms-state">
            ${!dayMenu.length
              ? '<span class="missing-chip">' + ICONS.alert + (multiDay ? `Day ${panelDayIdx + 1} not set` : 'Not set') + '</span>'
              : `<span class="pill neutral">${dayMenu.length} item${dayMenu.length === 1 ? '' : 's'}</span>`}
            <span class="chev">${ICONS.chevDown}</span>
          </span>
        </summary>
        <div class="miss-body">
          ${multiDay ? `<p class="menu-scope-hint">${dayHasMenuOverride
            ? `Custom menu for Day ${panelDayIdx + 1} — switch tabs above to set the other days.`
            : `Using the job's default menu — any change here becomes Day ${panelDayIdx + 1}'s own menu.`}</p>` : ''}
          ${dayMenu.length ? `<div class="tag-row">${dayMenu.map((m, i) => `
            <span class="tag">${esc(m)}${canEdit ? `<button data-menu-del="${i}" aria-label="Remove">${ICONS.x}</button>` : ''}</span>`).join('')}</div>`
            : '<p style="font-size:12.5px;color:var(--ink-3);padding-top:8px">Nothing on the menu yet' + (multiDay ? ' for this day' : '') + '.</p>'}
          ${canEdit && Store.get().menus.length ? `
          <div class="menu-pick">
            <select id="menuTplSel" aria-label="Saved menu">
              <option value="">Apply a saved menu…</option>
              ${Store.get().menus.map(m => `<option value="${m.id}">${esc(m.name)} (${m.items.length})</option>`).join('')}
            </select>
            <button class="btn sm" id="menuTplApply" type="button">${ICONS.check} Apply</button>
          </div>
          ${multiDay ? `<label class="menu-pick-all"><input type="checkbox" id="menuTplAll"> Apply to all ${j.shootDays.length} days (replaces each day's menu)</label>` : ''}` : ''}
          ${canEdit ? `
          <form class="tag-add" id="menuAddForm">
            <input type="text" id="menuAddInput" placeholder="${dayMenu.length ? 'Add an extra item…' : 'Or add items one by one…'}" autocomplete="off">
            <button class="btn sm" type="submit">${ICONS.plus} Add</button>
          </form>` : ''}
        </div>
      </details>`;

    /* dietary flags for the assigned crew + headcount note */
    const dietFlags = Store.crewIds(j)
      .map(id => Store.person(id))
      .filter(p => p && p.dietary.length)
      .map(p => `${esc(p.name.split(' ')[0])}: ${esc(p.dietary.join(', '))}`);

    const dietBlock = dietFlags.length ? `
      <details class="miss-block" data-block="diet">
        <summary>
          <span class="ms-icon">${ICONS.alert}</span>
          Crew dietary notes
          <span class="ms-state"><span class="pill pending">${dietFlags.length}</span><span class="chev">${ICONS.chevDown}</span></span>
        </summary>
        <div class="miss-body"><div class="check-list">
          ${dietFlags.map(f => `<div class="check-item"><span class="diet-flag">${f}</span></div>`).join('')}
        </div></div>
      </details>` : '';

    const sub = Store.jobSubtotal(j);

    /* schedule details for the active day (multi-day jobs) */
    const dayCard = !multiDay ? '' : `
      <div class="day-card">
        <div class="day-card-head">${fmtLong(activeDate)}${Object.keys(di).some(k => k !== 'menu' && di[k] !== '' && di[k] !== undefined && di[k] !== null) ? '' : ' · using job defaults'}</div>
        ${canEdit ? `
        <div class="day-form">
          <div class="field"><label>Call</label><input type="time" id="dayCall" value="${esc(dv('callTime') || '')}"></div>
          <div class="field"><label>Wrap (est.)</label><input type="time" id="dayWrap" value="${esc(dv('wrapTime') || '')}"></div>
          <div class="field"><label>People on set</label><input type="number" id="dayHead" min="0" value="${esc(dv('headcount') ?? '')}"></div>
          <div class="field"><label>Location</label><input type="text" id="dayLoc" value="${esc(dv('location') || '')}"></div>
          <div class="field wide"><label>Notes for this day</label><input type="text" id="dayNotes" value="${esc(di.notes || '')}" placeholder="e.g. company move, night exteriors…"></div>
          <button class="btn sm primary" id="daySaveBtn" type="button" style="justify-self:start">${ICONS.check} Save day ${panelDayIdx + 1}</button>
        </div>` : `
        <div class="fact-grid" style="margin-top:0">
          <div class="fact"><div class="f-label">Call</div><div class="f-value mono">${fmtTime12(dv('callTime'))}</div></div>
          <div class="fact"><div class="f-label">Wrap (est.)</div><div class="f-value mono">${fmtTime12(dv('wrapTime'))}</div></div>
          <div class="fact"><div class="f-label">People on set</div><div class="f-value mono">${dv('headcount') || '—'}</div></div>
          <div class="fact"><div class="f-label">Location</div><div class="f-value">${esc(dv('location') || '—')}</div></div>
          ${di.notes ? `<div class="fact wide"><div class="f-label">Day notes</div><div class="f-value" style="font-weight:450;font-size:13px">${esc(di.notes)}</div></div>` : ''}
        </div>`}
      </div>`;

    inner.innerHTML = `
      <div class="panel-top">
        <div>
          <div class="panel-kicker">${esc(j.productionCompany)}${j.agency ? ' · ' + esc(j.agency) : ''}</div>
          <h2 class="panel-title">${esc(j.productionName)}</h2>
          <div class="panel-sub">${statusPill(j.status)}</div>
        </div>
        <button class="panel-close" id="panelCloseBtn" aria-label="Close">${ICONS.x}</button>
      </div>

      ${dayTabs}

      <div class="miss-stack">
        ${crewBlock}
        ${menuBlock}
        ${dietBlock}
      </div>

      ${dayCard}

      <div class="fact-grid">
        <div class="fact"><div class="f-label">Shoot days</div><div class="f-value mono">${esc(fmtDays(j.shootDays))}</div></div>
        <div class="fact"><div class="f-label">${multiDay ? 'Total covers' : 'Headcount'}</div><div class="f-value mono">${multiDay ? Store.totalCovers(j) : j.headcount + ' on set'}</div></div>
        ${multiDay ? '' : `
        <div class="fact"><div class="f-label">Call</div><div class="f-value mono">${fmtTime12(j.callTime)}</div></div>
        <div class="fact"><div class="f-label">Wrap (est.)</div><div class="f-value mono">${fmtTime12(j.wrapTime)}</div></div>`}
        ${j.pm ? `<div class="fact"><div class="f-label">Production manager</div><div class="f-value">${esc(j.pm)}</div></div>` : ''}
        ${j.producers ? `<div class="fact${j.pm ? '' : ' wide'}"><div class="f-label">Producer${j.producers.includes(',') ? 's' : ''}</div><div class="f-value">${esc(j.producers)}</div></div>` : ''}
        ${multiDay ? '' : `<div class="fact wide"><div class="f-label">Location</div><div class="f-value">${esc(j.location || '—')}</div></div>`}
        ${j.notes ? `<div class="fact wide"><div class="f-label">Notes</div><div class="f-value" style="font-weight:450;font-size:13px">${esc(j.notes)}</div></div>` : ''}
        ${Store.can('finances') ? `<div class="fact wide"><div class="f-label">Estimate value</div><div class="f-value mono">${fmtMoney(sub)} <span style="color:var(--ink-3);font-size:11px">+ HST</span></div></div>` : ''}
      </div>

      <div class="panel-actions">
        ${canEdit ? `<button class="btn" id="panelEditBtn">${ICONS.edit} Edit job</button>` : ''}
        ${Store.can('finances') && j.status !== 'invoiced' ? `<button class="btn" id="panelInvoiceBtn">${ICONS.doc} Create invoice</button>` : ''}
        ${canEdit ? `<button class="btn danger" id="panelDeleteBtn">${ICONS.x} Delete</button>` : ''}
      </div>
    `;

    const dayChanged = lastPanelDay !== activeDate;
    inner.querySelectorAll('.miss-block[data-block]').forEach(d => {
      const key = d.dataset.block;
      // switching day tabs recomputes the menu block's open state — keep it
      if (key === 'menu' && dayChanged) return;
      if (openStates[key] !== undefined) d.open = openStates[key];
    });
    lastPanelDay = activeDate;

    /* wire panel events */
    inner.querySelector('#panelCloseBtn').onclick = closeJobPanel;

    inner.querySelectorAll('[data-day-tab]').forEach(b => {
      b.onclick = () => { panelDayIdx = +b.dataset.dayTab; renderPanel(); };
    });
    const daySave = inner.querySelector('#daySaveBtn');
    if (daySave) daySave.onclick = () => {
      Store.setDayInfo(j.id, activeDate, {
        callTime: inner.querySelector('#dayCall').value,
        wrapTime: inner.querySelector('#dayWrap').value,
        headcount: +inner.querySelector('#dayHead').value || '',
        location: inner.querySelector('#dayLoc').value.trim(),
        notes: inner.querySelector('#dayNotes').value.trim(),
      });
      toast(`Day ${panelDayIdx + 1} saved`, 'check');
      renderPanel();
      App.refreshView();
    };

    /* crew add: role select filters the person select to matching tags */
    const roleSel = inner.querySelector('#crewRoleSel');
    const personSel = inner.querySelector('#crewPersonSel');
    if (roleSel && personSel) {
      const fillPeople = () => {
        const cands = Store.candidatesFor(j.id, roleSel.value);
        personSel.innerHTML = cands.length
          ? cands.map(p => {
              const off = hasTimeOff(p.id);
              return `<option value="${p.id}">${esc(p.name)}${off ? ' — time off' : ''}</option>`;
            }).join('')
          : '<option value="">No one tagged ' + esc(roleSel.value) + '</option>';
        personSel.disabled = !cands.length;
        inner.querySelector('#crewAddBtn').disabled = !cands.length;
      };
      roleSel.onchange = fillPeople;
      fillPeople();
      inner.querySelector('#crewAddBtn').onclick = () => {
        if (!personSel.value) return;
        const p = Store.person(personSel.value);
        if (hasTimeOff(p.id) && !confirm(`${p.name} has time off during this shoot. Book them anyway?`)) return;
        Store.addCrew(j.id, roleSel.value, personSel.value);
        toast(`${p.name.split(' ')[0]} added as ${roleSel.value}`, 'people');
        renderPanel();
        App.refreshView();
      };
    }
    inner.querySelectorAll('[data-crew-del]').forEach(b => {
      b.onclick = () => {
        Store.removeCrew(j.id, +b.dataset.crewDel);
        renderPanel();
        App.refreshView();
      };
    });

    const tplApply = inner.querySelector('#menuTplApply');
    if (tplApply) tplApply.onclick = () => {
      const sel = inner.querySelector('#menuTplSel');
      const tpl = Store.menuTpl(sel.value);
      if (!tpl) return;
      const allDays = !!inner.querySelector('#menuTplAll')?.checked;
      const target = (multiDay && !allDays) ? activeDate : null;
      const existing = target ? Store.menuFor(j, target).length : j.menu.length;
      const scope = target ? `Day ${panelDayIdx + 1}` : (multiDay ? `all ${j.shootDays.length} days` : 'this job');
      if ((existing || (!target && multiDay)) && !confirm(`Apply the "${tpl.name}" menu to ${scope}?${!target && multiDay ? ' Each day\u2019s own menu will be replaced.' : existing ? ` Its current ${existing} item${existing === 1 ? '' : 's'} will be replaced.` : ''}`)) return;
      Store.setJobMenu(j.id, tpl.items, target);
      toast(`"${tpl.name}" applied to ${scope}`, 'menu');
      renderPanel();
      App.refreshView();
    };

    const menuForm = inner.querySelector('#menuAddForm');
    if (menuForm) menuForm.onsubmit = (e) => {
      e.preventDefault();
      const inp = inner.querySelector('#menuAddInput');
      if (inp.value.trim()) {
        Store.addMenuItem(j.id, inp.value, menuDate);
        renderPanel(); App.refreshView();
        const d = inner.querySelector('.miss-block[data-block="menu"]');
        if (d) d.open = true;
      }
    };
    inner.querySelectorAll('[data-menu-del]').forEach(b => {
      b.onclick = (e) => {
        e.preventDefault();
        Store.removeMenuItem(j.id, +b.dataset.menuDel, menuDate);
        renderPanel(); App.refreshView();
      };
    });

    const editBtn = inner.querySelector('#panelEditBtn');
    if (editBtn) editBtn.onclick = () => Views.dashboard.openJobForm(j.id);

    const invBtn = inner.querySelector('#panelInvoiceBtn');
    if (invBtn) invBtn.onclick = () => {
      const inv = Store.createInvoice(j.id);
      toast(`Invoice ${inv.number} drafted`, 'doc');
      renderPanel(); App.refreshView();
    };

    const delBtn = inner.querySelector('#panelDeleteBtn');
    if (delBtn) delBtn.onclick = () => {
      if (confirm(`Delete "${j.productionName}"? This also removes its invoices.`)) {
        Store.deleteJob(j.id);
        closeJobPanel();
        App.refreshView();
        toast('Job deleted', 'x');
      }
    };
  }

  document.addEventListener('click', (e) => {
    if (e.target.id === 'panelScrim') closeJobPanel();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeJobPanel(); closeModal(); }
  });

  return {
    esc, fmtShort, fmtLong, fmtRange, fmtDays, fmtMoney, fmtTime12, fmtClock, fmtAgo,
    avatar, avatarStack, statusPill,
    toast, openModal, closeModal,
    openJobPanel, closeJobPanel, renderPanel,
    get panelJobId() { return panelJobId; },
  };
})();
