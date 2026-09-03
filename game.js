/* ============================================================================
   tyneconbuddy — Progress layer (levels · skill tree · class leaderboard)
   ----------------------------------------------------------------------------
   One shared file for all four drilling pages. Each page defines a small
   window.GAME_CONFIG before loading this script; everything else lives here so
   there is only ONE place to change the rules.

   SCORING RULE (agreed with the teacher)
   --------------------------------------
   1. A question is "cleared" only when it is answered CORRECTLY.
   2. Anti-farming: if you got a question wrong, answering it right again only
      counts once you have either answered ANTI_FARM_GAP other questions in
      between, or waited ANTI_FARM_MS. Tapping through the same question twice
      in a row earns nothing. The student is told this on screen, in plain
      Cantonese, so it reads as a rule and not as a bug.
   3. Section % = cleared / total questions in that section (drives the tree).
   4. Ranking score = cleared / total across EVERY section, so a small section
      is worth exactly its size. Nobody climbs by farming the shortest topic.

   PRIVACY
   -------
   The leaderboard shows a nickname (花名) the student picks. Their Google
   email is never rendered on the board, and the JSONP read sends a short hash
   (uid) rather than the address, so emails stay out of URLs and server logs.
   ========================================================================== */
(function () {
  'use strict';

  var CFG = window.GAME_CONFIG;
  if (!CFG || !CFG.pageId) return;                 // page opted out

  /* ---------- tunables ---------------------------------------------------- */
  var ANTI_FARM_GAP = 5;                           // other questions in between
  var ANTI_FARM_MS = 10 * 60 * 1000;               // or ten minutes
  var PUSH_THROTTLE_MS = 20000;                    // min gap between score pushes
  var LB_TTL_MS = 60000;                           // leaderboard cache lifetime
  var LB_TIMEOUT_MS = 25000;                       // Apps Script cold start is slow
  var LB_RETRY_MS = 2500;                          // one silent retry after a timeout

  var LEVELS = [
    { at: 0,  en: 'Starter',    zh: '起步' },
    { at: 3,  en: 'Foundation', zh: '打底' },
    { at: 8,  en: 'Familiar',   zh: '上手' },
    { at: 15, en: 'Steady',     zh: '穩陣' },
    { at: 25, en: 'Sharp',      zh: '熟手' },
    { at: 40, en: 'Strong',     zh: '硬淨' },
    { at: 60, en: 'Advanced',   zh: '進階' },
    { at: 80, en: 'Expert',     zh: '高手' },
    { at: 95, en: 'Master',     zh: '大師' },
    { at: 100, en: 'Full Marks', zh: '滿盤' }
  ];

  /* ---------- tiny helpers ------------------------------------------------ */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function el(id) { return document.getElementById(id); }
  function pct(a, b) { return b ? Math.round((a / b) * 100) : 0; }
  function pct1(a, b) { return b ? Math.round((a / b) * 1000) / 10 : 0; }

  /* djb2 — must stay byte-for-byte identical to hashUid_() in Code.gs, or the
     student's own row will never be found on the leaderboard. */
  function djb2(s) {
    var x = 5381;
    s = String(s);
    for (var i = 0; i < s.length; i++) x = ((x * 33) ^ s.charCodeAt(i)) >>> 0;
    return x.toString(36);
  }

  /* localStorage with an in-memory fallback (private mode, file://) */
  var Store = (function () {
    var mem = {}, ok = false;
    try { localStorage.setItem('__g', '1'); localStorage.removeItem('__g'); ok = true; } catch (e) {}
    return {
      read: function (k) { try { return ok ? localStorage.getItem(k) : (k in mem ? mem[k] : null); } catch (e) { return mem[k] || null; } },
      write: function (k, v) { try { ok ? localStorage.setItem(k, v) : (mem[k] = v); } catch (e) { mem[k] = v; } }
    };
  })();

  /* ---------- who is signed in ------------------------------------------- */
  function who() {
    try { if (typeof cur !== 'undefined' && cur) return String(cur); } catch (e) {}
    return 'guest';
  }
  function uid() { return djb2('tyn:' + who()); }
  function key(suffix) { return 'tjxg:' + djb2(who()) + ':' + suffix; }

  /* ---------- per-student state ------------------------------------------ */
  /* cleared: {qid: timestamp}   wrong: {qid: {t, n}}   n: lifetime answers   */
  function blank() { return { cleared: {}, wrong: {}, n: 0, nick: '', day: '', dayN: 0 }; }
  var stateCache = null, stateOwner = null;

  function S() {
    var owner = who();
    if (stateCache && stateOwner === owner) return stateCache;
    var raw = Store.read(key('state'));
    var s = blank();
    if (raw) { try { s = Object.assign(blank(), JSON.parse(raw)); } catch (e) {} }
    stateCache = s; stateOwner = owner;
    return s;
  }
  function saveState() {
    if (!stateCache) return;
    Store.write(key('state'), JSON.stringify(stateCache));
  }

  /* ---------- sections ---------------------------------------------------- */
  /* CFG.sections: [{key, label}]   CFG.sectionOf(q) -> section key
     CFG.questions() -> array of question objects with .id                     */
  function questions() {
    try { return CFG.questions() || []; } catch (e) { return []; }
  }
  function sectionTotals() {
    var out = {};
    CFG.sections.forEach(function (s) { out[s.key] = { total: 0, cleared: 0, label: s.label }; });
    var st = S();
    questions().forEach(function (q) {
      var k;
      try { k = CFG.sectionOf(q); } catch (e) { return; }
      if (!out[k]) return;
      out[k].total++;
      if (st.cleared[q.id]) out[k].cleared++;
    });
    return out;
  }
  function overall() {
    var t = sectionTotals(), c = 0, n = 0;
    Object.keys(t).forEach(function (k) { c += t[k].cleared; n += t[k].total; });
    return { cleared: c, total: n, pct: pct1(c, n) };
  }
  function levelFor(p) {
    var lv = 0;
    for (var i = 0; i < LEVELS.length; i++) if (p >= LEVELS[i].at) lv = i;
    return { i: lv + 1, name: LEVELS[lv], next: LEVELS[lv + 1] || null };
  }

  /* ---------- topic mastery (leaves of the tree, display only) ------------ */
  function topicRows(sectionKey) {
    var st = S(), map = {};
    questions().forEach(function (q) {
      var k; try { k = CFG.sectionOf(q); } catch (e) { return; }
      if (k !== sectionKey) return;
      var t = CFG.topicOf ? CFG.topicOf(q) : { key: 'all', label: 'All' };
      if (!map[t.key]) map[t.key] = { label: t.label, total: 0, cleared: 0 };
      map[t.key].total++;
      if (st.cleared[q.id]) map[t.key].cleared++;
    });
    return Object.keys(map).map(function (k) {
      var r = map[k];
      return { key: k, label: r.label, total: r.total, cleared: r.cleared, pct: pct(r.cleared, r.total) };
    }).sort(function (a, b) { return b.total - a.total; });
  }

  /* ---------- the credit rule -------------------------------------------- */
  var lastToast = 0;
  function toast(msg, kind) {
    var host = el('game-toast');
    if (!host) {
      host = document.createElement('div');
      host.id = 'game-toast';
      document.body.appendChild(host);
    }
    host.className = 'g-toast show ' + (kind || '');
    host.textContent = msg;
    var mine = ++lastToast;
    setTimeout(function () { if (mine === lastToast) host.className = 'g-toast'; }, 3600);
  }

  function onAnswer(qid, correct) {
    if (!qid) return;
    var st = S();
    st.n++;

    var today = new Date().toISOString().slice(0, 10);
    if (st.day !== today) { st.day = today; st.dayN = 0; }
    st.dayN++;

    if (!correct) {
      st.wrong[qid] = { t: Date.now(), n: st.n };
      saveState(); refreshBadge();
      return;
    }
    if (st.cleared[qid]) { saveState(); refreshBadge(); return; }   // already banked

    var w = st.wrong[qid];
    if (!w) {
      st.cleared[qid] = Date.now();
      saveState(); refreshBadge(); schedulePush();
      return;
    }
    var waited = Date.now() - w.t >= ANTI_FARM_MS;
    var spaced = st.n - w.n >= ANTI_FARM_GAP;
    if (waited || spaced) {
      st.cleared[qid] = Date.now();
      delete st.wrong[qid];
      saveState(); refreshBadge(); schedulePush();
      toast('✓ 呢題翻身成功，計入進度。', 'ok');
    } else {
      saveState(); refreshBadge();
      var left = ANTI_FARM_GAP - (st.n - w.n);
      toast('答啱咗，但呢題頭先先答錯 — 隔多 ' + left + ' 題（或 10 分鐘）再答啱先計入進度。', 'warn');
    }
  }

  /* ---------- server sync ------------------------------------------------- */
  function syncUrl() {
    try { if (typeof SYNC_URL !== 'undefined' && SYNC_URL) return SYNC_URL; } catch (e) {}
    return '';
  }
  var lastPush = 0, pushTimer = null;
  function schedulePush() {
    if (!syncUrl() || who() === 'guest') return;
    if (pushTimer) return;
    var wait = Math.max(0, PUSH_THROTTLE_MS - (Date.now() - lastPush));
    pushTimer = setTimeout(function () { pushTimer = null; pushScore(); }, wait);
  }
  function pushScore() {
    if (!syncUrl() || who() === 'guest') return;
    lastPush = Date.now();
    var t = sectionTotals(), o = overall(), secs = {};
    Object.keys(t).forEach(function (k) { secs[k] = { p: pct(t[k].cleared, t[k].total), c: t[k].cleared, n: t[k].total, l: t[k].label }; });
    var body = {
      event: 'score',
      profile: who(),
      uid: uid(),
      nick: S().nick || '',
      pageId: CFG.pageId,
      pageLabel: CFG.pageLabel || CFG.pageId,
      sections: secs,
      cleared: o.cleared,
      total: o.total,
      ts: new Date().toISOString()
    };
    try {
      if (typeof googleIdToken !== 'undefined' && googleIdToken) body.idToken = googleIdToken;
    } catch (e) {}
    try {
      fetch(syncUrl(), {
        method: 'POST', mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(body)
      }).catch(function () {});
    } catch (e) {}
  }

  /* Apps Script Web Apps do not send CORS headers, so a read has to be JSONP. */
  var lbCache = null, lbAt = 0, lbPending = false, lbQueue = [];
  function fetchBoard(cb, force) {
    if (!syncUrl()) { cb({ off: true }); return; }
    if (!force && lbCache && Date.now() - lbAt < LB_TTL_MS) { cb(lbCache); return; }
    /* A request is already in flight: wait for it rather than dropping this
       caller, otherwise whoever asked second is left showing "loading" for good. */
    if (lbPending) { lbQueue.push(cb); return; }
    lbPending = true;
    var fn = '__tynLb' + Math.random().toString(36).slice(2);
    var done = false;
    var s = document.createElement('script');
    function finish(data) {
      if (done) return;
      done = true; lbPending = false;
      if (data && !data.error) { lbCache = data; lbAt = Date.now(); }
      /* Leave a no-op behind instead of deleting: a JSONP reply that arrives
         after we gave up would otherwise hit an undefined function and throw
         a ReferenceError into the console. Clear it once it cannot fire. */
      try { window[fn] = function () {}; s.remove(); } catch (e) {}
      setTimeout(function () { try { delete window[fn]; } catch (e) {} }, 60000);
      var payload = data || { error: 'no response' };
      var waiting = lbQueue; lbQueue = [];
      cb(payload);
      waiting.forEach(function (f) { try { f(payload); } catch (e) {} });
    }
    window[fn] = finish;
    s.src = syncUrl() + (syncUrl().indexOf('?') >= 0 ? '&' : '?') +
      'lb=1&uid=' + encodeURIComponent(uid()) + '&callback=' + fn;
    s.onerror = function () { finish({ error: 'network' }); };
    document.head.appendChild(s);
    /* Apps Script cold-starts. The first call of the day routinely takes
       10-15s while Google spins up a container, opens the spreadsheet and
       runs the authorisation check, so a tight limit reports a timeout on a
       backend that is merely waking up. */
    setTimeout(function () { finish({ error: 'timeout' }); }, LB_TIMEOUT_MS);
  }

  /* A cold Apps Script container often misses the first request and answers
     the second one immediately, so absorb one timeout before telling the
     student anything is wrong. */
  function fetchBoardRetrying(cb, force) {
    fetchBoard(function (d) {
      if (d && d.error === 'timeout') {
        setTimeout(function () { fetchBoard(cb, true); }, LB_RETRY_MS);
        return;
      }
      cb(d);
    }, force);
  }

  /* ==========================================================================
     PIXEL LAYER
     --------------------------------------------------------------------------
     Every sprite below is a grid of characters, one per pixel, rendered to SVG
     <rect> runs at publish time. No image files, no external requests: the
     whole thing works offline and stays crisp at any zoom, which matters on the
     phones most students actually drill on.

     The mascot is ONE base body plus accessory layers that unlock with level,
     rather than ten separate drawings. Adding a level means adding a layer, and
     the character visibly gains gear instead of being swapped out.
     ========================================================================== */
  var MPAL = {
    o: '#1b1030',   // outline
    s: '#f3c9a2',   // skin
    e: '#1b1030',   // eyes
    r: '#3f6fd8',   // robe
    w: '#eef2ff',   // paper
    n: '#a9713f',   // wood
    h: '#7b46b8',   // scholar cap
    c: '#c8402f',   // cape
    g: '#ffcc4d',   // gold
    a: '#7ee8ff',   // aura
    y: '#c08a4a',   // signpost wood
    d: '#5a6488'    // stone
  };

  var SPR_BASE = ['................','................','....oooooooo....','...osssssssso...','...ossessesso...','...osssssssso...','...osssoossso...','....oooooooo....','.....rrrrrr.....','...rrrrrrrrrr...','..srrrrrrrrrrs..','..srrrrrrrrrrs..','...rrrrrrrrrr...','...rrrr..rrrr...','...oooo..oooo...','................'];
  var SPR_LAYERS = {
    book: ['................','................','................','................','................','................','................','................','................','................','.www............','.wnw............','.www............','................','................','................'],
    hat: ['...hhhhhhhhhh...','....hhhhhhhh....','................','................','................','................','................','................','................','................','................','................','................','................','................','................'],
    trim: ['................','................','................','................','................','................','................','................','.....gggggg.....','................','................','................','...gggggggggg...','................','................','................'],
    cape: ['................','................','................','................','................','................','................','................','................','.c............c.','.c............c.','.c............c.','.cc..........cc.','..c..........c..','................','................'],
    staff: ['................','................','................','................','................','................','.............g..','.............n..','.............n..','.............n..','.............n..','.............n..','.............n..','.............n..','.............n..','................'],
    pads: ['................','................','................','................','................','................','................','................','................','...gg......gg...','................','................','................','................','................','................'],
    crown: ['...g..g..g..g...','...gggggggggg...','................','................','................','................','................','................','................','................','................','................','................','................','................','................'],
    aura: ['.a............a.','................','................','................','a..............a','................','................','................','................','................','................','................','a..............a','................','.a............a.','................'],
    halo: ['..aaaaaaaaaaaa..','................','................','................','................','................','................','................','................','................','................','................','................','................','................','................'],
  };
  var LEVEL_GEAR = {
    1: [],
    2: ["book"],
    3: ["book", "hat"],
    4: ["book", "hat", "trim"],
    5: ["cape", "book", "hat", "trim"],
    6: ["cape", "book", "hat", "trim", "staff"],
    7: ["cape", "book", "hat", "trim", "staff", "pads"],
    8: ["cape", "book", "trim", "staff", "pads", "crown"],
    9: ["aura", "cape", "book", "trim", "staff", "pads", "crown"],
    10: ["aura", "halo", "cape", "book", "trim", "staff", "pads", "crown"],
  };
  var SPR_ICON = {
    flag: ['............','..o.........','..ooooooo...','..oggggggo..','..oggggggo..','..ooooooo...','..o.........','..o.........','..o.........','.ooo........','ooooo.......','............'],
    sign: ['............','.ooooooooo..','.oyyyyyyyo..','.oyyyyyyyo..','.ooooooooo..','.....o......','.....o......','.....o......','.....o......','....ooo.....','............','............'],
    rock: ['............','............','....oooo....','...oddddo...','..oddddddo..','..oddddddo..','.oddddddddo.','.oddddddddo.','.oooooooooo.','............','............','............'],
  };
  var SPR_MEDAL = ['..oo..oo..','..oo..oo..','...oooo...','..oMMMMo..','.oMMMMMMo.','.oMMMMMMo.','.oMMMMMMo.','..oMMMMo..','...oooo...','..........'];

  /* Render a character grid to SVG, merging horizontal runs so a 16x16 sprite
     costs a few dozen rects rather than 256. crispEdges keeps the pixels hard
     at every zoom level. */
  function pixSVG(rows, pal, cls, label) {
    var w = rows[0].length, h = rows.length;
    var out = '<svg class="' + cls + '" viewBox="0 0 ' + w + ' ' + h + '" ' +
      'shape-rendering="crispEdges" preserveAspectRatio="xMidYMid meet" ' +
      (label ? 'role="img" aria-label="' + esc(label) + '"' : 'aria-hidden="true"') + '>';
    for (var y = 0; y < h; y++) {
      var row = rows[y], x = 0;
      while (x < w) {
        var c = row.charAt(x), fill = pal[c];
        if (!fill) { x++; continue; }
        var run = 1;
        while (x + run < w && row.charAt(x + run) === c) run++;
        out += '<rect x="' + x + '" y="' + y + '" width="' + run + '" height="1" fill="' + fill + '"/>';
        x += run;
      }
    }
    return out + '</svg>';
  }

  function mascotRows(level) {
    var grid = SPR_BASE.map(function (r) { return r.split(''); });
    (LEVEL_GEAR[level] || []).forEach(function (name) {
      var layer = SPR_LAYERS[name];
      if (!layer) return;
      layer.forEach(function (row, y) {
        for (var x = 0; x < row.length; x++) {
          var c = row.charAt(x);
          if (c !== '.') grid[y][x] = c;
        }
      });
    });
    return grid.map(function (r) { return r.join(''); });
  }
  function mascot(level, cls, label) {
    return pixSVG(mascotRows(level), MPAL, cls || 'px-mascot', label);
  }
  function icon(name, cls) { return pixSVG(SPR_ICON[name], MPAL, cls || 'px-icon'); }
  function medal(rank) {
    var col = ['#ffcc4d', '#d4dce8', '#c9803f'][rank - 1] || '#5a6488';
    var pal = { o: '#1b1030', M: col };
    return pixSVG(SPR_MEDAL, pal, 'px-medal');
  }

  /* A chunky segmented bar reads as a game meter; a smooth gradient would not. */
  function meter(p, segs) {
    segs = segs || 20;
    var on = Math.round(p / 100 * segs), h = '';
    for (var i = 0; i < segs; i++) h += '<i class="' + (i < on ? 'on' : '') + '"></i>';
    return '<div class="px-meter" role="img" aria-label="' + Math.round(p) + '%">' + h + '</div>';
  }

  /* ---------- UI: styles -------------------------------------------------- */
  var CSS = [
    '@import url("https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap");',

    /* one dark world, scoped so the rest of the site keeps its own look */
    '#p-game,.g-strip{',
    '--px-bg:#10142b; --px-panel:#1b2246; --px-panel-2:#252e5c; --px-edge:#0a0d1d;',
    '--px-line:#4a57a0; --px-ink:#eaeeff; --px-dim:#98a3d8; --px-gold:#ffcc4d;',
    '--px-green:#5ce07f; --px-cyan:#7ee8ff; --px-red:#ff7a6b;',
    "--px-font:'Press Start 2P',ui-monospace,monospace}",

    /* chunky stepped border, built from shadows so there is no anti-aliased radius */
    '.px-frame{background:var(--px-panel);border:3px solid var(--px-edge);',
    'box-shadow:0 0 0 3px var(--px-line), 0 6px 0 3px rgba(4,6,18,.45);',
    'padding:16px;margin:0 0 22px}',
    '#p-game{background:var(--px-bg);padding:18px 14px 26px;color:var(--px-ink);',
    'image-rendering:pixelated}',
    '#p-game h3{font-family:var(--px-font);font-size:11px;line-height:1.7;margin:0 0 12px;',
    'color:var(--px-gold);letter-spacing:.02em}',
    '#p-game .g-sub{color:var(--px-dim);font-size:13px;margin:0}',
    '#p-game .btn{background:var(--px-panel-2);border:2px solid var(--px-edge);',
    'box-shadow:0 0 0 2px var(--px-line);color:var(--px-ink);border-radius:0;font-weight:700}',
    '#p-game .btn:hover{background:var(--px-line);border-color:var(--px-edge)}',
    '#p-game .btn:active{transform:translateY(2px)}',

    /* --- hero --- */
    '.px-hero{display:grid;grid-template-columns:auto 1fr;gap:18px;align-items:center}',
    '.px-mascot{width:96px;height:96px;flex:0 0 auto;',
    'background:var(--px-panel-2);border:2px solid var(--px-edge);box-shadow:0 0 0 2px var(--px-line);padding:4px}',
    '.px-lv{font-family:var(--px-font);font-size:15px;color:var(--px-gold);margin:0 0 8px;line-height:1.5}',
    '.px-lv small{display:block;font-family:inherit;font-size:11px;color:var(--px-dim);margin-top:6px}',
    '.px-stat{font-size:13px;color:var(--px-dim);margin:9px 0 0}',
    '.px-stat b{color:var(--px-ink);font-family:var(--px-font);font-size:11px}',

    '.px-meter{display:flex;gap:2px;margin:4px 0 2px;max-width:360px}',
    '.px-meter i{flex:1 1 0;height:12px;background:var(--px-edge);',
    'box-shadow:inset 0 0 0 1px rgba(74,87,160,.5)}',
    '.px-meter i.on{background:var(--px-green);box-shadow:inset 0 -3px 0 rgba(0,0,0,.28)}',

    /* --- quest path --- */
    '.px-path{display:flex;flex-wrap:wrap;gap:0;align-items:flex-start}',
    '.px-node{flex:0 0 auto;width:104px;text-align:center;background:none;border:none;',
    'padding:8px 2px;cursor:pointer;color:inherit;font:inherit}',
    '.px-node:focus-visible{outline:2px solid var(--px-gold);outline-offset:2px}',
    '.px-icon{width:44px;height:44px;display:block;margin:0 auto 7px;',
    'background:var(--px-panel-2);border:2px solid var(--px-edge);box-shadow:0 0 0 2px var(--px-line);padding:3px}',
    '.px-node.done .px-icon{box-shadow:0 0 0 2px var(--px-gold)}',
    '.px-node.locked .px-icon{opacity:.55}',
    '.px-node.locked .px-nname{color:var(--px-dim)}',
    /* Fixed height, not min-height: section names run to two or three lines
       and a growing box pushes each percentage to a different baseline, so
       the row of nodes stops reading as one row. */
    '.px-nname{display:block;font-size:11px;line-height:1.4;color:var(--px-ink);',
    'height:46px;overflow:hidden;margin-bottom:4px}',
    '.px-npct{font-family:var(--px-font);font-size:10px;color:var(--px-dim)}',
    '.px-node.done .px-npct{color:var(--px-gold)}',
    '.px-node.part .px-npct{color:var(--px-green)}',
    '.px-link{flex:0 0 auto;align-self:flex-start;margin-top:29px;width:22px;height:6px;',
    'background:repeating-linear-gradient(90deg,var(--px-line) 0 4px,transparent 4px 8px)}',
    '@media (max-width:560px){.px-node{width:33.333%}.px-link{display:none}}',

    /* --- topic leaves --- */
    '.px-leaves{display:none;gap:8px;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));',
    'margin-top:14px;padding-top:14px;border-top:2px solid var(--px-line)}',
    '.px-leaves.open{display:grid}',
    '.px-leaf{background:var(--px-panel-2);border:2px solid var(--px-edge);padding:9px 10px}',
    '.px-leaf b{display:block;font-size:12px;margin-bottom:6px;color:var(--px-ink);font-weight:600}',
    '.px-leaf span{font-family:var(--px-font);font-size:9px;color:var(--px-dim)}',

    /* --- leaderboard --- */
    '.px-row{display:grid;grid-template-columns:26px 34px 1fr auto;gap:10px;align-items:center;',
    'padding:8px 10px;background:var(--px-panel-2);border:2px solid var(--px-edge);margin-bottom:5px}',
    '.px-row.me{box-shadow:0 0 0 2px var(--px-gold);background:#2c3568}',
    '.px-rank{font-family:var(--px-font);font-size:10px;color:var(--px-dim);text-align:right}',
    '.px-medal{width:26px;height:26px;display:block}',
    '.px-who{font-size:14px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.px-who em{font-style:normal;font-family:var(--px-font);font-size:8px;color:var(--px-dim);margin-left:8px}',
    '.px-pct{font-family:var(--px-font);font-size:10px;color:var(--px-gold)}',
    '.px-gap{margin:12px 0 0;font-size:13px;color:var(--px-dim);line-height:1.7}',
    '.px-gap b{color:var(--px-cyan)}',
    '.px-rule{font-size:12px;color:var(--px-dim);line-height:1.8;margin:14px 0 0;',
    'padding-top:12px;border-top:2px solid var(--px-line)}',
    '.px-rule b{color:var(--px-ink)}',
    '.px-nickrow{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:12px}',
    '.px-nickrow input{flex:1 1 190px;min-height:44px;padding:0 12px;border:2px solid var(--px-edge);',
    'box-shadow:0 0 0 2px var(--px-line);border-radius:0;background:var(--px-edge);',
    'color:var(--px-ink);font:inherit;font-size:14px}',
    '.px-nickrow input:focus{outline:none;box-shadow:0 0 0 2px var(--px-gold)}',

    /* --- overview strip --- */
    '.g-strip{background:var(--px-bg);color:var(--px-ink);border:3px solid var(--px-edge);',
    'box-shadow:0 0 0 3px var(--px-line);padding:12px 14px;margin-bottom:16px;',
    'display:grid;grid-template-columns:auto 1fr auto;gap:14px;align-items:center;image-rendering:pixelated}',
    '.g-strip .px-mascot{width:52px;height:52px;padding:2px}',
    '.px-slv{font-family:var(--px-font);font-size:10px;color:var(--px-gold);line-height:1.6}',
    '.px-slv span{display:block;font-family:inherit;font-size:8px;color:var(--px-dim);margin-top:5px}',
    '.px-srank{min-width:0;font-size:14px}',
    '.px-srank b{color:var(--px-ink)}',
    '.px-sdim{color:var(--px-dim);font-size:12px;margin-top:3px}',
    '.px-stop{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}',
    '.px-stop i{font-style:normal;font-family:var(--px-font);font-size:8px;padding:4px 7px;',
    'background:var(--px-panel-2);color:var(--px-dim);border:1px solid var(--px-edge)}',
    '.px-stop i:first-child{background:var(--px-gold);color:#2a1c00}',
    '.g-strip .btn{background:var(--px-panel-2);border:2px solid var(--px-edge);',
    'box-shadow:0 0 0 2px var(--px-line);color:var(--px-ink);border-radius:0;white-space:nowrap;font-weight:700}',
    '@media (max-width:620px){.g-strip{grid-template-columns:auto 1fr;row-gap:10px}',
    '.g-strip .btn{grid-column:1/-1}}',

    /* --- toast --- */
    '.g-toast{position:fixed;left:50%;bottom:18px;transform:translate(-50%,150%);',
    'max-width:min(520px,92vw);background:#1b2246;color:#eaeeff;padding:12px 15px;',
    'border:2px solid #0a0d1d;box-shadow:0 0 0 2px #4a57a0;font-size:13px;line-height:1.55;',
    'z-index:9999;transition:transform .18s steps(4);pointer-events:none}',
    '.g-toast.show{transform:translate(-50%,0)}',
    '.g-toast.ok{box-shadow:0 0 0 2px #5ce07f}.g-toast.warn{box-shadow:0 0 0 2px #ffcc4d}',
    '@media (prefers-reduced-motion:reduce){.g-toast{transition:none}}'
  ].join('');

  function injectCSS() {
    var s = document.createElement('style');
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  /* ---------- UI: the Progress panel -------------------------------------- */
  var openSections = {};

  function render() {
    var host = el('game-host');
    if (!host) return;

    var o = overall(), lv = levelFor(o.pct), st = S();
    var toNext = lv.next ? Math.max(0, Math.ceil((lv.next.at - o.pct) / 100 * o.total)) : 0;
    var span = lv.next ? (lv.next.at - lv.name.at) : 1;
    var into = lv.next ? Math.min(100, Math.max(0, (o.pct - lv.name.at) / span * 100)) : 100;

    var h = '';

    /* --- hero: the character, and what it takes to level up --- */
    h += '<div class="px-frame"><div class="px-hero">' +
      mascot(lv.i, 'px-mascot', 'Level ' + lv.i + ' character') +
      '<div><p class="px-lv">LV.' + lv.i + ' ' + lv.name.zh +
      '<small>' + esc(lv.name.en.toUpperCase()) + '</small></p>' +
      meter(into) +
      (lv.next
        ? '<p class="px-stat">再答啱 <b>' + toNext + '</b> 題 &rarr; LV.' + (lv.i + 1) + ' ' + lv.next.zh + '</p>'
        : '<p class="px-stat">全清。冇得再升。</p>') +
      '<p class="px-stat">已攻下 <b>' + o.cleared + '</b> / ' + o.total + ' 題' +
      (st.dayN ? ' &middot; 今日 <b>' + st.dayN + '</b> 題' : '') + '</p>' +
      '</div></div></div>';

    /* --- quest path: one node per section, in course order --- */
    var t = sectionTotals();
    h += '<div class="px-frame"><h3>QUEST MAP &mdash; ' + esc(CFG.pageLabel || '') + '</h3>' +
      '<p class="g-sub" style="margin-bottom:14px">撳一個關卡睇入面每個 topic 嘅進度。</p>' +
      '<div class="px-path">';
    CFG.sections.forEach(function (sec, i) {
      var r = t[sec.key] || { total: 0, cleared: 0 };
      var p = pct(r.cleared, r.total);
      var cls = p >= 100 ? 'done' : (p > 0 ? 'part' : 'locked');
      var ic = p >= 100 ? 'flag' : (p > 0 ? 'sign' : 'rock');
      if (i) h += '<span class="px-link" aria-hidden="true"></span>';
      h += '<button class="px-node ' + cls + '" data-sec="' + esc(sec.key) + '" ' +
        'aria-expanded="' + (!!openSections[sec.key]) + '">' +
        icon(ic) +
        '<span class="px-nname">' + esc(sec.label) + '</span>' +
        '<span class="px-npct">' + p + '%</span>' +
        '</button>';
    });
    h += '</div>';

    CFG.sections.forEach(function (sec) {
      if (!openSections[sec.key]) return;
      h += '<div class="px-leaves open">';
      topicRows(sec.key).forEach(function (lf) {
        h += '<div class="px-leaf"><b>' + esc(lf.label) + '</b>' +
          meter(lf.pct, 10) +
          '<span>' + lf.cleared + '/' + lf.total + '</span></div>';
      });
      h += '</div>';
    });
    h += '</div>';

    /* --- leaderboard --- */
    h += '<div class="px-frame" id="g-lb-card"><h3>CLASS RANKING 班際排行榜</h3>' +
      '<div id="g-lb-body"><p class="g-sub">Loading&hellip;</p></div>' +
      '<div class="px-nickrow"><input id="g-nick" maxlength="16" placeholder="你嘅花名（會喺榜上顯示）" value="' + esc(st.nick) + '">' +
      '<button class="btn" id="g-nick-save">Save</button>' +
      '<button class="btn" id="g-lb-refresh">&#8635; Refresh</button></div>' +
      '<p class="px-rule">計分規則：<b>答啱先計</b>。同一題答錯之後，要隔 ' + ANTI_FARM_GAP +
      ' 題或 10 分鐘再答啱先計入進度 — 撳兩次係唔會加分嘅。排名按全部關卡嘅總完成率計，' +
      '所以掃細關卡唔會拉高排名。榜上只顯示花名，唔會顯示 email。</p>' +
      '</div>';

    host.innerHTML = h;

    host.querySelectorAll('.px-node').forEach(function (b) {
      b.onclick = function () { var k = b.dataset.sec; openSections[k] = !openSections[k]; render(); };
    });
    var nickInput = el('g-nick');
    el('g-nick-save').onclick = function () {
      var v = (nickInput.value || '').trim().slice(0, 16);
      S().nick = v; saveState();
      lastPush = 0; pushScore();
      toast(v ? '花名已更新：' + v : '花名已清走。', 'ok');
      setTimeout(function () { loadBoard(true); }, 1200);
    };
    el('g-lb-refresh').onclick = function () { lastPush = 0; pushScore(); setTimeout(function () { loadBoard(true); }, 1200); };

    loadBoard(false);
  }

  function loadBoard(force) {
    var body = el('g-lb-body');
    if (!body) return;
    if (who() === 'guest') {
      body.innerHTML = '<p class="g-sub">未登入 — 排行榜要 Google sign-in 先睇到。你嘅進度會照計，登入之後會上榜。</p>';
      return;
    }
    if (force) body.innerHTML = '<p class="g-sub">Loading&hellip;</p>';
    fetchBoardRetrying(function (d) {
      if (!el('g-lb-body')) return;
      if (d.off) {
        el('g-lb-body').innerHTML = '<p class="g-sub">呢一頁未接後端，所以冇班際排名。上面嘅等級同關卡照計，全部存喺你部機。</p>';
        return;
      }
      if (d.error || !d.top) {
        el('g-lb-body').innerHTML = '<p class="g-sub">排行榜讀唔到（' + esc(d.error || 'no data') +
          '）。後端第一次叫醒要成十幾秒，等一陣再撳 <b>&#8635; Refresh</b> 通常就得。你嘅進度全部安全。</p>';
        return;
      }
      var h = '';
      if (!d.top.length) {
        h += '<p class="g-sub">仲未有人上榜。你會係第一個。</p>';
      } else {
        d.top.forEach(function (r, i) {
          var mine = d.you && d.you.rank === (i + 1);
          h += '<div class="px-row' + (mine ? ' me' : '') + '">' +
            '<span class="px-rank">' + (i + 1) + '</span>' +
            (i < 3 ? medal(i + 1) : '<span></span>') +
            '<span class="px-who">' + esc(r.nick || '（未改花名）') +
            (r.lvl ? '<em>LV.' + r.lvl + '</em>' : '') + '</span>' +
            '<span class="px-pct">' + r.pct + '%</span></div>';
        });
      }
      if (d.you && d.you.rank) {
        if (d.you.rank > d.top.length) {
          h += '<div class="px-row me" style="margin-top:9px">' +
            '<span class="px-rank">' + d.you.rank + '</span><span></span>' +
            '<span class="px-who">你<em>LV.' + (d.you.lvl || 1) + '</em></span>' +
            '<span class="px-pct">' + d.you.pct + '%</span></div>';
        }
        h += '<p class="px-gap">你排第 <b>' + d.you.rank + '</b> / ' + d.n + ' 人。' +
          (d.you.gap > 0
            ? '追上前一位仲差 <b>' + d.you.gap + '%</b>（大約 <b>' + d.you.gapQ + '</b> 題）。'
            : '你而家喺榜首。') + '</p>';
      } else {
        h += '<p class="px-gap">你仲未上榜 — 答啱幾題，撳 Refresh 就會出現。</p>';
      }
      el('g-lb-body').innerHTML = h;
    }, force);
  }

  /* ---------- compact strip on the Overview page -------------------------- */
  /* The full board lives in the Progress tab; this is what students see the
     moment the page opens, so the ranking is not hidden behind a click. */
  function renderStrip() {
    var slot = el('game-ov');
    if (!slot) return;
    var ov = document.querySelector('#p-overview');
    if (ov && !ov.classList.contains('on')) return;   // not on screen, skip the work

    /* Recompute inside paint(): the board arrives asynchronously, and by then
       the student may have cleared more questions than when we started. */
    function paint(rankHTML) {
      var o = overall(), lv = levelFor(o.pct);
      slot.innerHTML = '<div class="g-strip">' +
        '<div>' + mascot(lv.i, 'px-mascot', 'Level ' + lv.i) +
        '<p class="px-slv" style="margin:6px 0 0;text-align:center">LV.' + lv.i +
        '<span>' + Math.round(o.pct) + '%</span></p></div>' +
        '<div class="px-srank">' + rankHTML + '</div>' +
        '<button class="btn" id="g-strip-go">睇全榜 &rsaquo;</button>' +
        '</div>';
      var go = el('g-strip-go');
      if (go) go.onclick = function () { if (window.GameProgress) window.GameProgress.show(); };
    }

    if (who() === 'guest') {
      paint('<b>班際排行榜</b><div class="px-sdim">登入之後就會見到自己排第幾。</div>');
      return;
    }
    if (!syncUrl()) {
      paint('<b>班際排行榜未開</b><div class="px-sdim">呢一頁未接後端，只有個人進度。</div>');
      return;
    }

    paint('<b>班際排行榜</b><div class="px-sdim">讀緊&hellip;</div>');
    fetchBoardRetrying(function (d) {
      if (!el('game-ov')) return;
      if (d.error || !d.top) {
        paint('<b>班際排行榜</b><div class="px-sdim">暫時讀唔到，撳「睇全榜」再試。</div>');
        return;
      }
      var top3 = d.top.slice(0, 3).map(function (r, i) {
        return '<i>' + (i + 1) + ' ' + esc(r.nick || '?') + ' ' + r.pct + '%</i>';
      }).join('');
      var line;
      if (d.you && d.you.rank) {
        line = '<b>你排第 ' + d.you.rank + ' / ' + d.n + ' 人</b>' +
          '<div class="px-sdim">' + (d.you.gap > 0
            ? '追上前一位差 ' + d.you.gap + '%（約 ' + d.you.gapQ + ' 題）'
            : '你而家喺榜首。') + '</div>';
      } else {
        line = '<b>你仲未上榜</b><div class="px-sdim">答啱幾題就會出現，記得去 Progress 改個花名。</div>';
      }
      paint(line + '<div class="px-stop">' + top3 + '</div>');
    }, false);
  }

  function hookOverview() {
    var ov = document.querySelector('#p-overview');
    if (!ov) return;
    var slot = document.createElement('div');
    slot.id = 'game-ov';
    ov.insertBefore(slot, ov.firstChild);

    if (typeof window.renderOverview === 'function') {
      var oo = window.renderOverview;
      window.renderOverview = function () {
        var r = oo.apply(this, arguments);
        try { renderStrip(); } catch (e) {}
        return r;
      };
    }
    renderStrip();
  }

  /* ---------- tab badge --------------------------------------------------- */
  function refreshBadge() {
    var b = el('game-pip');
    if (!b) return;
    var o = overall();
    b.textContent = Math.round(o.pct) + '%';
    b.style.display = '';
    try { renderStrip(); } catch (e) {}
  }

  /* ---------- wiring ------------------------------------------------------ */
  function hookAnswers() {
    /* Function declarations live on the global object, so wrapping them here
       transparently intercepts every existing call site. */
    if (typeof window.recordAnswer === 'function') {
      var orig = window.recordAnswer;
      window.recordAnswer = function (q, ok) {
        var r = orig.apply(this, arguments);
        try { onAnswer(q && q.id, !!ok); } catch (e) {}
        return r;
      };
    }
    if (typeof window.choose === 'function') {          // macro.html — drill
      var oc = window.choose;
      window.choose = function (q, i) {
        var fresh = q && (typeof picks === 'undefined' || picks[q.id] == null);
        var r = oc.apply(this, arguments);
        try { if (fresh) onAnswer(q && q.id, i === (q && q.ans)); } catch (e) {}
        return r;
      };
    }
    if (typeof window.renderExamResult === 'function') {  // macro.html — exam
      var oe = window.renderExamResult;
      window.renderExamResult = function () {
        try {
          var es = (typeof examState !== 'undefined') ? examState : null;
          if (es && es.qs && !es._graded) {
            es._graded = 1;
            es.qs.forEach(function (i) {
              var q = MCQ[i];
              if (q && es.ans[q.id] != null) onAnswer(q.id, es.ans[q.id] === q.ans);
            });
          }
        } catch (e) {}
        return oe.apply(this, arguments);
      };
    }
  }

  function mountTab() {
    var tabs = document.querySelector('.tabs');
    var wrap = document.querySelector('.wrap');
    if (!tabs || !wrap) return;

    var btn = document.createElement('button');
    btn.className = 'tab';
    btn.id = 'game-tab';
    btn.setAttribute('data-tab', 'game');
    btn.innerHTML = 'Progress <span class="pip" id="game-pip" style="display:none">0%</span>';
    var acct = el('acctbtn');
    if (acct) tabs.insertBefore(btn, acct); else tabs.appendChild(btn);

    var panel = document.createElement('section');
    panel.className = 'panel';
    panel.id = 'p-game';
    panel.innerHTML = '<div id="game-host"></div>';
    wrap.appendChild(panel);

    function show() {
      document.querySelectorAll('.tab').forEach(function (t) { t.classList.toggle('on', t === btn); });
      document.querySelectorAll('.panel').forEach(function (p) { p.classList.toggle('on', p === panel); });
      var menu = el('tab-more-menu'); if (menu) menu.classList.remove('show');
      render();
      pushScore();
    }
    btn.addEventListener('click', show);

    /* When any other tab is clicked, the page's own switchTab() takes over and
       our panel must close with it. */
    document.querySelectorAll('.tab, .tab-more-item').forEach(function (t) {
      if (t === btn) return;
      t.addEventListener('click', function () { panel.classList.remove('on'); btn.classList.remove('on'); });
    });

    window.GameProgress = { show: show, render: render, onAnswer: onAnswer, push: pushScore };
  }

  function start() {
    injectCSS();
    mountTab();
    hookOverview();
    hookAnswers();
    refreshBadge();
    /* Existing local progress from before this feature existed: treat every
       question the page already recorded as correct as cleared, once. */
    migrateOnce();
    if (syncUrl() && who() !== 'guest') setTimeout(pushScore, 3000);
  }

  function migrateOnce() {
    var st = S();
    if (st.migrated) return;
    try {
      if (typeof activeData === 'function') {
        var d = activeData();
        if (d && d.answers) Object.keys(d.answers).forEach(function (qid) { if (d.answers[qid]) st.cleared[qid] = st.cleared[qid] || 1; });
      } else if (typeof picks !== 'undefined' && typeof byId !== 'undefined') {
        Object.keys(picks).forEach(function (qid) {
          var q = byId[qid];
          if (q && picks[qid] === q.ans) st.cleared[qid] = st.cleared[qid] || 1;
        });
      }
    } catch (e) {}
    st.migrated = 1;
    saveState();
    refreshBadge();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
