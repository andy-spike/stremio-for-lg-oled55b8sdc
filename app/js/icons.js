// Inline SVG icons: one family on a 24-unit grid, 2px round strokes (the
// play/pause glyphs are filled so they read at a distance). Icons inherit
// currentColor, so focus states only change `color`.

var Icons = (function () {
  var PATHS = {
    play: '<path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z" fill="currentColor" stroke="none"/>',
    pause: '<rect x="5.5" y="4" width="4.5" height="16" rx="1.2" fill="currentColor" stroke="none"/><rect x="14" y="4" width="4.5" height="16" rx="1.2" fill="currentColor" stroke="none"/>',
    audio: '<path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 11v2"/>',
    subtitles: '<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M6.5 15h4M13 15h4.5M6.5 11.5h7.5M16.5 11.5h1"/>',
    back10: '<path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1"/><path d="M3.5 3.8v4.4h4.4"/><text x="12" y="15.1" text-anchor="middle" font-size="8.4" font-weight="700" font-family="sans-serif" fill="currentColor" stroke="none">10</text>',
    forward10: '<path d="M20.5 12a8.5 8.5 0 1 1-2.6-6.1"/><path d="M20.5 3.8v4.4h-4.4"/><text x="12" y="15.1" text-anchor="middle" font-size="8.4" font-weight="700" font-family="sans-serif" fill="currentColor" stroke="none">10</text>',
    next: '<path d="M5 5l9 7-9 7z" fill="currentColor" stroke-linejoin="round"/><path d="M19 5v14"/>',
    sources: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
    check: '<path d="M4.5 12.5l5 5 10-11"/>',
    chevronLeft: '<path d="M15 5l-7 7 7 7"/>',
    chevronRight: '<path d="M9 5l7 7-7 7"/>',
    chevronDown: '<path d="M5 9l7 7 7-7"/>',
    chevronUp: '<path d="M5 15l7-7 7 7"/>',
    back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
    retry: '<path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 4v5h-5"/>',
    alert: '<circle cx="12" cy="12" r="9.5"/><path d="M12 7.5v5.5M12 16.5v.01"/>',
    peers: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.2a6.5 6.5 0 0 1 3.5 5.8"/>',
    download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
    convert: '<path d="M4 9h13l-3-3M20 15H7l3 3"/>',
    size: '<path d="M4 7V5h16v2M12 5v14M9 19h6"/>',
    clock: '<circle cx="12" cy="12" r="9.5"/><path d="M12 7v5l3 2"/>',
    home: '<path d="M3.5 10.5L12 3.5l8.5 7"/><path d="M5.5 9v11h13V9"/><path d="M10 20v-5.5h4V20"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L20.5 20.5"/>',
    library: '<path d="M6 3.5h12v17l-6-4-6 4z"/>',
    settings: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2.2"/><circle cx="10" cy="17" r="2.2"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3.5 7l8.5 6 8.5-6"/>',
    star: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z" fill="currentColor"/>',
    signOut: '<path d="M14 4h4.5a1.5 1.5 0 0 1 1.5 1.5v13a1.5 1.5 0 0 1-1.5 1.5H14"/><path d="M10 16l-4-4 4-4M6 12h10"/>',
    server: '<rect x="3.5" y="4" width="17" height="7" rx="1.5"/><rect x="3.5" y="13" width="17" height="7" rx="1.5"/><path d="M7.5 7.5v.01M7.5 16.5v.01"/>'

  };

  function svg(name, cls) {
    var span = document.createElement("span");
    span.className = "icon" + (cls ? " " + cls : "");
    span.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (PATHS[name] || "") + "</svg>";
    return span;
  }

  return { svg: svg };
})();
