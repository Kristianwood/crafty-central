/* ============================================================
   Crafty Central — Directory
   Names, roles, contact info and dietary restrictions.
   ============================================================ */

window.Views = window.Views || {};

Views.directory = (() => {

  function render(el) {
    const people = Store.get().people.slice().sort((a, b) => {
      const order = { admin: 0, moderator: 1, crew: 2 };
      return order[a.role] - order[b.role] || a.name.localeCompare(b.name);
    });
    const canEdit = Store.can('editDirectory');
    const dietCount = people.filter(p => p.dietary.length).length;

    el.innerHTML = `
      <div class="view-enter">
        <div class="section-head">
          <div>
            <div class="section-title">Team directory</div>
            <div class="section-hint">${people.length} people · ${dietCount} with dietary restrictions on file.</div>
          </div>
          ${canEdit ? `<button class="btn primary" id="addPersonBtn">${ICONS.plus} Add person</button>` : ''}
        </div>

        <div class="dir-list stagger">
          ${people.map((p, i) => `
            <div class="dir-row" style="--i:${i}">
              ${UI.avatar(p)}
              <div>
                <div class="d-name">${UI.esc(p.name)}</div>
                <div class="d-pos">${UI.esc(p.position)}
                  ${(p.tags || []).map(t => `<span class="crew-role-tag">${UI.esc(t)}</span>`).join('')}
                </div>
              </div>
              <span class="role-tag ${p.role}">${p.role}</span>
              <div class="d-contact">${UI.esc(p.phone)}<br>${UI.esc(p.email)}</div>
              <div style="display:flex;align-items:center;gap:10px">
                <div class="dir-diet">
                  ${p.dietary.length
                    ? p.dietary.map(d => `<span class="diet-tag ${/severe|allerg/i.test(d) ? 'severe' : ''}">${UI.esc(d)}</span>`).join('')
                    : '<span class="diet-tag none">No restrictions</span>'}
                </div>
                ${canEdit ? `<button class="icon-btn" style="width:30px;height:30px" data-edit="${p.id}" aria-label="Edit">${ICONS.edit}</button>` : ''}
              </div>
            </div>`).join('')}
        </div>

        ${canEdit ? companiesSection() : ''}
      </div>`;

    const addBtn = el.querySelector('#addPersonBtn');
    if (addBtn) addBtn.onclick = () => openForm();
    el.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => openForm(b.dataset.edit));

    const addCoBtn = el.querySelector('#addCompanyBtn');
    if (addCoBtn) addCoBtn.onclick = () => openCompanyForm();
    el.querySelectorAll('[data-edit-co]').forEach(b => b.onclick = () => openCompanyForm(b.dataset.editCo));
  }

  /* ============ Production companies (admin/mod only) ============ */

  function companiesSection() {
    const companies = Store.get().companies.slice().sort((a, b) => a.name.localeCompare(b.name));
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
        <div class="e-title">No companies yet</div>
        <div class="e-sub">Add the production companies you bill so invoices fill themselves in.</div></div>`}`;
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

  function openForm(personId) {
    const p = personId ? Store.person(personId) : null;
    UI.openModal(`
      <div class="modal-head">
        <div>
          <div class="modal-title">${p ? 'Edit person' : 'Add person'}</div>
          <div class="modal-sub">Dietary restrictions show up automatically on any job they're crewed on.</div>
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
          <div class="field"><label>Phone</label><input type="tel" name="phone" value="${UI.esc(p?.phone || '')}" placeholder="+1 (416) …"></div>
          <div class="field wide"><label>Email</label><input type="email" name="email" value="${UI.esc(p?.email || '')}"></div>
          <div class="field wide">
            <label>Dietary restrictions</label>
            <input type="text" name="dietary" value="${UI.esc((p?.dietary || []).join(', '))}" placeholder="Comma-separated — e.g. Vegan, Nut allergy (severe)">
            <span class="hint">Mark severe allergies with "(severe)" so they flag in red.</span>
          </div>
        </div>
        <div class="modal-foot">
          <button type="button" class="btn" id="modalCancelBtn">Cancel</button>
          <button type="submit" class="btn primary">${p ? 'Save' : 'Add to directory'}</button>
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
        dietary: f.elements.dietary.value.split(',').map(s => s.trim()).filter(Boolean),
      });
      UI.closeModal();
      UI.toast(p ? 'Directory updated' : 'Added to the directory', 'check');
      App.refreshView(); App.renderRoleSwitch();
    };
  }

  return { render, title: 'Directory' };
})();
