/* Coquille des appareils, navigation du prototype et interactions.
   Aucune dépendance : ouvrir index.html ou view.html directement.
   Tout est simulé localement : chaque bouton produit un état, un toast,
   une feuille ou une transition. */

(function () {
  "use strict";

  var Icons = window.LearnyIcons;
  var Screens = window.LearnyScreens;
  var icon = Icons.icon;

  function chip(label, tone) {
    return '<span class="chip ' + (tone || "") + '">' + label + "</span>";
  }

  var META = {
    ios: { dw: 415, dh: 874, w: 393, h: 852 },
    android: { dw: 432, dh: 935, w: 412, h: 915 }
  };

  var TABS = [
    ["today", "Aujourd’hui", "home"],
    ["programme", "Programme", "layers"],
    ["revise", "Réviser", "cards"],
    ["agenda", "Agenda", "calendar"],
    ["profile", "Profil", "user"]
  ];

  var TAB_SCREENS = { today: true, programme: true, session: true, agenda: true, profile: true };
  var boardPlatform = "ios";
  var toastSeq = 0;

  function frameSize(platform, plain) {
    var meta = META[platform];
    return plain ? { dw: meta.w, dh: meta.h } : { dw: meta.dw, dh: meta.dh };
  }

  function later(device, fn, ms) {
    setTimeout(function () {
      if (device && device.isConnected) fn();
    }, ms);
  }

  function statusBar() {
    return '<div class="statusbar"><span>13:20</span>' + Icons.statusIcons() + "</div>";
  }

  function tabBar(p, active) {
    var items = TABS.map(function (tab) {
      var key = tab[0];
      var target = key === "revise" ? "session" : key;
      var current = active === key ? ' aria-current="page"' : "";
      return (
        '<button type="button" class="tab" data-nav="' + target + '" data-t="tab"' + current + ">" +
        '<span class="tab-ic">' + icon(tab[2], p === "ios" ? 24 : 23) + "</span>" +
        "<span>" + tab[1] + "</span>" +
        "</button>"
      );
    }).join("");
    return '<nav class="tabbar" aria-label="Navigation principale">' + items + "</nav>";
  }

  /* ------------------------------------------------------------------ */
  /* Etat                                                               */
  /* ------------------------------------------------------------------ */

  function initialState(options) {
    return {
      platform: options.platform || "ios",
      screen: options.screen || "today",
      plain: !!options.plain,
      sheet: options.sheet ? "tutor" : null,
      sheetData: {},
      transition: null,
      pick: null,
      checked: false,
      qi: 0,
      card: 0,
      reveal: false,
      quizPaused: false,
      toast: null,
      authMode: "login",
      loading: false,
      snoozed: false,
      reprise: "propose",
      bookedSlot: null,
      slotsOpen: false,
      bookmark: false,
      messages: [],
      typing: false,
      answers: [],
      reportCancelled: false,
      day: 11,
      agendaView: "jour",
      agendaFilter: "sap",
      programmeView: "modules",
      mod2Open: false,
      notifFilter: "all",
      readAll: false,
      readIds: {},
      settings: { rappel: true, sons: true, eco: false, serie: true, bilan: true, lacunes: true },
      rhythmDays: [1, 2, 3, 4, 5],
      identity: { name: "Alex Perrin", email: "alex.perrin@exemple.fr" },
      importStep: 0,
      model: "Claude",
      _renderedSheet: null
    };
  }

  /* ------------------------------------------------------------------ */
  /* Rendu                                                              */
  /* ------------------------------------------------------------------ */

  function render(device, opts) {
    opts = opts || {};
    var st = device._state;
    var p = st.platform;
    var meta = frameSize(p, st.plain);
    var previousScreen = device.dataset.screen;
    var previousSheet = st._renderedSheet;
    var scroller = device.querySelector(".app-scroll");
    var previousScroll = scroller ? scroller.scrollTop : 0;
    var sheetScroller = device.querySelector(".sheet-body");
    var previousSheetScroll = sheetScroller ? sheetScroller.scrollTop : 0;

    device.dataset.platform = p;
    device.dataset.screen = st.screen;
    device.dataset.plain = st.plain ? "1" : "0";
    device.style.setProperty("--dw", meta.dw);
    device.style.setProperty("--dh", meta.dh);

    var app = device.querySelector(".app");
    app.dataset.p = p;
    var screen = Screens.render(p, st);

    var anim = st.transition ? " anim-" + st.transition : "";
    st.transition = null;

    var html = statusBar(p) + '<div class="app-scroll' + anim + '">' + screen.body + "</div>";
    if (screen.tab) html += tabBar(p, screen.tab);
    if (screen.foot) html += screen.foot;
    if (screen.fab) {
      html += '<button type="button" class="fab" data-act="open-sheet" data-sheet="newFormation" aria-label="Nouvelle formation">' + icon("plus", 22) + "</button>";
    }
    if (st.sheet) html += sheetHTML(p, st, opts);
    if (st.toast) html += toastHTML(st.toast);
    html += '<span class="home-bar" aria-hidden="true"></span>';
    app.innerHTML = html;

    var nextScroller = app.querySelector(".app-scroll");
    if (nextScroller) {
      if (opts.keepScroll && previousScreen === st.screen) nextScroller.scrollTop = previousScroll;
      if (st.screen === "cours") {
        nextScroller.addEventListener("scroll", function () { updateReadProgress(device); }, { passive: true });
        updateReadProgress(device);
      }
    }

    st._renderedSheet = st.sheet;
    var body = app.querySelector(".sheet-body");
    if (body) {
      if (st.sheet === previousSheet && previousSheetScroll) body.scrollTop = previousSheetScroll;
      if (st.sheet === "tutor" && opts.scrollChat) body.scrollTop = body.scrollHeight;
    }
    if (opts.focusSheet) {
      var close = app.querySelector(".sheet [data-close-sheet]");
      if (close) close.focus({ preventScroll: true });
    }
    if (st.toast) scheduleToast(device, st.toast.id);
  }

  function toastHTML(toast) {
    return '<div class="toast" role="status" data-toast="' + toast.id + '"><span class="toast-dot"></span>' + toast.text + "</div>";
  }

  function scheduleToast(device, id) {
    if (device._toastTimer === id) return;
    device._toastTimer = id;
    later(device, function () {
      var st = device._state;
      var el = device.querySelector('[data-toast="' + id + '"]');
      if (el) {
        el.classList.add("is-out");
        setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 220);
      }
      if (st.toast && st.toast.id === id) st.toast = null;
    }, 2800);
  }

  function showToast(device, text) {
    var st = device._state;
    st.toast = { id: ++toastSeq, text: text };
    render(device, { keepScroll: true, sheetUpdate: true });
  }

  function updateReadProgress(device) {
    var app = device.querySelector(".app");
    var scroller = app && app.querySelector(".app-scroll");
    var bar = app && app.querySelector(".readbar > span");
    if (!scroller || !bar) return;
    var max = scroller.scrollHeight - scroller.clientHeight;
    var ratio = max > 0 ? Math.min(1, Math.max(0, scroller.scrollTop / max)) : 0;
    bar.style.width = Math.round((0.52 + 0.48 * ratio) * 100) + "%";
  }

  /* ------------------------------------------------------------------ */
  /* Navigation, feuilles, toasts                                       */
  /* ------------------------------------------------------------------ */

  function go(device, screen, kind) {
    var st = device._state;
    if (screen === "quiz" && st.screen !== "quiz" && !st.quizPaused) {
      st.qi = 0;
      st.pick = null;
      st.checked = false;
      st.answers = [];
    }
    if (screen === "quiz") st.quizPaused = false;
    st.screen = screen;
    st.sheet = null;
    st.transition = kind || "fwd";
    render(device);
  }

  function openSheet(device, name, data) {
    var st = device._state;
    st._focus = document.activeElement;
    st.sheet = name;
    st.sheetData = data || {};
    render(device, { keepScroll: true, focusSheet: true });
  }

  function closeSheet(device) {
    var st = device._state;
    var sheet = device.querySelector(".sheet");
    var backdrop = device.querySelector(".sheet-backdrop");
    if (!sheet) {
      st.sheet = null;
      render(device, { keepScroll: true });
      return;
    }
    sheet.classList.add("is-closing");
    if (backdrop) backdrop.classList.add("is-closing");
    st.sheet = null;
    later(device, function () {
      render(device, { keepScroll: true });
      if (st._focus && st._focus.focus) st._focus.focus({ preventScroll: true });
    }, 190);
  }

  /* ------------------------------------------------------------------ */
  /* Feuilles                                                           */
  /* ------------------------------------------------------------------ */

  function sheetHead(title, sub, iconName) {
    return (
      '<div class="sheet-head">' +
      '<span class="sheet-icon">' + icon(iconName || "sparkles", 18) + "</span>" +
      '<div class="grow"><h2>' + title + "</h2>" + (sub ? "<p>" + sub + "</p>" : "") + "</div>" +
      '<button type="button" class="iconbtn is-plain" data-close-sheet aria-label="Fermer">' + icon("x", 18) + "</button>" +
      "</div>"
    );
  }

  function sheetHTML(p, st, opts) {
    var builder = SHEETS[st.sheet];
    if (!builder) return "";
    var cfg = builder(p, st);
    if (!cfg) return "";
    var instant = opts && opts.sheetUpdate && st._renderedSheet === st.sheet ? " is-instant" : "";
    return (
      '<div class="sheet-backdrop' + instant + '" data-close-sheet aria-hidden="true"></div>' +
      '<section class="sheet' + instant + '" role="dialog" aria-modal="true" aria-label="' + cfg.title + '">' +
      '<div class="sheet-grab" aria-hidden="true"></div>' +
      sheetHead(cfg.title, cfg.sub, cfg.icon) +
      '<div class="sheet-body">' + cfg.body + "</div>" +
      (cfg.foot ? '<div class="sheet-foot">' + cfg.foot + "</div>" : "") +
      "</section>"
    );
  }

  function toggleRow(label, sub, on, key) {
    return (
      '<button type="button" class="pref-row" data-act="toggle" data-key="' + key + '">' +
      '<span class="grow"><b>' + label + "</b>" + (sub ? "<span>" + sub + "</span>" : "") + "</span>" +
      '<span class="switch" role="switch" aria-checked="' + !!on + '" aria-label="' + label + '"></span>' +
      "</button>"
    );
  }

  function radioRow(label, sub, on, act, data) {
    return (
      '<button type="button" class="radio-row" data-act="' + act + '" ' + (data || "") + ' aria-pressed="' + !!on + '">' +
      '<span class="radio-dot" aria-hidden="true"></span>' +
      '<span class="grow"><b>' + label + "</b>" + (sub ? "<span>" + sub + "</span>" : "") + "</span>" +
      (on ? icon("check", 16) : "") +
      "</button>"
    );
  }

  function notifItem(st, n) {
    var unread = !Screens.notifRead(st, n.id);
    return (
      '<button type="button" class="notif-item' + (unread ? " is-unread" : "") + '" data-act="notif-open" data-id="' + n.id + '" data-target="' + n.target + '">' +
      '<span class="notif-ico">' + icon(n.icon, 17) + "</span>" +
      '<span class="grow notif-copy"><span class="row between"><b>' + n.title + '</b><span class="tiny">' + n.time + "</span></span>" +
      '<span class="small">' + n.text + "</span></span>" +
      '<span class="unread-dot" aria-hidden="true"></span>' +
      "</button>"
    );
  }

  var SHEETS = {
    notifications: function (p, st) {
      var unread = Screens.notifUnread(st);
      var list = Screens.notifs.filter(function (n) {
        return st.notifFilter === "all" || !Screens.notifRead(st, n.id);
      });
      return {
        title: "Notifications",
        sub: unread ? unread + " non lue" + (unread > 1 ? "s" : "") : "Tout est lu",
        icon: "bell",
        body:
          '<div class="sheet-tools"><div class="seg seg-sheet" role="group" aria-label="Filtrer">' +
          '<button type="button" data-act="notif-filter" data-filter="all" aria-pressed="' + (st.notifFilter === "all") + '">Toutes</button>' +
          '<button type="button" data-act="notif-filter" data-filter="unread" aria-pressed="' + (st.notifFilter === "unread") + '">Non lues</button>' +
          "</div>" +
          '<button type="button" class="link" data-act="notif-read-all"' + (unread ? "" : " disabled") + ">Tout lire</button></div>" +
          (list.length
            ? '<div class="notif-list">' + list.map(function (n) { return notifItem(st, n); }).join("") + "</div>"
            : '<div class="empty-state small-empty"><span class="empty-ico">' + icon("check", 22) + "</span><h3>Tout est lu</h3><p>Les prochains rappels arriveront ici.</p></div>") +
          '<p class="sheet-note">Les rappels sont aussi envoyés par e-mail. <button type="button" class="link" data-act="open-sheet" data-sheet="notifPrefs">Gérer</button></p>'
      };
    },

    account: function (p, st) {
      return {
        title: "Mon compte",
        sub: "Apprenant · 3 formations en cours",
        icon: "user",
        body:
          '<div class="account-head"><span class="avatar lg">AP</span><div class="grow"><b>Alex Perrin</b><span>alex.perrin@exemple.fr</span></div>' +
          '<span class="chip lime">Actif</span></div>' +
          '<div class="list sheet-list">' +
          '<button type="button" class="li" data-act="account-go" data-target="profile"><span class="li-icon">' + icon("user", 18) + '</span><span class="li-body"><span class="li-title">Profil</span><span class="li-sub">Identité et préférences</span></span><span class="chev">' + icon("chevronRight", 16) + "</span></button>" +
          '<button type="button" class="li" data-act="open-sheet" data-sheet="settings"><span class="li-icon">' + icon("settings", 18) + '</span><span class="li-body"><span class="li-title">Paramètres</span><span class="li-sub">Rappels, sons, économie</span></span><span class="chev">' + icon("chevronRight", 16) + "</span></button>" +
          '<button type="button" class="li" data-act="pause"><span class="li-icon">' + icon("pause", 18) + '</span><span class="li-body"><span class="li-title">Mettre en pause</span><span class="li-sub">Suspendre les rappels 1 semaine</span></span></button>' +
          '<button type="button" class="li" data-act="open-sheet" data-sheet="logout"><span class="li-icon">' + icon("logout", 18) + '</span><span class="li-body"><span class="li-title danger">Se déconnecter</span></span></button>' +
          "</div>"
      };
    },

    streak: function (p, st) {
      var cells = "";
      for (var i = 0; i < 14; i++) cells += '<span class="' + (i < 12 ? "is-on" : "") + '"></span>';
      return {
        title: "Série de 12 jours",
        sub: "14 derniers jours",
        icon: "flame",
        body:
          '<div class="stat-hero"><b>12</b><span>jours d’affilée</span></div>' +
          '<div class="streak-cells">' + cells + "</div>" +
          '<p class="sheet-note">Une micro-séance de 5 minutes suffit à conserver la série. Le tuteur vous a proposé une séance plus courte lundi.</p>',
        foot: '<button type="button" class="btn btn-ink btn-block" data-act="go" data-target="session">Ouvrir la session</button>'
      };
    },

    retention: function (p, st) {
      return {
        title: "Rétention à 1 mois",
        sub: "Mesurée par le quiz global",
        icon: "target",
        body:
          '<div class="retention-ring"><span><b>86 %</b><small>à 1 mois</small></span></div>' +
          '<div class="mini-stats"><div><b>79 %</b><span>à 2 mois</span></div><div><b>14</b><span>notions suivies</span></div><div><b>4</b><span>à consolider</span></div></div>' +
          '<p class="sheet-note">La rétention baisse de 7 points entre 1 et 2 mois. Le tuteur priorise les lacunes dans le quiz global du soir.</p>',
        foot: '<button type="button" class="btn btn-outline btn-block" data-act="toast" data-msg="Le calcul détaillé arrive dans le bilan hebdomadaire.">Comprendre le calcul</button>'
      };
    },

    gaps: function (p, st) {
      var gaps = [
        ["Clé de comptabilisation", "2 confusions · module 3"],
        ["Ledgers parallèles", "1 erreur · module 2"],
        ["Date de pièce", "1 confusion · module 3"],
        ["Lettrage", "non revu depuis 6 jours"]
      ];
      return {
        title: "Mes lacunes",
        sub: "4 notions à consolider",
        icon: "alert",
        body:
          '<div class="list sheet-list">' + gaps.map(function (g) {
            return '<div class="li"><span class="li-icon">' + icon("alert", 17) + '</span><span class="li-body"><span class="li-title">' + g[0] + '</span><span class="li-sub">' + g[1] + "</span></span>" + chip("À revoir", "orange") + "</div>";
          }).join("") + "</div>" +
          '<p class="sheet-note">Le tuteur a ajouté ces notions au quiz global de 17:00, en priorité.</p>',
        foot: '<button type="button" class="btn btn-primary btn-block" data-act="go" data-target="session">S’entraîner sur mes lacunes</button>'
      };
    },

    feed: function (p, st) {
      var items = [
        ["Quiz global lissé", "18 notions étaient dues : 4 sont reportées à jeudi.", "toast", "Report annulé · les 18 notions restent aujourd’hui.", "Annuler"],
        ["Question devenue carte", "« Pourquoi deux dates sur une pièce ? » reviendra vendredi.", "go", "session", "Voir la carte"],
        ["Remédiation prête", "15 min sur la clé de comptabilisation et les ledgers.", "go", "quiz", "Ouvrir"],
        ["Sprint planifié", "Mardi 17 et jeudi 19 nov., 30 min avant le quiz du module 4.", "go", "agenda", "Voir l’agenda"],
        ["Micro-séance", "Lundi 20:00, 5 min faites : votre série est conservée.", null, null, null]
      ];
      return {
        title: "Le tuteur a agi",
        sub: "5 actions cette semaine",
        icon: "sparkles",
        body: '<div class="feed-list">' + items.map(function (it) {
          return '<div class="feed-item"><div class="row between"><b>' + it[0] + '</b><span class="tiny">' + (it[2] ? "À faire" : "Fait") + "</span></div>" +
            '<p class="small">' + it[1] + "</p>" +
            (it[4] ? '<button type="button" class="btn btn-outline btn-sm" data-act="' + it[2] + '" data-target="' + it[3] + '" data-msg="' + it[3] + '">' + it[4] + "</button>" : "") +
            "</div>";
        }).join("") + "</div>"
      };
    },

    forgot: function (p, st) {
      return {
        title: "Mot de passe oublié",
        sub: "Recevez un lien de réinitialisation",
        icon: "mail",
        body:
          '<div class="field"><label for="forgot-email">Adresse e-mail</label><input id="forgot-email" type="email" value="alex.perrin@exemple.fr"></div>' +
          '<p class="sheet-note">Le lien expire dans 30 minutes. Vous resterez connecté sur cet appareil.</p>',
        foot: '<button type="button" class="btn btn-primary btn-block" data-act="send-reset">Envoyer le lien</button>'
      };
    },

    legal: function (p, st) {
      var doc = (st.sheetData && st.sheetData.doc) || "cgu";
      var isCgu = doc === "cgu";
      return {
        title: isCgu ? "Conditions d’utilisation" : "Confidentialité",
        sub: "Document de démonstration",
        icon: "shield",
        body:
          "<p class=\"legal-p\">" + (isCgu
            ? "Learny est un espace d’apprentissage personnel. Les contenus générés par le tuteur sont des propositions pédagogiques : vérifiez toujours leur applicabilité à votre organisation."
            : "Vos données d’apprentissage servent à adapter les séances et à mesurer la rétention. Elles ne sont jamais revendues. Les clés de modèle restent côté serveur et chiffrées.") + "</p>" +
          "<h3 class=\"sheet-h3\">Ce que nous conservons</h3>" +
          "<p class=\"legal-p\">Progression, réponses aux quiz, cartes et préférences. Le détail est accessible dans Profil · Confidentialité.</p>" +
          "<h3 class=\"sheet-h3\">Vos droits</h3>" +
          "<p class=\"legal-p\">Export et suppression depuis les paramètres. Une question ? Le centre d’aide répond sous 24 h.</p>"
      };
    },

    newFormation: function (p, st) {
      return {
        title: "Nouvelle formation",
        sub: "Le tuteur préparera un programme",
        icon: "plus",
        body:
          '<div class="field"><label for="nf-name">Intitulé</label><input id="nf-name" type="text" value="Gestion de projet agile" placeholder="Ex. Comptabilité fournisseurs"></div>' +
          '<div class="field mt-12"><label for="nf-level">Niveau</label><select id="nf-level"><option>Débutant</option><option>Intermédiaire</option><option>Avancé</option></select></div>' +
          '<p class="sheet-note">Le tuteur analysera vos apports et proposera un programme de 4 à 7 modules.</p>',
        foot: '<button type="button" class="btn btn-primary btn-block" data-act="create-formation">Créer la formation</button>'
      };
    },

    import: function (p, st) {
      var step = st.importStep || 0;
      var body;
      if (step === 0) {
        body =
          '<div class="dropzone" data-act="import-run" role="button" tabindex="0">' + icon("mail", 26) + "<b>Glissez votre programme</b><span>PDF, DOCX ou lien · 20 Mo max.</span></div>" +
          '<p class="sheet-note">Le tuteur détecte les modules et chapitres, puis vous laisse ajuster.</p>';
      } else if (step === 1) {
        body =
          '<div class="import-progress"><div class="progress"><span style="width:68%"></span></div><p class="small">Analyse du programme… 48 chapitres détectés.</p></div>';
      } else {
        body =
          '<div class="import-summary">' + icon("check", 22) + "<b>Programme prêt</b><span>12 modules · 48 chapitres · 3 quiz détectés</span></div>" +
          '<div class="mini-stats"><div><b>12</b><span>modules</span></div><div><b>48</b><span>chapitres</span></div><div><b>6 sem.</b><span>estimées</span></div></div>';
      }
      return {
        title: "Importer votre programme",
        sub: step === 2 ? "Vérifiez avant d’importer" : "Depuis un fichier existant",
        icon: "layers",
        body: body,
        foot: step === 0
          ? '<button type="button" class="btn btn-ink btn-block" data-act="import-run">Choisir un fichier</button>'
          : step === 2
            ? '<button type="button" class="btn btn-primary btn-block" data-act="import-apply">Importer 12 modules</button>'
            : ""
      };
    },

    formation: function (p, st) {
      return {
        title: "SAP S/4HANA Finance",
        sub: "Module 3 sur 7 · 38 %",
        icon: "layers",
        body:
          '<div class="formation-sheet-head"><span class="sigle">SAP</span><div class="grow"><b>2 nov. – 11 déc.</b><span>24 h prévues · 17 h faites</span></div><span class="percent">38 %</span></div>' +
          '<div class="progress mt-12"><span style="width:38%"></span></div>' +
          '<div class="mini-stats mt-16"><div><b>7</b><span>modules</span></div><div><b>28</b><span>chapitres</span></div><div><b>2</b><span>validés</span></div></div>' +
          '<p class="sheet-note">Prochaine étape : quiz de validation du module 3, à 14:00.</p>',
        foot:
          '<button type="button" class="btn btn-outline" data-act="open-sheet" data-sheet="import">Importer</button>' +
          '<button type="button" class="btn btn-primary grow" data-act="go" data-target="programme">Voir les modules</button>'
      };
    },

    quit: function (p, st) {
      return {
        title: "Quitter le quiz ?",
        sub: "Votre progression est conservée",
        icon: "alert",
        body: '<p class="sheet-note">Vous pourrez reprendre à la question 3. Le chronomètre sera remis à 40 minutes.</p>',
        foot:
          '<button type="button" class="btn btn-outline grow" data-act="close-sheet">Continuer</button>' +
          '<button type="button" class="btn btn-ink grow" data-act="quiz-leave">Quitter</button>'
      };
    },

    reschedule: function (p, st) {
      return {
        title: "Replanifier la séance",
        sub: "Le tuteur propose trois créneaux",
        icon: "calendar",
        body: '<div class="slot-options">' + ["Aujourd’hui 18:00", "Jeudi 10:30", "Vendredi 12:00"].map(function (s) {
          return '<button type="button" class="slot-option" data-act="pick-slot-time" data-slot="' + s + '"><b>' + s + "</b><span>40 min · quiz de validation</span>" + icon("chevronRight", 16) + "</button>";
        }).join("") + "</div>" +
          '<p class="sheet-note">Le créneau choisi est bloqué et la série reste protégée.</p>'
      };
    },

    formations: function (p, st) {
      var keys = ["all", "sap", "gpa", "ang"];
      return {
        title: "Filtrer l’agenda",
        sub: "3 formations en cours",
        icon: "layers",
        body: '<div class="radio-list">' + keys.map(function (key) {
          return radioRow(Screens.filters[key], key === "all" ? "Toutes les activités" : "Calendrier et rappels", st.agendaFilter === key, "pick-formation", 'data-f="' + key + '"');
        }).join("") + "</div>"
      };
    },

    activity: function (p, st) {
      var day = Screens.agenda[st.day] || Screens.agenda[11];
      var index = st.sheetData && typeof st.sheetData.index === "number" ? st.sheetData.index : day.selected;
      var slot = day.slots[index] || day.slots[0];
      return {
        title: slot.title,
        sub: (st.day === 11 ? "Aujourd’hui" : day.label) + " · " + slot.time,
        icon: "calendar",
        body:
          '<div class="activity-meta">' + chip(slot.badge[0], slot.badge[1]) + "<span>" + slot.sub + "</span></div>" +
          '<div class="activity-details"><div><b>Durée</b><span>40 min</span></div><div><b>Formation</b><span>SAP S/4HANA Finance</span></div><div><b>Lieu</b><span>À distance</span></div></div>' +
          '<p class="sheet-note">Le tuteur vous rappellera 10 minutes avant. Vous pouvez replanifier sans casser la série.</p>',
        foot:
          '<button type="button" class="btn btn-outline" data-act="open-sheet" data-sheet="reschedule">Replanifier</button>' +
          (slot.target
            ? '<button type="button" class="btn btn-primary grow" data-act="go" data-target="' + slot.target + '">Ouvrir</button>'
            : '<button type="button" class="btn btn-primary grow" data-act="toast" data-msg="Activité marquée comme faite.">Marquer comme fait</button>')
      };
    },

    settings: function (p, st) {
      return {
        title: "Paramètres",
        sub: "Rappels et confort",
        icon: "settings",
        body:
          '<div class="pref-list">' +
          toggleRow("Rappels de séance", "10 minutes avant chaque activité", st.settings.rappel, "rappel") +
          toggleRow("Sons et retours", "Signal discret à la validation", st.settings.sons, "sons") +
          toggleRow("Mode économie", "Moins d’animations et de visuels", st.settings.eco, "eco") +
          "</div>" +
          '<p class="sheet-note">Ces réglages sont locaux à la démonstration.</p>',
        foot: '<button type="button" class="btn btn-primary btn-block" data-act="save-settings">Enregistrer</button>'
      };
    },

    identity: function (p, st) {
      return {
        title: "Identité",
        sub: "Visible par le tuteur",
        icon: "user",
        body:
          '<div class="field"><label for="id-name">Nom complet</label><input id="id-name" type="text" value="' + st.identity.name + '"></div>' +
          '<div class="field mt-12"><label for="id-email">Adresse e-mail</label><input id="id-email" type="email" value="' + st.identity.email + '"></div>' +
          '<p class="sheet-note">Votre adresse sert aux rappels et au bilan hebdomadaire.</p>',
        foot: '<button type="button" class="btn btn-primary btn-block" data-act="save-identity">Enregistrer</button>'
      };
    },

    notifPrefs: function (p, st) {
      return {
        title: "Notifications",
        sub: "Choisissez ce que le tuteur envoie",
        icon: "bell",
        body:
          '<div class="pref-list">' +
          toggleRow("Rappels de séance", "Avant chaque quiz", st.settings.rappel, "rappel") +
          toggleRow("Série", "Alerte si la série est en danger", st.settings.serie, "serie") +
          toggleRow("Bilan hebdomadaire", "Le dimanche à 19:00", st.settings.bilan, "bilan") +
          toggleRow("Nouvelles lacunes", "Quand une confusion est détectée", st.settings.lacunes, "lacunes") +
          "</div>",
        foot: '<button type="button" class="btn btn-primary btn-block" data-act="save-settings">Enregistrer</button>'
      };
    },

    security: function (p, st) {
      return {
        title: "Sécurité et connexion",
        sub: "Mot de passe, appareils",
        icon: "lock",
        body:
          '<div class="list sheet-list">' +
          '<button type="button" class="li" data-act="toast" data-msg="Un lien de changement de mot de passe a été envoyé."><span class="li-icon">' + icon("lock", 18) + '</span><span class="li-body"><span class="li-title">Changer de mot de passe</span><span class="li-sub">Dernière modification il y a 3 mois</span></span><span class="chev">' + icon("chevronRight", 16) + "</span></button>" +
          '<button type="button" class="li" data-act="toast" data-msg="2 appareils connectés : iPhone 16 Pro, MacBook Air."><span class="li-icon">' + icon("shield", 18) + '</span><span class="li-body"><span class="li-title">Appareils connectés</span><span class="li-sub">2 appareils · session active</span></span><span class="chev">' + icon("chevronRight", 16) + "</span></button>" +
          "</div>"
      };
    },

    rhythm: function (p, st) {
      return {
        title: "Rythme et rappels",
        sub: "5 h par semaine · soirs",
        icon: "clock",
        body:
          '<div class="range-row"><label for="rhythm-range">Heures par semaine</label><b id="rhythm-value">5 h</b></div>' +
          '<input id="rhythm-range" class="range" type="range" min="1" max="15" value="5" data-act="range">' +
          '<p class="group-label" style="margin-left:0">Jours préférés</p>' +
          '<div class="day-chips">' + ["L", "M", "M", "J", "V", "S", "D"].map(function (d, i) {
            var on = st.rhythmDays.indexOf(i) !== -1;
            return '<button type="button" class="day-chip' + (on ? " is-on" : "") + '" data-act="toggle-day" data-day="' + i + '" aria-pressed="' + on + '">' + d + "</button>";
          }).join("") + "</div>" +
          '<p class="sheet-note">Le tuteur place les séances longues le week-end si votre rythme baisse.</p>',
        foot: '<button type="button" class="btn btn-primary btn-block" data-act="save-settings">Enregistrer</button>'
      };
    },

    models: function (p, st) {
      return {
        title: "Modèles d’IA",
        sub: "Fournisseur utilisé par le tuteur",
        icon: "sparkles",
        body:
          '<div class="radio-list">' +
          radioRow("Claude", "Anthropic · par défaut", st.model === "Claude", "pick-model", 'data-model="Claude"') +
          radioRow("GPT", "OpenAI · clé personnelle", st.model === "GPT", "pick-model", 'data-model="GPT"') +
          radioRow("DeepSeek", "DeepSeek · clé personnelle", st.model === "DeepSeek", "pick-model", 'data-model="DeepSeek"') +
          "</div>" +
          '<p class="sheet-note">Les clés restent chiffrées côté serveur et ne reviennent jamais au navigateur.</p>'
      };
    },

    subscription: function (p, st) {
      return {
        title: "Abonnement",
        sub: "Essai en cours",
        icon: "card",
        body:
          '<div class="plan-card"><span class="tag">Essai</span><b>12 jours restants</b><span>Accès complet · 3 formations</span></div>' +
          '<div class="mini-stats mt-16"><div><b>3</b><span>formations</span></div><div><b>24 h</b><span>ce mois</span></div><div><b>0 €</b><span>à payer</span></div></div>' +
          '<p class="sheet-note">Après l’essai : 12 €/mois, résiliable à tout moment.</p>',
        foot: '<button type="button" class="btn btn-ink btn-block" data-act="toast" data-msg="Gestion de l’abonnement ouverte (démo).">Gérer l’abonnement</button>'
      };
    },

    help: function (p, st) {
      return {
        title: "Centre d’aide",
        sub: "Réponses rapides",
        icon: "help",
        body:
          '<div class="faq">' +
          "<details><summary>Comment fonctionne le quiz global ?</summary><p>Il reprend les notions dues selon la courbe d’oubli. Le tuteur peut reporter des notions pour garder la session sous 10 minutes.</p></details>" +
          "<details><summary>Puis-je apprendre hors ligne ?</summary><p>Le cours et les cartes sont mis en cache. Les quiz se synchronisent au retour du réseau.</p></details>" +
          "<details><summary>Comment changer de modèle d’IA ?</summary><p>Profil · Modèles d’IA. Vous pouvez utiliser votre propre clé fournisseur.</p></details>" +
          "</div>",
        foot: '<button type="button" class="btn btn-outline btn-block" data-act="toast" data-msg="Un conseiller vous répond sous 24 h (démo).">Contacter le support</button>'
      };
    },

    privacy: function (p, st) {
      return {
        title: "Confidentialité",
        sub: "Vos données d’apprentissage",
        icon: "shield",
        body:
          '<p class="legal-p">Learny conserve votre progression, vos réponses et vos préférences pour adapter les séances. Aucune donnée n’est revendue.</p>' +
          '<div class="pref-list"><div class="pref-row static"><span class="grow"><b>Export de mes données</b><span>JSON · prêt sous 24 h</span></span><button type="button" class="btn btn-outline btn-sm" data-act="toast" data-msg="Export demandé · vous recevrez un lien.">Exporter</button></div>' +
          '<div class="pref-row static"><span class="grow"><b>Supprimer mon compte</b><span>Effacement définitif après 30 jours</span></span><button type="button" class="btn btn-outline btn-sm" data-act="toast" data-msg="Demande de suppression enregistrée (démo).">Supprimer</button></div></div>'
      };
    },

    logout: function (p, st) {
      return {
        title: "Se déconnecter ?",
        sub: "La progression reste enregistrée",
        icon: "logout",
        body: '<p class="sheet-note">Vous retrouverez votre série de 12 jours et vos 3 formations à la prochaine connexion.</p>',
        foot:
          '<button type="button" class="btn btn-outline grow" data-act="close-sheet">Annuler</button>' +
          '<button type="button" class="btn btn-ink grow" data-act="logout-confirm">Se déconnecter</button>'
      };
    },

    tutor: function (p, st) {
      var extras = (st.messages || []).map(function (m) {
        return m.role === "user"
          ? '<div class="bubble-user">' + m.text + "</div>"
          : '<div class="bubble-ai">' + m.text + "</div>";
      }).join("");
      return {
        title: "Tuteur",
        sub: "Comptabilité générale · chapitre 2",
        icon: "sparkles",
        body:
          '<div class="bubble-user">Pourquoi deux dates sur une pièce ?</div>' +
          '<div class="bubble-ai">' +
          "<p><b>Parce que l’une fixe la période, l’autre le suivi.</b></p>" +
          "<p>La <b>date de pièce</b> (ou date comptable) décide de la période : une facture du 31 octobre saisie le 12 novembre reste en octobre.</p>" +
          "<p>La <b>date de saisie</b> sert à tracer l’enregistrement et à mesurer le délai de traitement.</p>" +
          '<button type="button" class="source-chip" data-act="toast" data-msg="Source : chapitre 2 · L’en-tête de pièce.">' + icon("book", 13) + "Chapitre 2 · L’en-tête de pièce</button>" +
          "</div>" +
          extras +
          (st.typing ? '<div class="bubble-ai typing" aria-label="Le tuteur écrit"><span></span><span></span><span></span></div>' : "") +
          '<div class="quick">' +
          '<button type="button" class="chip outline" data-act="tutor-quick" data-q="Donne-moi un exemple concret.">Un exemple concret</button>' +
          '<button type="button" class="chip outline" data-act="tutor-quick" data-q="Plus court, s’il te plaît.">Plus court</button>' +
          '<button type="button" class="chip outline" data-act="tutor-quick" data-q="Crée une carte de rappel.">Créer une carte</button>' +
          "</div>" +
          '<div class="composer"><input data-tutor-input placeholder="Posez votre question…" aria-label="Votre question" autocomplete="off"><button type="button" class="send" data-act="tutor-send" aria-label="Envoyer">' + icon("send", 16) + "</button></div>" +
          '<p class="tiny" style="text-align:center;margin:8px 0 0">Le tuteur cite ses sources. Vérifiez l’applicabilité à votre société.</p>'
      };
    }
  };

  function replyFor(text) {
    var t = String(text).toLowerCase();
    if (t.indexOf("carte") !== -1) return "C’est noté : la carte « Pourquoi deux dates sur une pièce ? » est créée. Elle reviendra vendredi dans le quiz global.";
    if (t.indexOf("court") !== -1) return "La date de pièce fixe la période ; la date de saisie trace l’enregistrement.";
    if (t.indexOf("exemple") !== -1) return "Une facture du 31 octobre saisie le 12 novembre reste en octobre : la date de pièce commande la période.";
    return "La date de pièce commande la période comptable ; la date de saisie ne fait que tracer l’enregistrement. Voulez-vous un exemple ou une carte de rappel ?";
  }

  function sendTutor(device, text) {
    var st = device._state;
    var value = String(text || "").trim();
    if (!value) {
      showToast(device, "Écrivez une question ou choisissez une suggestion.");
      return;
    }
    st.messages.push({ role: "user", text: value });
    st.typing = true;
    render(device, { keepScroll: true, sheetUpdate: true, scrollChat: true });
    later(device, function () {
      st.messages.push({ role: "ai", text: replyFor(value) });
      st.typing = false;
      if (st.sheet === "tutor") {
        render(device, { keepScroll: true, sheetUpdate: true, scrollChat: true });
      }
      if (/carte/i.test(value)) showToast(device, "Carte créée · elle revient vendredi.");
    }, 1100);
  }

  /* ------------------------------------------------------------------ */
  /* Actions                                                            */
  /* ------------------------------------------------------------------ */

  function handleAction(device, el) {
    var st = device._state;
    var act = el.dataset.act;

    switch (act) {
      case "open-sheet":
        openSheet(device, el.dataset.sheet, { doc: el.dataset.doc });
        break;
      case "close-sheet":
        closeSheet(device);
        break;
      case "toast":
        showToast(device, el.dataset.msg || "Action simulée.");
        break;
      case "go": {
        var target = el.dataset.target;
        var kind = TAB_SCREENS[target] ? "tab" : "fwd";
        st.sheet = null;
        go(device, target, kind);
        break;
      }
      case "account-go":
        st.sheet = null;
        go(device, el.dataset.target, "back");
        break;
      case "auth-mode":
        st.authMode = el.dataset.mode;
        st.loading = false;
        render(device);
        break;
      case "login":
        if (st.loading) break;
        st.loading = true;
        render(device);
        later(device, function () {
          st.loading = false;
          st.toast = { id: ++toastSeq, text: st.authMode === "signup" ? "Compte créé · bienvenue Alex." : "Bienvenue Alex · votre séance de 14:00 vous attend." };
          go(device, "today", "fwd");
        }, 900);
        break;
      case "provider":
        if (st.loading) break;
        st.loading = true;
        render(device);
        later(device, function () {
          st.loading = false;
          st.toast = { id: ++toastSeq, text: "Connexion " + el.dataset.provider + " simulée · bienvenue." };
          go(device, "today", "fwd");
        }, 800);
        break;
      case "send-reset": {
        var email = (device.querySelector("#forgot-email") || {}).value || "votre adresse";
        closeSheet(device);
        showToast(device, "Lien envoyé à " + email + ".");
        break;
      }
      case "snooze":
        st.snoozed = true;
        showToast(device, "Séance reportée à 18:00 · série protégée.");
        break;
      case "unsnooze":
        st.snoozed = false;
        showToast(device, "Séance ramenée à 14:00.");
        break;
      case "reprise-accept":
        st.reprise = "accepte";
        st.slotsOpen = false;
        showToast(device, "Séance acceptée · jeudi 10:30.");
        break;
      case "reprise-slots":
        st.slotsOpen = !st.slotsOpen;
        render(device, { keepScroll: true });
        break;
      case "reprise-pick":
        st.reprise = "slot";
        st.bookedSlot = el.dataset.slot;
        st.slotsOpen = false;
        showToast(device, "Séance déplacée à " + el.dataset.slot + ".");
        break;
      case "reprise-undo":
        st.reprise = "propose";
        st.bookedSlot = null;
        st.slotsOpen = false;
        showToast(device, "Reprise annulée · la séance reste à replacer.");
        break;
      case "stat":
        openSheet(device, el.dataset.stat);
        break;
      case "notif-filter":
        st.notifFilter = el.dataset.filter;
        render(device, { keepScroll: true, sheetUpdate: true });
        break;
      case "notif-read-all":
        st.readAll = true;
        st.readIds = {};
        render(device, { keepScroll: true, sheetUpdate: true });
        showToast(device, "Toutes les notifications sont lues.");
        break;
      case "notif-open": {
        var id = el.dataset.id;
        st.readIds[id] = true;
        st.toast = { id: ++toastSeq, text: "Notification ouverte." };
        go(device, el.dataset.target || "today", "fwd");
        break;
      }
      case "bookmark":
        st.bookmark = !st.bookmark;
        showToast(device, st.bookmark ? "Chapitre enregistré dans vos favoris." : "Chapitre retiré des favoris.");
        break;
      case "tutor-quick":
        sendTutor(device, el.dataset.q);
        break;
      case "tutor-send": {
        var input = device.querySelector("[data-tutor-input]");
        sendTutor(device, input ? input.value : "");
        break;
      }
      case "quiz-quit":
        openSheet(device, "quit");
        break;
      case "quiz-leave":
        st.quizPaused = true;
        st.toast = { id: ++toastSeq, text: "Quiz en pause · progression conservée." };
        go(device, "today", "back");
        break;
      case "quiz-restart":
        st.qi = 0;
        st.pick = null;
        st.checked = false;
        st.answers = [];
        st.screen = "quiz";
        st.sheet = null;
        st.transition = "fwd";
        render(device);
        break;
      case "session-report":
        st.reportCancelled = true;
        showToast(device, "Report annulé · les 4 notions sont de retour.");
        break;
      case "agenda-view":
        st.agendaView = el.dataset.view;
        st.transition = "tab";
        render(device);
        break;
      case "pick-day":
        st.day = Number(el.dataset.day);
        st.agendaView = "jour";
        st.transition = "tab";
        render(device);
        break;
      case "pick-formation":
        st.agendaFilter = el.dataset.f;
        st.sheet = null;
        st.transition = "tab";
        render(device);
        showToast(device, "Filtre : " + Screens.filters[st.agendaFilter] + ".");
        break;
      case "activity":
        openSheet(device, "activity", { index: Number(el.dataset.index) });
        break;
      case "pick-slot-time":
        closeSheet(device);
        showToast(device, "Créneau proposé : " + el.dataset.slot + " · en attente du tuteur.");
        break;
      case "programme-view":
        st.programmeView = el.dataset.view;
        st.transition = "tab";
        render(device);
        break;
      case "toggle-module":
        st.mod2Open = !st.mod2Open;
        render(device, { keepScroll: true });
        break;
      case "locked":
        showToast(device, "Module 4 verrouillé · terminez d’abord le module 3.");
        break;
      case "day-info":
        showToast(device, "Séance du " + el.dataset.day + " novembre · 18:00 (démo).");
        break;
      case "create-formation": {
        var nameInput = device.querySelector("#nf-name");
        var name = nameInput && nameInput.value.trim() ? nameInput.value.trim() : "Nouvelle formation";
        st.sheet = null;
        render(device, { keepScroll: true });
        showToast(device, "Formation « " + name + " » créée · programme en préparation.");
        break;
      }
      case "import-run":
        if (st.importStep === 0) {
          st.importStep = 1;
          render(device, { keepScroll: true, sheetUpdate: true });
          later(device, function () {
            st.importStep = 2;
            render(device, { keepScroll: true, sheetUpdate: true });
          }, 1200);
        }
        break;
      case "import-apply":
        st.importStep = 0;
        closeSheet(device);
        showToast(device, "12 modules et 48 chapitres importés.");
        break;
      case "toggle": {
        var key = el.dataset.key;
        st.settings[key] = !st.settings[key];
        render(device, { keepScroll: true, sheetUpdate: true });
        break;
      }
      case "toggle-day": {
        var dayIndex = Number(el.dataset.day);
        var at = st.rhythmDays.indexOf(dayIndex);
        if (at === -1) st.rhythmDays.push(dayIndex);
        else st.rhythmDays.splice(at, 1);
        render(device, { keepScroll: true, sheetUpdate: true });
        break;
      }
      case "save-settings":
        closeSheet(device);
        showToast(device, "Préférences enregistrées.");
        break;
      case "save-identity": {
        var nameEl = device.querySelector("#id-name");
        var mailEl = device.querySelector("#id-email");
        if (nameEl && nameEl.value.trim()) st.identity.name = nameEl.value.trim();
        if (mailEl && mailEl.value.trim()) st.identity.email = mailEl.value.trim();
        closeSheet(device);
        showToast(device, "Identité mise à jour.");
        break;
      }
      case "pick-model":
        st.model = el.dataset.model;
        st.sheet = null;
        render(device, { keepScroll: true });
        showToast(device, "Modèle " + st.model + " sélectionné.");
        break;
      case "pause":
        st.sheet = null;
        render(device, { keepScroll: true });
        showToast(device, "Rappels suspendus 7 jours · reprise le 19 novembre.");
        break;
      case "logout-confirm":
        st.screen = "welcome";
        st.sheet = null;
        st.transition = "back";
        st.toast = { id: ++toastSeq, text: "À bientôt · votre progression est enregistrée." };
        render(device);
        break;
      case "close-toast":
        st.toast = null;
        render(device, { keepScroll: true, sheetUpdate: true });
        break;
      default:
        break;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Interactions                                                       */
  /* ------------------------------------------------------------------ */

  function findState(target) {
    var device = target.closest(".device");
    return device ? { device: device, st: device._state } : null;
  }

  document.addEventListener("click", function (event) {
    var target = event.target;
    if (!target || !target.closest) return;

    var platformButton = target.closest(".platform-switch [data-platform]");
    if (platformButton) {
      setPlatform(platformButton.dataset.platform);
      return;
    }

    var found = findState(target);
    if (!found) return;
    var device = found.device;
    var st = found.st;

    if (target.closest("[data-close-sheet]")) {
      closeSheet(device);
      return;
    }

    var nav = target.closest("[data-nav]");
    if (nav) {
      var screen = nav.dataset.nav;
      var kind = nav.dataset.t || (TAB_SCREENS[st.screen] ? (TAB_SCREENS[screen] ? "tab" : "fwd") : "back");
      st.sheet = null;
      go(device, screen, kind);
      return;
    }

    var reveal = target.closest("[data-reveal]");
    if (reveal) {
      st.reveal = !st.reveal;
      render(device, { keepScroll: true });
      return;
    }

    var option = target.closest("[data-option]");
    if (option && !st.checked) {
      st.pick = Number(option.dataset.option);
      render(device, { keepScroll: true });
      return;
    }

    if (target.closest("[data-check]")) {
      if (st.pick != null) {
        st.checked = true;
        var q = Screens.questions[st.qi];
        st.answers[st.qi] = { pick: st.pick, correct: st.pick === q.correct };
        render(device, { keepScroll: true });
      }
      return;
    }

    if (target.closest("[data-next]")) {
      if (st.qi < Screens.questions.length - 1) {
        st.qi += 1;
        st.pick = null;
        st.checked = false;
        render(device);
      } else {
        st.screen = "result";
        st.transition = "fwd";
        render(device);
      }
      return;
    }

    var advance = target.closest("[data-advance]");
    if (advance) {
      var previous = st.card;
      st.card = (st.card + 1) % Screens.cards.length;
      st.reveal = false;
      render(device, { keepScroll: true });
      if (previous === Screens.cards.length - 1) showToast(device, "Session terminée · 12 jours de série conservés.");
      return;
    }

    var action = target.closest("[data-act]");
    if (action) {
      handleAction(device, action);
      return;
    }
  });

  document.addEventListener("keydown", function (event) {
    var device = findState(event.target);
    if (!device) return;
    var st = device.st;

    if (event.key === "Escape" && st.sheet) {
      closeSheet(device.device);
      return;
    }

    if ((event.key === "Enter" || event.key === " ") && event.target.closest("[data-reveal]")) {
      event.preventDefault();
      st.reveal = !st.reveal;
      render(device.device, { keepScroll: true });
      return;
    }

    if (event.key === "Enter" && event.target.matches("[data-tutor-input]")) {
      event.preventDefault();
      sendTutor(device.device, event.target.value);
      return;
    }

    if (event.target.matches('[data-act="import-run"]') && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      handleAction(device.device, event.target);
    }
  });

  document.addEventListener("input", function (event) {
    var target = event.target;
    if (target.matches("#rhythm-range")) {
      var sheet = target.closest(".sheet");
      var value = sheet && sheet.querySelector("#rhythm-value");
      if (value) value.textContent = target.value + " h";
    }
  });

  /* ------------------------------------------------------------------ */
  /* Plateforme et planche                                              */
  /* ------------------------------------------------------------------ */

  function setPlatform(platform) {
    boardPlatform = platform;
    document.querySelectorAll(".device:not([data-fixed])").forEach(function (device) {
      device._state.platform = platform;
      render(device, { keepScroll: true, sheetUpdate: true });
    });
    document.querySelectorAll("#gallery .tile-stage").forEach(function (stage) {
      stage.style.setProperty("--dw", META[platform].dw);
      stage.style.setProperty("--dh", META[platform].dh);
    });
    document.querySelectorAll("[data-platform]").forEach(function (button) {
      if (button.closest(".platform-switch")) {
        button.setAttribute("aria-pressed", String(button.dataset.platform === platform));
      }
    });
    document.querySelectorAll("[data-open]").forEach(function (link) {
      var screen = link.dataset.open;
      link.href = "view.html#screen=" + screen + "&platform=" + platform + (link.dataset.sheet === "1" ? "&sheet=1" : "");
    });
    var label = document.getElementById("platform-label");
    if (label) label.textContent = platform === "ios" ? "iOS" : "Android";
  }

  function buildBoard() {
    var gallery = document.getElementById("gallery");
    if (!gallery) return;
    var index = 0;

    function addTile(screenKey, options) {
      options = options || {};
      index += 1;
      var number = String(index).padStart(2, "0");
      var title = Screens.titles[screenKey] + (options.sheet ? " · tuteur ouvert" : "");
      var note = options.note || Screens.notes[screenKey];
      var figure = document.createElement("figure");
      figure.className = "tile";
      figure.innerHTML =
        '<div class="tile-stage">' +
        '<div class="tile-slot">' +
        '<article class="device">' +
        '<div class="device-screen"><span class="island"></span><span class="punch"></span><div class="app"></div></div>' +
        "</article>" +
        "</div>" +
        "</div>" +
        '<figcaption class="tile-cap"><span class="tile-num">' + number + '</span><span class="tile-name">' + title + "</span></figcaption>" +
        '<p class="tile-note">' + note + "</p>" +
        '<a class="tile-open" data-open="' + screenKey + '" data-sheet="' + (options.sheet ? "1" : "0") + '" href="view.html#screen=' + screenKey + "&platform=" + boardPlatform + (options.sheet ? "&sheet=1" : "") + '" target="_blank" rel="noopener">Ouvrir en grand ' + icon("arrowRight", 12) + "</a>";
      gallery.appendChild(figure);

      var device = figure.querySelector(".device");
      initDevice(device, {
        screen: screenKey,
        platform: boardPlatform,
        sheet: !!options.sheet
      });
    }

    Screens.order.forEach(function (key) {
      addTile(key);
      if (key === "cours") {
        addTile("cours", {
          sheet: true,
          note: "Le tuteur s’ouvre en feuille native : renvoi vers le chapitre, réponses rapides et saisie."
        });
      }
    });

    setPlatform(boardPlatform);
  }

  function buildCompare() {
    var zone = document.getElementById("compare-devices");
    if (!zone) return;
    ["ios", "android"].forEach(function (platform) {
      var wrap = document.createElement("div");
      wrap.className = "compare-device " + platform;
      wrap.innerHTML =
        '<div class="tile-stage" style="--dw:' + META[platform].dw + ";--dh:" + META[platform].dh + '">' +
        '<div class="tile-slot">' +
        '<article class="device" data-fixed="' + platform + '">' +
        '<div class="device-screen"><span class="island"></span><span class="punch"></span><div class="app"></div></div>' +
        "</article>" +
        "</div>" +
        "</div>" +
        '<p class="compare-cap">' + (platform === "ios" ? "iOS · HIG" : "Android · Material 3") + "</p>";
      zone.appendChild(wrap);
      initDevice(wrap.querySelector(".device"), { screen: "today", platform: platform });
    });
  }

  function buildView() {
    var stage = document.getElementById("view");
    if (!stage) return;
    var raw = window.location.hash ? window.location.hash.slice(1) : window.location.search.slice(1);
    var params = new URLSearchParams(raw);
    var screen = params.get("screen") || "today";
    if (Screens.order.indexOf(screen) === -1) screen = "today";
    var platform = params.get("platform") === "android" ? "android" : "ios";
    var sheet = params.get("sheet") === "1";
    var plain = params.get("plain") === "1";
    document.body.classList.toggle("plain-page", plain);

    var article = stage.querySelector(".device");
    initDevice(article, { screen: screen, platform: platform, sheet: sheet, plain: plain });
    var meta = frameSize(platform, plain);
    document.body.style.width = meta.dw + "px";
    document.body.style.height = meta.dh + "px";
    document.title = Screens.titles[screen] + " · " + (platform === "ios" ? "iOS" : "Android") + " · Learny";
  }

  function initDevice(device, options) {
    device._state = initialState(options);
    render(device);
  }

  document.addEventListener("DOMContentLoaded", function () {
    buildBoard();
    buildCompare();
    buildView();

    var params = new URLSearchParams(window.location.hash.slice(1));
    if (params.get("platform") === "android") setPlatform("android");
  });

  window.addEventListener("hashchange", function () {
    if (document.getElementById("view")) buildView();
  });

  window.LearnyApp = {
    setPlatform: setPlatform,
    render: render
  };
})();
