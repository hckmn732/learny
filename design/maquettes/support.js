/*
 * Moteur local minimal pour ouvrir les maquettes .dc.html dans un navigateur,
 * sans l'éditeur en ligne. Il prend en charge ce que ces maquettes utilisent :
 * {{trous}}, <sc-for>, <sc-if>, les événements (onClick, onChange), l'état
 * (setState) et le contenu de <helmet>.
 */
(function () {
  'use strict';

  /*
   * Échelle d'affichage des maquettes : 0.9 = tout est affiché à 90 %.
   * Les hauteurs en vh sont corrigées plus bas pour rester pleine hauteur.
   */
  var UI_ZOOM = 0.9;

  var hide = document.createElement('style');
  hide.textContent = [
    'x-dc{display:none!important}',
    'html{zoom:' + UI_ZOOM + '}',
    'html[data-sidebar="collapsed"] [data-sidebar]{display:none!important}',
    'html:not([data-sidebar="collapsed"]) [data-show-when="collapsed"]{display:none!important}',
    '[data-popover][hidden],[data-notif-empty][hidden],[data-notif-group][hidden],[data-notif-dot][hidden]{display:none!important}',
    '[data-sidebar]{scrollbar-width:none}',
    '[data-sidebar]::-webkit-scrollbar{display:none}',
    '@media (min-width: 900px){[data-sidebar]{position:sticky;top:0;height:calc(100vh / ' + UI_ZOOM + ');overflow-y:auto;align-self:flex-start}}',
    '[data-notif]{background:transparent;transition:background-color .15s}',
    '[data-notif][data-unread]{background:#F5F5FD}',
    '[data-notif]:hover{background:#F4F4F1}',
    '[data-notif]:not([data-unread]) [data-unread-dot]{display:none}',
    '[data-notif-filter][aria-pressed="true"]{background:#FFFFFF;color:#111113;font-weight:700;box-shadow:0 1px 3px rgba(17,17,19,.12)}',
    '[data-notif-filter][aria-pressed="false"]{background:transparent;color:#62626B;font-weight:500}',
    '[role="menuitem"]:hover{background:#F4F4F1!important}',
    '[data-tab-panel][hidden]{display:none!important}',
    '[data-tab][aria-selected="true"]{background:#FFFFFF;color:#111113;font-weight:600;box-shadow:0 1px 3px rgba(17,17,19,.12)}',
    '[data-tab][aria-selected="false"]{background:transparent;color:#62626B;font-weight:500}'
  ].join('\n');
  document.head.appendChild(hide);

  /* Coquille commune : menu latéral réductible (mémorisé), panneaux Notifications et Mon compte. */
  var SIDEBAR_KEY = 'tuteur.menu';
  var NOTIF_KEY = 'tuteur.notifications';
  var notifFilter = 'toutes';
  try {
    if (localStorage.getItem(SIDEBAR_KEY) === 'reduit') document.documentElement.setAttribute('data-sidebar', 'collapsed');
  } catch (err) { /* stockage indisponible */ }

  function isCollapsed() {
    return document.documentElement.getAttribute('data-sidebar') === 'collapsed';
  }

  function allRead() {
    try { return localStorage.getItem(NOTIF_KEY) === 'lues'; } catch (err) { return false; }
  }

  function syncNotifications() {
    var items = document.querySelectorAll('[data-notif]');
    if (!items.length) return;
    if (allRead()) {
      for (var i = 0; i < items.length; i++) items[i].removeAttribute('data-unread');
    }
    var unread = document.querySelectorAll('[data-notif][data-unread]').length;
    var dot = document.querySelector('[data-notif-dot]');
    if (dot) {
      dot.textContent = String(unread);
      if (unread) dot.removeAttribute('hidden'); else dot.setAttribute('hidden', '');
    }
    var bell = document.querySelector('[data-popover-toggle="notifications"]');
    if (bell) bell.setAttribute('aria-label', unread ? 'Notifications, ' + unread + ' non lue' + (unread > 1 ? 's' : '') : 'Notifications, aucune non lue');
    var count = document.querySelector('[data-count="non-lues"]');
    if (count) count.textContent = String(unread);
    var filters = document.querySelectorAll('[data-notif-filter]');
    for (var f = 0; f < filters.length; f++) filters[f].setAttribute('aria-pressed', filters[f].getAttribute('data-notif-filter') === notifFilter ? 'true' : 'false');
    var visible = 0;
    var groups = document.querySelectorAll('[data-notif-group]');
    for (var g = 0; g < groups.length; g++) {
      var shown = 0;
      var inGroup = groups[g].querySelectorAll('[data-notif]');
      for (var k = 0; k < inGroup.length; k++) {
        var show = notifFilter === 'toutes' || inGroup[k].hasAttribute('data-unread');
        inGroup[k].parentNode.hidden = !show;
        if (show) shown++;
      }
      groups[g].hidden = !shown;
      visible += shown;
    }
    var empty = document.querySelector('[data-notif-empty]');
    if (empty) empty.hidden = visible > 0;
  }

  /*
   * Onglets statiques : <button role="tab" data-tab="groupe:clé"> et <div data-tab-panel="groupe:clé">.
   * Le choix est gardé en mémoire et réappliqué après chaque rendu.
   */
  var tabState = {};

  function syncTabs() {
    var buttons = document.querySelectorAll('[data-tab]');
    var i, parts;
    for (i = 0; i < buttons.length; i++) {
      parts = buttons[i].getAttribute('data-tab').split(':');
      if (!(parts[0] in tabState) && buttons[i].getAttribute('aria-selected') === 'true') tabState[parts[0]] = parts[1];
    }
    for (i = 0; i < buttons.length; i++) {
      parts = buttons[i].getAttribute('data-tab').split(':');
      var on = tabState[parts[0]] === parts[1];
      buttons[i].setAttribute('aria-selected', on ? 'true' : 'false');
      buttons[i].setAttribute('tabindex', on ? '0' : '-1');
    }
    var panels = document.querySelectorAll('[data-tab-panel]');
    for (i = 0; i < panels.length; i++) {
      parts = panels[i].getAttribute('data-tab-panel').split(':');
      panels[i].hidden = tabState[parts[0]] !== parts[1];
    }
  }

  function syncShell() {
    var collapsed = isCollapsed();
    var toggles = document.querySelectorAll('[data-action="toggle-sidebar"]');
    for (var i = 0; i < toggles.length; i++) toggles[i].setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    syncNotifications();
    syncTabs();
  }

  function popoverToggle(name) {
    return document.querySelector('[data-popover-toggle="' + name + '"]');
  }

  function closePopovers(focusName) {
    var open = document.querySelectorAll('[data-popover]:not([hidden])');
    for (var i = 0; i < open.length; i++) {
      var name = open[i].getAttribute('data-popover');
      open[i].setAttribute('hidden', '');
      var button = popoverToggle(name);
      if (button) {
        button.setAttribute('aria-expanded', 'false');
        if (focusName) button.focus();
      }
    }
  }

  function openPopover(name) {
    var panel = document.querySelector('[data-popover="' + name + '"]');
    var button = popoverToggle(name);
    if (!panel) return;
    closePopovers(false);
    panel.removeAttribute('hidden');
    if (button) button.setAttribute('aria-expanded', 'true');
    var first = panel.querySelector('[role="menuitem"], [aria-pressed="true"], button, a[href]');
    if (first) first.focus();
  }

  document.addEventListener('click', function (ev) {
    var target = ev.target;
    if (!target || !target.closest) return;
    if (target.closest('[data-action="toggle-sidebar"]')) {
      var collapse = !isCollapsed();
      if (collapse) document.documentElement.setAttribute('data-sidebar', 'collapsed');
      else document.documentElement.removeAttribute('data-sidebar');
      try { localStorage.setItem(SIDEBAR_KEY, collapse ? 'reduit' : 'ouvert'); } catch (err) { /* stockage indisponible */ }
      syncShell();
      var next = document.querySelector(collapse ? '[data-show-when="collapsed"]' : '[data-sidebar] [data-action="toggle-sidebar"]');
      if (next) next.focus();
      return;
    }
    var toggle = target.closest('[data-popover-toggle]');
    if (toggle) {
      var name = toggle.getAttribute('data-popover-toggle');
      if (toggle.getAttribute('aria-expanded') === 'true') closePopovers(false);
      else openPopover(name);
      return;
    }
    var tabButton = target.closest('[data-tab]');
    if (tabButton) {
      var tp = tabButton.getAttribute('data-tab').split(':');
      tabState[tp[0]] = tp[1];
      syncTabs();
      return;
    }
    var filter = target.closest('[data-notif-filter]');
    if (filter) {
      notifFilter = filter.getAttribute('data-notif-filter');
      syncNotifications();
      return;
    }
    if (target.closest('[data-action="notif-read-all"]')) {
      try { localStorage.setItem(NOTIF_KEY, 'lues'); } catch (err) { /* stockage indisponible */ }
      var items = document.querySelectorAll('[data-notif]');
      for (var i = 0; i < items.length; i++) items[i].removeAttribute('data-unread');
      syncNotifications();
      return;
    }
    if (!target.closest('[data-popover]')) closePopovers(false);
  });

  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape') closePopovers(true);
    var tab = ev.target && ev.target.closest && ev.target.closest('[data-tab]');
    if (tab && (ev.key === 'ArrowRight' || ev.key === 'ArrowLeft')) {
      var list = tab.closest('[role="tablist"]');
      var all = list ? Array.prototype.slice.call(list.querySelectorAll('[data-tab]')) : [tab];
      var next = all[(all.indexOf(tab) + (ev.key === 'ArrowRight' ? 1 : all.length - 1)) % all.length];
      var np = next.getAttribute('data-tab').split(':');
      tabState[np[0]] = np[1];
      syncTabs();
      next.focus();
      ev.preventDefault();
    }
  });

  var comp = null;
  var tpl = null;
  var root = null;
  var pending = false;

  function schedule() {
    if (pending) return;
    pending = true;
    Promise.resolve().then(function () {
      pending = false;
      draw();
    });
  }

  function DCLogic(props) {
    this.props = props || {};
    this.state = undefined;
  }
  DCLogic.prototype.setState = function (patch) {
    var next = typeof patch === 'function' ? patch(this.state, this.props) : patch;
    this.state = Object.assign({}, this.state || {}, next || {});
    schedule();
  };
  DCLogic.prototype.forceUpdate = function () {
    schedule();
  };

  var HOLE = /\{\{\s*([^}]*?)\s*\}\}/g;
  var WHOLE = /^\s*\{\{\s*([^}]*?)\s*\}\}\s*$/;
  var EVENTS = {
    onclick: 'click', onchange: 'change', oninput: 'input', onsubmit: 'submit',
    onkeydown: 'keydown', onkeyup: 'keyup', onfocus: 'focus', onblur: 'blur',
    onmouseenter: 'mouseenter', onmouseleave: 'mouseleave'
  };

  function resolve(expr, scope) {
    expr = (expr || '').trim();
    if (expr === 'true') return true;
    if (expr === 'false') return false;
    if (expr === 'null') return null;
    if (expr === 'undefined' || expr === '') return undefined;
    if (/^-?\d+(\.\d+)?$/.test(expr)) return Number(expr);
    var quoted = expr.match(/^(['"])(.*)\1$/);
    if (quoted) return quoted[2];
    var parts = expr.split('.');
    var cur = scope;
    for (var i = 0; i < parts.length; i++) {
      if (cur == null) return undefined;
      cur = cur[parts[i]];
    }
    return cur;
  }

  function interpolate(str, scope) {
    return str.replace(HOLE, function (_, expr) {
      var v = resolve(expr, scope);
      return v == null ? '' : String(v);
    });
  }

  function isTextField(el) {
    if (el.localName === 'textarea') return true;
    if (el.localName !== 'input') return false;
    var type = (el.getAttribute('type') || 'text').toLowerCase();
    return !/^(checkbox|radio|file|range|color|submit|button|reset)$/.test(type);
  }

  function renderChildren(node, scope, out) {
    for (var i = 0; i < node.childNodes.length; i++) render(node.childNodes[i], scope, out);
  }

  function render(node, scope, out) {
    if (node.nodeType === 3) {
      var text = node.nodeValue;
      out.push(document.createTextNode(text.indexOf('{{') >= 0 ? interpolate(text, scope) : text));
      return;
    }
    if (node.nodeType !== 1) return;
    var tag = node.localName;
    if (tag === 'helmet') return;
    if (tag === 'sc-for') {
      var listMatch = (node.getAttribute('list') || '').match(WHOLE);
      var list = listMatch ? resolve(listMatch[1], scope) : null;
      var as = node.getAttribute('as') || 'item';
      if (list && list.length) {
        for (var i = 0; i < list.length; i++) {
          var child = Object.create(scope);
          child[as] = list[i];
          child.$index = i;
          renderChildren(node, child, out);
        }
      }
      return;
    }
    if (tag === 'sc-if') {
      var condMatch = (node.getAttribute('value') || '').match(WHOLE);
      if (condMatch && resolve(condMatch[1], scope)) renderChildren(node, scope, out);
      return;
    }

    var el = node.namespaceURI && node.namespaceURI !== 'http://www.w3.org/1999/xhtml'
      ? document.createElementNS(node.namespaceURI, node.localName)
      : document.createElement(tag);
    var events = [];
    var hasValue = false;
    var value;
    var checked;
    var options = null;

    for (var a = 0; a < node.attributes.length; a++) {
      var name = node.attributes[a].name;
      var raw = node.attributes[a].value;
      var lname = name.toLowerCase();
      if (lname.indexOf('hint-') === 0) continue;
      var whole = raw.match(WHOLE);
      if (whole) {
        var v = resolve(whole[1], scope);
        if (lname.indexOf('on') === 0) {
          if (typeof v === 'function') events.push([lname, v]);
          continue;
        }
        if (lname === 'value') { hasValue = true; value = v; continue; }
        /* <select data-options="{{liste}}"> : options construites ici, car les navigateurs
           retirent les éléments inconnus placés dans un <select>. */
        if (lname === 'data-options') { if (Array.isArray(v)) options = v; continue; }
        if (lname === 'checked') { checked = !!v; continue; }
        if (v === false || v == null) continue;
        if (v === true && lname.indexOf('aria-') !== 0) { el.setAttribute(name, ''); continue; }
        el.setAttribute(name, String(v));
      } else if (raw.indexOf('{{') >= 0) {
        el.setAttribute(name, interpolate(raw, scope));
      } else {
        el.setAttribute(name, raw);
      }
    }

    var kids = [];
    renderChildren(node, scope, kids);
    for (var k = 0; k < kids.length; k++) el.appendChild(kids[k]);
    if (options) {
      for (var o = 0; o < options.length; o++) {
        var opt = document.createElement('option');
        opt.value = String(options[o].value);
        opt.textContent = String(options[o].label);
        el.appendChild(opt);
      }
    }

    for (var e = 0; e < events.length; e++) {
      var evt = EVENTS[events[e][0]] || events[e][0].slice(2);
      if (events[e][0] === 'onchange' && isTextField(el)) evt = 'input';
      el.addEventListener(evt, events[e][1]);
    }
    if (hasValue) {
      el.value = value == null ? '' : String(value);
      el._dcBound = true;
    }
    if (checked !== undefined) el.checked = checked;
    out.push(el);
  }

  function pathOf(n) {
    var p = [];
    while (n && n !== root) {
      var i = 0;
      var s = n;
      while ((s = s.previousSibling)) i++;
      p.unshift(i);
      n = n.parentNode;
    }
    return n === root ? p : null;
  }

  function byPath(p) {
    var n = root;
    for (var i = 0; n && i < p.length; i++) n = n.childNodes[p[i]];
    return n;
  }

  function draw() {
    var active = document.activeElement;
    var focusPath = null;
    var selStart = null;
    var selEnd = null;
    if (active && root.contains(active)) {
      focusPath = pathOf(active);
      try { selStart = active.selectionStart; selEnd = active.selectionEnd; } catch (err) { /* champ sans sélection */ }
    }
    var saved = [];
    var fields = root.querySelectorAll('input, textarea, select');
    for (var f = 0; f < fields.length; f++) {
      if (!fields[f]._dcBound) saved.push({ id: fields[f].id, tag: fields[f].localName, path: pathOf(fields[f]), value: fields[f].value, checked: fields[f].checked, type: fields[f].type });
    }

    var vals = comp.renderVals() || {};
    var out = [];
    renderChildren(tpl, vals, out);
    root.textContent = '';
    for (var i = 0; i < out.length; i++) root.appendChild(out[i]);

    for (var s = 0; s < saved.length; s++) {
      /* Un champ retrouve sa valeur par son id ; sans id, par sa place, s'il est du même type. */
      var field = saved[s].id ? document.getElementById(saved[s].id) : (saved[s].path && byPath(saved[s].path));
      if (field && !root.contains(field)) field = null;
      if (field && (field.localName !== saved[s].tag || field.type !== saved[s].type)) field = null;
      if (field && !field._dcBound && /^(input|textarea|select)$/.test(field.localName || '')) {
        if (saved[s].type === 'checkbox' || saved[s].type === 'radio') field.checked = saved[s].checked;
        else field.value = saved[s].value;
      }
    }
    if (focusPath) {
      var target = byPath(focusPath);
      if (target && target.focus) {
        target.focus({ preventScroll: true });
        try { if (selStart != null) target.setSelectionRange(selStart, selEnd); } catch (err) { /* champ sans sélection */ }
      }
    }
    syncShell();
    /* Écrans qui gèrent une partie de leur affichage eux-mêmes (la carte des notions). */
    if (mounted && typeof comp.componentDidUpdate === 'function') comp.componentDidUpdate();
  }

  var mounted = false;

  function mount() {
    var x = document.querySelector('x-dc');
    var script = document.querySelector('script[data-dc-script]');
    if (!x || !script) return;

    var helmet = x.querySelector('helmet');
    if (helmet) {
      for (var i = 0; i < helmet.children.length; i++) document.head.appendChild(helmet.children[i].cloneNode(true));
    }

    var props = {};
    try {
      var decl = JSON.parse(script.getAttribute('data-props') || '{}');
      Object.keys(decl).forEach(function (key) {
        if (key.charAt(0) !== '$' && decl[key] && Object.prototype.hasOwnProperty.call(decl[key], 'default')) props[key] = decl[key]['default'];
      });
    } catch (err) { /* data-props absent ou invalide */ }

    var Component = new Function('DCLogic', script.textContent + '\nreturn Component;')(DCLogic);
    comp = new Component(props);

    tpl = x;
    root = document.createElement('div');
    root.setAttribute('data-dc-root', '');
    x.parentNode.insertBefore(root, x);
    x.parentNode.removeChild(x);

    draw();
    mounted = true;
    if (typeof comp.componentDidMount === 'function') comp.componentDidMount();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
