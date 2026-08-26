/* Crafty Central — inline SVG icon set (stroke 2, 24 viewBox) */
const ICONS = (() => {
  const w = (paths) =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
  return {
    dashboard: w('<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>'),
    calendar: w('<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>'),
    schedule: w('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>'),
    chat: w('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>'),
    directory: w('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>'),
    finances: w('<path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>'),
    plus: w('<path d="M12 5v14M5 12h14"/>'),
    x: w('<path d="M18 6 6 18M6 6l12 12"/>'),
    chevDown: w('<path d="m6 9 6 6 6-6"/>'),
    chevLeft: w('<path d="m15 18-6-6 6-6"/>'),
    chevRight: w('<path d="m9 18 6-6-6-6"/>'),
    people: w('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/>'),
    menu: w('<path d="M3 11h18M5 11V7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v4M5 11l-1 8h16l-1-8M9 15h6"/>'),
    pin: w('<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>'),
    clock: w('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>'),
    note: w('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>'),
    alert: w('<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/>'),
    check: w('<path d="M20 6 9 17l-5-5"/>'),
    send: w('<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>'),
    moon: w('<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>'),
    bell: w('<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>'),
    truck: w('<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 8h4l3 3v5a1 1 0 0 1-1 1h-1"/><circle cx="7.5" cy="18" r="2"/><circle cx="17.5" cy="18" r="2"/><path d="M9.5 18h6"/>'),
    dollar: w('<path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>'),
    edit: w('<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>'),
    briefcase: w('<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>'),
    doc: w('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>'),
    palm: w('<path d="M12 22v-9"/><path d="M12 13c0-3 2.5-5.5 6-5.5 1.5 0 3 .5 4 1.5-1.5.5-2.5 2-6 2"/><path d="M12 13c0-3-2.5-5.5-6-5.5-1.5 0-3 .5-4 1.5 1.5.5 2.5 2 6 2"/><path d="M12 13c0-4 1-7 3-9-2 .5-3.5 2-4 4-.5-2-2-3.5-4-4 2 2 5 5 5 9"/>'),
  };
})();
