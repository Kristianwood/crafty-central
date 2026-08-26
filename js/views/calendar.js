/* ============================================================
   Crafty Central — Calendar (the central hub)
   Month grid; jobs land on their shoot days; click a job to
   open the side panel with missing-info dropdowns on top.
   ============================================================ */

window.Views = window.Views || {};

Views.calendar = (() => {
  let cursor = null; // {y, m}

  function render(el) {
    const now = new Date();
    if (!cursor) cursor = { y: now.getFullYear(), m: now.getMonth() };

    const first = new Date(cursor.y, cursor.m, 1);
    const label = first.toLocaleDateString('en-CA', { month: 'long' });
    const T = Store.todayISO();
    const jobs = Store.visibleJobs();
    const timeOff = Store.get().timeOff.filter(t => t.status === 'approved');
    const canSeeTO = Store.can('approveTimeOff');

    // grid: start Sunday
    const startOffset = first.getDay();
    const gridStart = new Date(cursor.y, cursor.m, 1 - startOffset);
    const cells = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      cells.push(d);
    }
    // trim trailing empty week
    const weeks = cells.length / 7;
    const lastWeekHasMonth = cells.slice(35).some(d => d.getMonth() === cursor.m);
    const shown = lastWeekHasMonth ? cells : cells.slice(0, 35);

    const dows = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    el.innerHTML = `
      <div class="view-enter cal-shell">
        <div class="cal-head">
          <div class="cal-month">${label} <span class="yr">${cursor.y}</span></div>
          <div class="cal-nav">
            <button class="icon-btn" id="calPrev" aria-label="Previous month">${ICONS.chevLeft}</button>
            <button class="btn sm" id="calToday">Today</button>
            <button class="icon-btn" id="calNext" aria-label="Next month">${ICONS.chevRight}</button>
            ${Store.can('createJob') ? `<button class="btn primary" id="calNewJob" style="margin-left:8px">${ICONS.plus} New job</button>` : ''}
          </div>
        </div>

        <div class="cal-grid">
          ${dows.map(d => `<div class="cal-dow">${d}</div>`).join('')}
          ${shown.map(d => {
            const dISO = Store.iso(d);
            const other = d.getMonth() !== cursor.m;
            const dayJobs = jobs.filter(j => j.shootDays.includes(dISO));
            const dayTO = canSeeTO ? timeOff.filter(t => dISO >= t.start && dISO <= t.end) : [];
            return `
            <div class="cal-cell ${other ? 'other' : ''} ${dISO === T ? 'today' : ''}">
              <span class="c-num">${d.getDate()}</span>
              ${dayJobs.map(j => {
                const miss = Store.missing(j).length;
                return `<button class="cal-job ${j.status}" data-job="${j.id}" title="${UI.esc(j.productionName)}">${miss ? '<span class="cj-miss"></span>' : ''}${UI.esc(j.productionName)}</button>`;
              }).join('')}
              ${dayTO.map(t => {
                const p = Store.person(t.personId);
                return `<span class="cal-job timeoff" title="${UI.esc(p.name)} — time off">${UI.esc(p.name.split(' ')[0])} off</span>`;
              }).join('')}
            </div>`;
          }).join('')}
        </div>

        <div class="cal-legend">
          <span class="lg-item"><span class="lg-swatch" style="background:var(--accent)"></span>Confirmed</span>
          <span class="lg-item"><span class="lg-swatch" style="background:var(--amber)"></span>Hold</span>
          <span class="lg-item"><span class="lg-swatch" style="background:var(--blue)"></span>Wrapped</span>
          ${canSeeTO ? '<span class="lg-item"><span class="lg-swatch" style="background:var(--ink-3)"></span>Approved time off</span>' : ''}
          <span class="lg-item"><span class="cj-miss" style="position:static;display:inline-block"></span>Missing info</span>
        </div>
      </div>`;

    el.querySelector('#calPrev').onclick = () => { shift(-1); render(el); };
    el.querySelector('#calNext').onclick = () => { shift(1); render(el); };
    el.querySelector('#calToday').onclick = () => { cursor = null; render(el); };
    const nj = el.querySelector('#calNewJob');
    if (nj) nj.onclick = () => Views.dashboard.openJobForm();

    el.querySelectorAll('[data-job]').forEach(b => {
      b.onclick = () => UI.openJobPanel(b.dataset.job);
    });
  }

  function shift(n) {
    cursor.m += n;
    if (cursor.m < 0) { cursor.m = 11; cursor.y--; }
    if (cursor.m > 11) { cursor.m = 0; cursor.y++; }
  }

  return { render, title: 'Calendar' };
})();
