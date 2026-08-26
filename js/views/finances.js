/* ============================================================
   Crafty Central — Finances (admin only)
   Estimates from job data, invoice list, simple doc preview.
   ============================================================ */

window.Views = window.Views || {};

Views.finances = (() => {
  let openDoc = null; // invoice id or 'est:'+jobId

  function render(el) {
    if (!Store.can('finances')) {
      el.innerHTML = `<div class="empty view-enter">${ICONS.finances}
        <div class="e-title">Admins only</div>
        <div class="e-sub">Financials are only visible to admin accounts.</div></div>`;
      return;
    }

    const jobs = Store.get().jobs;
    const invoices = Store.get().invoices.slice().reverse();
    const estimates = jobs.filter(j => j.status === 'estimate');
    const outstanding = invoices.filter(i => i.status !== 'paid')
      .reduce((s, i) => s + Store.invoiceTotal(i), 0);
    const collected = invoices.filter(i => i.status === 'paid')
      .reduce((s, i) => s + Store.invoiceTotal(i), 0);
    const pipeline = estimates.reduce((s, j) => s + Store.jobSubtotal(j), 0);

    el.innerHTML = `
      <div class="view-enter">
        <div class="stat-row stagger">
          <div class="stat-cell" style="--i:0">
            <div class="stat-label">Outstanding</div>
            <div class="stat-value">${UI.fmtMoney(outstanding).replace('.00','')}</div>
            <div class="stat-sub">${(n => `${n} unpaid invoice${n === 1 ? '' : 's'}`)(invoices.filter(i => i.status !== 'paid').length)}</div>
          </div>
          <div class="stat-cell" style="--i:1">
            <div class="stat-label">Collected · 30 days</div>
            <div class="stat-value">${UI.fmtMoney(collected).replace('.00','')}</div>
            <div class="stat-sub up">marked paid</div>
          </div>
          <div class="stat-cell" style="--i:2">
            <div class="stat-label">Estimate pipeline</div>
            <div class="stat-value">${UI.fmtMoney(pipeline).replace('.00','')}</div>
            <div class="stat-sub">${estimates.length} open estimate${estimates.length === 1 ? '' : 's'}</div>
          </div>
          <div class="stat-cell" style="--i:3">
            <div class="stat-label">HST rate</div>
            <div class="stat-value">13<span class="unit">%</span></div>
            <div class="stat-sub">Ontario</div>
          </div>
        </div>

        <div class="section-head">
          <div>
            <div class="section-title">Estimates</div>
            <div class="section-hint">Built live from the job sheet — headcount × per-head rate × days, plus the truck.</div>
          </div>
        </div>
        ${estimates.length ? `
        <table class="fin-table">
          <thead><tr><th>Production</th><th>Days</th><th class="num">Covers</th><th class="num">Subtotal</th><th class="num">With HST</th><th></th></tr></thead>
          <tbody>
            ${estimates.map(j => {
              const sub = Store.jobSubtotal(j);
              return `
              <tr class="clickable" data-doc="est:${j.id}">
                <td><strong>${UI.esc(j.productionName)}</strong><br><span style="color:var(--ink-3);font-size:12px">${UI.esc(j.productionCompany)}</span></td>
                <td style="font-family:var(--mono);font-size:12.5px">${UI.esc(UI.fmtRange(j.shootDays[0], j.shootDays[j.shootDays.length-1]))}</td>
                <td class="num">${Store.totalCovers(j)} covers</td>
                <td class="num">${UI.fmtMoney(sub)}</td>
                <td class="num fin-total">${UI.fmtMoney(sub * 1.13)}</td>
                <td style="text-align:right"><button class="btn sm" data-confirm-job="${j.id}">${ICONS.check} Confirm</button></td>
              </tr>
              ${openDoc === 'est:' + j.id ? `<tr><td colspan="6">${docHTML(j, null)}</td></tr>` : ''}`;
            }).join('')}
          </tbody>
        </table>` : `
        <div class="empty">${ICONS.doc}<div class="e-title">No open estimates</div><div class="e-sub">Jobs saved with status "Estimate" show up here priced out.</div></div>`}

        <div class="section-head">
          <div>
            <div class="section-title">Invoices</div>
            <div class="section-hint">Click a row to preview the document.</div>
          </div>
        </div>
        ${invoices.length ? `
        <table class="fin-table">
          <thead><tr><th>Nº</th><th>Production</th><th>Issued</th><th>Due</th><th class="num">Total</th><th>Status</th><th></th></tr></thead>
          <tbody>
            ${invoices.map(inv => {
              const j = Store.job(inv.jobId);
              if (!j) return '';
              return `
              <tr class="clickable" data-doc="${inv.id}">
                <td style="font-family:var(--mono)">${inv.number}</td>
                <td><strong>${UI.esc(j.productionName)}</strong></td>
                <td style="font-family:var(--mono);font-size:12.5px">${UI.fmtShort(inv.issuedOn)}</td>
                <td style="font-family:var(--mono);font-size:12.5px">${UI.fmtShort(inv.dueOn)}</td>
                <td class="num fin-total">${UI.fmtMoney(Store.invoiceTotal(inv))}</td>
                <td><span class="pill ${inv.status === 'paid' ? 'paid' : inv.status === 'sent' ? 'pending' : 'neutral'}">${inv.status}</span></td>
                <td style="text-align:right">
                  ${inv.status !== 'paid' ? `<button class="btn sm" data-paid="${inv.id}">${ICONS.check} Mark paid</button>` : ''}
                </td>
              </tr>
              ${openDoc === inv.id ? `<tr><td colspan="7">${docHTML(j, inv)}</td></tr>` : ''}`;
            }).join('')}
          </tbody>
        </table>` : `
        <div class="empty">${ICONS.doc}<div class="e-title">No invoices yet</div><div class="e-sub">Open a wrapped job and hit "Create invoice".</div></div>`}
      </div>`;

    el.querySelectorAll('[data-doc]').forEach(r => r.onclick = (e) => {
      if (e.target.closest('button')) return;
      openDoc = openDoc === r.dataset.doc ? null : r.dataset.doc;
      render(el);
    });
    el.querySelectorAll('[data-paid]').forEach(b => b.onclick = (e) => {
      e.stopPropagation();
      Store.markInvoice(b.dataset.paid, 'paid');
      UI.toast('Invoice marked paid', 'check');
      render(el);
    });
    el.querySelectorAll('[data-confirm-job]').forEach(b => b.onclick = (e) => {
      e.stopPropagation();
      const j = Store.job(b.dataset.confirmJob);
      j.status = 'confirmed';
      Store.save();
      Store.notify('all', `${j.productionName} is confirmed.`, 'check');
      UI.toast('Estimate confirmed — job is live', 'check');
      render(el); App.refreshBadges();
    });
  }

  function docHTML(j, inv) {
    const co = Store.companyByName(j.productionCompany);
    const attn = [j.pm && `${j.pm} (PM)`, j.producers].filter(Boolean).join(' · ');
    const days = j.shootDays.length;
    const perHead = j.rates?.perHead ?? 33;
    const truck = j.rates?.truckDay ?? 850;
    const covers = Store.totalCovers(j);
    const catering = covers * perHead;
    const truckTotal = truck * days;
    const sub = catering + truckTotal;
    const tax = sub * 0.13;
    return `
      <div class="doc">
        <div class="doc-head">
          <div>
            <div class="dh-brand">Crafty</div>
            <div style="font-size:11.5px;color:var(--ink-3)">Craft service &amp; catering · Toronto ON</div>
          </div>
          <div class="dh-meta">
            ${inv ? `${inv.number}<br>Issued ${UI.fmtShort(inv.issuedOn)} · Due ${UI.fmtShort(inv.dueOn)}` : 'ESTIMATE'}
          </div>
        </div>
        <div class="doc-billto">
          <div class="db-label">Bill to</div>
          <div class="db-body">
            <strong>${UI.esc(j.productionCompany)}</strong>
            ${co?.billingAddress
              ? `<br>${UI.esc(co.billingAddress).replace(/\n/g, '<br>')}`
              : `<br><span class="db-warn">${ICONS.alert} No billing address on file — add ${UI.esc(j.productionCompany)} under Directory → Production companies.</span>`}
            ${co?.email ? `<br><span style="font-family:var(--mono);font-size:11.5px">${UI.esc(co.email)}</span>` : ''}
            ${attn ? `<br><span style="color:var(--ink-2)">Attn: ${UI.esc(attn)}</span>` : ''}
          </div>
        </div>
        <table>
          <tr><th>Line item</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Amount</th></tr>
          <tr>
            <td>Full craft service — ${UI.esc(j.productionName)}</td>
            <td class="num">${covers} covers</td>
            <td class="num">${UI.fmtMoney(perHead)}</td>
            <td class="num">${UI.fmtMoney(catering)}</td>
          </tr>
          <tr>
            <td>Truck &amp; crew day rate</td>
            <td class="num">${days}d</td>
            <td class="num">${UI.fmtMoney(truck)}</td>
            <td class="num">${UI.fmtMoney(truckTotal)}</td>
          </tr>
          <tr><td colspan="3" style="text-align:right;color:var(--ink-2)">Subtotal</td><td class="num">${UI.fmtMoney(sub)}</td></tr>
          <tr><td colspan="3" style="text-align:right;color:var(--ink-2)">HST (13%)</td><td class="num">${UI.fmtMoney(tax)}</td></tr>
          <tr class="total"><td colspan="3" style="text-align:right">Total</td><td class="num">${UI.fmtMoney(sub + tax)}</td></tr>
        </table>
      </div>`;
  }

  return { render, title: 'Finances' };
})();
