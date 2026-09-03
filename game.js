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

  /* ---------- UI: styles -------------------------------------------------- */
  var CSS = [
    '.g-toast{position:fixed;left:50%;bottom:18px;transform:translate(-50%,120%);max-width:min(520px,92vw);',
    'background:var(--ink,#1e293b);color:#fff;padding:11px 15px;border-radius:10px;font-size:13px;line-height:1.5;',
    'box-shadow:0 6px 24px rgba(15,23,42,.22);z-index:9999;transition:transform .22s ease;pointer-events:none}',
    '.g-toast.show{transform:translate(-50%,0)}',
    '.g-toast.ok{background:#065f46}.g-toast.warn{background:#92400e}',

    '.g-hero{display:grid;grid-template-columns:auto 1fr;gap:16px;align-items:center}',
    '.g-ring{width:96px;height:96px;flex:0 0 auto}',
    '.g-lvl{font-size:21px;font-weight:700;letter-spacing:-.01em;margin:0 0 2px}',
    '.g-lvl small{font-weight:600;font-size:13px;color:var(--muted,#64748b);margin-left:6px}',
    '.g-sub{color:var(--muted,#64748b);font-size:13px;margin:0}',
    '.g-nextbar{height:6px;background:var(--line,#e2e8f0);border-radius:999px;overflow:hidden;margin:9px 0 5px;max-width:340px}',
    '.g-nextbar>i{display:block;height:100%;background:var(--brand,#2563eb);border-radius:999px;transition:width .35s ease}',

    '.g-tree{margin:0;padding:0;list-style:none;position:relative}',
    '.g-node{position:relative;padding:0 0 4px 30px;border-left:2px solid var(--line,#e2e8f0);margin-left:11px}',
    '.g-node:last-child{border-left-color:transparent}',
    '.g-node>.g-dot{position:absolute;left:-11px;top:12px;width:20px;height:20px;border-radius:50%;',
    'background:var(--surface,#fff);border:2px solid var(--line,#e2e8f0);display:flex;align-items:center;justify-content:center;',
    'font-size:10px;font-weight:700;color:var(--muted,#64748b)}',
    '.g-node.part>.g-dot{border-color:var(--brand,#2563eb);color:var(--brand,#2563eb)}',
    '.g-node.full>.g-dot{border-color:var(--pos,#059669);background:var(--pos,#059669);color:#fff}',
    '.g-secbtn{width:100%;text-align:left;background:none;border:none;padding:9px 0;cursor:pointer;font:inherit;color:inherit;',
    'display:grid;grid-template-columns:1fr auto;gap:10px;align-items:center;min-height:44px}',
    '.g-secname{font-weight:600;font-size:14px}',
    '.g-secpct{font-variant-numeric:tabular-nums;font-weight:700;font-size:14px;color:var(--muted,#64748b)}',
    '.g-node.part .g-secpct{color:var(--brand,#2563eb)}.g-node.full .g-secpct{color:var(--pos,#059669)}',
    '.g-secbar{grid-column:1/-1;height:7px;background:var(--surface-2,#f1f5f9);border-radius:999px;overflow:hidden}',
    '.g-secbar>i{display:block;height:100%;background:var(--brand,#2563eb);border-radius:999px;transition:width .35s ease}',
    '.g-node.full .g-secbar>i{background:var(--pos,#059669)}',
    '.g-leaves{display:none;padding:6px 0 12px;gap:6px;grid-template-columns:repeat(auto-fill,minmax(148px,1fr))}',
    '.g-leaves.open{display:grid}',
    '.g-leaf{border:1px solid var(--line,#e2e8f0);border-radius:8px;padding:8px 10px;background:var(--surface,#fff)}',
    '.g-leaf b{display:block;font-size:12px;font-weight:600;margin-bottom:5px}',
    '.g-leaf .g-lb{height:5px;background:var(--surface-2,#f1f5f9);border-radius:999px;overflow:hidden}',
    '.g-leaf .g-lb>i{display:block;height:100%;background:var(--brand,#2563eb)}',
    '.g-leaf span{font-size:11px;color:var(--muted,#64748b);font-variant-numeric:tabular-nums}',

    '.g-lbrow{display:grid;grid-template-columns:34px 1fr auto;gap:10px;align-items:center;padding:9px 10px;border-radius:8px}',
    '.g-lbrow+.g-lbrow{margin-top:3px}',
    '.g-lbrow.me{background:var(--surface-2,#f1f5f9);outline:1px solid var(--brand,#2563eb)}',
    '.g-rank{font-variant-numeric:tabular-nums;font-weight:700;color:var(--muted,#64748b);text-align:right;font-size:13px}',
    '.g-lbrow.top1 .g-rank,.g-lbrow.top2 .g-rank,.g-lbrow.top3 .g-rank{color:var(--star,#b45309)}',
    '.g-nick{font-weight:600;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.g-nick em{font-style:normal;color:var(--muted,#64748b);font-weight:600;font-size:12px;margin-left:6px}',
    '.g-score{font-variant-numeric:tabular-nums;font-weight:700;font-size:14px}',
    '.g-gap{margin-top:10px;font-size:13px;color:var(--muted,#64748b)}',
    '.g-rule{font-size:12px;color:var(--muted,#64748b);line-height:1.6;margin:10px 0 0}',
    '.g-nickrow{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:4px}',
    '.g-nickrow input{flex:1 1 180px;min-height:44px;padding:0 12px;border:1px solid var(--line,#e2e8f0);',
    'border-radius:8px;font:inherit;font-size:14px;background:var(--surface,#fff);color:var(--ink,#1e293b)}',

    /* --- compact strip on the Overview page --- */
    '.g-strip{background:var(--surface,#fff);border:1px solid var(--line,#e2e8f0);border-radius:10px;',
    'padding:12px 14px;margin-bottom:14px;box-shadow:var(--shadow-1,0 1px 2px rgba(30,41,59,.04));',
    'display:grid;grid-template-columns:auto 1fr auto;gap:14px;align-items:center}',
    '@media (max-width:620px){.g-strip{grid-template-columns:auto 1fr;row-gap:10px}.g-strip .g-stripbtn{grid-column:1/-1}}',
    '.g-striplv{display:flex;align-items:center;gap:9px}',
    '.g-stripring{width:44px;height:44px;flex:0 0 auto}',
    '.g-striplv b{display:block;font-size:14px;line-height:1.25}',
    '.g-striplv span{display:block;font-size:11px;color:var(--muted,#64748b)}',
    '.g-striprank{min-width:0}',
    '.g-striprank b{font-size:15px}',
    '.g-striprank .g-strdim{color:var(--muted,#64748b);font-weight:600;font-size:12px}',
    '.g-strtop{display:flex;gap:6px;flex-wrap:wrap;margin-top:4px}',
    '.g-strtop i{font-style:normal;font-size:11px;font-weight:600;padding:2px 7px;border-radius:999px;',
    'background:var(--surface-2,#f1f5f9);color:var(--muted,#64748b);white-space:nowrap}',
    '.g-strtop i:first-child{background:#fef3c7;color:#92400e}',
    '.g-stripbtn{white-space:nowrap}'
  ].join('');

  function injectCSS() {
    var s = document.createElement('style');
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  /* ---------- UI: the level ring ------------------------------------------ */
  function ring(p) {
    var r = 40, c = 2 * Math.PI * r, on = c * Math.min(100, p) / 100;
    return '<svg class="g-ring" viewBox="0 0 96 96" role="img" aria-label="' + p + '% complete">' +
      '<circle cx="48" cy="48" r="' + r + '" fill="none" stroke="var(--line,#e2e8f0)" stroke-width="8"/>' +
      '<circle cx="48" cy="48" r="' + r + '" fill="none" stroke="var(--brand,#2563eb)" stroke-width="8" ' +
      'stroke-linecap="round" stroke-dasharray="' + on.toFixed(1) + ' ' + c.toFixed(1) + '" ' +
      'transform="rotate(-90 48 48)"/>' +
      '<text x="48" y="53" text-anchor="middle" font-size="21" font-weight="700" fill="currentColor">' + p + '%</text>' +
      '</svg>';
  }

  /* ---------- UI: the panel ----------------------------------------------- */
  var openSections = {};

  function render() {
    var host = el('game-host');
    if (!host) return;

    var o = overall(), lv = levelFor(o.pct), st = S();
    var toNext = lv.next ? Math.max(0, Math.ceil((lv.next.at - o.pct) / 100 * o.total)) : 0;
    var span = lv.next ? (lv.next.at - lv.name.at) : 1;
    var into = lv.next ? Math.min(100, Math.max(0, (o.pct - lv.name.at) / span * 100)) : 100;

    var h = '';

    /* --- level card --- */
    h += '<div class="card"><div class="g-hero">' + ring(Math.round(o.pct)) +
      '<div><p class="g-lvl">Lv.' + lv.i + ' ' + lv.name.zh +
      '<small>' + esc(lv.name.en) + '</small></p>' +
      '<p class="g-sub">已攻下 <b>' + o.cleared + '</b> / ' + o.total + ' 題 · ' + esc(CFG.pageLabel || '') + '</p>' +
      (lv.next
        ? '<div class="g-nextbar"><i style="width:' + into.toFixed(1) + '%"></i></div>' +
          '<p class="g-sub">再答啱 <b>' + toNext + '</b> 題就升到 Lv.' + (lv.i + 1) + ' ' + lv.next.zh + '</p>'
        : '<p class="g-sub">全清。冇得再升。</p>') +
      (st.dayN ? '<p class="g-sub" style="margin-top:6px">今日已答 ' + st.dayN + ' 題</p>' : '') +
      '</div></div></div>';

    /* --- skill tree --- */
    var t = sectionTotals();
    h += '<div class="card"><h3 style="margin:0 0 4px">技能樹 Skill tree</h3>' +
      '<p class="g-sub" style="margin-bottom:10px">撳一個 section 睇入面每個 topic 嘅進度。</p><ul class="g-tree">';
    CFG.sections.forEach(function (sec) {
      var r = t[sec.key] || { total: 0, cleared: 0 };
      var p = pct(r.cleared, r.total);
      var cls = p >= 100 ? 'full' : (p > 0 ? 'part' : '');
      var open = !!openSections[sec.key];
      h += '<li class="g-node ' + cls + '">' +
        '<span class="g-dot" aria-hidden="true">' + (p >= 100 ? '✓' : p) + '</span>' +
        '<button class="g-secbtn" data-sec="' + esc(sec.key) + '" aria-expanded="' + open + '">' +
        '<span class="g-secname">' + esc(sec.label) + '</span>' +
        '<span class="g-secpct">' + p + '%</span>' +
        '<span class="g-secbar"><i style="width:' + p + '%"></i></span>' +
        '</button>' +
        '<div class="g-leaves' + (open ? ' open' : '') + '" data-leaves="' + esc(sec.key) + '">';
      if (open) {
        topicRows(sec.key).forEach(function (lf) {
          h += '<div class="g-leaf"><b>' + esc(lf.label) + '</b>' +
            '<div class="g-lb"><i style="width:' + lf.pct + '%"></i></div>' +
            '<span>' + lf.cleared + '/' + lf.total + '</span></div>';
        });
      }
      h += '</div></li>';
    });
    h += '</ul></div>';

    /* --- leaderboard --- */
    h += '<div class="card" id="g-lb-card"><h3 style="margin:0 0 4px">班際排行榜 Class leaderboard</h3>' +
      '<div id="g-lb-body"><p class="g-sub">Loading…</p></div>' +
      '<div class="g-nickrow"><input id="g-nick" maxlength="16" placeholder="你嘅花名（會喺榜上顯示）" value="' + esc(st.nick) + '">' +
      '<button class="btn" id="g-nick-save">Save</button>' +
      '<button class="btn" id="g-lb-refresh">↻ Refresh</button></div>' +
      '<p class="g-rule">計分規則：<b>答啱先計</b>。同一題答錯之後，要隔 ' + ANTI_FARM_GAP +
      ' 題或 10 分鐘再答啱先計入進度 — 撳兩次係唔會加分嘅。排名按全部 section 嘅總完成率計，' +
      '所以掃細 section 唔會拉高排名。榜上只顯示花名，唔會顯示 email。</p>' +
      '</div>';

    host.innerHTML = h;

    host.querySelectorAll('.g-secbtn').forEach(function (b) {
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
    if (force) body.innerHTML = '<p class="g-sub">Loading…</p>';
    fetchBoardRetrying(function (d) {
      if (!el('g-lb-body')) return;
      if (d.off) {
        el('g-lb-body').innerHTML = '<p class="g-sub">呢一頁未接後端（SYNC_URL 係空），所以冇班際排名。上面嘅等級同技能樹照計，全部存喺你部機。</p>';
        return;
      }
      if (d.error || !d.top) {
        el('g-lb-body').innerHTML = '<p class="g-sub">排行榜讀唔到（' + esc(d.error || 'no data') + '）。後端第一次叫醒要成十幾秒，等一陣再撳 <b>↻ Refresh</b> 通常就得。你嘅進度全部安全，冇受影響。</p>';
        return;
      }
      var h = '';
      if (!d.top.length) {
        h += '<p class="g-sub">仲未有人上榜。你會係第一個。</p>';
      } else {
        d.top.forEach(function (r, i) {
          var mine = d.you && d.you.rank === (i + 1);
          h += '<div class="g-lbrow ' + (mine ? 'me ' : '') + (i < 3 ? 'top' + (i + 1) : '') + '">' +
            '<span class="g-rank">' + (i + 1) + '</span>' +
            '<span class="g-nick">' + esc(r.nick || '（未改花名）') +
            (r.lvl ? '<em>Lv.' + r.lvl + '</em>' : '') + '</span>' +
            '<span class="g-score">' + r.pct + '%</span></div>';
        });
      }
      if (d.you && d.you.rank) {
        if (d.you.rank > d.top.length) {
          h += '<div class="g-lbrow me" style="margin-top:8px">' +
            '<span class="g-rank">' + d.you.rank + '</span>' +
            '<span class="g-nick">你</span>' +
            '<span class="g-score">' + d.you.pct + '%</span></div>';
        }
        h += '<p class="g-gap">你排第 <b>' + d.you.rank + '</b> / ' + d.n + ' 人。' +
          (d.you.gap > 0
            ? '追上前一位仲差 <b>' + d.you.gap + '%</b>（大約 ' + d.you.gapQ + ' 題）。'
            : '你而家喺榜首。') + '</p>';
      } else {
        h += '<p class="g-gap">你仲未上榜 — 答啱幾題，撳 Refresh 就會出現。</p>';
      }
      el('g-lb-body').innerHTML = h;
    }, force);
  }

  /* ---------- compact strip on the Overview page -------------------------- */
  /* The full board lives in the Progress tab; this is the bit students see the
     moment the page opens, so the ranking is not hidden behind a click. */
  function smallRing(p) {
    var r = 18, c = 2 * Math.PI * r, on = c * Math.min(100, p) / 100;
    return '<svg class="g-stripring" viewBox="0 0 44 44" aria-hidden="true">' +
      '<circle cx="22" cy="22" r="' + r + '" fill="none" stroke="var(--line,#e2e8f0)" stroke-width="4"/>' +
      '<circle cx="22" cy="22" r="' + r + '" fill="none" stroke="var(--brand,#2563eb)" stroke-width="4" ' +
      'stroke-linecap="round" stroke-dasharray="' + on.toFixed(1) + ' ' + c.toFixed(1) + '" transform="rotate(-90 22 22)"/>' +
      '<text x="22" y="26" text-anchor="middle" font-size="12" font-weight="700" fill="currentColor">' + Math.round(p) + '</text>' +
      '</svg>';
  }

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
        '<div class="g-striplv">' + smallRing(o.pct) +
        '<span><b>Lv.' + lv.i + ' ' + lv.name.zh + '</b>' +
        '<span>' + o.cleared + ' / ' + o.total + ' 題</span></span></div>' +
        '<div class="g-striprank">' + rankHTML + '</div>' +
        '<button class="btn g-stripbtn" id="g-strip-go">睇全榜 ›</button>' +
        '</div>';
      var go = el('g-strip-go');
      if (go) go.onclick = function () { if (window.GameProgress) window.GameProgress.show(); };
    }

    if (who() === 'guest') {
      paint('<b>班際排行榜</b><div class="g-strdim">登入之後就會見到自己排第幾。</div>');
      return;
    }
    if (!syncUrl()) {
      paint('<b>班際排行榜未開</b><div class="g-strdim">呢一頁未接後端，只有個人進度。</div>');
      return;
    }

    paint('<b>班際排行榜</b><div class="g-strdim">讀緊…</div>');
    fetchBoardRetrying(function (d) {
      if (!el('game-ov')) return;
      if (d.error || !d.top) {
        paint('<b>班際排行榜</b><div class="g-strdim">暫時讀唔到，撳「睇全榜」再試。</div>');
        return;
      }
      var top3 = d.top.slice(0, 3).map(function (r, i) {
        return '<i>' + (i + 1) + '. ' + esc(r.nick || '未改花名') + ' ' + r.pct + '%</i>';
      }).join('');
      var line;
      if (d.you && d.you.rank) {
        line = '<b>你排第 ' + d.you.rank + ' / ' + d.n + ' 人</b>' +
          '<div class="g-strdim">' + (d.you.gap > 0
            ? '追上前一位差 ' + d.you.gap + '%（約 ' + d.you.gapQ + ' 題）'
            : '你而家喺榜首。') + '</div>';
      } else {
        line = '<b>你仲未上榜</b><div class="g-strdim">答啱幾題就會出現，記得去 Progress 改個花名。</div>';
      }
      paint(line + '<div class="g-strtop">' + top3 + '</div>');
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
