/* ============================================================
   Crafty Central — Job Brief
   A full-page, read-first call sheet for one job, one day at a
   time: call-time hero, fact tiles, then Menu · Crew · Dietary.
   Everyone can view it; editing stays on the job sheet panel.
   ============================================================ */

window.Views = window.Views || {};

Views.brief = (() => {
  let jobId = null;
  let dayIdx = 0;

  function setJob(id, date) {
    jobId = id;
    const j = Store.job(id);
    dayIdx = (date && j) ? Math.max(0, j.shootDays.indexOf(date)) : 0;
  }

  function render(el) {
    const j = jobId && Store.job(jobId);
    if (!j) {
      el.innerHTML = `<div class="empty view-enter">${ICONS.doc}
        <div class="e-title">No job selected</div>
        <div class="e-sub">Open any job from the calendar and tap "Job brief".</div></div>`;
      return;
    }
    if (dayIdx >= j.shootDays.length) dayIdx = 0;
    const date = j.shootDays[dayIdx] || Store.todayISO();
    const multi = j.shootDays.length > 1;
    const dv = (f) => Store.dayVal(j, date, f);
    const di = (j.dayInfo && j.dayInfo[date]) || {};
    const menu = Store.menuFor(j, date);
    const crew = Store.crewFor(j, date);
    const canEdit = Store.can('editJob');

    /* dietary: the day's truck crew with restrictions + every on-set
       person on file (the people we feed) */
    const crewDiet = crew.map(c => Store.person(c.personId))
      .filter(p => p && (p.dietary || []).length)
      .map(p => ({ name: p.name, role: 'Crafty · ' + (p.position || 'crew'), diet: p.dietary.join(', '), severe: p.dietary.some(d => /severe|allerg/i.test(d)) }));
    const setDiet = Store.get().setCrew
      .filter(c => (c.dietary || []).length || c.notes)
      .map(c => ({ name: c.name, role: c.position || 'on set', diet: [(c.dietary || []).join(', '), c.notes].filter(Boolean).join(' — '), severe: (c.dietary || []).some(d => /allerg/i.test(d)) || /severe/i.test(c.notes || '') }));
    const dietary = [...crewDiet, ...setDiet];

    const gaps = [];
    if (!crew.length) gaps.push(multi ? `No crew booked for Day ${dayIdx + 1} yet.` : 'No crew booked yet.');
    if (!menu.length) gaps.push(multi ? `Day ${dayIdx + 1}'s menu is still unset.` : 'The menu is still unset.');
    if (!dv('location')) gaps.push('No location on the sheet.');

    el.innerHTML = `
      <div class="view-enter brief">
        <div class="brief-topline">
          <button class="btn sm" id="briefBackBtn">${ICONS.chevLeft} Back</button>
          ${multi ? `
          <div class="day-tabs brief-days">
            ${j.shootDays.map((d, i) => `
              <button class="seg ${i === dayIdx ? 'active' : ''}" data-brief-day="${i}">
                Day ${i + 1} <span class="seg-sub">${UI.fmtShort(d)}</span>
              </button>`).join('')}
          </div>` : ''}
          ${canEdit ? `<button class="btn sm" id="briefEditBtn">${ICONS.edit} Open job sheet</button>` : '<span></span>'}
        </div>

        <div class="brief-hero">
          <div class="bh-kicker">Job brief · ${UI.esc(UI.fmtLong(date))}${multi ? ` · Day ${dayIdx + 1} of ${j.shootDays.length}` : ''}</div>
          <div class="bh-call">
            <span class="bh-time">${UI.fmtTime12(dv('callTime'))}</span>
            <span class="bh-call-label">call</span>
          </div>
          <div class="bh-name">${UI.esc(j.productionName)}</div>
          <div class="bh-sub">${UI.esc(dv('location') || 'Location TBC')} · ${dv('headcount') || '—'} on set · wrap ${UI.fmtTime12(dv('wrapTime'))} est.</div>
          ${di.notes ? `<div class="bh-note">${ICONS.note} ${UI.esc(di.notes)}</div>` : ''}
        </div>

        <div class="brief-tiles">
          <div class="fact"><div class="f-label">Production co.</div><div class="f-value">${UI.esc(j.productionCompany)}</div></div>
          <div class="fact"><div class="f-label">PM</div><div class="f-value">${UI.esc(j.pm || '—')}</div></div>
          <div class="fact"><div class="f-label">Producer${(j.producers || '').includes(',') ? 's' : ''}</div><div class="f-value">${UI.esc(j.producers || '—')}</div></div>
          <div class="fact"><div class="f-label">Status</div><div class="f-value">${UI.statusPill(j.status)}</div></div>
        </div>

        <div class="brief-cols">
          <div class="brief-card">
            <div class="bc-title">Menu${multi ? ` — Day ${dayIdx + 1}` : ''}</div>
            ${menu.length ? `<div class="bc-list">
              ${menu.map(m => `<span class="bc-pill">${UI.esc(m)}</span>`).join('')}
            </div>` : `<p class="bc-empty">Nothing set yet${canEdit ? ' — build it on the job sheet' : ''}.</p>`}
          </div>

          <div class="brief-card">
            <div class="bc-title">Crew on the truck</div>
            ${crew.length ? `<div class="bc-rows">
              ${crew.map(c => {
                const p = Store.person(c.personId);
                if (!p) return '';
                return `<span class="bc-row">${UI.avatar(p, 'sm')}<b>${UI.esc(p.name)}</b><span class="bc-role">${UI.esc(c.role)}</span></span>`;
              }).join('')}
            </div>` : `<p class="bc-empty">Nobody booked${multi ? ' for this day' : ''} yet.</p>`}
          </div>

          <div class="brief-card">
            <div class="bc-title">Watch the plates</div>
            ${dietary.length ? `<div class="bc-diet">
              ${dietary.map(d => `
                <span class="bc-diet-row ${d.severe ? 'severe' : ''}"><b>${UI.esc(d.name)}</b> · ${UI.esc(d.role)} — ${UI.esc(d.diet)}</span>`).join('')}
            </div>` : '<p class="bc-empty">No dietary flags on file.</p>'}
          </div>
        </div>

        ${j.notes ? `
        <div class="brief-card brief-notes">
          <div class="bc-title">Job notes</div>
          <p class="bc-body">${UI.esc(j.notes)}</p>
        </div>` : ''}

        ${gaps.length ? `
        <div class="brief-gaps">
          ${ICONS.alert}
          <span>${gaps.map(g => UI.esc(g)).join(' ')}</span>
        </div>` : ''}
      </div>`;

    el.querySelector('#briefBackBtn').onclick = () => {
      App.go(Store.can('createJob') ? 'dashboard' : 'schedule');
    };
    const editBtn = el.querySelector('#briefEditBtn');
    if (editBtn) editBtn.onclick = () => {
      App.go('calendar');
      UI.openJobPanel(j.id, date);
    };
    el.querySelectorAll('[data-brief-day]').forEach(b => {
      b.onclick = () => { dayIdx = +b.dataset.briefDay; render(el); };
    });
  }

  return { render, setJob, title: 'Job Brief' };
})();
