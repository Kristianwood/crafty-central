/* ============================================================
   Crafty Central — Directory
   Three lists behind one search bar:
   - Employees: Crafty's own team (accounts, roles, crew tags)
   - On-set crew: production-side people we feed — dietary
     restrictions + notes, referenced when planning any job
   - Production companies: billing info for invoices
   ============================================================ */

window.Views = window.Views || {};

Views.directory = (() => {
  let query = '';

  function render(el) {
    const q = query.trim().toLowerCase();
    const match = (...fields) => !q || fields.some(f => (f || '').toLowerCase().includes(q));

    const people = Store.get().people.slice()
      .sort((a, b) => {
        const order = { admin: 0, moderator: 1, crew: 2 };
        return order[a.role] - order[b.role] || a.name.localeCompare(b.name);
      })
      .filter(p => match(p.name, p.position, p.email));
    const setCrew = Store.get().setCrew.slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .filter(c => match(c.name, c.position, (c.dietary || []).join(' ')));
    const canEdit = Store.can('editDirectory');

    el.innerHTML = `
      <div class="view-enter">
        <div class="dir-search">
          <span class="ds-icon">${ICONS.people}</span>
          <input type="text" id="dirSearch" placeholder="Search everyone — employees, on-set crew, companies…" value="${UI.esc(query)}" autocomplete="off">
          ${query ? `<button class="ds-clear" id="dirSearchClear" aria-label="Clear search">${ICONS.x}</button>` : ''}
        </div>

        <div class="section-head">
          <div>
            <div class="section-title">Employees</div>
            <div class="section-hint">Crafty's own team — accounts, permissions, and crew roles.</div>
          </div>
          ${canEdit ? `<button class="btn primary" id="addPersonBtn">${ICONS.plus} Add employee</button>` : ''}
        </div>

        ${people.length ? `<div class="dir-list">
          ${people.map(p => `
            <div class="dir-row">
              ${UI.avatar(p)}
              <div>
                <div class="d-name">${UI.esc(p.name)}</div>
                <div class="d-pos">${UI.esc(p.position)}
                  ${(p.tags || []).map(t => `<span class="crew-role-tag">${UI.esc(t)}</span>`).join('')}
                </div>
              </div>
              <span class="role-tag ${p.role}">${p.role}</span>
              <div class="d-contact">${UI.esc(p.phone)}<br>${UI.esc(p.email)}</div>
              <div style="display:flex;align-items:center;gap:10px;justify-content:flex-end">
                ${canEdit ? `<button class="icon-btn" style="width:30px;height:30px" data-edit="${p.id}" aria-label="Edit ${UI.esc(p.name)}">${ICONS.edit}</button>` : ''}
              </div>
            </div>`).join('')}
        </div>` : `<div class="empty">${ICONS.people}<div class="e-title">No matches</div><div class="e-sub">No employee matches "${UI.esc(query)}".</div></div>`}

        <details class="set-crew-wrap" ${setCrew.length || q ? 'open' : ''}>
          <summary>
            <span class="ms-icon">${ICONS.directory}</span>
            <span class="sc-sum-title">On-set crew
              <span class="section-hint" style="display:block;font-weight:400">Production-side people you feed — track their dietary restrictions once, reference them on any job.</span>
            </span>
            <span class="ms-state">
              <span class="pill neutral">${Store.get().setCrew.length}</span>
              <span class="chev">${ICONS.chevDown}</span>
            </span>
          </summary>
          <div class="sc-body">
            <div style="display:flex;justify-content:flex-end;margin-bottom:10px">
              <button class="btn primary" id="addSetCrewBtn">${ICONS.plus} Add on-set crew</button>
            </div>
            ${setCrew.length ? `<div class="dir-list">
              ${setCrew.map(c => `
                <div class="sc-row">
                  <div class="sc-top">
                    ${UI.avatar(c, 'sm')}
                    <div class="sc-who">
                      <span class="d-name">${UI.esc(c.name)}</span>
                      <span class="d-pos">${UI.esc(c.position || '')}</span>
                    </div>
                    <div class="dir-diet">
                      ${(c.dietary || []).length
                        ? c.dietary.map(d => `<span class="diet-tag ${/allerg/i.test(d) ? 'severe' : ''}">${UI.esc(d)}</span>`).join('')
                        : '<span class="diet-tag none">No restrictions</span>'}
                    </div>
                    <button class="icon-btn" style="width:30px;height:30px" data-edit-sc="${c.id}" aria-label="Edit ${UI.esc(c.name)}">${ICONS.edit}</button>
                  </div>
                  ${c.notes ? `<div class="sc-notes">${ICONS.note} ${UI.esc(c.notes)}</div>` : ''}
                </div>`).join('')}
            </div>` : `<div class="empty" style="padding:26px">${ICONS.directory}<div class="e-title">${q ? 'No matches' : 'Nobody on file yet'}</div><div class="e-sub">${q ? `No on-set crew matches "${UI.esc(query)}".` : 'Add the ADs, gaffers, and directors you feed — their restrictions follow them to every job.'}</div></div>`}
          </div>
        </details>

        ${canEdit ? companiesSection() : ''}
      </div>`;

    /* search wiring — re-render but keep focus + caret in the box */
    const search = el.querySelector('#dirSearch');
    search.oninput = () => {
      query = search.value;
      const pos = search.selectionStart;
      render(el);
      const s2 = el.querySelector('#dirSearch');
      s2.focus();
      s2.setSelectionRange(pos, pos);
    };
    const clearBtn = el.querySelector('#dirSearchClear');
    if (clearBtn) clearBtn.onclick = () => { query = ''; render(el); };

    const addBtn = el.querySelector('#addPersonBtn');
    if (addBtn) addBtn.onclick = () => openForm();
    el.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => openForm(b.dataset.edit));

    const addScBtn = el.querySelector('#addSetCrewBtn');
    if (addScBtn) addScBtn.onclick = () => openSetCrewForm();
    el.querySelectorAll('[data-edit-sc]').forEach(b => b.onclick = () => openSetCrewForm(b.dataset.editSc));

    const addCoBtn = el.querySelector('#addCompanyBtn');
    if (addCoBtn) addCoBtn.onclick = () => openCompanyForm();
    el.querySelectorAll('[data-edit-co]').forEach(b => b.onclick = () => openCompanyForm(b.dataset.editCo));
  }

  /* ============ Employee form (no dietary — that's for on-set crew) ============ */

  function openForm(personId) {
    const p = personId ? Store.person(personId) : null;
    UI.openModal(`
      <div class="modal-head">
        <div>
          <div class="modal-title">${p ? 'Edit employee' : 'Add employee'}</div>
          <div class="modal-sub">Their account links up automatically when they sign up with this email.</div>
        </div>
        <button class="panel-close" id="modalCloseBtn" aria-label="Close">${ICONS.x}</button>
      </div>
      <form id="personForm">
        <div class="form-grid">
          <div class="field"><label>Full name</label><input type="text" name="name" required value="${UI.esc(p?.name || '')}"></div>
          <div class="field"><label>Position</label><input type="text" name="position" value="${UI.esc(p?.position || '')}" placeholder="e.g. Craft Service"></div>
          <div class="field">
            <label>Role</label>
            <select name="role">
              ${['crew', 'moderator', 'admin'].map(r => `<option value="${r}" ${p?.role === r ? 'selected' : ''}>${r[0].toUpperCase() + r.slice(1)}</option>`).join('')}
            </select>
          </div>
          <div class="field"><label>Phone</label><input type="tel" name="phone" value="${UI.esc(p?.phone || '')}" placeholder="+1 (416) …"></div>
          <div class="field wide">
            <label>Crew roles</label>
            <div class="tag-check-row">
              ${Store.CREW_ROLES.map(t => `
                <label class="tag-check">
                  <input type="checkbox" name="tag" value="${t}" ${(p?.tags || []).includes(t) ? 'checked' : ''}>
                  ${t}
                </label>`).join('')}
            </div>
            <span class="hint">Controls which dropdowns they appear in when booking crew on a job.</span>
          </div>
          <div class="field wide"><label>Email</label><input type="email" name="email" value="${UI.esc(p?.email || '')}"></div>
        </div>
        <div class="modal-foot">
          <button type="button" class="btn" id="modalCancelBtn">Cancel</button>
          <button type="submit" class="btn primary">${p ? 'Save' : 'Add employee'}</button>
        </div>
      </form>
    `);
    const modal = document.getElementById('modal');
    modal.querySelector('#modalCloseBtn').onclick = UI.closeModal;
    modal.querySelector('#modalCancelBtn').onclick = UI.closeModal;
    modal.querySelector('#personForm').onsubmit = (e) => {
      e.preventDefault();
      const f = e.target;
      Store.upsertPerson({
        id: p?.id,
        name: f.elements.name.value.trim(),
        position: f.elements.position.value.trim(),
        role: f.elements.role.value,
        tags: [...f.querySelectorAll('input[name="tag"]:checked')].map(cb => cb.value),
        phone: f.elements.phone.value.trim(),
        email: f.elements.email.value.trim(),
        dietary: p?.dietary || [],
      });
      UI.closeModal();
      UI.toast(p ? 'Employee updated' : 'Added to the team', 'check');
      App.refreshView(); App.renderRoleSwitch();
    };
  }

  /* ============ On-set crew form: dietary dropdown + notes ============ */

  function openSetCrewForm(id) {
    const c = id ? Store.setCrewMember(id) : null;
    UI.openModal(`
      <div class="modal-head">
        <div>
          <div class="modal-title">${c ? 'Edit on-set crew' : 'Add on-set crew'}</div>
          <div class="modal-sub">Their restrictions show up wherever you plan food for a job they're on.</div>
        </div>
        <button class="panel-close" id="modalCloseBtn" aria-label="Close">${ICONS.x}</button>
      </div>
      <form id="setCrewForm">
        <div class="form-grid">
          <div class="field"><label>Name</label><input type="text" name="name" required value="${UI.esc(c?.name || '')}" placeholder="Who's on set"></div>
          <div class="field"><label>Role on set</label><input type="text" name="position" value="${UI.esc(c?.position || '')}" placeholder="e.g. 1st AD, Gaffer, Director"></div>
          <div class="field wide">
            <label>Dietary restrictions</label>
            <div class="tag-check-row">
              ${Store.DIETARY.map(d => `
                <label class="tag-check">
                  <input type="checkbox" name="diet" value="${d}" ${(c?.dietary || []).includes(d) ? 'checked' : ''}>
                  ${d}
                </label>`).join('')}
            </div>
          </div>
          <div class="field wide">
            <label>Notes</label>
            <textarea name="notes" rows="3" placeholder="Severity, preferences, anything the truck should know…">${UI.esc(c?.notes || '')}</textarea>
          </div>
        </div>
        <div class="modal-foot">
          ${c ? `<button type="button" class="btn danger" id="scDeleteBtn" style="margin-right:auto">${ICONS.x} Remove</button>` : ''}
          <button type="button" class="btn" id="modalCancelBtn">Cancel</button>
          <button type="submit" class="btn primary">${c ? 'Save' : 'Add to on-set crew'}</button>
        </div>
      </form>
    `);
    const modal = document.getElementById('modal');
    modal.querySelector('#modalCloseBtn').onclick = UI.closeModal;
    modal.querySelector('#modalCancelBtn').onclick = UI.closeModal;
    const delBtn = modal.querySelector('#scDeleteBtn');
    if (delBtn) delBtn.onclick = () => {
      if (confirm(`Remove ${c.name} from the on-set crew list?`)) {
        Store.deleteSetCrew(c.id);
        UI.closeModal();
        UI.toast('Removed', 'x');
        App.refreshView();
      }
    };
    modal.querySelector('#setCrewForm').onsubmit = (e) => {
      e.preventDefault();
      const f = e.target;
      Store.upsertSetCrew({
        id: c?.id,
        name: f.elements.name.value.trim(),
        position: f.elements.position.value.trim(),
        dietary: [...f.querySelectorAll('input[name="diet"]:checked')].map(cb => cb.value),
        notes: f.elements.notes.value.trim(),
      });
      UI.closeModal();
      UI.toast(c ? 'Updated' : 'Added to on-set crew', 'check');
      App.refreshView();
    };
  }

  /* ============ Production companies (admin/mod only) ============ */

  function companiesSection() {
    const q = query.trim().toLowerCase();
    const companies = Store.get().companies.slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .filter(c => !q || c.name.toLowerCase().includes(q) || (c.contactName || '').toLowerCase().includes(q));
    const jobCount = (c) => Store.get().jobs.filter(j =>
      (j.productionCompany || '').trim().toLowerCase() === c.name.trim().toLowerCase()).length;
    return `
      <div class="section-head" style="margin-top:38px">
        <div>
          <div class="section-title">Production companies</div>
          <div class="section-hint">Billing addresses on file flow straight onto estimates and invoices.</div>
        </div>
        <button class="btn primary" id="addCompanyBtn">${ICONS.plus} Add company</button>
      </div>
      ${companies.length ? `<div class="dir-list">
        ${companies.map(c => `
          <div class="co-row">
            <span class="co-mark">${ICONS.briefcase}</span>
            <div>
              <div class="d-name">${UI.esc(c.name)}</div>
              <div class="d-pos">${UI.esc(c.contactName || '')}${c.contactName && jobCount(c) ? ' · ' : ''}${jobCount(c) ? jobCount(c) + ' job' + (jobCount(c) === 1 ? '' : 's') : ''}</div>
            </div>
            <div class="co-address">${UI.esc(c.billingAddress || '').replace(/\n/g, '<br>') || '<span style="color:var(--red)">No billing address</span>'}</div>
            <div class="d-contact">${UI.esc(c.email || '')}<br>${UI.esc(c.phone || '')}</div>
            <button class="icon-btn" style="width:30px;height:30px" data-edit-co="${c.id}" aria-label="Edit ${UI.esc(c.name)}">${ICONS.edit}</button>
          </div>`).join('')}
      </div>` : `
      <div class="empty">${ICONS.briefcase}
        <div class="e-title">${q ? 'No matches' : 'No companies yet'}</div>
        <div class="e-sub">${q ? `No company matches "${UI.esc(query)}".` : 'Add the production companies you bill so invoices fill themselves in.'}</div></div>`}`;
  }

  function openCompanyForm(companyId) {
    const c = companyId ? Store.company(companyId) : null;
    UI.openModal(`
      <div class="modal-head">
        <div>
          <div class="modal-title">${c ? 'Edit company' : 'Add production company'}</div>
          <div class="modal-sub">The billing address prints on every estimate and invoice for this company.</div>
        </div>
        <button class="panel-close" id="modalCloseBtn" aria-label="Close">${ICONS.x}</button>
      </div>
      <form id="companyForm">
        <div class="form-grid">
          <div class="field wide"><label>Company name</label><input type="text" name="name" required value="${UI.esc(c?.name || '')}" placeholder="e.g. Bellwoods Motion Co."></div>
          <div class="field wide">
            <label>Billing address</label>
            <textarea name="billingAddress" placeholder="Street, suite&#10;City Province Postal">${UI.esc(c?.billingAddress || '')}</textarea>
          </div>
          <div class="field"><label>Billing contact</label><input type="text" name="contactName" value="${UI.esc(c?.contactName || '')}" placeholder="Accounts payable contact"></div>
          <div class="field"><label>Phone</label><input type="tel" name="phone" value="${UI.esc(c?.phone || '')}"></div>
          <div class="field wide"><label>Billing email</label><input type="email" name="email" value="${UI.esc(c?.email || '')}" placeholder="ap@company.com"></div>
        </div>
        <div class="modal-foot">
          ${c ? `<button type="button" class="btn danger" id="companyDeleteBtn" style="margin-right:auto">${ICONS.x} Delete</button>` : ''}
          <button type="button" class="btn" id="modalCancelBtn">Cancel</button>
          <button type="submit" class="btn primary">${c ? 'Save' : 'Add company'}</button>
        </div>
      </form>
    `);
    const modal = document.getElementById('modal');
    modal.querySelector('#modalCloseBtn').onclick = UI.closeModal;
    modal.querySelector('#modalCancelBtn').onclick = UI.closeModal;
    const delBtn = modal.querySelector('#companyDeleteBtn');
    if (delBtn) delBtn.onclick = () => {
      if (confirm(`Remove ${c.name} from the directory? Existing jobs and invoices keep the name, but the billing address stops printing.`)) {
        Store.deleteCompany(c.id);
        UI.closeModal();
        UI.toast('Company removed', 'x');
        App.refreshView();
      }
    };
    modal.querySelector('#companyForm').onsubmit = (e) => {
      e.preventDefault();
      const f = e.target;
      Store.upsertCompany({
        id: c?.id,
        name: f.elements.name.value.trim(),
        billingAddress: f.elements.billingAddress.value.trim(),
        contactName: f.elements.contactName.value.trim(),
        phone: f.elements.phone.value.trim(),
        email: f.elements.email.value.trim(),
      });
      UI.closeModal();
      UI.toast(c ? 'Company updated' : 'Company added', 'check');
      App.refreshView();
    };
  }

  return { render, title: 'Directory' };
})();
