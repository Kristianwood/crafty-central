/* ============================================================
   Crafty Central — Menus
   The menu library: build menus once, then apply them to any
   job from the job sheet (or when creating the job).
   Admins + moderators only.
   ============================================================ */

window.Views = window.Views || {};

Views.menus = (() => {

  function render(el) {
    if (!Store.can('editJob')) {
      el.innerHTML = `<div class="empty view-enter">${ICONS.menu}
        <div class="e-title">Admins and moderators only</div>
        <div class="e-sub">Menus are managed by the office — the one on your job shows up on the job sheet.</div></div>`;
      return;
    }

    const menus = Store.get().menus.slice().sort((a, b) => a.name.localeCompare(b.name));
    const key = (items) => (items || []).join('|');
    const usedCount = (m) => Store.get().jobs.filter(j =>
      m.items.length && (key(j.menu) === key(m.items) ||
        Object.values(j.dayInfo || {}).some(d => Array.isArray(d.menu) && key(d.menu) === key(m.items)))).length;

    el.innerHTML = `
      <div class="view-enter">
        <div class="section-head">
          <div>
            <div class="section-title">Menu library</div>
            <div class="section-hint">Build a menu once, then apply it to any job from the job sheet. Jobs keep their own copy, so tweaking a saved menu never changes past jobs.</div>
          </div>
          <button class="btn primary" id="addMenuBtn">${ICONS.plus} New menu</button>
        </div>

        ${menus.length ? `<div class="menu-grid stagger">
          ${menus.map((m, i) => `
            <div class="menu-card" data-edit-menu="${m.id}" style="--i:${i}">
              <div class="mc-head">
                <span class="mc-icon">${ICONS.menu}</span>
                <div class="mc-title">
                  <span class="mc-name">${UI.esc(m.name)}</span>
                  <span class="mc-count">${m.items.length} item${m.items.length === 1 ? '' : 's'}${usedCount(m) ? ` · on ${usedCount(m)} job${usedCount(m) === 1 ? '' : 's'}` : ''}</span>
                </div>
                <span class="mc-edit">${ICONS.edit}</span>
              </div>
              <ul class="mc-items">
                ${m.items.slice(0, 5).map(it => `<li>${UI.esc(it)}</li>`).join('')}
                ${m.items.length > 5 ? `<li class="mc-more">+ ${m.items.length - 5} more</li>` : ''}
              </ul>
            </div>`).join('')}
        </div>` : `
        <div class="empty">${ICONS.menu}
          <div class="e-title">No menus yet</div>
          <div class="e-sub">Build your first menu — the crew sees it on every job you apply it to.</div>
          <div style="display:flex;justify-content:center;margin-top:16px">
            <button class="btn primary" id="emptyMenuBtn">${ICONS.plus} Build a menu</button>
          </div>
        </div>`}
      </div>`;

    const add = el.querySelector('#addMenuBtn');
    if (add) add.onclick = () => openForm();
    const emptyAdd = el.querySelector('#emptyMenuBtn');
    if (emptyAdd) emptyAdd.onclick = () => openForm();
    el.querySelectorAll('[data-edit-menu]').forEach(c => c.onclick = () => openForm(c.dataset.editMenu));
  }

  function openForm(menuId) {
    const m = menuId ? Store.menuTpl(menuId) : null;
    UI.openModal(`
      <div class="modal-head">
        <div>
          <div class="modal-title">${m ? 'Edit menu' : 'New menu'}</div>
          <div class="modal-sub">One item per line. Applying this menu to a job copies the items over.</div>
        </div>
        <button class="panel-close" id="modalCloseBtn" aria-label="Close">${ICONS.x}</button>
      </div>
      <form id="menuForm">
        <div class="field">
          <label>Menu name</label>
          <input type="text" name="name" required value="${UI.esc(m?.name || '')}" placeholder='e.g. Standard Shoot Day'>
        </div>
        <div class="field">
          <label>Items <span style="font-weight:400;color:var(--ink-3)">(one per line)</span></label>
          <textarea name="items" rows="9" placeholder="Breakfast burritos&#10;Espresso + drip station&#10;Hot lunch — protein + two sides&#10;Afternoon substantials">${UI.esc((m?.items || []).join('\n'))}</textarea>
        </div>
        <div class="modal-foot">
          ${m ? `<button type="button" class="btn danger" id="menuDeleteBtn" style="margin-right:auto">${ICONS.x} Delete</button>` : ''}
          <button type="button" class="btn" id="modalCancelBtn">Cancel</button>
          <button type="submit" class="btn primary">${m ? 'Save menu' : 'Create menu'}</button>
        </div>
      </form>
    `);

    const modal = document.getElementById('modal');
    modal.querySelector('#modalCloseBtn').onclick = UI.closeModal;
    modal.querySelector('#modalCancelBtn').onclick = UI.closeModal;

    const delBtn = modal.querySelector('#menuDeleteBtn');
    if (delBtn) delBtn.onclick = () => {
      if (confirm(`Delete the "${m.name}" menu? Jobs it was applied to keep their items.`)) {
        Store.deleteMenu(m.id);
        UI.closeModal();
        UI.toast('Menu deleted', 'x');
        App.refreshView();
      }
    };

    modal.querySelector('#menuForm').onsubmit = (e) => {
      e.preventDefault();
      const f = e.target;
      const name = f.elements.name.value.trim();
      const items = f.elements.items.value.split('\n').map(s => s.trim()).filter(Boolean);
      if (!name || !items.length) {
        UI.toast('A menu needs a name and at least one item', 'alert');
        return;
      }
      Store.upsertMenu({ id: m?.id, name, items });
      UI.closeModal();
      UI.toast(m ? 'Menu saved' : 'Menu created — apply it from any job sheet', 'check');
      App.refreshView();
    };
  }

  return { render, title: 'Menus' };
})();
