/* Écrans de l'application mobile Learny.
   Même information et mêmes composants sur iOS et Android ; seules les
   conventions natives changent (chrome, contrôles, feuilles, actions).
   Chaque action est branchée sur un état local : la planche reste une maquette,
   mais tous les boutons produisent un retour visible. */

(function () {
  "use strict";

  var icon = window.LearnyIcons.icon;

  var DAY_LETTERS = ["L", "M", "M", "J", "V", "S", "D"];
  var WEEK_DAYS = [9, 10, 11, 12, 13, 14, 15];
  var SLOTS = ["jeudi 10:30", "jeudi 18:00", "vendredi 12:00"];

  var FILTERS = {
    all: "Toutes les formations",
    sap: "SAP S/4HANA Finance",
    gpa: "Gestion de projet agile",
    ang: "Anglais professionnel"
  };

  var NOTIFS = [
    { id: "quiz", title: "Quiz de validation à 14:00", text: "Module 3 · Comptabilité générale, tentative 2. Seuil de validation : 80 %.", time: "13:20", target: "quiz", icon: "clock", unread: true },
    { id: "gap", title: "Nouvelle lacune repérée", text: "Clé de comptabilisation : confondue avec le type de pièce, deux fois.", time: "16:42", target: "session", icon: "target", unread: true },
    { id: "module", title: "Module 2 validé · 91 %", text: "Le module 3 · Comptabilité générale est débloqué.", time: "lun. 9 nov.", target: "programme", icon: "check", unread: false },
    { id: "bilan", title: "Bilan de la semaine", text: "13 h d’étude, 86 % retenu à 1 mois, 3 notions à risque d’oubli.", time: "dim. 8 nov.", target: "today", icon: "chart", unread: true }
  ];

  function notifRead(st, id) {
    if (st.readAll) return true;
    if (st.readIds && st.readIds[id]) return true;
    for (var i = 0; i < NOTIFS.length; i++) {
      if (NOTIFS[i].id === id) return !NOTIFS[i].unread;
    }
    return true;
  }

  function notifUnread(st) {
    return NOTIFS.filter(function (n) { return !notifRead(st, n.id); }).length;
  }

  var QUESTIONS = [
    {
      q: "Une facture fournisseur est enregistrée le 12 novembre, avec une date de pièce au 31 octobre. Dans quelle période est-elle comptabilisée ?",
      options: [
        "Novembre, la date de saisie",
        "Octobre, la date de pièce",
        "Décembre, la date d’échéance",
        "La période choisie par le tuteur"
      ],
      correct: 1,
      why: "La date de pièce fixe la période comptable. La date de saisie ne sert qu’au suivi de l’enregistrement."
    },
    {
      q: "Que porte l’en-tête d’une pièce comptable ?",
      options: [
        "Les postes et les montants",
        "Le type, les dates, la société et la référence",
        "Uniquement le numéro de pièce",
        "Les clés de comptabilisation des postes"
      ],
      correct: 1,
      why: "L’en-tête identifie l’opération ; les postes, les comptes et les clés viennent ensuite."
    }
  ];

  var CARDS = [
    {
      n: "Notion 4 · Module 3",
      term: "Clé de comptabilisation",
      q: "Une pièce est saisie avec la clé 40 sur un compte fournisseur. Que vérifiez-vous en premier ?",
      a: "Le sens crédit et le compte de contrepartie. Une clé 40 ne s’utilise pas sur un compte de charge."
    },
    {
      n: "Notion 5 · Module 2",
      term: "Ledgers parallèles",
      q: "Pourquoi la même pièce peut-elle avoir deux valorisations différentes ?",
      a: "Chaque ledger suit son propre plan de comptes et ses propres règles : la pièce est commune, les écritures ne le sont pas."
    },
    {
      n: "Notion 6 · Module 3",
      term: "Date de pièce",
      q: "Une facture d’octobre est saisie en novembre. Quelle date commande la période ?",
      a: "La date de pièce. La date de saisie ne déplace jamais la période comptable."
    }
  ];

  var AGENDA = {
    9: {
      label: "lundi 9 novembre",
      slots: [
        { time: "18:00", title: "Relecture du cours", sub: "Module 2 · Les ledgers parallèles", badge: ["Fait", "green"], state: "" },
        { time: "18:30", title: "Quiz global", sub: "12 notions · 8 min", badge: ["Fait", "green"], state: "" }
      ],
      selected: 1
    },
    10: {
      label: "mardi 10 novembre",
      slots: [
        { time: "13:00", title: "Échauffement", sub: "3 questions de rappel · 2 min", badge: ["Fait", "green"], state: "" },
        { time: "18:00", title: "Les ledgers parallèles", sub: "Module 2 · chapitre 4 · non terminé", badge: ["Manqué", "orange"], state: "" }
      ],
      selected: 1
    },
    11: {
      label: "mercredi 11 novembre",
      slots: [
        { time: "09:00", title: "Relecture du cours", sub: "Module 3 · Saisie des pièces comptables", badge: ["Fait", "green"], state: "" },
        { time: "13:50", title: "Échauffement", sub: "3 questions de rappel · 2 min", badge: ["Faire", "lime"], state: "next", target: "quiz" },
        { time: "14:00", title: "Quiz de validation", sub: "Tentative 2 · seuil 80 % · 40 min", badge: ["Dans 40 min", "lime"], state: "now", target: "quiz" },
        { time: "17:00", title: "Quiz global", sub: "14 notions · 10 min", badge: ["À venir", "outline"], state: "", target: "session" }
      ],
      selected: 2
    },
    12: {
      label: "jeudi 12 novembre",
      slots: [
        { time: "10:30", title: "Reprise · ledgers parallèles", sub: "Séance replacée par le tuteur · 20 min", badge: ["Demain", "indigo"], state: "" },
        { time: "17:30", title: "Rétrospective", sub: "Apports du chapitre 2", badge: ["Demain", "outline"], state: "" }
      ],
      selected: 0
    },
    13: {
      label: "vendredi 13 novembre",
      slots: [
        { time: "12:00", title: "Quiz du module 3", sub: "Tentative 2 · 40 min", badge: ["Vendredi", "outline"], state: "" },
        { time: "18:00", title: "Révision libre", sub: "Cartes à revoir · 10 min", badge: ["Vendredi", "outline"], state: "" }
      ],
      selected: 0
    },
    14: {
      label: "samedi 14 novembre",
      slots: [
        { time: "10:00", title: "Atelier cartes", sub: "Créer 5 cartes sur les ledgers", badge: ["Samedi", "outline"], state: "" }
      ],
      selected: 0
    },
    15: {
      label: "dimanche 15 novembre",
      slots: [
        { time: "19:00", title: "Bilan hebdomadaire", sub: "13 h d’étude · 86 % retenu", badge: ["Dimanche", "outline"], state: "" }
      ],
      selected: 0
    }
  };

  function chip(label, tone) {
    return '<span class="chip ' + (tone || "") + '">' + label + "</span>";
  }

  function largeHead(kicker, title, actions) {
    return (
      '<header class="largehead">' +
      '<div><p class="kicker">' + kicker + '</p><h1 class="h1">' + title + "</h1></div>" +
      '<div class="head-actions">' + (actions || "") + "</div>" +
      "</header>"
    );
  }

  function statCard(kind, tone, iconName, label, value, unit) {
    return (
      '<button type="button" class="stat ' + tone + '" data-act="stat" data-stat="' + kind + '">' +
      '<span class="stat-top">' + icon(iconName, 12) + label + "</span>" +
      '<span class="stat-val">' + value + (unit ? " <small>" + unit + "</small>" : "") + "</span>" +
      "</button>"
    );
  }

  function monthGrid(selected, marked, act) {
    var cells = "";
    var d;
    for (d = 26; d <= 31; d++) cells += '<span class="mcell is-muted">' + d + "</span>";
    for (d = 1; d <= 30; d++) {
      var cls = "mcell";
      if (marked.indexOf(d) !== -1) cls += " is-marked";
      if (d === selected) cls += " is-selected";
      cells += '<button type="button" class="' + cls + '" data-act="' + act + '" data-day="' + d + '" aria-pressed="' + (d === selected) + '">' + d + "</button>";
    }
    for (d = 1; d <= 6; d++) cells += '<span class="mcell is-muted">' + d + "</span>";
    return (
      '<div class="month">' +
      '<div class="month-head">' + DAY_LETTERS.map(function (l) { return "<span>" + l + "</span>"; }).join("") + "</div>" +
      '<div class="month-grid">' + cells + "</div>" +
      "</div>"
    );
  }

  function slotCard(slot, index) {
    return (
      '<button type="button" class="slot ' + (slot.state || "") + '" data-act="activity" data-index="' + index + '">' +
      '<span class="slot-time">' + slot.time + "</span>" +
      '<span class="slot-rail"><span class="slot-dot"></span></span>' +
      '<span class="slot-card">' +
      '<span class="slot-head"><span class="slot-title">' + slot.title + "</span>" + chip(slot.badge[0], slot.badge[1]) + "</span>" +
      '<span class="slot-sub">' + slot.sub + "</span>" +
      (slot.target && (slot.state === "now" || slot.state === "next") ? '<span class="link mt-8">Ouvrir</span>' : "") +
      "</span>" +
      "</button>"
    );
  }

  /* ------------------------------------------------------------------ */
  /* 1. Connexion                                                        */
  /* ------------------------------------------------------------------ */

  function welcome(p, st) {
    var signup = st.authMode === "signup";
    var apple = '<button type="button" class="btn btn-block btn-apple" data-act="provider" data-provider="Apple">' + icon("apple", 20) + "Continuer avec Apple</button>";
    var google = '<button type="button" class="btn btn-block btn-google" data-act="provider" data-provider="Google">' + icon("google", 20) + "Continuer avec Google</button>";

    return {
      body:
        '<div class="welcome">' +
        '<div class="brand"><span class="brand-tile">' + icon("logo", 20) + "</span>Learny</div>" +
        "<h1>" + (signup ? "Créez votre espace d’apprentissage." : "Reprenez là où vous en êtes.") + "</h1>" +
        '<p class="lede">' + (signup
          ? "Trois minutes pour poser votre rythme, votre objectif et le tuteur qui vous accompagne."
          : "Votre tuteur a préparé la séance de 14:00 : 10 questions, 40 minutes, seuil de validation 80 %.") + "</p>" +
        '<div class="seg" role="group" aria-label="Mode de connexion">' +
        '<button type="button" data-act="auth-mode" data-mode="login" aria-pressed="' + (!signup) + '">Se connecter</button>' +
        '<button type="button" data-act="auth-mode" data-mode="signup" aria-pressed="' + signup + '">Créer un compte</button>' +
        "</div>" +
        '<div class="stack gap-12 mt-20">' +
        (signup
          ? '<div class="field"><label for="w-name">Prénom</label><input id="w-name" type="text" value="Alex" autocomplete="given-name"></div>'
          : "") +
        '<div class="field"><label for="w-email">Adresse e-mail</label><input id="w-email" type="email" value="alex.perrin@exemple.fr" autocomplete="email"></div>' +
        '<div class="field"><label for="w-pass">Mot de passe</label><input id="w-pass" type="password" value="motdepasse" autocomplete="current-password"></div>' +
        "</div>" +
        '<div class="row between mt-8"><span class="small">Session sécurisée</span>' +
        (signup ? '<span class="small">12 caractères minimum</span>' : '<button type="button" class="link" data-act="open-sheet" data-sheet="forgot">Mot de passe oublié ?</button>') +
        "</div>" +
        '<button type="button" class="btn btn-primary btn-block mt-16" data-act="login"' + (st.loading ? " disabled" : "") + ">" +
        (st.loading ? '<span class="spinner" aria-hidden="true"></span>' + (signup ? "Création…" : "Connexion…") : (signup ? "Créer mon compte" : "Se connecter")) +
        "</button>" +
        '<div class="divider">ou</div>' +
        '<div class="signin">' + (p === "ios" ? apple + google : google + apple) + "</div>" +
        '<p class="legal">En continuant, vous acceptez les <button type="button" class="inline-link" data-act="open-sheet" data-sheet="legal" data-doc="cgu">conditions d’utilisation</button> et la <button type="button" class="inline-link" data-act="open-sheet" data-sheet="legal" data-doc="privacy">politique de confidentialité</button> de Learny.</p>' +
        "</div>"
    };
  }

  /* ------------------------------------------------------------------ */
  /* 2. Aujourd’hui                                                      */
  /* ------------------------------------------------------------------ */

  function today(p, st) {
    var unread = notifUnread(st);
    var accepted = st.reprise === "accepte" || st.reprise === "slot";
    var slotLabel = st.bookedSlot || "jeudi 10:30";

    return {
      tab: "today",
      body:
        largeHead(
          "Mercredi 11 novembre",
          "Aujourd’hui",
          '<button type="button" class="iconbtn" data-act="open-sheet" data-sheet="notifications" aria-label="Notifications, ' + unread + ' non lues">' + icon("bell", 19) + (unread ? '<span class="badge">' + unread + "</span>" : "") + "</button>" +
          '<button type="button" class="avatar" data-act="open-sheet" data-sheet="account" aria-label="Profil d’Alex Perrin">AP</button>'
        ) +
        '<section class="hero card-dark">' +
        '<div class="row between"><span class="hero-kicker">Votre séance</span><span class="hero-time">' + (st.snoozed ? "18:00" : "14:00") + "</span></div>" +
        '<h2 class="hero-title">Quiz de validation</h2>' +
        '<p class="hero-meta">Comptabilité générale · tentative 2 · seuil 80 %</p>' +
        (st.snoozed ? '<div class="hero-note">' + icon("clock", 14) + " Reporté à 18:00 · le tuteur a prévenu votre série" + "</div>" : "") +
        '<div class="progress on-dark"><span style="width:38%"></span></div>' +
        '<div class="hero-foot"><span>3 h faites</span><span>5 h prévues</span></div>' +
        '<div class="hero-actions">' +
        '<button type="button" class="btn btn-primary" data-nav="quiz" data-t="fwd">' + (st.snoozed ? "Commencer quand même" : "Commencer · 40 min") + "</button>" +
        '<button type="button" class="btn btn-outline" data-act="' + (st.snoozed ? "unsnooze" : "snooze") + '">' + (st.snoozed ? "Annuler le report" : "Plus tard") + "</button>" +
        "</div>" +
        "</section>" +
        '<div class="stat-row">' +
        statCard("streak", "lime", "flame", "Série", "12", "jours") +
        statCard("retention", "", "target", "Rétention", "86", "%") +
        statCard("gaps", "", "alert", "Lacunes", "4", "notions") +
        "</div>" +
        '<section class="section">' +
        '<div class="section-head"><h2 class="h2">Le tuteur a agi</h2><button type="button" class="link" data-act="open-sheet" data-sheet="feed">Tout voir</button></div>' +
        '<div class="tutor-card">' +
        '<div class="tutor-kind"><span class="dot"></span>Séance replacée</div>' +
        (accepted
          ? '<p class="tutor-text">Séance acceptée · <b>' + slotLabel + '</b>. Le tuteur a prévenu votre série et bloqué le créneau.</p>' +
            '<div class="tutor-actions"><span class="chip green">Acceptée · ' + slotLabel + '</span><button type="button" class="link" data-act="reprise-undo">Annuler</button></div>'
          : '<p class="tutor-text">« Ledgers parallèles » non terminé mardi : reprise proposée <b>jeudi 10:30</b>.</p>' +
            '<div class="tutor-actions"><button type="button" class="btn btn-ink btn-sm" data-act="reprise-accept">Accepter</button><button type="button" class="btn btn-outline btn-sm" data-act="reprise-slots" aria-expanded="' + !!st.slotsOpen + '">Autre créneau</button></div>' +
            (st.slotsOpen
              ? '<div class="quick">' + SLOTS.map(function (s) { return '<button type="button" class="chip outline" data-act="reprise-pick" data-slot="' + s + '">' + s + "</button>"; }).join("") + "</div>"
              : "")) +
        "</div>" +
        '<div class="tutor-card">' +
        '<div class="tutor-kind"><span class="dot" style="background:var(--indigo)"></span>Carte créée</div>' +
        '<p class="tutor-text">« Pourquoi deux dates sur une pièce ? » reviendra vendredi dans le quiz global.</p>' +
        '<div class="tutor-actions"><button type="button" class="btn btn-outline btn-sm" data-nav="session" data-t="fwd">Voir la carte</button></div>' +
        "</div>" +
        "</section>" +
        '<section class="section">' +
        '<div class="section-head"><h2 class="h2">À suivre</h2></div>' +
        '<div class="card" style="padding:2px 14px">' +
        '<button type="button" class="next-row" data-nav="session" data-t="fwd" style="width:100%;text-align:left">' +
        '<span class="next-time">17:00</span><span class="dot" style="background:var(--violet)"></span>' +
        '<span class="next-body"><span class="next-title">Quiz global</span><span class="next-sub">14 notions · 10 min</span></span>' +
        '<span class="chev">' + icon("chevronRight", 16) + "</span>" +
        "</button>" +
        '<button type="button" class="next-row" data-nav="cours" data-t="fwd" style="width:100%;text-align:left">' +
        '<span class="next-time">+ 8 min</span><span class="dot" style="background:var(--indigo)"></span>' +
        '<span class="next-body"><span class="next-title">Votre cours</span><span class="next-sub">Chapitre 2 · Saisie des pièces comptables</span></span>' +
        '<span class="chev">' + icon("chevronRight", 16) + "</span>" +
        "</button>" +
        "</div>" +
        "</section>" +
        '<div style="height:20px"></div>'
    };
  }

  /* ------------------------------------------------------------------ */
  /* 3. Programme                                                        */
  /* ------------------------------------------------------------------ */

  function chapter(state, num, title, meta) {
    var mark =
      state === "done"
        ? '<span class="round ok">' + icon("check", 12) + "</span>"
        : state === "current"
          ? '<span class="round on">' + num + "</span>"
          : '<span class="round">' + num + "</span>";
    return (
      '<button type="button" class="chapter ' + (state === "done" ? "done" : "") + '" data-nav="cours" data-t="fwd">' +
      '<span class="ch-state">' + mark + "</span>" +
      '<span class="ch-title">' + title + "</span>" +
      '<span class="ch-meta">' + meta + "</span>" +
      "</button>"
    );
  }

  function programme(p, st) {
    var modules = st.programmeView !== "calendrier";
    var marked = [2, 4, 6, 9, 11, 13, 16, 18, 20, 23, 25, 27, 30];

    var head =
      largeHead(
        "SAP S/4HANA Finance",
        "Programme",
        '<button type="button" class="iconbtn only-ios" data-act="open-sheet" data-sheet="newFormation" aria-label="Nouvelle formation">' + icon("plus", 20) + "</button>"
      ) +
      '<section class="formation card" data-act="open-sheet" data-sheet="formation" style="cursor:pointer">' +
      '<div class="formation-top">' +
      '<span class="sigle">SAP</span>' +
      '<div class="grow"><div class="row between"><b style="font-size:15px">SAP S/4HANA Finance</b><span class="percent">38 %</span></div>' +
      '<p class="small" style="margin:2px 0 0">Module 3 sur 7 · 2 nov. – 11 déc.</p></div>' +
      "</div>" +
      '<div class="progress mt-12"><span style="width:38%"></span></div>' +
      "</section>" +
      '<div class="px mt-16"><div class="seg" role="group" aria-label="Vue du programme">' +
      '<button type="button" data-act="programme-view" data-view="modules" aria-pressed="' + modules + '">Modules</button>' +
      '<button type="button" data-act="programme-view" data-view="calendrier" aria-pressed="' + !modules + '">Calendrier</button>' +
      "</div></div>" +
      '<div class="px" style="margin-top:10px;text-align:right">' +
      '<button type="button" class="link" style="display:inline-flex;align-items:center;gap:5px" data-act="open-sheet" data-sheet="import">' + icon("plus", 13) + "Importer votre programme</button>" +
      "</div>";

    if (!modules) {
      return {
        tab: "programme",
        fab: true,
        body:
          head +
          '<section class="section" style="margin-top:14px">' +
          '<div class="section-head"><h2 class="h2">Calendrier de la formation</h2><span class="tiny">2 nov. – 11 déc.</span></div>' +
          monthGrid(11, marked, "day-info") +
          '<div class="legend"><span><i class="lg-dot indigo"></i>Séance</span><span><i class="lg-dot ink"></i>Aujourd’hui</span></div>' +
          '<div class="card card-pad mt-16"><div class="row between"><span class="kicker">Prochaine séance</span>' + chip("Aujourd’hui · 14:00", "lime") + "</div>" +
          '<h3 class="h2 mt-8" style="font-size:18px">Quiz de validation · module 3</h3>' +
          '<p class="sub mt-4">Comptabilité générale · tentative 2 · 40 min.</p>' +
          '<button type="button" class="btn btn-ink btn-sm mt-12" data-nav="quiz" data-t="fwd">Ouvrir le quiz</button></div>' +
          "</section>" +
          '<div style="height:28px"></div>'
      };
    }

    return {
      tab: "programme",
      fab: true,
      body:
        head +
        '<section class="section" style="margin-top:14px">' +
        '<div class="card module current">' +
        '<div class="module-head">' +
        '<span class="module-num">3</span>' +
        '<div class="grow"><div class="row between"><h2 class="h2" style="font-size:18px">Comptabilité générale</h2>' + chip("En cours", p === "ios" ? "lime" : "") + "</div>" +
        '<p class="small" style="margin:3px 0 0">4 chapitres · quiz à 80 %</p></div>' +
        "</div>" +
        chapter("done", 1, "L’en-tête de pièce", "Validé") +
        chapter("current", 2, "Saisie des pièces comptables", "8 min") +
        chapter("todo", 3, "Lettrage et rapprochement", "") +
        chapter("todo", 4, "Les ledgers parallèles", "") +
        '<div style="padding:4px 16px 16px 58px"><button type="button" class="btn btn-ink btn-sm btn-block" data-nav="cours" data-t="fwd">Reprendre le chapitre 2</button></div>' +
        "</div>" +
        '<button type="button" class="card module mt-8" data-act="locked" style="width:100%;text-align:left">' +
        '<div class="module-head">' +
        '<span class="module-num">4</span>' +
        '<div class="grow"><div class="row between"><h2 class="h2" style="font-size:18px">Clôtures et reporting</h2></div>' +
        '<p class="small" style="margin:3px 0 0">5 chapitres · après le module 3</p></div>' +
        '<span style="color:var(--muted-2)">' + icon("lock", 16) + "</span>" +
        "</div></button>" +
        '<button type="button" class="card module mt-8" data-act="toggle-module" style="width:100%;text-align:left">' +
        '<div class="module-head">' +
        '<span class="module-num">2</span>' +
        '<div class="grow"><div class="row between"><h2 class="h2" style="font-size:18px">Comptabilité fournisseurs</h2>' + chip("Validé", "green") + "</div>" +
        '<p class="small" style="margin:3px 0 0">4 chapitres terminés · 91 %</p></div>' +
        '<span style="color:var(--muted-2);transform:rotate(' + (st.mod2Open ? 180 : 0) + 'deg);transition:transform .2s">' + icon("chevronDown", 18) + "</span>" +
        "</div>" +
        (st.mod2Open
          ? '<div class="module-open">' +
            '<div class="mini-row"><span class="round ok">' + icon("check", 12) + '</span><span>Lettrage simple</span><span class="tiny">95 %</span></div>' +
            '<div class="mini-row"><span class="round ok">' + icon("check", 12) + '</span><span>Rapprochement bancaire</span><span class="tiny">89 %</span></div>' +
            '<div class="mini-row"><span class="round ok">' + icon("check", 12) + '</span><span>Comptes fournisseurs</span><span class="tiny">91 %</span></div>' +
            "</div>"
          : "") +
        "</button>" +
        "</section>" +
        '<div style="height:28px"></div>'
    };
  }

  /* ------------------------------------------------------------------ */
  /* 4. Cours                                                            */
  /* ------------------------------------------------------------------ */

  function cours(p, st) {
    return {
      body:
        '<div class="navbar">' +
        '<button type="button" class="iconbtn is-plain" data-nav="programme" data-t="back" aria-label="Retour au programme">' + icon("chevronLeft", 22) + "</button>" +
        '<span class="nav-title">Chapitre 2 sur 4</span>' +
        '<button type="button" class="iconbtn is-plain ' + (st.bookmark ? "is-on" : "") + '" data-act="bookmark" aria-label="' + (st.bookmark ? "Retirer des favoris" : "Enregistrer le chapitre") + '" aria-pressed="' + !!st.bookmark + '">' + icon("bookmark", 19) + "</button>" +
        "</div>" +
        '<div class="readbar" aria-hidden="true"><span></span></div>' +
        '<article class="article">' +
        '<span class="tag">Comptabilité générale</span>' +
        "<h1>Saisie des pièces comptables</h1>" +
        '<div class="meta">' + icon("clock", 13) + "<span>8 min de lecture · 4 apports · mis à jour hier</span></div>" +
        "<p>Une pièce se saisit en deux temps : l’en-tête, puis les postes. Cet ordre n’est pas décoratif — il détermine ce que le tuteur pourra vérifier ensuite.</p>" +
        "<h2>L’en-tête de pièce</h2>" +
        "<p>L’en-tête identifie l’opération. Il porte le type de pièce, la société, la référence et deux dates qu’on confond souvent.</p>" +
        '<div class="field-card"><span class="num">1</span><div><b>Date de pièce</b><span class="small">Fixe la période comptable. C’est elle qui fait foi.</span></div></div>' +
        '<div class="field-card"><span class="num">2</span><div><b>Date de saisie</b><span class="small">Trace l’enregistrement. Elle ne déplace jamais la période.</span></div></div>' +
        '<div class="field-card"><span class="num">3</span><div><b>Référence</b><span class="small">Relie la pièce à la facture ou au bon de livraison.</span></div></div>' +
        "<h2>Les postes et les clés</h2>" +
        "<p>Chaque poste porte un compte, un sens et une clé de comptabilisation. La clé ne décrit pas la nature de la pièce : elle décrit le rôle du compte dans l’écriture.</p>" +
        '<div class="warn"><b>Ne pas confondre</b><p>La clé de comptabilisation n’est pas le type de pièce. Une même facture fournisseur peut se saisir avec plusieurs clés selon le compte mouvementé.</p></div>' +
        '<div class="remember"><b>À retenir</b><ul><li>La date de pièce commande la période.</li><li>La clé décrit le rôle du compte, pas la nature du document.</li></ul></div>' +
        '<div class="article-end"><button type="button" class="btn btn-ink btn-block" data-nav="quiz" data-t="fwd">Passer au quiz de validation</button></div>' +
        "</article>",
      foot:
        '<div class="course-cta">' +
        '<button type="button" class="btn btn-ink" data-act="open-sheet" data-sheet="tutor">' + icon("sparkles", 17) + "Demander au tuteur</button>" +
        '<button type="button" class="btn btn-outline btn-square" data-nav="quiz" data-t="fwd" aria-label="Passer au quiz">' + icon("cards", 19) + "</button>" +
        "</div>"
    };
  }

  /* ------------------------------------------------------------------ */
  /* 5. Quiz de validation                                               */
  /* ------------------------------------------------------------------ */

  function quiz(p, st) {
    var q = QUESTIONS[st.qi] || QUESTIONS[0];
    var n = 3 + st.qi;
    var checked = !!st.checked;
    var ok = checked && st.pick === q.correct;

    var segments = "";
    for (var i = 0; i < 10; i++) {
      var cls = i < n - 1 ? "done" : i === n - 1 ? "current" : "";
      segments += '<span class="' + cls + '"></span>';
    }

    var options = q.options
      .map(function (label, index) {
        var klass = "option";
        if (checked) {
          if (index === q.correct) klass += " correct";
          else if (index === st.pick) klass += " wrong";
        }
        var pressed = !checked && st.pick === index ? ' aria-pressed="true"' : ' aria-pressed="false"';
        return (
          '<button type="button" class="' + klass + '" data-option="' + index + '"' + pressed + (checked ? ' aria-disabled="true"' : "") + ">" +
          '<span class="letter">' + "ABCD"[index] + "</span>" +
          "<span>" + label + "</span>" +
          "</button>"
        );
      })
      .join("");

    var footer;
    if (!checked) {
      footer =
        '<div class="quiz-foot"><button type="button" class="btn btn-primary btn-block"' + (st.pick == null ? " disabled" : "") + " data-check>Valider</button></div>";
    } else {
      footer =
        '<div class="quiz-foot">' +
        '<div class="feedback ' + (ok ? "" : "bad") + '">' + icon(ok ? "check" : "alert", 17) +
        "<span><b>" + (ok ? "Bonne réponse." : "Pas tout à fait.") + "</b> " + q.why + "</span></div>" +
        '<button type="button" class="btn btn-ink btn-block mt-8" data-next>' + (st.qi < QUESTIONS.length - 1 ? "Question suivante" : "Voir le résultat") + "</button>" +
        "</div>";
    }

    return {
      body:
        '<div class="quiz-top">' +
        '<button type="button" class="iconbtn is-plain" data-act="quiz-quit" aria-label="Quitter le quiz">' + icon("x", 20) + "</button>" +
        '<span class="quiz-count">Question ' + n + " sur 10</span>" +
        '<span class="quiz-timer">' + icon("clock", 13) + "08:42</span>" +
        "</div>" +
        '<div class="segments" aria-hidden="true">' + segments + "</div>" +
        '<div class="quiz-body">' +
        '<span class="tag">Application · chapitre 2</span>' +
        '<h1 class="quiz-q">' + q.q + "</h1>" +
        '<p class="tiny" style="margin:-10px 0 14px">Une seule réponse. Retour possible avant de valider.</p>' +
        options +
        "</div>",
      foot: footer
    };
  }

  /* ------------------------------------------------------------------ */
  /* 6. Résultat (démo)                                                  */
  /* ------------------------------------------------------------------ */

  function result(p, st) {
    var total = QUESTIONS.length;
    var answers = st.answers || [];
    var good = answers.filter(function (a) { return a && a.correct; }).length;
    var pct = Math.round((good / total) * 100);

    return {
      body:
        '<div class="result-wrap">' +
        '<p class="kicker">Tentative 2 · Comptabilité générale</p>' +
        '<h1 class="h1 mt-4">Quiz terminé</h1>' +
        '<div class="result-ring" style="--pct:' + pct + '"><span><b>' + good + "/" + total + "</b><small>" + pct + " %</small></span></div>" +
        '<p class="sub">' + (good === total ? "Tout est juste. Le tuteur note une bonne maîtrise de la période comptable." : "Encore un point à consolider : la période comptable.") + "</p>" +
        '<div class="result-note">Démo : ' + total + ' questions jouées sur 10. Le résultat complet est simulé pour montrer les états.</div>' +
        '<div class="result-list">' +
        QUESTIONS.map(function (q, i) {
          var a = answers[i];
          var ok = a && a.correct;
          return '<div class="result-row">' +
            '<span class="round ' + (ok ? "ok" : "ko") + '">' + icon(ok ? "check" : "x", 12) + "</span>" +
            '<span class="grow"><b>Question ' + (i + 3) + "</b><span>" + q.q + "</span></span>" +
            "</div>";
        }).join("") +
        "</div>" +
        '<button type="button" class="btn btn-ink btn-block" data-nav="today" data-t="tab">Retour à l’accueil</button>' +
        '<button type="button" class="btn btn-outline btn-block mt-8" data-act="quiz-restart">Revoir mes réponses</button>' +
        "</div>"
    };
  }

  /* ------------------------------------------------------------------ */
  /* 7. Quiz global / révision                                           */
  /* ------------------------------------------------------------------ */

  function session(p, st) {
    var index = (st.card || 0) % CARDS.length;
    var card = CARDS[index];

    var cells = "";
    for (var i = 0; i < 14; i++) {
      cells += '<span style="flex:1;height:8px;border-radius:3px;background:' + (i < 12 ? "var(--lime)" : "#E4E3DE") + '"></span>';
    }

    return {
      tab: "revise",
      body:
        largeHead(
          "Session du mercredi 11 novembre",
          "Quiz global",
          '<button type="button" class="iconbtn" data-nav="today" data-t="tab" aria-label="Fermer la session">' + icon("x", 19) + "</button>"
        ) +
        '<div class="px"><div class="row between"><span class="small">Notion ' + (index + 4) + " sur 14</span><span class=\"small mono\">4 min</span></div>" +
        '<div class="progress mt-8"><span style="width:' + ((index + 4) / 14) * 100 + '%"></span></div></div>' +
        '<div class="deck-wrap">' +
        '<div class="deck-shadow two"></div><div class="deck-shadow"></div>' +
        '<div class="deck-card" data-reveal role="button" tabindex="0" aria-label="Révéler la réponse">' +
        '<span class="deck-kicker">' + card.n + "</span>" +
        '<h2 class="deck-term">' + card.term + "</h2>" +
        '<p class="deck-q">' + card.q + "</p>" +
        (st.reveal
          ? '<p class="deck-a">' + card.a + "</p>"
          : '<span class="deck-reveal">' + icon("swipe", 14) + "Touchez pour révéler</span>") +
        "</div>" +
        "</div>" +
        '<div class="deck-actions">' +
        '<button type="button" class="btn btn-outline" data-advance="review">À revoir</button>' +
        '<button type="button" class="btn btn-primary" data-advance="known">Je savais</button>' +
        "</div>" +
        '<button type="button" class="session-strip" data-act="stat" data-stat="streak" style="width:calc(100% - 40px);text-align:left">' +
        '<span style="color:var(--orange)">' + icon("flame", 18) + "</span>" +
        '<span class="grow"><span class="row between"><b style="font-size:14px">Série de 12 jours</b><span class="tiny">14 derniers jours</span></span>' +
        '<span style="display:flex;gap:3px;margin-top:6px">' + cells + "</span></span>" +
        "</button>" +
        (st.reportCancelled
          ? ""
          : '<div class="px mt-16" style="padding-bottom:22px">' +
            '<div class="row gap-8" style="padding:12px 14px;border:1px dashed var(--line-2);border-radius:14px">' +
            '<span style="color:var(--muted)">' + icon("sparkles", 16) + "</span>" +
            '<p class="tiny" style="margin:0">Le tuteur a reporté 4 notions à jeudi pour garder la session sous 10 minutes. <button type="button" class="link" style="font-size:11px" data-act="session-report">Annuler</button></p>' +
            "</div></div>") +
        '<div style="height:8px"></div>'
    };
  }

  /* ------------------------------------------------------------------ */
  /* 8. Agenda                                                           */
  /* ------------------------------------------------------------------ */

  function agenda(p, st) {
    var day = st.day || 11;
    var data = AGENDA[day];
    var view = st.agendaView || "jour";
    var empty = st.agendaFilter !== "all" && st.agendaFilter !== "sap";

    var week = WEEK_DAYS.map(function (n, index) {
      var active = n === day;
      return (
        '<button type="button" class="day" data-act="pick-day" data-day="' + n + '" aria-pressed="' + active + '">' +
        "<span>" + DAY_LETTERS[index] + "</span>" +
        '<span class="dnum">' + n + "</span>" +
        '<span class="ddots">' + (index < 5 ? "<i></i>" : "") + (n === 11 ? "<i></i>" : "") + "</span>" +
        "</button>"
      );
    }).join("");

    var timeline = data.slots.map(function (slot, index) { return slotCard(slot, index); }).join("");
    var selected = data.slots[data.selected] || data.slots[0];
    var selectedSlot = data.selected;

    var viewBody = "";
    if (empty) {
      viewBody =
        '<div class="empty-state"><span class="empty-ico">' + icon("calendar", 24) + "</span>" +
        "<h3>Aucune activité pour " + FILTERS[st.agendaFilter] + "</h3>" +
        "<p>Le tuteur n’a rien planifié sur cette formation cette semaine.</p>" +
        '<button type="button" class="btn btn-outline btn-sm" data-act="open-sheet" data-sheet="formations">Changer de filtre</button></div>';
    } else if (view === "semaine") {
      viewBody =
        '<div class="week-list">' +
        WEEK_DAYS.map(function (n) {
          var d = AGENDA[n];
          var first = d.slots[0];
          return '<button type="button" class="week-row ' + (n === day ? "is-active" : "") + '" data-act="pick-day" data-day="' + n + '">' +
            '<span class="week-day"><b>' + DAY_LETTERS[WEEK_DAYS.indexOf(n)] + "</b><span>" + n + "</span></span>" +
            '<span class="grow"><b>' + first.title + "</b><span>" + d.slots.length + " activité" + (d.slots.length > 1 ? "s" : "") + " · " + first.time + "</span></span>" +
            '<span class="chev">' + icon("chevronRight", 16) + "</span>" +
            "</button>";
        }).join("") +
        "</div>";
    } else if (view === "mois") {
      viewBody =
        monthGrid(day, [9, 10, 11, 12, 13, 14, 15], "pick-day") +
        '<div class="legend"><span><i class="lg-dot indigo"></i>Activité</span><span><i class="lg-dot ink"></i>Sélection</span></div>' +
        '<div class="card card-pad mt-16"><div class="row between"><span class="kicker">' + data.label + "</span>" + chip(data.slots.length + " activités", "indigo") + "</div>" +
        '<p class="sub mt-8">' + data.slots.map(function (s) { return s.time + " " + s.title; }).join(" · ") + "</p>" +
        '<button type="button" class="btn btn-ink btn-sm mt-12" data-act="agenda-view" data-view="jour">Voir la journée</button></div>';
    } else {
      viewBody =
        '<div class="timeline">' + timeline + "</div>" +
        '<button type="button" class="card card-pad" data-act="activity" data-index="' + selectedSlot + '" style="width:calc(100% - 32px);margin:14px 16px 0;text-align:left">' +
        '<span class="row between"><span class="tag">Activité sélectionnée</span>' + chip(selected.badge[0], selected.badge[1]) + "</span>" +
        '<span class="h2 mt-12" style="font-size:19px;display:block">' + selected.title + "</span>" +
        '<span class="sub mt-4" style="display:block">' + selected.sub + " · " + selected.time + ".</span>" +
        '<span class="row gap-8 mt-12"><span class="btn btn-primary grow">Ouvrir</span><span class="btn btn-outline">Replanifier</span></span>' +
        "</button>" +
        '<div style="height:22px"></div>';
    }

    return {
      tab: "agenda",
      body:
        largeHead(
          data.label.charAt(0).toUpperCase() + data.label.slice(1),
          "Agenda",
          '<button type="button" class="iconbtn" data-act="open-sheet" data-sheet="formations" aria-label="Filtrer par formation">' + icon("list", 19) + "</button>"
        ) +
        '<div class="px"><button type="button" class="chip outline" data-act="open-sheet" data-sheet="formations">' + icon("layers", 13) + FILTERS[st.agendaFilter || "all"] + icon("chevronDown", 12) + "</button></div>" +
        '<div class="px mt-12"><div class="seg" role="group" aria-label="Période">' +
        ["jour", "semaine", "mois"].map(function (v) {
          return '<button type="button" data-act="agenda-view" data-view="' + v + '" aria-pressed="' + (view === v) + '">' + v.charAt(0).toUpperCase() + v.slice(1) + "</button>";
        }).join("") +
        "</div></div>" +
        (view === "jour" ? '<div class="week" role="group" aria-label="Semaine du 9 au 15 novembre">' + week + "</div>" : "") +
        '<div class="agenda-body">' + viewBody + "</div>"
    };
  }

  /* ------------------------------------------------------------------ */
  /* 9. Profil                                                           */
  /* ------------------------------------------------------------------ */

  function profileRow(iconName, title, sub, options) {
    options = options || {};
    return (
      '<button type="button" class="li" data-act="open-sheet" data-sheet="' + (options.sheet || "") + '"' + (options.nav ? ' data-nav="' + options.nav + '" data-t="back"' : "") + ">" +
      '<span class="li-icon">' + icon(iconName, 19) + "</span>" +
      '<span class="li-body"><span class="li-title">' + title + "</span>" + (sub ? '<span class="li-sub">' + sub + "</span>" : "") + "</span>" +
      (options.right ? options.right : '<span class="chev">' + icon("chevronRight", 16) + "</span>") +
      "</button>"
    );
  }

  function profile(p, st) {
    var identity = st.identity || { name: "Alex Perrin", email: "alex.perrin@exemple.fr" };
    var initials = identity.name.split(" ").map(function (part) { return part.charAt(0); }).join("").slice(0, 2).toUpperCase();

    return {
      tab: "profile",
      body:
        largeHead(
          "Mon compte",
          "Profil",
          '<button type="button" class="iconbtn" data-act="open-sheet" data-sheet="settings" aria-label="Paramètres">' + icon("settings", 19) + "</button>"
        ) +
        '<div class="profile-hero card">' +
        '<span class="avatar lg">' + initials + "</span>" +
        '<div class="grow"><p class="pname">' + identity.name + '</p><p class="small" style="margin:2px 0 4px">Apprenant · 3 formations en cours</p><span class="chip">Membre depuis septembre</span></div>' +
        "</div>" +
        '<div class="profile-stats">' +
        '<button type="button" class="pstat" data-act="stat" data-stat="streak"><b>12 j</b><span>de série</span></button>' +
        '<button type="button" class="pstat" data-act="stat" data-stat="retention"><b>86 %</b><span>retenu à 1 mois</span></button>' +
        '<button type="button" class="pstat" data-act="stat" data-stat="gaps"><b>4</b><span>lacunes</span></button>' +
        "</div>" +
        '<p class="group-label">Compte</p>' +
        '<div class="list inset">' +
        profileRow("user", "Identité", identity.name + " · " + identity.email, { sheet: "identity" }) +
        profileRow("bell", "Notifications", notifUnread(st) + " non lues · rappels et bilans", { sheet: "notifPrefs" }) +
        profileRow("lock", "Sécurité et connexion", "Mot de passe, appareils", { sheet: "security" }) +
        "</div>" +
        '<p class="group-label">Apprentissage</p>' +
        '<div class="list inset">' +
        profileRow("clock", "Rythme et rappels", "5 h par semaine · soirs", { sheet: "rhythm" }) +
        profileRow("sparkles", "Modèles d’IA", (st.model || "Claude") + " par défaut", { sheet: "models" }) +
        profileRow("card", "Abonnement", "Essai · 12 jours restants", { sheet: "subscription" }) +
        "</div>" +
        '<p class="group-label">Aide</p>' +
        '<div class="list inset">' +
        profileRow("help", "Centre d’aide", "", { sheet: "help" }) +
        profileRow("shield", "Confidentialité", "", { sheet: "privacy" }) +
        '<button type="button" class="li" data-act="open-sheet" data-sheet="logout">' +
        '<span class="li-icon">' + icon("logout", 19) + '</span><span class="li-body"><span class="li-title danger">Se déconnecter</span></span>' +
        "</button>" +
        "</div>" +
        '<p class="tiny" style="text-align:center;margin:20px 0 26px">Learny 1.0 · build 482</p>'
    };
  }

  var SCREENS = {
    welcome: welcome,
    today: today,
    programme: programme,
    cours: cours,
    quiz: quiz,
    result: result,
    session: session,
    agenda: agenda,
    profile: profile
  };

  var ORDER = ["welcome", "today", "programme", "cours", "quiz", "session", "agenda", "profile"];

  var TITLES = {
    welcome: "Connexion",
    today: "Aujourd’hui",
    programme: "Programme",
    cours: "Cours · chapitre 2",
    quiz: "Quiz de validation",
    result: "Résultat",
    session: "Quiz global",
    agenda: "Agenda",
    profile: "Profil"
  };

  var NOTES = {
    welcome: "Connexion, compte et rassurance. Apple d’abord sur iOS, Google d’abord sur Android.",
    today: "La séance du jour, la série, la rétention et les actions du tuteur.",
    programme: "Modules, chapitres et reprise du chapitre en cours.",
    cours: "Lecture, contrôle de compréhension et appel au tuteur.",
    quiz: "Question, progression, chronomètre et validation.",
    session: "Révision en cartes : révéler, trier, avancer.",
    agenda: "Semaine, journée et activité sélectionnée.",
    profile: "Compte, réglages, abonnement et déconnexion."
  };

  window.LearnyScreens = {
    render: function (p, st) {
      var fn = SCREENS[st.screen] || today;
      return fn(p, st);
    },
    order: ORDER,
    titles: TITLES,
    notes: NOTES,
    questions: QUESTIONS,
    cards: CARDS,
    agenda: AGENDA,
    filters: FILTERS,
    slots: SLOTS,
    notifs: NOTIFS,
    notifUnread: notifUnread,
    notifRead: notifRead
  };
})();
