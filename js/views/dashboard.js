/* ============================================================
   Crafty Central — Dashboard (admin/moderator home)
   Stats, upcoming jobs needing attention, job creation form.
   ============================================================ */

window.Views = window.Views || {};

Views.dashboard = (() => {

  function render(el) {
    const T = Store.todayISO();
    const jobs = Store.visibleJobs();
    const upcoming = jobs
      .filter(j => j.shootDays[j.shootDays.length - 1] >= T)
      .sort((a, b) => a.shootDays[0].localeCompare(b.shootDays[0]));
    const needsAttention = upcoming.filter(j => Store.missing(j).length);
    const next7 = jobs.filter(j => j.shootDays.some(d => d >= T && d <= Store.addDays(T, 6)));
    const headcount7 = next7.reduce((s, j) => s + j.headcount * j.shootDays.filter(d => d >= T && d <= Store.addDays(T, 6)).length, 0);
    const pendingTO = Store.get().timeOff.filter(t => t.status === 'pending');
    const pipeline = jobs.filter(j => j.status === 'estimate' || j.status === 'confirmed')
      .reduce((s, j) => s + Store.jobSubtotal(j), 0);

    el.innerHTML = `
      <div class="view-enter">
        <div class="stat-row stagger">
          <div class="stat-cell" style="--i:0">
            <div class="stat-label">Jobs this week</div>
            <div class="stat-value">${next7.length}</div>
            <div class="stat-sub">${upcoming.length} upcoming total</div>
          </div>
          <div class="stat-cell" style="--i:1">
            <div class="stat-label">Meals to plan · 7 days</div>
            <div class="stat-value">${headcount7}<span class="unit">covers</span></div>
            <div class="stat-sub">across confirmed shoot days</div>
          </div>
          <div class="stat-cell" style="--i:2">
            <div class="stat-label">Needs attention</div>
            <div class="stat-value" style="${needsAttention.length ? 'color:var(--red)' : ''}">${needsAttention.length}</div>
            <div class="stat-sub">jobs with missing info</div>
          </div>
          ${Store.can('finances') ? `
          <div class="stat-cell" style="--i:3">
            <div class="stat-label">Open pipeline</div>
            <div class="stat-value">${UI.fmtMoney(pipeline).replace('.00', '')}</div>
            <div class="stat-sub up">estimates + confirmed</div>
          </div>` : `
          <div class="stat-cell" style="--i:3">
            <div class="stat-label">Time-off requests</div>
            <div class="stat-value">${pendingTO.length}</div>
            <div class="stat-sub">awaiting review</div>
          </div>`}
        </div>

        <div class="section-head">
          <div>
            <div class="section-title">Upcoming jobs</div>
            <div class="section-hint">Click a job to open the full sheet — red dot means something is missing.</div>
          </div>
          ${Store.can('createJob') ? `<button class="btn primary" id="newJobBtn">${ICONS.plus} New job</button>` : ''}
        </div>

        ${upcoming.length ? `<div class="job-strip stagger">${upcoming.map((j, i) => jobRow(j, i)).join('')}</div>` : `
          <div class="empty">
            ${ICONS.truck}
            <div class="e-title">No upcoming jobs</div>
            <div class="e-sub">${Store.can('createJob') ? 'Create the first job to get it on the calendar.' : 'Nothing scheduled for you yet.'}</div>
            ${Store.can('createJob') && !Store.get().jobs.length ? `
            <div style="display:flex;gap:8px;justify-content:center;margin-top:16px">
              <button class="btn primary" id="emptyNewJobBtn">${ICONS.plus} New job</button>
              <button class="btn" id="emptySampleBtn">${ICONS.briefcase} Load sample data</button>
            </div>
            <div class="e-sub" style="margin-top:10px">Sample data fills the calendar, finances, and chat with three demo jobs so you can try every feature — delete them anytime.</div>` : ''}
          </div>`}

        ${pendingTO.length && Store.can('approveTimeOff') ? `
        <div class="section-head">
          <div class="section-title">Time-off requests</div>
          <div class="section-hint">Approve or deny — the crew member is notified either way.</div>
        </div>
        <div class="timeoff-card">${pendingTO.map(toRow).join('')}</div>` : ''}

        ${Store.can('assignCrew') ? crewWorkloadSection() : ''}
      </div>`;

    const newBtn = el.querySelector('#newJobBtn');
    if (newBtn) newBtn.onclick = () => openJobForm();
    const emptyNew = el.querySelector('#emptyNewJobBtn');
    if (emptyNew) emptyNew.onclick = () => openJobForm();
    const sampleBtn = el.querySelector('#emptySampleBtn');
    if (sampleBtn) sampleBtn.onclick = () => {
      Store.loadSampleData();
      UI.toast('Sample data loaded — check the calendar and finances', 'check');
      App.refreshView(); App.refreshBadges();
    };

    el.querySelectorAll('[data-open-job]').forEach(r => {
      r.onclick = () => UI.openJobPanel(r.dataset.openJob);
    });
    el.querySelectorAll('[data-to-approve]').forEach(b => b.onclick = (e) => {
      e.stopPropagation();
      Store.resolveTimeOff(b.dataset.toApprove, 'approved');
      UI.toast('Time off approved', 'check'); App.refreshView(); App.refreshBadges();
    });
    el.querySelectorAll('[data-to-deny]').forEach(b => b.onclick = (e) => {
      e.stopPropagation();
      Store.resolveTimeOff(b.dataset.toDeny, 'denied');
      UI.toast('Time off denied', 'x'); App.refreshView(); App.refreshBadges();
    });
    el.querySelectorAll('[data-person-sched]').forEach(r => {
      r.onclick = () => openPersonSchedule(r.dataset.personSched);
    });
  }

  /* ============ Crew workload (moderators + admins) ============ */

  function crewWorkloadSection() {
    const people = Store.get().people.slice()
      .sort((a, b) => Store.personUpcomingDays(b.id) - Store.personUpcomingDays(a.id) || a.name.localeCompare(b.name));
    return `
      <div class="section-head">
        <div>
          <div class="section-title">Crew workload</div>
          <div class="section-hint">Booked days from today onward — click anyone to see their schedule.</div>
        </div>
      </div>
      <div class="workload-list">
        ${people.map(p => {
          const days = Store.personUpcomingDays(p.id);
          const nextJob = Store.personJobs(p.id).find(j => j.shootDays.some(d => d >= Store.todayISO()));
          const nextDay = nextJob ? nextJob.shootDays.find(d => d >= Store.todayISO()) : null;
          return `
          <div class="workload-row" data-person-sched="${p.id}">
            ${UI.avatar(p, 'sm')}
            <div class="wl-main">
              <span class="wl-name">${UI.esc(p.name)}</span>
              <span class="wl-tags">${(p.tags || []).map(t => `<span class="crew-role-tag">${UI.esc(t)}</span>`).join('')}</span>
            </div>
            <div class="wl-days ${days ? '' : 'zero'}">
              <span class="wl-count">${days}</span>
              <span class="wl-unit">day${days === 1 ? '' : 's'}</span>
            </div>
            <span class="wl-next">${nextDay ? 'next ' + UI.fmtShort(nextDay) : 'nothing booked'}</span>
          </div>`;
        }).join('')}
      </div>`;
  }

  /* Person schedule modal: list view or mini calendar view */
  let schedView = 'list';
  let schedCursor = null; // {y, m} for the mini calendar

  function openPersonSchedule(personId) {
    schedView = 'list';
    schedCursor = null;
    renderPersonSchedule(personId);
  }

  function renderPersonSchedule(personId) {
    const p = Store.person(personId);
    if (!p) return;
    const T = Store.todayISO();
    const days = Store.personUpcomingDays(personId);

    UI.openModal(`
      <div class="modal-head">
        <div style="display:flex;align-items:center;gap:12px">
          ${UI.avatar(p, 'lg')}
          <div>
            <div class="modal-title">${UI.esc(p.name)}</div>
            <div class="modal-sub">${UI.esc(p.position)} · ${(p.tags || []).join(', ')} · <span style="font-family:var(--mono)">${days}</span> upcoming day${days === 1 ? '' : 's'}</div>
          </div>
        </div>
        <button class="panel-close" id="modalCloseBtn" aria-label="Close">${ICONS.x}</button>
      </div>

      <div class="seg-toggle" role="tablist">
        <button class="seg ${schedView === 'list' ? 'active' : ''}" data-sched-view="list">${ICONS.note} List</button>
        <button class="seg ${schedView === 'cal' ? 'active' : ''}" data-sched-view="cal">${ICONS.calendar} Calendar</button>
      </div>

      <div id="schedBody">${schedView === 'list' ? schedListHTML(p) : schedCalHTML(p)}</div>
    `);

    const modal = document.getElementById('modal');
    modal.querySelector('#modalCloseBtn').onclick = UI.closeModal;
    modal.querySelectorAll('[data-sched-view]').forEach(b => b.onclick = () => {
      schedView = b.dataset.schedView;
      renderPersonSchedule(personId);
    });
    modal.querySelectorAll('[data-open-job]').forEach(r => r.onclick = () => {
      UI.closeModal();
      UI.openJobPanel(r.dataset.openJob);
    });
    const prev = modal.querySelector('#miniPrev'), next = modal.querySelector('#miniNext');
    if (prev) prev.onclick = () => { shiftMini(-1); renderPersonSchedule(personId); };
    if (next) next.onclick = () => { shiftMini(1); renderPersonSchedule(personId); };
  }

  function schedListHTML(p) {
    const T = Store.todayISO();
    const jobs = Store.personJobs(p.id);
    const roleOn = (j) => (j.crew.find(c => c.personId === p.id) || {}).role || '';
    const upcoming = jobs.filter(j => j.shootDays[j.shootDays.length - 1] >= T);
    const past = jobs.filter(j => j.shootDays[j.shootDays.length - 1] < T).reverse();
    const offs = Store.get().timeOff.filter(t => t.personId === p.id && t.status === 'approved' && t.end >= T);

    const row = (j) => `
      <div class="sched-mini-row" data-open-job="${j.id}">
        <span class="smr-dates">${UI.esc(UI.fmtRange(j.shootDays[0], j.shootDays[j.shootDays.length - 1]))}</span>
        <div class="smr-main">
          <span class="smr-name">${UI.esc(j.productionName)}</span>
          <span class="smr-sub">Call ${UI.fmtTime12(j.callTime)} · ${UI.esc((j.location || '—').split(',')[0])}</span>
        </div>
        <span class="crew-role-tag">${UI.esc(roleOn(j))}</span>
        ${UI.statusPill(j.status)}
      </div>`;

    if (!upcoming.length && !past.length && !offs.length) {
      return `<div class="empty" style="margin-top:14px">${ICONS.schedule}
        <div class="e-title">Nothing booked</div>
        <div class="e-sub">Assign them to a job from the calendar to fill this in.</div></div>`;
    }
    return `
      ${offs.length ? `<div class="sched-off-note">${ICONS.palm} Time off: ${offs.map(t => UI.fmtRange(t.start, t.end)).join(' · ')}</div>` : ''}
      ${upcoming.length ? upcoming.map(row).join('') : '<p style="font-size:13px;color:var(--ink-3);padding:14px 2px 6px">Nothing upcoming.</p>'}
      ${past.length ? `<div class="sched-past-label">Past</div>${past.slice(0, 5).map(row).join('')}` : ''}
    `;
  }

  function shiftMini(n) {
    schedCursor.m += n;
    if (schedCursor.m < 0) { schedCursor.m = 11; schedCursor.y--; }
    if (schedCursor.m > 11) { schedCursor.m = 0; schedCursor.y++; }
  }

  function schedCalHTML(p) {
    const now = new Date();
    if (!schedCursor) schedCursor = { y: now.getFullYear(), m: now.getMonth() };
    const T = Store.todayISO();
    const booked = Store.personBookedDays(p.id);
    const offs = Store.get().timeOff.filter(t => t.personId === p.id && t.status === 'approved');
    const isOff = (d) => offs.some(t => d >= t.start && d <= t.end);

    const first = new Date(schedCursor.y, schedCursor.m, 1);
    const label = first.toLocaleDateString('en-CA', { month: 'long', year: 'numeric' });
    const gridStart = new Date(schedCursor.y, schedCursor.m, 1 - first.getDay());
    const cells = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      cells.push(d);
    }
    const shown = cells.slice(35).some(d => d.getMonth() === schedCursor.m) ? cells : cells.slice(0, 35);

    return `
      <div class="mini-cal-head">
        <span class="mini-cal-label">${label}</span>
        <span style="display:flex;gap:6px">
          <button class="icon-btn" id="miniPrev" aria-label="Previous month" style="width:28px;height:28px">${ICONS.chevLeft}</button>
          <button class="icon-btn" id="miniNext" aria-label="Next month" style="width:28px;height:28px">${ICONS.chevRight}</button>
        </span>
      </div>
      <div class="mini-cal">
        ${['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(d => `<span class="mc-dow">${d}</span>`).join('')}
        ${shown.map(d => {
          const dISO = Store.iso(d);
          const other = d.getMonth() !== schedCursor.m;
          const j = booked[dISO];
          const off = isOff(dISO);
          const cls = ['mc-day', other ? 'other' : '', dISO === T ? 'today' : '', j ? 'booked' : '', off ? 'off' : ''].join(' ');
          const title = j ? j.productionName : (off ? 'Time off' : '');
          return `<span class="${cls}" ${title ? `title="${UI.esc(title)}"` : ''}>${d.getDate()}</span>`;
        }).join('')}
      </div>
      <div class="cal-legend" style="margin-top:10px">
        <span class="lg-item"><span class="lg-swatch" style="background:var(--accent)"></span>Booked</span>
        <span class="lg-item"><span class="lg-swatch" style="background:var(--ink-3)"></span>Time off</span>
      </div>`;
  }

  function jobRow(j, i) {
    const first = j.shootDays[0];
    const d = new Date(first + 'T00:00:00');
    const miss = Store.missing(j);
    return `
      <div class="job-row" data-open-job="${j.id}" style="--i:${i}">
        <div class="job-date">
          <span class="d-mon">${d.toLocaleDateString('en-CA', { month: 'short' })}</span>
          <span class="d-day">${d.getDate()}</span>
          <span class="d-wk">${d.toLocaleDateString('en-CA', { weekday: 'short' })}${j.shootDays.length > 1 ? ` +${j.shootDays.length - 1}` : ''}</span>
        </div>
        <div class="job-main">
          <div class="job-name">${UI.esc(j.productionName)}
            ${miss.length ? `<span class="missing-chip">${ICONS.alert}${miss.length} missing</span>` : ''}
          </div>
          <div class="job-meta">
            <span>${ICONS.briefcase}${UI.esc(j.productionCompany)}</span>
            <span>${ICONS.people}${j.headcount} on set</span>
            <span>${ICONS.pin}${UI.esc((j.location || '—').split(',')[0])}</span>
          </div>
        </div>
        <div class="job-side">
          ${j.crew.length ? UI.avatarStack(Store.crewIds(j)) : ''}
          ${UI.statusPill(j.status)}
        </div>
      </div>`;
  }

  function toRow(t) {
    const p = Store.person(t.personId);
    return `
      <div class="to-item">
        <div style="display:flex;align-items:center;gap:10px">
          ${UI.avatar(p, 'sm')}
          <div>
            <div style="font-weight:600">${UI.esc(p.name)}</div>
            <div class="to-reason">${UI.esc(t.reason || 'No reason given')}</div>
          </div>
        </div>
        <span class="to-dates">${UI.fmtRange(t.start, t.end)}</span>
        <div class="to-actions">
          <button class="btn sm" data-to-approve="${t.id}">${ICONS.check} Approve</button>
          <button class="btn sm danger" data-to-deny="${t.id}">Deny</button>
        </div>
      </div>`;
  }

  /* ============ Job create/edit form (modal) ============ */

  function openJobForm(jobId) {
    const j = jobId ? Store.job(jobId) : null;
    const s = Store.get().settings;
    let days = j ? j.shootDays.slice() : [];

    UI.openModal(`
      <div class="modal-head">
        <div>
          <div class="modal-title">${j ? 'Edit job' : 'New job'}</div>
          <div class="modal-sub">${j ? UI.esc(j.productionName) : 'It lands on the calendar the moment you save.'}</div>
        </div>
        <button class="panel-close" id="modalCloseBtn" aria-label="Close">${ICONS.x}</button>
      </div>
      <form id="jobForm" novalidate>
        <div class="form-grid">
          <div class="field wide" data-f="productionName">
            <label>Production name</label>
            <input type="text" name="productionName" value="${UI.esc(j?.productionName || '')}" placeholder='e.g. Maple &amp; Rye "First Pour"'>
            <span class="err">Give the production a name.</span>
          </div>
          <div class="field" data-f="productionCompany">
            <label>Production company</label>
            <input type="text" name="productionCompany" value="${UI.esc(j?.productionCompany || '')}" placeholder="Who's producing" list="companyOptions" autocomplete="off">
            <datalist id="companyOptions">
              ${Store.get().companies.map(c => `<option value="${UI.esc(c.name)}"></option>`).join('')}
            </datalist>
            <span class="hint">Pick a company from the directory and its billing address flows onto the invoice.</span>
            <span class="err">Required.</span>
          </div>
          <div class="field">
            <label>Agency <span style="font-weight:400;color:var(--ink-3)">(optional)</span></label>
            <input type="text" name="agency" value="${UI.esc(j?.agency || '')}">
          </div>
          <div class="field">
            <label>Production manager</label>
            <input type="text" name="pm" value="${UI.esc(j?.pm || '')}" placeholder="PM's name">
          </div>
          <div class="field">
            <label>Producer(s)</label>
            <input type="text" name="producers" value="${UI.esc(j?.producers || '')}" placeholder="Comma-separated if several">
          </div>
          <div class="field" data-f="headcount">
            <label>People on set</label>
            <input type="number" name="headcount" min="1" value="${j?.headcount || ''}" placeholder="e.g. 45">
            <span class="err">How many mouths to feed?</span>
          </div>
          <div class="field">
            <label>Status</label>
            <select name="status">
              ${['estimate', 'confirmed', 'wrapped'].map(o => `<option value="${o}" ${j?.status === o ? 'selected' : ''}>${o[0].toUpperCase() + o.slice(1)}</option>`).join('')}
            </select>
          </div>
          <div class="field wide" data-f="days">
            <label>Shoot days</label>
            <div style="display:flex;gap:8px">
              <input type="date" id="dayPicker" style="flex:1">
              <button type="button" class="btn" id="dayAddBtn">${ICONS.plus} Add day</button>
            </div>
            <div class="day-chips" id="dayChips" style="margin-top:8px"></div>
            <span class="err">Add at least one shoot day.</span>
          </div>
          <div class="field" >
            <label>Call time</label>
            <input type="time" name="callTime" value="${j?.callTime || '07:00'}">
          </div>
          <div class="field">
            <label>Wrap (est.)</label>
            <input type="time" name="wrapTime" value="${j?.wrapTime || '19:00'}">
          </div>
          <div class="field wide">
            <label>Location</label>
            <input type="text" name="location" value="${UI.esc(j?.location || '')}" placeholder="Studio / address">
          </div>
          <div class="field" data-f="perHead">
            <label>Rate per head / day</label>
            <input type="number" name="perHead" min="0" step="0.5" value="${j?.rates?.perHead ?? s.perHeadDefault}">
          </div>
          <div class="field">
            <label>Truck day rate</label>
            <input type="number" name="truckDay" min="0" step="25" value="${j?.rates?.truckDay ?? s.truckDayDefault}">
          </div>
          <div class="field wide">
            <label>Notes</label>
            <textarea name="notes" placeholder="Allergies on the client side, load-in quirks, power, parking…">${UI.esc(j?.notes || '')}</textarea>
          </div>
        </div>
        <div class="modal-foot">
          <button type="button" class="btn" id="modalCancelBtn">Cancel</button>
          <button type="submit" class="btn primary">${j ? 'Save changes' : 'Create job'}</button>
        </div>
      </form>
    `);

    const modal = document.getElementById('modal');
    const renderChips = () => {
      days.sort();
      modal.querySelector('#dayChips').innerHTML = days.length
        ? days.map((d, i) => `<span class="day-chip">${UI.fmtLong(d)}<button type="button" data-day-del="${i}" aria-label="Remove day">${ICONS.x}</button></span>`).join('')
        : '<span style="font-size:12px;color:var(--ink-3)">No days added yet.</span>';
      modal.querySelectorAll('[data-day-del]').forEach(b => b.onclick = () => { days.splice(+b.dataset.dayDel, 1); renderChips(); });
    };
    renderChips();

    modal.querySelector('#modalCloseBtn').onclick = UI.closeModal;
    modal.querySelector('#modalCancelBtn').onclick = UI.closeModal;
    modal.querySelector('#dayAddBtn').onclick = () => {
      const v = modal.querySelector('#dayPicker').value;
      if (v && !days.includes(v)) { days.push(v); renderChips(); }
    };
    // convenience: pressing enter in the date field adds the day
    modal.querySelector('#dayPicker').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); modal.querySelector('#dayAddBtn').click(); }
    });

    modal.querySelector('#jobForm').onsubmit = (e) => {
      e.preventDefault();
      const f = e.target;
      const val = (n) => f.elements[n].value.trim();
      let ok = true;
      const need = (name, cond) => {
        const field = modal.querySelector(`[data-f="${name}"]`);
        if (field) field.classList.toggle('invalid', !cond);
        if (!cond) ok = false;
      };
      need('productionName', !!val('productionName'));
      need('productionCompany', !!val('productionCompany'));
      need('headcount', +val('headcount') > 0);
      need('days', days.length > 0);
      if (!ok) return;

      const data = {
        id: j?.id,
        productionName: val('productionName'),
        productionCompany: val('productionCompany'),
        agency: val('agency'),
        pm: val('pm'),
        producers: val('producers'),
        headcount: +val('headcount'),
        status: val('status'),
        shootDays: days.slice(),
        callTime: val('callTime'),
        wrapTime: val('wrapTime'),
        location: val('location'),
        rates: { perHead: +val('perHead') || 0, truckDay: +val('truckDay') || 0 },
        notes: val('notes'),
        crew: j?.crew || [],
        menu: j?.menu || [],
      };
      Store.upsertJob(data);
      UI.closeModal();
      UI.toast(j ? 'Job updated' : 'Job created — it is on the calendar', 'check');
      App.refreshView(); App.refreshBadges();
      if (UI.panelJobId) UI.renderPanel();
    };
  }

  return { render, openJobForm, title: 'Dashboard' };
})();
