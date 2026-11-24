/* Jeu d'icônes des maquettes : traits de 1,8 px, grille 24, extrémités arrondies.
   Les marques Apple et Google sont les seules icônes pleines. */

(function () {
  "use strict";

  var STROKE = {
    logo: '<path d="M4 19V6l8 6 8-6v13"/>',
    home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    layers: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5"/><path d="m3 16 9 5 9-5"/>',
    cards: '<rect x="3" y="7" width="13" height="14" rx="3"/><path d="M8 3h10a3 3 0 0 1 3 3v11"/>',
    calendar: '<rect x="3" y="4.5" width="18" height="16.5" rx="3"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6"/>',
    bell: '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    check: '<path d="m5 12 4.5 4.5L19 7"/>',
    chevronLeft: '<path d="m14 6-6 6 6 6"/>',
    chevronRight: '<path d="m10 6 6 6-6 6"/>',
    chevronDown: '<path d="m6 9 6 6 6-6"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    flame: '<path d="M12 3c1.2 3.2-2 4.8-2 7.3a2 2 0 0 0 4 0c0-1-.3-1.8-.9-2.6 2 .7 3.9 2.8 3.9 5.6a5 5 0 0 1-10 0C7 9.4 10 6.2 12 3Z"/>',
    target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1.3"/>',
    alert: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5M12 16.2v.1"/>',
    sparkles: '<path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3Z"/><path d="M19 14.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z"/>',
    send: '<path d="M4.5 11.5 20 4l-7.5 15.5-2-6-6-2Z"/><path d="m10.5 13.5 4-4"/>',
    mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>',
    bookmark: '<path d="M6 4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5V21l-6-4-6 4z"/>',
    lock: '<rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    more: '<circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none"/>',
    settings: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h9M17 18h3"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="15" cy="18" r="2"/>',
    card: '<rect x="3" y="5.5" width="18" height="13" rx="3"/><path d="M3 10h18"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.2a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .9-1 1.6v.4M12 17v.1"/>',
    logout: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="m10 17 5-5-5-5M15 12H4"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m4 7 8 6 8-6"/>',
    play: '<path d="M8 5.5v13l11-6.5z"/>',
    pause: '<rect x="7" y="5" width="3.5" height="14" rx="1"/><rect x="14" y="5" width="3.5" height="14" rx="1"/>',
    arrowRight: '<path d="M4 12h15M13 6l6 6-6 6"/>',
    undo: '<path d="M4 9v5h5"/><path d="M4.5 13.5a8 8 0 1 0 1.7-7.2L4 9"/>',
    book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15.5H6.5A2.5 2.5 0 0 0 4 21z"/><path d="M4 18.5A2.5 2.5 0 0 1 6.5 16H20"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
    list: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1.2" fill="currentColor" stroke="none"/><circle cx="4.5" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="4.5" cy="18" r="1.2" fill="currentColor" stroke="none"/>',
    headphones: '<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="3" y="14" width="4" height="6" rx="2"/><rect x="17" y="14" width="4" height="6" rx="2"/>',
    moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8.2 8.2 0 1 0 10.5 10.5Z"/>',
    swipe: '<path d="M4 12h7M8 8l-4 4 4 4"/><path d="M20 12h-7M16 8l4 4-4 4"/>',
    refresh: '<path d="M20 5v5h-5"/><path d="M19.4 14a8 8 0 1 1-1.9-8.3L20 8"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    shield: '<path d="M12 3l7 3v6c0 4.2-3 7.4-7 9-4-1.6-7-4.8-7-9V6z"/><path d="m9 12 2 2 4-4"/>',
    pin: '<path d="M12 21s7-5.4 7-11a7 7 0 1 0-14 0c0 5.6 7 11 7 11Z"/><circle cx="12" cy="10" r="2.5"/>'
  };

  var FILL = {
    apple: '<path fill="currentColor" d="M16.37 1.43c.04 1.14-.4 2.2-1.24 3.03-.85.84-1.9 1.31-3.03 1.23-.05-1.1.44-2.2 1.24-3.02.8-.83 1.95-1.33 3.03-1.24ZM20.5 17.2c-.5 1.2-.74 1.73-1.38 2.79-.9 1.48-2.17 3.32-3.75 3.33-1.4.01-1.76-.9-3.66-.9-1.9 0-2.3.9-3.67.92-1.58.02-2.79-1.55-3.69-3.02-2.55-4.14-2.82-9-1.25-11.58 1.12-1.84 2.88-2.92 4.54-2.92 1.69 0 2.75.92 4.15.92 1.35 0 2.18-.92 4.13-.92 1.48 0 3.05.8 4.17 2.18-3.66 2.05-3.07 7.4.41 9.2Z"/>',
    google: '<path fill="#4285F4" d="M23.5 12.27c0-.79-.07-1.55-.2-2.27H12v4.3h6.46c-.28 1.5-1.12 2.76-2.39 3.61v3h3.86c2.26-2.08 3.57-5.15 3.57-8.64Z"/><path fill="#34A853" d="M12 24c3.24 0 5.95-1.07 7.93-2.91l-3.86-3c-1.07.72-2.44 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.95H1.28v3.1C3.25 21.3 7.31 24 12 24Z"/><path fill="#FBBC05" d="M5.27 14.29A7.2 7.2 0 0 1 4.89 12c0-.8.14-1.57.38-2.29v-3.1H1.28A12 12 0 0 0 0 12c0 1.93.46 3.76 1.28 5.39l3.99-3.1Z"/><path fill="#EA4335" d="M12 4.76c1.76 0 3.34.6 4.59 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0 7.31 0 3.25 2.7 1.28 6.61l3.99 3.1C6.22 6.87 8.87 4.76 12 4.76Z"/>'
  };

  function icon(name, size, cls) {
    size = size || 20;
    cls = cls || '';
    if (FILL[name]) {
      return '<svg class="ic ' + cls + '" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">' + FILL[name] + '</svg>';
    }
    return '<svg class="ic ' + cls + '" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + (STROKE[name] || '') + '</svg>';
  }

  function statusIcons() {
    return (
      '<span class="sb-right">' +
      '<svg width="17" height="11" viewBox="0 0 17 11" fill="currentColor" aria-hidden="true"><rect x="0" y="7" width="3" height="4" rx="1"/><rect x="4.6" y="5" width="3" height="6" rx="1"/><rect x="9.2" y="2.6" width="3" height="8.4" rx="1"/><rect x="13.8" y="0" width="3" height="11" rx="1"/></svg>' +
      '<svg width="16" height="12" viewBox="0 0 16 12" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="M1 4.3a10 10 0 0 1 14 0"/><path d="M3.7 7.1a6.3 6.3 0 0 1 8.6 0"/><circle cx="8" cy="10" r="1.15" fill="currentColor" stroke="none"/></svg>' +
      '<svg width="26" height="13" viewBox="0 0 26 13" fill="none" aria-hidden="true"><rect x="0.6" y="0.6" width="22" height="11.8" rx="3.4" stroke="currentColor" stroke-opacity=".38" stroke-width="1.1"/><rect x="2.4" y="2.4" width="17.4" height="8.2" rx="2" fill="currentColor"/><path d="M24.4 4.4v4.2" stroke="currentColor" stroke-opacity=".45" stroke-width="1.6" stroke-linecap="round"/></svg>' +
      '</span>'
    );
  }

  window.LearnyIcons = { icon: icon, statusIcons: statusIcons };
})();
