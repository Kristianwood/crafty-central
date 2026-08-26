/* ============================================================
   Crafty Central — My Schedule
   The crew's own view: just their jobs, plus time-off requests
   that notify the moderators.
   ============================================================ */

window.Views = window.Views || {};

Views.schedule = (() => {

  function render(el) {
    const meP = Store.me();
    const T = Store.todayISO();
    const mine = Store.get().jobs
      .filter(j => Store.crewIds(j).includes(meP.id))
      .sort((a, b) => a.shootDays[0].localeCompare(b.shootDays[0]));
    const upcoming = mine.filter(j => j.shootDays[j.shootDays.length - 1] >= T);
    const past = mine.filter(j => j.shootDays[j.shootDays.length - 1] < T).reverse();
    const myTO = Store.get().timeOff.filter(t => t.personId === meP.id).slice().reverse();

    el.innerHTML = `
      <div class="view-enter sched-split">
        <div>
          <div class="section-head">
            <div>
              <div class="section-title">Your upcoming jobs</div>
              <div class="section-hint">Call times and locations for everything you're booked on.</div>
            </div>
          </div>
          ${upcoming.length ? `<div class="job-strip stagger">${upcoming.map((j, i) => myJobRow(j, i)).join('')}</div>` : `
            <div class="empty">
              ${ICONS.schedule}
              <div class="e-title">Nothing booked yet</div>
              <div class="e-sub">When a moderator adds you to a job, it shows up here and you get a notification.</div>
            </div>`}

          ${past.length ? `
          <div class="section-head"><div class="section-title">Recent</div></div>
          <div class="job-strip" style="opacity:.62">${past.slice(0, 4).map((j, i) => myJobRow(j, i)).join('')}</div>` : ''}
        </div>

        <div class="timeoff-card">
          <h3>Time off</h3>
          <div class="tc-sub">Requests go straight to the moderators — you'll hear back in your notifications.</div>
          <form id="toForm">
            <div class="field">
              <label>First day off</label>
              <input type="date" name="start" required min="${T}">
            </div>
            <div class="field">
              <label>Last day off</label>
              <input type="date" name="end" min="${T}">
              <span class="hint">Leave blank for a single day.</span>
            </div>
            <div class="field">
              <label>Reason <span style="font-weight:400;color:var(--ink-3)">(optional)</span></label>
              <input type="text" name="reason" placeholder="e.g. out of town">
            </div>
            <button class="btn primary" type="submit" style="width:100%;justify-content:center">${ICONS.send} Request time off</button>
          </form>

          ${myTO.length ? `
          <div style="margin-top:18px;border-top:1px solid var(--line-soft);padding-top:8px">
            ${myTO.map(t => `
              <div class="to-item">
                <span class="to-dates">${UI.fmtRange(t.start, t.end)}</span>
                <span class="to-reason">${UI.esc(t.reason || '')}</span>
                <span class="pill ${t.status}">${t.status}</span>
              </div>`).join('')}
          </div>` : ''}
        </div>
      </div>`;

    el.querySelectorAll('[data-open-job]').forEach(r => {
      r.onclick = () => UI.openJobPanel(r.dataset.openJob);
    });

    el.querySelector('#toForm').onsubmit = (e) => {
      e.preventDefault();
      const f = e.target;
      const start = f.elements.start.value;
      let end = f.elements.end.value || start;
      if (!start) return;
      if (end < start) end = start;
      Store.requestTimeOff(start, end, f.elements.reason.value.trim());
      UI.toast('Request sent to the moderators', 'send');
      App.refreshView(); App.refreshBadges();
    };
  }

  function myJobRow(j, i) {
    const first = j.shootDays.find(d => d >= Store.todayISO()) || j.shootDays[0];
    const d = new Date(first + 'T00:00:00');
    const myRole = (j.crew.find(c => c.personId === Store.me().id) || {}).role;
    return `
      <div class="job-row" data-open-job="${j.id}" style="--i:${i}">
        <div class="job-date">
          <span class="d-mon">${d.toLocaleDateString('en-CA', { month: 'short' })}</span>
          <span class="d-day">${d.getDate()}</span>
          <span class="d-wk">${d.toLocaleDateString('en-CA', { weekday: 'short' })}${j.shootDays.length > 1 ? ` +${j.shootDays.length - 1}` : ''}</span>
        </div>
        <div class="job-main">
          <div class="job-name">${UI.esc(j.productionName)}${myRole ? ` <span class="crew-role-tag">${UI.esc(myRole)}</span>` : ''}</div>
          <div class="job-meta">
            <span>${ICONS.clock}Call ${UI.fmtTime12(j.callTime)}</span>
            <span>${ICONS.pin}${UI.esc((j.location || '—').split(',')[0])}</span>
            <span>${ICONS.people}${j.headcount} on set</span>
          </div>
        </div>
        <div class="job-side">${UI.statusPill(j.status)}</div>
      </div>`;
  }

  return { render, title: 'My Schedule' };
})();
