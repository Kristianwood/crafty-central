/* ============================================================
   Crafty Central — Chat
   #crafty-hq company channel + DMs. Messages composed outside
   the active window (7am–9pm) queue and deliver at 7:00 AM.
   ============================================================ */

window.Views = window.Views || {};

Views.chat = (() => {
  let active = 'company';

  function render(el) {
    Store.releaseQueued();
    // live updates re-render this view — don't wipe a half-typed message
    const prevInput = el.querySelector('#composeInput');
    const draft = prevInput ? { value: prevInput.value, focused: document.activeElement === prevInput } : null;
    const meP = Store.me();
    const chans = Store.myChannels();
    const windowOpen = Store.chatWindowOpen();
    const s = Store.get().settings;

    // ensure active channel is still valid for this user
    if (active !== 'company' && !active.includes(meP.id)) active = 'company';

    const dmName = (chan) => {
      const other = chan.split(':').slice(1).find(id => id !== meP.id);
      return Store.person(other)?.name || 'Unknown';
    };

    const others = Store.get().people.filter(p => p.id !== meP.id);

    el.innerHTML = `
      <div class="view-enter chat-shell">
        <div class="chat-side">
          <div class="cs-label">Channels</div>
          <button class="chan-btn ${active === 'company' ? 'active' : ''}" data-chan="company">
            <span class="hash">#</span> crafty-hq
            ${Store.unread('company') && active !== 'company' ? '<span class="cb-unread"></span>' : ''}
          </button>
          <div class="cs-label">Direct messages</div>
          ${others.map(p => {
            const chan = Store.dmChannel(meP.id, p.id);
            return `
            <button class="chan-btn ${active === chan ? 'active' : ''}" data-chan="${chan}">
              ${UI.avatar(p, 'sm')} ${UI.esc(p.name.split(' ')[0])}
              ${Store.unread(chan) && active !== chan ? '<span class="cb-unread"></span>' : ''}
            </button>`;
          }).join('')}
        </div>

        <div class="chat-main">
          <div class="chat-title-bar">
            <div>
              <div class="ct-name">${active === 'company' ? '# crafty-hq' : dmName(active)}</div>
              <div class="ct-sub">${active === 'company' ? 'Everyone at Crafty' : 'Private conversation'}</div>
            </div>
            <span class="chat-window-pill ${windowOpen ? 'on' : 'off'}">
              <span class="pip"></span>
              ${windowOpen ? `Active until ${fmtHour(s.quietEnd)}` : `Quiet hours — opens ${fmtHour(s.quietStart)}`}
            </span>
          </div>

          <div class="chat-scroll" id="chatScroll">${messagesHTML()}</div>

          <div class="chat-compose">
            ${!windowOpen ? `
            <div class="chat-quiet-note">
              ${ICONS.moon}
              It's outside the ${fmtHour(s.quietStart)}–${fmtHour(s.quietEnd)} window. Your message will send automatically at ${fmtHour(s.quietStart)}.
            </div>` : ''}
            <form class="compose-row" id="composeForm">
              <input type="text" id="composeInput" placeholder="Message ${active === 'company' ? '#crafty-hq' : dmName(active).split(' ')[0]}…" autocomplete="off" maxlength="600">
              <button class="send-btn" type="submit" aria-label="Send">${ICONS.send}</button>
            </form>
          </div>
        </div>
      </div>`;

    Store.markRead(active);
    App.refreshBadges();

    el.querySelectorAll('[data-chan]').forEach(b => {
      b.onclick = () => { active = b.dataset.chan; render(el); };
    });

    const scroll = el.querySelector('#chatScroll');
    scroll.scrollTop = scroll.scrollHeight;

    if (draft && draft.value) {
      const inp = el.querySelector('#composeInput');
      inp.value = draft.value;
      if (draft.focused) inp.focus();
    }

    el.querySelector('#composeForm').onsubmit = (e) => {
      e.preventDefault();
      const inp = el.querySelector('#composeInput');
      const text = inp.value.trim();
      if (!text) return;
      const msg = Store.sendMessage(active, text);
      inp.value = '';
      if (msg.deliverAt > msg.sentAt) {
        UI.toast(`Queued — sends at ${fmtHour(Store.get().settings.quietStart)}`, 'moon');
      }
      // re-render just the scroll area to keep input focus
      scroll.innerHTML = messagesHTML();
      scroll.scrollTop = scroll.scrollHeight;
      inp.focus();
    };
  }

  function fmtHour(h) {
    const ap = h >= 12 ? 'PM' : 'AM';
    return `${((h + 11) % 12) + 1}:00 ${ap}`;
  }

  function messagesHTML() {
    const meP = Store.me();
    const msgs = Store.channelMessages(active);
    if (!msgs.length) {
      return `<div class="empty" style="margin:auto;border:none">
        ${ICONS.chat}
        <div class="e-title">No messages yet</div>
        <div class="e-sub">Say hello — everyone in this channel will see it.</div>
      </div>`;
    }
    let html = '';
    let lastDay = '';
    msgs.forEach(m => {
      const day = new Date(m.sentAt).toLocaleDateString('en-CA', { weekday: 'long', month: 'short', day: 'numeric' });
      if (day !== lastDay) { html += `<div class="day-divider">${day}</div>`; lastDay = day; }
      const p = Store.person(m.fromId);
      const mine = m.fromId === meP.id;
      const queued = m.deliverAt > Date.now();
      html += `
        <div class="msg ${mine ? 'mine' : ''} ${queued ? 'queued' : ''}">
          ${UI.avatar(p, 'sm')}
          <div class="msg-body">
            <div class="msg-head">
              <span class="msg-name">${mine ? 'You' : UI.esc(p.name.split(' ')[0])}</span>
              <span class="msg-time">${UI.fmtClock(m.sentAt)}</span>
            </div>
            <div class="msg-text">${UI.esc(m.text)}</div>
            ${queued ? `<span class="msg-queued-tag">${ICONS.moon} Sends at ${UI.fmtClock(m.deliverAt)}</span>` : ''}
          </div>
        </div>`;
    });
    return html;
  }

  return { render, title: 'Chat' };
})();
