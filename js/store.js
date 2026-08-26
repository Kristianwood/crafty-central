/* ============================================================
   Crafty Central — store.js
   Single data layer with two modes behind one API:
   - local: everything in localStorage (demo / no Firebase config)
   - cloud: Firebase Auth + Firestore. Live snapshots keep the
     in-memory state synced for everyone; mutations mutate local
     state optimistically and write through to Firestore.
   Per-device things (which chats/notifications you've read)
   always stay in localStorage.
   ============================================================ */

const Store = (() => {
  const KEY = 'crafty-central-v1';
  const READ_KEY = 'crafty-central-reads';
  const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);

  /* ---------- date helpers ---------- */
  const iso = (d) => {
    const x = d instanceof Date ? d : new Date(d + 'T00:00:00');
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  };
  const todayISO = () => iso(new Date());
  const addDays = (isoStr, n) => {
    const d = new Date(isoStr + 'T00:00:00');
    d.setDate(d.getDate() + n);
    return iso(d);
  };

  const DEFAULT_SETTINGS = { quietStart: 7, quietEnd: 21, perHeadDefault: 33, truckDayDefault: 850 };

  /* Crew roles a person can be tagged with, and booked on a job as */
  const CREW_ROLES = ['Driver', 'Chef', 'Key', 'Assist'];

  /* Dietary restriction options for on-set crew */
  const DIETARY = ['Vegetarian', 'Vegan', 'Pescatarian', 'Gluten-free', 'Dairy-free', 'Halal', 'Kosher', 'Nut allergy', 'Shellfish allergy'];

  /* ---------- normalizers (migrate old-shape docs from either mode) ----------
     jobs: crew used to be an array of person ids — now [{role, personId}].
     people: tags (crew-role tags) may be missing on older docs; infer from
     their position text once, only when the field doesn't exist at all. */
  /* Keep dayInfo consistent with shootDays: drop overrides for days that
     no longer exist, and when a job shrinks to a single day, fold that
     day's overrides back into the job-level fields so there is exactly
     one source of truth for single-day jobs. */
  function reconcileDays(j) {
    j.dayInfo = j.dayInfo || {};
    const days = j.shootDays || [];
    Object.keys(j.dayInfo).forEach(d => { if (!days.includes(d)) delete j.dayInfo[d]; });
    if (days.length === 1) {
      const d = j.dayInfo[days[0]];
      if (d) {
        ['callTime', 'wrapTime', 'headcount', 'location'].forEach(f => {
          if (d[f] !== undefined && d[f] !== '' && d[f] !== null) j[f] = d[f];
        });
        if (Array.isArray(d.menu)) j.menu = d.menu;
        if (d.notes) j.notes = j.notes ? j.notes + ' — ' + d.notes : d.notes;
        j.dayInfo = {};
      }
    }
    return j;
  }

  function normalizeJob(j) {
    j.crew = (j.crew || []).map(c =>
      typeof c === 'string' ? { role: 'Assist', personId: c } : c);
    return reconcileDays(j);
  }
  function inferTags(position) {
    const p = (position || '').toLowerCase();
    const tags = [];
    if (/driver|setup/.test(p)) tags.push('Driver');
    if (/chef|cook|grill|prep|barista/.test(p)) tags.push('Chef');
    if (/captain|lead|key|owner/.test(p)) tags.push('Key');
    if (!tags.length) tags.push('Assist');
    return tags;
  }
  function normalizePerson(p) {
    if (p.tags === undefined) p.tags = inferTags(p.position);
    return p;
  }

  /* ---------- seed data (local demo mode only) ---------- */
  function seed() {
    const T = todayISO();
    const people = [
      { id: 'p-mar', name: 'Marisol Quintero', role: 'admin', position: 'Owner / Operator', tags: ['Key'], phone: '+1 (416) 508-2247', email: 'marisol@craftyto.ca', dietary: [] },
      { id: 'p-dar', name: 'Dario Pellegrini', role: 'moderator', position: 'Operations Lead', tags: ['Key', 'Driver'], phone: '+1 (647) 331-9084', email: 'dario@craftyto.ca', dietary: ['Lactose intolerant'] },
      { id: 'p-kei', name: 'Keisha Alleyne', role: 'moderator', position: 'Truck Captain', tags: ['Key', 'Chef'], phone: '+1 (416) 772-4415', email: 'keisha@craftyto.ca', dietary: [] },
      { id: 'p-tam', name: 'Tam Nguyen-Brooks', role: 'crew', position: 'Craft Service', tags: ['Assist'], phone: '+1 (647) 906-1152', email: 'tam@craftyto.ca', dietary: ['Vegetarian'] },
      { id: 'p-roc', name: 'Rocco Fiorito', role: 'crew', position: 'Grill / Prep', tags: ['Chef'], phone: '+1 (416) 285-7730', email: 'rocco@craftyto.ca', dietary: [] },
      { id: 'p-pri', name: 'Priya Ramanathan', role: 'crew', position: 'Craft Service', tags: ['Assist'], phone: '+1 (905) 467-3318', email: 'priya@craftyto.ca', dietary: ['Vegan'] },
      { id: 'p-jun', name: 'Junie St-Amour', role: 'crew', position: 'Barista / FOH', tags: ['Assist', 'Chef'], phone: '+1 (438) 224-6907', email: 'junie@craftyto.ca', dietary: ['Gluten-free'] },
      { id: 'p-ola', name: 'Oladele Akintola', role: 'crew', position: 'Driver / Setup', tags: ['Driver'], phone: '+1 (647) 553-2189', email: 'ola@craftyto.ca', dietary: ['Halal'] },
      { id: 'p-sas', name: 'Saskia Vandermeer', role: 'crew', position: 'Prep Cook', tags: ['Chef', 'Assist'], phone: '+1 (416) 940-8823', email: 'saskia@craftyto.ca', dietary: ['Shellfish allergy (severe)'] },
    ];

    const jobs = [
      {
        id: 'j-1', productionName: 'Maple & Rye "First Pour"', productionCompany: 'Bellwoods Motion Co.',
        agency: 'Open Kitchen Creative', pm: 'Noor El-Amin', producers: 'Catie Brankovic', headcount: 62, location: 'Cherry Beach Studios, 33 Villiers St',
        shootDays: [addDays(T, 1), addDays(T, 2)], callTime: '06:30', wrapTime: '19:00',
        status: 'confirmed', crew: [{ role: 'Key', personId: 'p-kei' }, { role: 'Chef', personId: 'p-roc' }, { role: 'Assist', personId: 'p-pri' }], menu: ['Breakfast burritos', 'Espresso bar', 'Harvest bowls', 'Afternoon snack table'],
        rates: { perHead: 34, truckDay: 850 }, notes: 'Client is nut-free across the board. Talent trailer needs a separate tray at 07:00.',
        dayInfo: { [addDays(T, 2)]: { callTime: '08:30', headcount: 48, notes: 'Company move to Studio B — smaller unit.', menu: ['Egg + cheddar sandwiches', 'Espresso bar', 'Studio B hot lunch', 'Afternoon snack table'] } },
        createdAt: addDays(T, -12),
      },
      {
        id: 'j-2', productionName: 'Northbound Athletics FW26', productionCompany: 'Gooseneck Productions',
        agency: '', pm: 'Theo Vandenberg', producers: 'Marisa Okafor, Jules Petit', headcount: 38, location: 'R.L. Hearn Generating Station, Unwin Ave',
        shootDays: [addDays(T, 5)], callTime: '05:45', wrapTime: '20:30',
        status: 'confirmed', crew: [], menu: [],
        rates: { perHead: 31, truckDay: 850 }, notes: 'Overnight pre-rig the day before. Power drop confirmed by locations.',
        createdAt: addDays(T, -6),
      },
      {
        id: 'j-3', productionName: 'Caisse Populaire "Kitchen Table"', productionCompany: 'Harbourlight Pictures',
        agency: 'Fjord & Field', pm: '', producers: 'Hannah Liu-Beaumont', headcount: 45, location: 'Private residence, 128 Indian Rd, Roncesvalles',
        shootDays: [addDays(T, 8), addDays(T, 9), addDays(T, 10)], callTime: '07:00', wrapTime: '18:00',
        status: 'estimate', crew: [], menu: [],
        rates: { perHead: 33, truckDay: 850 }, notes: 'Residential street — quiet load-in before 07:00, no generators on the lawn.',
        createdAt: addDays(T, -3),
      },
      {
        id: 'j-4', productionName: 'Streetcar Chocolate "Winter Batch"', productionCompany: 'Bellwoods Motion Co.',
        agency: '', headcount: 27, location: 'Revival 629, 629 Eastern Ave',
        shootDays: [addDays(T, -7)], callTime: '08:00', wrapTime: '17:30',
        status: 'wrapped', crew: [{ role: 'Assist', personId: 'p-tam' }, { role: 'Chef', personId: 'p-jun' }], menu: ['Soup + sandwich service', 'Hot chocolate bar'],
        rates: { perHead: 29, truckDay: 850 }, notes: '',
        createdAt: addDays(T, -21),
      },
      {
        id: 'j-5', productionName: 'Ontario Tourism "Shoulder Season"', productionCompany: 'Copperline Films',
        agency: 'Fjord & Field', pm: 'Dmitri Kovalenko', producers: 'Fern Whitely', headcount: 84, location: 'Scarborough Bluffs + company move to Kew Beach',
        shootDays: [addDays(T, -16), addDays(T, -15)], callTime: '05:30', wrapTime: '21:00',
        status: 'invoiced', crew: [{ role: 'Key', personId: 'p-kei' }, { role: 'Chef', personId: 'p-roc' }, { role: 'Assist', personId: 'p-pri' }, { role: 'Driver', personId: 'p-ola' }, { role: 'Chef', personId: 'p-sas' }], menu: ['Full breakfast', 'BBQ lunch', 'Substantials x2', 'Coffee truck all day'],
        rates: { perHead: 36, truckDay: 950 }, notes: 'Two-truck day. Company move at 13:00.',
        createdAt: addDays(T, -30),
      },
    ];

    const companies = [
      { id: 'co-bel', name: 'Bellwoods Motion Co.', billingAddress: '214 Ossington Ave, 2nd Floor\nToronto ON M6J 2Z9', contactName: 'Renata Iannucci', email: 'ap@bellwoodsmotion.ca', phone: '+1 (416) 604-2218' },
      { id: 'co-goo', name: 'Gooseneck Productions', billingAddress: '388 Carlaw Ave, Studio 210\nToronto ON M4M 2T4', contactName: 'Wes Obuya', email: 'accounting@gooseneck.tv', phone: '+1 (647) 490-1163' },
      { id: 'co-har', name: 'Harbourlight Pictures', billingAddress: '67 Mowat Ave, Suite 431\nToronto ON M6K 3E3', contactName: 'Solène Marchetti', email: 'ap@harbourlight.ca', phone: '+1 (416) 538-9902' },
      { id: 'co-cop', name: 'Copperline Films', billingAddress: '1235 Bay St, Suite 700\nToronto ON M5R 3K4', contactName: 'Grover Lindqvist', email: 'billing@copperlinefilms.com', phone: '+1 (416) 921-4407' },
    ];

    const menus = [
      { id: 'm-std', name: 'Standard Shoot Day', items: ['Breakfast burritos', 'Fresh fruit + yogurt bar', 'Espresso + drip station', 'Hot lunch — protein + two sides', 'Afternoon substantials', 'Snack table restock'] },
      { id: 'm-early', name: 'Early Call Breakfast', items: ['Egg + cheddar sandwiches', 'Overnight oats', 'Smoothie bar', 'Espresso + drip station', 'Late-morning pastry drop'] },
      { id: 'm-wrap', name: 'Wrap Party', items: ['Souvlaki + pita station', 'Greek salad bowls', 'Loukoumades', 'Sparkling lemonade + iced coffee'] },
    ];

    const setCrew = [
      { id: 'sc-1', name: 'Wren Kalogeropoulos', position: '1st AD', dietary: ['Vegetarian'], notes: 'Prefers oat milk for coffee.' },
      { id: 'sc-2', name: 'Bo Lindqvist-Osei', position: 'Gaffer', dietary: ['Nut allergy'], notes: 'Severe — keep his plate clear of the snack table.' },
      { id: 'sc-3', name: 'Camille Iwu', position: 'Director', dietary: ['Gluten-free', 'Dairy-free'], notes: '' },
    ];

    const inquiries = [
      { id: 'inq-1', company: 'Parkdale Pictures', pm: 'Sana Whitfield', email: 'sana@parkdalepictures.ca', phone: '+1 (416) 555-0139', intExt: 'INT + EXT', dayNight: 'Day', headcount: 45, shootDays: [addDays(T, 12), addDays(T, 13)], notes: 'Two-day spot near High Park, tight turnaround.', createdAt: new Date().toISOString(), status: 'new' },
    ];

    const invoices = [
      { id: 'inv-1', jobId: 'j-5', number: 'CR-2026-041', issuedOn: addDays(T, -12), dueOn: addDays(T, 18), status: 'sent', taxRate: 0.13 },
      { id: 'inv-2', jobId: 'j-4', number: 'CR-2026-042', issuedOn: addDays(T, -4), dueOn: addDays(T, 26), status: 'paid', taxRate: 0.13 },
    ];

    const timeOff = [
      { id: 'to-1', personId: 'p-jun', start: addDays(T, 9), end: addDays(T, 11), reason: 'Family wedding in Gatineau', status: 'pending', createdAt: T },
      { id: 'to-2', personId: 'p-roc', start: addDays(T, -2), end: addDays(T, -1), reason: 'Moving apartments', status: 'approved', createdAt: addDays(T, -9) },
    ];

    const now = Date.now();
    const hrs = (n) => now - n * 3600 * 1000;
    const messages = [
      { id: uid(), channel: 'company', fromId: 'p-mar', text: 'Big week ahead — Maple & Rye is now two days at Cherry Beach. Job sheet is on the calendar.', sentAt: hrs(30), deliverAt: hrs(30) },
      { id: uid(), channel: 'company', fromId: 'p-dar', text: 'Truck B is back from the shop. Fridge compressor replaced, keep an eye on temps this week anyway.', sentAt: hrs(7), deliverAt: hrs(7) },
      { id: uid(), channel: 'company', fromId: 'p-kei', text: 'Costco run tomorrow at 3 if anyone needs anything added to the list.', sentAt: hrs(4), deliverAt: hrs(4) },
      { id: uid(), channel: 'dm:p-dar:p-tam', fromId: 'p-tam', text: 'Hey Dario, could I swap off the Friday job? Have a callback that morning.', sentAt: hrs(5), deliverAt: hrs(5) },
      { id: uid(), channel: 'dm:p-dar:p-tam', fromId: 'p-dar', text: 'Should be fine — I will move Saskia in. Confirming by tonight.', sentAt: hrs(4.5), deliverAt: hrs(4.5) },
    ];

    const notifications = [
      { id: uid(), audience: 'moderator', text: 'Junie St-Amour requested time off (' + fmtRange(timeOff[0].start, timeOff[0].end) + ').', at: now - 3600 * 1000 * 6, read: false, icon: 'palm' },
      { id: uid(), audience: 'all', text: 'Northbound Athletics FW26 confirmed for ' + fmtShort(addDays(T, 5)) + ' — crew still unassigned.', at: now - 3600 * 1000 * 20, read: false, icon: 'alert' },
    ];

    return {
      v: 1,
      currentUserId: 'p-mar',
      people, jobs, companies, menus, setCrew, inquiries, invoices, timeOff, messages, notifications,
      chatRead: {},
      settings: { ...DEFAULT_SETTINGS },
    };
  }

  function emptyState() {
    return {
      v: 1, currentUserId: null,
      people: [], jobs: [], companies: [], menus: [], setCrew: [], inquiries: [], invoices: [], timeOff: [], messages: [], notifications: [],
      chatRead: {},
      settings: { ...DEFAULT_SETTINGS },
    };
  }

  /* small formatters needed by seed (duplicated in ui.js for views) */
  function fmtShort(isoStr) {
    return new Date(isoStr + 'T00:00:00').toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
  }
  function fmtRange(a, b) {
    return a === b ? fmtShort(a) : fmtShort(a) + ' – ' + fmtShort(b);
  }

  /* ---------- persistence ---------- */
  let state;
  let cloud = false;            // true once enterCloud() succeeds
  let releaseMark = 0;          // cloud mode: last releaseQueued() check
  let reads = { chat: {}, notifs: [] }; // per-device read tracking (cloud mode)

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      state = raw ? JSON.parse(raw) : seed();
    } catch (e) {
      state = seed();
    }
    state.jobs.forEach(normalizeJob);
    state.people.forEach(normalizePerson);
    save();
  }
  function save() {
    if (cloud) return; // cloud mode persists per-document via put()/del()
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* private mode */ }
  }
  function reset() {
    if (cloud) return;
    state = seed(); save();
  }

  /* cloud write-through: mutations mutate state optimistically,
     then push just the touched document */
  function put(col, obj) { if (cloud && window.Cloud) Cloud.save(col, obj.id, obj); }
  function del(col, id) { if (cloud && window.Cloud) Cloud.remove(col, id); }
  function saveReads() {
    if (!cloud) return;
    try { localStorage.setItem(READ_KEY, JSON.stringify(reads)); } catch (e) { /* ignore */ }
  }

  /* ---------- cloud boot ---------- */
  const COLS = ['people', 'jobs', 'companies', 'menus', 'setCrew', 'inquiries', 'invoices', 'timeOff', 'messages', 'notifications'];

  async function enterCloud(user) {
    cloud = true;
    state = emptyState();
    try {
      const r = JSON.parse(localStorage.getItem(READ_KEY));
      if (r && r.chat && Array.isArray(r.notifs)) reads = r;
    } catch (e) { /* fresh device */ }

    // subscribe every collection; resolves after the first snapshot of each
    const normalizers = { jobs: normalizeJob, people: normalizePerson };
    await Promise.all(COLS.map((c) =>
      Cloud.watch(c, (docs) => {
        state[c] = normalizers[c] ? docs.map(normalizers[c]) : docs;
        onRemote();
      })
    ));
    Cloud.watchDoc('meta', 'settings', (d) => {
      state.settings = { ...DEFAULT_SETTINGS, ...(d || {}) };
      onRemote();
    });

    // link the signed-in account to a person in the directory (by email).
    // If the admin already added them in the Directory, they keep that
    // role; otherwise a crew profile is created (first account = admin).
    const email = (user.email || '').toLowerCase();
    let p = state.people.find((x) => (x.email || '').toLowerCase() === email);
    if (!p) {
      const first = state.people.length === 0;
      p = {
        id: 'p-' + uid(),
        name: user.displayName || email.split('@')[0],
        role: first ? 'admin' : 'crew',
        position: first ? 'Owner / Operator' : 'Crew',
        tags: first ? ['Key'] : ['Assist'],
        phone: '', email: user.email, dietary: [],
      };
      state.people.push(p);
      put('people', p);
    }
    state.currentUserId = p.id;
  }

  function onRemote() {
    if (window.App && App.started) { App.refreshView(); }
  }

  const isCloud = () => cloud;

  /* ---------- queries ---------- */
  const get = () => state;
  const me = () => state.people.find(p => p.id === state.currentUserId) || state.people[0]
    || { id: '', name: '—', role: 'crew', position: '', dietary: [] };
  const person = (id) => state.people.find(p => p.id === id);
  const job = (id) => state.jobs.find(j => j.id === id);

  const company = (id) => state.companies.find(c => c.id === id);
  const companyByName = (name) => {
    const n = (name || '').trim().toLowerCase();
    return n ? state.companies.find(c => c.name.trim().toLowerCase() === n) : null;
  };

  const role = () => me().role;
  const can = (perm) => {
    const r = role();
    const map = {
      finances: r === 'admin',
      createJob: r === 'admin' || r === 'moderator',
      editJob: r === 'admin' || r === 'moderator',
      assignCrew: r === 'admin' || r === 'moderator',
      approveTimeOff: r === 'admin' || r === 'moderator',
      editDirectory: r === 'admin' || r === 'moderator',
      seeAllJobs: r === 'admin' || r === 'moderator',
    };
    return !!map[perm];
  };

  /* person ids booked on a job, regardless of role */
  const crewIds = (j) => j.crew.map(c => c.personId);

  function visibleJobs() {
    if (can('seeAllJobs')) return state.jobs.slice();
    const myId = me().id;
    return state.jobs.filter(j => crewIds(j).includes(myId));
  }

  function jobsOn(isoDate, jobsList) {
    return (jobsList || visibleJobs()).filter(j => j.shootDays.includes(isoDate));
  }

  function missing(j) {
    const out = [];
    if (!j.crew.length) out.push('crew');
    if (j.shootDays.length
      ? j.shootDays.some(d => !menuFor(j, d).length)
      : !j.menu.length) out.push('menu');
    if (!j.headcount) out.push('headcount');
    if (!j.location) out.push('location');
    if (!j.callTime) out.push('call time');
    return out;
  }

  /* ---------- per-day details ----------
     Each shoot day can override callTime / wrapTime / headcount /
     location / notes; anything unset falls back to the job-level value. */
  function dayVal(j, date, field) {
    const d = j.dayInfo && j.dayInfo[date];
    if (d && d[field] !== undefined && d[field] !== '' && d[field] !== null) return d[field];
    return j[field];
  }
  function setDayInfo(jobId, date, patch) {
    const j = job(jobId);
    if (!j) return;
    j.dayInfo = j.dayInfo || {};
    j.dayInfo[date] = { ...(j.dayInfo[date] || {}), ...patch };
    put('jobs', j);
    save();
  }
  /* total covers across all shoot days, honouring per-day headcounts */
  function totalCovers(j) {
    return j.shootDays.reduce((sum, d) => sum + (+dayVal(j, d, 'headcount') || 0), 0);
  }

  /* ---------- money ---------- */
  function jobSubtotal(j) {
    const days = j.shootDays.length || 1;
    return (totalCovers(j) * (j.rates?.perHead ?? state.settings.perHeadDefault))
      + ((j.rates?.truckDay ?? state.settings.truckDayDefault) * days);
  }
  function invoiceTotal(inv) {
    const j = job(inv.jobId);
    if (!j) return 0;
    const sub = jobSubtotal(j);
    return sub * (1 + (inv.taxRate ?? 0.13));
  }

  /* ---------- mutations ---------- */
  function upsertJob(data) {
    const existing = data.id && job(data.id);
    if (existing) {
      Object.assign(existing, data);
      reconcileDays(existing);
      put('jobs', existing);
    } else {
      data.id = 'j-' + uid();
      data.createdAt = todayISO();
      data.crew = data.crew || [];
      data.menu = data.menu || [];
      reconcileDays(data);
      state.jobs.push(data);
      put('jobs', data);
      notify('all', `New job created: ${data.productionName} (${fmtRange(data.shootDays[0], data.shootDays[data.shootDays.length - 1])}).`, 'briefcase');
    }
    save();
    return data;
  }

  function deleteJob(id) {
    state.invoices.filter(i => i.jobId === id).forEach(i => del('invoices', i.id));
    state.jobs = state.jobs.filter(j => j.id !== id);
    state.invoices = state.invoices.filter(i => i.jobId !== id);
    del('jobs', id);
    save();
  }

  function addCrew(jobId, roleTag, personId) {
    const j = job(jobId);
    if (!j || !personId || crewIds(j).includes(personId)) return;
    j.crew.push({ role: roleTag, personId });
    notify('person:' + personId, `You were added to ${j.productionName} as ${roleTag} (${fmtRange(j.shootDays[0], j.shootDays[j.shootDays.length - 1])}).`, 'briefcase');
    put('jobs', j);
    save();
  }
  function removeCrew(jobId, idx) {
    const j = job(jobId);
    if (!j || !j.crew[idx]) return;
    j.crew.splice(idx, 1);
    put('jobs', j);
    save();
  }

  /* people tagged for a crew role, excluding anyone already on the job */
  function candidatesFor(jobId, roleTag) {
    const j = job(jobId);
    const taken = j ? crewIds(j) : [];
    return state.people.filter(p =>
      (p.tags || []).includes(roleTag) && !taken.includes(p.id));
  }

  /* ---------- crew workload ---------- */
  function personJobs(personId) {
    return state.jobs
      .filter(j => crewIds(j).includes(personId))
      .sort((a, b) => a.shootDays[0].localeCompare(b.shootDays[0]));
  }
  /* upcoming booked days (today onward) for the workload list */
  function personUpcomingDays(personId) {
    const T = todayISO();
    const days = new Set();
    personJobs(personId).forEach(j => j.shootDays.forEach(d => { if (d >= T) days.add(d); }));
    return days.size;
  }
  /* date -> job map for the mini calendar */
  function personBookedDays(personId) {
    const map = {};
    personJobs(personId).forEach(j => j.shootDays.forEach(d => { map[d] = j; }));
    return map;
  }

  function addMenuItem(jobId, item, date) {
    const j = job(jobId);
    if (j && item.trim()) { dayMenuTarget(j, date).push(item.trim()); put('jobs', j); save(); }
  }
  function removeMenuItem(jobId, idx, date) {
    const j = job(jobId);
    if (j) { dayMenuTarget(j, date).splice(idx, 1); put('jobs', j); save(); }
  }

  function requestTimeOff(start, end, reason) {
    const req = { id: 'to-' + uid(), personId: me().id, start, end, reason, status: 'pending', createdAt: todayISO() };
    state.timeOff.push(req);
    put('timeOff', req);
    notify('moderator', `${me().name} requested time off (${fmtRange(start, end)}).`, 'palm');
    save();
    return req;
  }
  function resolveTimeOff(id, status) {
    const req = state.timeOff.find(t => t.id === id);
    if (!req) return;
    req.status = status;
    put('timeOff', req);
    notify('person:' + req.personId, `Your time-off request (${fmtRange(req.start, req.end)}) was ${status}.`, status === 'approved' ? 'check' : 'x');
    save();
  }

  /* ---------- chat ---------- */
  function chatWindowOpen(d) {
    const h = (d || new Date()).getHours();
    return h >= state.settings.quietStart && h < state.settings.quietEnd;
  }
  function nextWindowOpen() {
    const d = new Date();
    const open = new Date(d);
    open.setHours(state.settings.quietStart, 0, 0, 0);
    if (d.getHours() >= state.settings.quietEnd) open.setDate(open.getDate() + 1);
    return open;
  }
  function dmChannel(a, b) { return 'dm:' + [a, b].sort().join(':'); }

  function sendMessage(channel, text) {
    const now = Date.now();
    const open = chatWindowOpen();
    const msg = {
      id: uid(), channel, fromId: me().id, text: text.trim(),
      sentAt: now,
      deliverAt: open ? now : nextWindowOpen().getTime(),
    };
    state.messages.push(msg);
    put('messages', msg);
    save();
    return msg;
  }

  /* deliver queued messages whose time has arrived; returns count released.
     Local mode marks them; cloud mode just detects the transition (every
     client filters by deliverAt, so no write is needed). */
  function releaseQueued() {
    const now = Date.now();
    if (cloud) {
      const n = state.messages.filter(m =>
        m.deliverAt > m.sentAt && m.deliverAt <= now && m.deliverAt > releaseMark).length;
      releaseMark = now;
      return n;
    }
    let n = 0;
    state.messages.forEach(m => {
      if (m.deliverAt > m.sentAt && m.deliverAt <= now && !m.released) { m.released = true; n++; }
    });
    if (n) save();
    return n;
  }

  function channelMessages(channel) {
    const now = Date.now();
    const myId = me().id;
    return state.messages
      .filter(m => m.channel === channel)
      .filter(m => m.deliverAt <= now || m.fromId === myId)
      .sort((a, b) => a.sentAt - b.sentAt);
  }

  function myChannels() {
    const myId = me().id;
    const dms = new Set();
    state.messages.forEach(m => {
      if (m.channel.startsWith('dm:') && m.channel.includes(myId)) dms.add(m.channel);
    });
    return { company: 'company', dms: [...dms] };
  }

  function lastReadOf(channel) {
    return cloud ? (reads.chat[channel] || 0) : (state.chatRead[channel] || 0);
  }
  function unread(channel) {
    const last = lastReadOf(channel);
    const now = Date.now();
    return state.messages.some(m =>
      m.channel === channel && m.fromId !== me().id && m.deliverAt <= now && m.deliverAt > last);
  }
  function markRead(channel) {
    if (cloud) { reads.chat[channel] = Date.now(); saveReads(); }
    else { state.chatRead[channel] = Date.now(); save(); }
  }

  /* ---------- notifications ---------- */
  function notify(audience, text, icon) {
    const n = { id: uid(), audience, text, at: Date.now(), read: false, icon: icon || 'bell' };
    state.notifications.unshift(n);
    put('notifications', n);
    save();
  }
  function myNotifications() {
    const r = role(), myId = me().id;
    return state.notifications
      .filter(n =>
        n.audience === 'all' ||
        n.audience === r ||
        (n.audience === 'moderator' && r === 'admin') ||
        n.audience === 'person:' + myId)
      .map(n => cloud ? { ...n, read: reads.notifs.includes(n.id) } : n)
      .sort((a, b) => b.at - a.at);
  }
  function markNotifsRead() {
    if (cloud) {
      myNotifications().forEach(n => { if (!reads.notifs.includes(n.id)) reads.notifs.push(n.id); });
      if (reads.notifs.length > 400) reads.notifs = reads.notifs.slice(-400);
      saveReads();
    } else {
      myNotifications().forEach(n => n.read = true);
      save();
    }
  }

  function setUser(id) {
    if (cloud) return; // cloud identity comes from the real login
    state.currentUserId = id;
    save();
  }

  function upsertPerson(data) {
    const existing = data.id && person(data.id);
    if (existing) { Object.assign(existing, data); put('people', existing); }
    else {
      data.id = 'p-' + uid();
      data.dietary = data.dietary || [];
      state.people.push(data);
      put('people', data);
    }
    save();
  }

  /* ---------- menu templates ---------- */
  const menuTpl = (id) => state.menus.find(m => m.id === id);

  function upsertMenu(data) {
    const existing = data.id && menuTpl(data.id);
    if (existing) { Object.assign(existing, data); put('menus', existing); }
    else {
      data.id = 'm-' + uid();
      state.menus.push(data);
      put('menus', data);
    }
    save();
    return data;
  }

  function deleteMenu(id) {
    state.menus = state.menus.filter(m => m.id !== id);
    del('menus', id);
    save();
  }

  /* Effective menu for a given shoot day: the day's own menu if it has
     one, otherwise the job-level default. */
  function menuFor(j, date) {
    const d = j.dayInfo && j.dayInfo[date];
    return (d && Array.isArray(d.menu)) ? d.menu : j.menu;
  }

  /* The array to mutate for a date — copy-on-write from the job default,
     so editing one day never bleeds into the others. */
  function dayMenuTarget(j, date) {
    if (!date) return j.menu;
    j.dayInfo = j.dayInfo || {};
    const d = j.dayInfo[date] = j.dayInfo[date] || {};
    if (!Array.isArray(d.menu)) d.menu = j.menu.slice();
    return d.menu;
  }

  /* Replace a menu with a copy of the given items. With a date, only that
     day changes; without one, the job default is set and every per-day
     menu override is cleared (all days back in sync). Jobs always keep
     copies, so editing a template later never rewrites past jobs. */
  function setJobMenu(jobId, items, date) {
    const j = job(jobId);
    if (!j) return;
    if (date) {
      j.dayInfo = j.dayInfo || {};
      j.dayInfo[date] = { ...(j.dayInfo[date] || {}), menu: (items || []).slice() };
    } else {
      j.menu = (items || []).slice();
      Object.values(j.dayInfo || {}).forEach(d => { delete d.menu; });
    }
    put('jobs', j);
    save();
  }

  /* ---------- on-set crew (production-side people we feed) ---------- */
  const setCrewMember = (id) => state.setCrew.find(c => c.id === id);

  function upsertSetCrew(data) {
    const existing = data.id && setCrewMember(data.id);
    if (existing) { Object.assign(existing, data); put('setCrew', existing); }
    else {
      data.id = 'sc-' + uid();
      data.dietary = data.dietary || [];
      state.setCrew.push(data);
      put('setCrew', data);
    }
    save();
    return data;
  }
  function deleteSetCrew(id) {
    state.setCrew = state.setCrew.filter(c => c.id !== id);
    del('setCrew', id);
    save();
  }

  /* ---------- outreach inquiries ---------- */
  function newInquiries() {
    return state.inquiries.filter(i => i.status === 'new')
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }
  function convertInquiry(id) {
    const inq = state.inquiries.find(i => i.id === id);
    if (!inq) return null;
    const j = upsertJob({
      productionName: 'TBC — ' + inq.company,
      productionCompany: inq.company,
      agency: '', pm: inq.pm || '', producers: '',
      headcount: +inq.headcount || 0,
      location: '',
      shootDays: (inq.shootDays || []).slice().sort(),
      callTime: '07:00', wrapTime: '19:00',
      status: 'estimate',
      crew: [], menu: [],
      rates: { perHead: state.settings.perHeadDefault, truckDay: state.settings.truckDayDefault },
      notes: `From outreach form — ${inq.intExt || '?'} · ${inq.dayNight || '?'}.` +
        (inq.email || inq.phone ? ` Contact: ${[inq.email, inq.phone].filter(Boolean).join(' · ')}.` : '') +
        (inq.notes ? ` "${inq.notes}"` : ''),
    });
    inq.status = 'converted';
    put('inquiries', inq);
    save();
    return j;
  }
  function dismissInquiry(id) {
    const inq = state.inquiries.find(i => i.id === id);
    if (!inq) return;
    inq.status = 'dismissed';
    put('inquiries', inq);
    save();
  }

  function upsertCompany(data) {
    const existing = data.id && company(data.id);
    if (existing) { Object.assign(existing, data); put('companies', existing); }
    else {
      data.id = 'co-' + uid();
      state.companies.push(data);
      put('companies', data);
    }
    save();
    return data;
  }

  function deleteCompany(id) {
    state.companies = state.companies.filter(c => c.id !== id);
    del('companies', id);
    save();
  }

  /* ---------- one-click sample data (fresh cloud workspaces) ----------
     Writes through the normal mutations, so in cloud mode it syncs to
     everyone. Shows off every feature: a fully-dressed confirmed job,
     an estimate with missing-info flags, a wrapped job with an invoice,
     a billable company, and a welcome chat message. */
  function loadSampleData() {
    if (state.jobs.some(j => j.sample)) return false;
    const T = todayISO();
    const meP = me();

    if (!state.menus.length) {
      upsertMenu({ name: 'Standard Shoot Day', items: ['Breakfast burritos', 'Fresh fruit + yogurt bar', 'Espresso + drip station', 'Hot lunch — protein + two sides', 'Afternoon substantials'] });
    }

    if (!companyByName('Bluewater Films')) {
      upsertCompany({
        name: 'Bluewater Films',
        billingAddress: '55 Commissioners St, Unit 12\nToronto ON M5A 1A6',
        contactName: 'Ines Delacroix-Ma',
        email: 'ap@bluewaterfilms.ca',
        phone: '+1 (416) 555-0182',
      });
    }

    // 1. Confirmed job with everything filled in — you're on the crew
    upsertJob({
      sample: true,
      productionName: 'Sunhaus Patio "Golden Hour"',
      productionCompany: 'Bluewater Films',
      agency: 'Wide Angle Creative',
      pm: 'Petra Solberg',
      producers: 'Malik Okonjo, Dree Vanterpool',
      headcount: 54,
      location: 'Polson Pier, 11 Polson St',
      shootDays: [addDays(T, 1), addDays(T, 2)],
      callTime: '06:00', wrapTime: '19:30',
      status: 'confirmed',
      crew: [{ role: 'Key', personId: meP.id }],
      menu: ['Breakfast burritos', 'Espresso bar', 'Taco lunch', 'Afternoon snack table'],
      dayInfo: { [addDays(T, 2)]: { menu: ['Overnight oats + fruit', 'Espresso bar', 'Souvlaki lunch', 'Wrap-day treat table'], notes: 'Day 2 menu is different — that is the per-day menus feature.' } },
      rates: { perHead: 34, truckDay: 850 },
      notes: 'Sample job — delete anytime. Client is nut-free; smoothie run at 3 PM.',
    });

    // 2. Estimate with gaps — shows the red missing-info flags + pricing
    upsertJob({
      sample: true,
      productionName: 'Lakeshore Credit Union "First Home"',
      productionCompany: 'Bluewater Films',
      agency: '',
      pm: '',
      producers: 'Hannah Brightwater',
      headcount: 41,
      location: 'Residential — Leslieville (TBC)',
      shootDays: [addDays(T, 7), addDays(T, 8)],
      callTime: '07:00', wrapTime: '18:00',
      status: 'estimate',
      crew: [], menu: [],
      rates: { perHead: 33, truckDay: 850 },
      notes: 'Sample estimate — open it on the calendar to see the missing-info dropdowns, and check Finances for the auto-priced estimate.',
    });

    // 3. Wrapped job + invoice — shows Finances end to end
    const wrapped = upsertJob({
      sample: true,
      productionName: 'Aegean Yogurt "Blue Roofs"',
      productionCompany: 'Bluewater Films',
      agency: 'Wide Angle Creative',
      pm: 'Petra Solberg',
      producers: 'Malik Okonjo',
      headcount: 30,
      location: 'Studio 7, 940 Lansdowne Ave',
      shootDays: [addDays(T, -6)],
      callTime: '08:00', wrapTime: '17:00',
      status: 'wrapped',
      crew: [{ role: 'Key', personId: meP.id }],
      menu: ['Souvlaki lunch', 'Iced coffee bar'],
      rates: { perHead: 31, truckDay: 850 },
      notes: 'Sample wrapped job — its invoice (with Bluewater’s billing address) is under Finances.',
    });
    createInvoice(wrapped.id);

    // 4. Welcome message in #crafty-hq (delivered immediately)
    const now = Date.now();
    const msg = {
      id: uid(), channel: 'company', fromId: meP.id,
      text: 'Welcome to Crafty Central! This is the company-wide channel. Sample data is loaded — poke around. Anything sent between 9 PM and 7 AM waits until morning.',
      sentAt: now, deliverAt: now,
    };
    state.messages.push(msg);
    put('messages', msg);

    notify('all', 'Sample data loaded — three jobs, a company, and an invoice to explore.', 'check');
    save();
    return true;
  }

  function markInvoice(id, status) {
    const inv = state.invoices.find(i => i.id === id);
    if (inv) { inv.status = status; put('invoices', inv); save(); }
  }

  function createInvoice(jobId) {
    const j = job(jobId);
    if (!j) return null;
    const n = state.invoices.length + 41;
    const inv = {
      id: 'inv-' + uid(), jobId, number: `CR-2026-0${n}`,
      issuedOn: todayISO(), dueOn: addDays(todayISO(), 30),
      status: 'draft', taxRate: 0.13,
    };
    state.invoices.push(inv);
    put('invoices', inv);
    j.status = 'invoiced';
    put('jobs', j);
    save();
    return inv;
  }

  load();

  return {
    get, save, reset, uid,
    iso, todayISO, addDays,
    me, person, job, role, can, setUser,
    visibleJobs, jobsOn, missing,
    CREW_ROLES, DIETARY, crewIds, addCrew, removeCrew, candidatesFor,
    dayVal, setDayInfo, totalCovers,
    setCrewMember, upsertSetCrew, deleteSetCrew,
    newInquiries, convertInquiry, dismissInquiry,
    personJobs, personUpcomingDays, personBookedDays,
    jobSubtotal, invoiceTotal,
    upsertJob, deleteJob, addMenuItem, removeMenuItem,
    requestTimeOff, resolveTimeOff,
    chatWindowOpen, nextWindowOpen, dmChannel, sendMessage, releaseQueued, channelMessages, myChannels, unread, markRead,
    notify, myNotifications, markNotifsRead,
    upsertPerson, markInvoice, createInvoice, loadSampleData,
    company, companyByName, upsertCompany, deleteCompany,
    menuTpl, upsertMenu, deleteMenu, setJobMenu, menuFor,
    enterCloud, isCloud,
  };
})();
