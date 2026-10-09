var BUILD = '2026-10-09a';   // bump when you paste a new version; ?ping=1 echoes it
/*****************************************************************************
 * tyneconbuddy — Apps Script backend  (v2)
 * ---------------------------------------------------------------------------
 * WHAT CHANGED FROM v1, AND WHY
 *
 * 1. THE ADMIN PASSWORD PATH IS GONE.
 *    v1 accepted ?admin=1&adminPass=... over JSONP and returned every
 *    student's EMAIL. ADMIN_PASS was hard-coded in three public HTML files,
 *    so any student could read it with View Source and pull the whole class
 *    roster. There is no safe way to keep a shared password in a public
 *    static page, so the path is removed rather than re-secured. You own the
 *    Sheet; read the Scores tab directly instead.
 *
 * 2. SCHOOL_HD IS NOW REAL.
 *    In v1 it was declared and never used, so despite the comment in the HTML
 *    calling it "the real gate", there was NO server-side gate at all: doPost
 *    trusted whatever profile string the client sent. Now every write carries
 *    a Google ID token that is verified against Google before anything is
 *    stored.
 *
 * 3. THE QUESTION BANK LIVES HERE, NOT IN THE HTML.
 *    Questions are served per section to signed-in students only.
 *
 * 4. MISTAKES ARE APPEND-ONLY.
 *    There is deliberately no code path that deletes or edits a row in the
 *    Mistakes tab. A student may annotate a mistake and set its status, but
 *    may never clear it. Notes are separate from mistakes for this reason.
 *
 * DEPLOY
 *   1. Put bank.json in your Google Drive.
 *   2. Paste this over Code.gs.
 *   3. Run install()  — it does everything else and reports back.
 *   4. Deploy > Manage deployments > pencil > New version > Deploy.
 *      Keep the SAME deployment so the /exec URL does not change.
 *      Execute as: Me.   Who has access: Anyone.
 *****************************************************************************/

var SHEET_ID   = '130td46ZXxU0HaQDWOhsR49RJgw5ofxraqqfyX4sb58k';
var SCHOOL_HD  = '';   // '' = any Google account. Set to e.g. 'lkss.edu.hk' to gate by domain.
var USE_ROSTER = false; // true = only emails listed in the Roster tab may write.
var TOP_N      = 10;
var SESSION_HOURS = 12;

/* The Google OAuth client ID the pages sign in with. A token is only accepted
   if Google says it was issued for THIS client — otherwise a token borrowed
   from any other site would be accepted here. */
var CLIENT_ID = '533999025151-qf44e4dp2k7stspp5r6g8050ererf6st.apps.googleusercontent.com';

/* Level thresholds — keep identical to LEVELS in game.js */
var LEVELS = [0, 3, 8, 15, 25, 40, 60, 80, 95, 100];

/* ---------------------------------------------------------------- sheets -- */
function ss_() {
  if (SHEET_ID) return SpreadsheetApp.openById(SHEET_ID);
  var s = SpreadsheetApp.getActiveSpreadsheet();
  if (!s) throw new Error('No spreadsheet: set SHEET_ID at the top of Code.gs.');
  return s;
}

function sheet_(name, headers) {
  var ss = ss_(), sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); sh.appendRow(headers); sh.setFrozenRows(1); }
  else if (sh.getLastRow() === 0) { sh.appendRow(headers); sh.setFrozenRows(1); }
  return sh;
}

function logSheet_()      { return sheet_('Log',      ['ts','event','profile','session','page','qid','correct','raw']); }
function scoreSheet_()    { return sheet_('Scores',   ['uid','email','nick','pageId','pageLabel','cleared','total','sections','updated']); }
function bankSheet_()     { return sheet_('Bank',     ['key','type','page','topic','payload']); }
function mistakeSheet_()  { return sheet_('Mistakes', ['ts','uid','key','chose','correct']); }
function noteSheet_()     { return sheet_('Notes',    ['uid','key','status','note','updated']); }
function sessionSheet_()  { return sheet_('Sessions', ['nonce','token','uid','email','expires']); }
function rosterSheet_()   { return sheet_('Roster',   ['email','name','active']); }
function blockSheet_()    { return sheet_('Blocklist',['email','reason','added','status']); }
function clearedSheet_()  { return sheet_('Cleared',  ['uid','cleared','updated']); }
function studentSheet_()  { return sheet_('Students', ['uid','email','class','num','nick','joined','updated']); }
function commentSheet_()  { return sheet_('Comments', ['cid','key','uid','nick','class','num','text','ts','likes','verified','hidden']); }
function likeSheet_()     { return sheet_('Likes',    ['cid','uid','ts']); }
function explainSheet_()  { return sheet_('Explain',  ['key','qid','chose','topic','text','hits','students','first','last','source','reviewed']); }
function aiLogSheet_()    { return sheet_('AIUsage',  ['day','uid','n']); }

function configSheet_() {
  var sh = ss_().getSheetByName('Config');
  if (!sh) {
    sh = ss_().insertSheet('Config');
    sh.appendRow(['key','value']);
    sh.appendRow(['status','OPEN']);
    sh.appendRow(['closed_message','This drill is not open right now.']);
    sh.setFrozenRows(1);
  }
  return sh;
}

function configGet_(key, dflt) {
  var v = configSheet_().getDataRange().getValues();
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][0]).trim().toLowerCase() === key) return String(v[i][1]).trim();
  }
  return dflt;
}

/* djb2 — must match djb2() in game.js exactly, or students never match their
   own leaderboard row. */
function hashUid_(s) {
  var x = 5381; s = String(s);
  for (var i = 0; i < s.length; i++) x = ((x * 33) ^ s.charCodeAt(i)) >>> 0;
  return x.toString(36);
}

function levelOf_(p) {
  var lv = 1;
  for (var i = 0; i < LEVELS.length; i++) if (p >= LEVELS[i]) lv = i + 1;
  return lv;
}

function rnd_() {
  return Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '').slice(0, 8);
}

/* ================================================================ AUTH ==== *
 * The pages cannot read a POST response (they post with mode:'no-cors' because
 * Apps Script does not answer CORS preflight). So the handshake is:
 *
 *   1. page invents a random nonce, POSTs {event:'auth', idToken, nonce}
 *   2. server verifies the token WITH GOOGLE, stores a session under that nonce
 *   3. page calls GET ?claim=<nonce> over JSONP and receives its session token
 *   4. every later GET carries ?t=<session token>  (short, so URLs stay small)
 *
 * The ID token itself never goes in a URL, which keeps it out of browser
 * history and server logs.
 * ========================================================================== */

function verifyIdToken_(idToken) {
  if (!idToken) return null;
  var url = 'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken);
  var res;
  try { res = UrlFetchApp.fetch(url, { muteHttpExceptions: true }); }
  catch (e) { authErr_('tokeninfo fetch threw: ' + e); return null; }
  if (res.getResponseCode() !== 200) {
    authErr_('tokeninfo ' + res.getResponseCode() + ' ' + res.getContentText().slice(0, 200));
    return null;
  }

  var p;
  try { p = JSON.parse(res.getContentText()); } catch (e) { authErr_('tokeninfo not JSON'); return null; }

  // Google verified the signature for us. We still must check WHO it was for.
  if (String(p.aud) !== CLIENT_ID) {
    authErr_('aud mismatch: token is for ' + p.aud + ' but CLIENT_ID is ' + CLIENT_ID);
    return null;
  }
  if (String(p.email_verified) !== 'true') { authErr_('email not verified: ' + p.email); return null; }
  if (Number(p.exp) * 1000 < Date.now()) { authErr_('token expired'); return null; }
  // Blocklist is checked before the domain and roster rules, so a blocked
  // student cannot slip through by being on the right domain.
  if (isBlocked_(p.email)) return { email: String(p.email), denied: 'blocked' };
  if (SCHOOL_HD && String(p.hd || '') !== SCHOOL_HD) return { email: String(p.email), denied: 'domain' };
  if (USE_ROSTER && !onRoster_(p.email)) return { email: String(p.email), denied: 'roster' };
  return { email: String(p.email), name: String(p.name || p.email) };
}

/* ============================================================ BLOCKLIST ==== *
 * A blocked email is refused at the door. Because every function on the site
 * already requires a signed-in session, refusing the session refuses the whole
 * site — there is no logged-out mode that still works.
 *
 * Checked on EVERY request, not only at sign-in, so blocking someone who is
 * already signed in takes effect within a minute instead of waiting out their
 * 12-hour session. Cached for 60s so it costs one sheet read a minute, not one
 * per click.
 * ========================================================================== */
function blockedSet_() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get('blocked');
  if (hit !== null) { try { return JSON.parse(hit); } catch (e) {} }
  var v = blockSheet_().getDataRange().getValues(), set = {};
  for (var i = 1; i < v.length; i++) {
    var em = String(v[i][0]).trim().toLowerCase();
    if (em) set[em] = String(v[i][1] || '');
  }
  cache.put('blocked', JSON.stringify(set), 60);
  return set;
}

function isBlocked_(email) {
  return blockedSet_().hasOwnProperty(String(email).trim().toLowerCase());
}

/*
 * Run from the editor:  block('someone@gmail.com')
 * Adds them to the Blocklist AND deletes any session they are holding right
 * now, so they are out immediately rather than at the next expiry.
 */
function block(email, reason) {
  email = String(email).trim().toLowerCase();
  if (!email) return 'Give me an email.';
  if (!isBlocked_(email)) blockSheet_().appendRow([email, reason || '', new Date()]);
  var sh = sessionSheet_(), v = sh.getDataRange().getValues(), killed = 0;
  for (var i = v.length - 1; i >= 1; i--) {
    if (String(v[i][3]).trim().toLowerCase() === email) { sh.deleteRow(i + 1); killed++; }
  }
  CacheService.getScriptCache().remove('blocked');
  var msg = 'Blocked ' + email + '. Live sessions removed: ' + killed + '.';
  Logger.log(msg);
  return msg;
}

/*
 * THE EASY WAY TO BLOCK SOMEONE: just type their email into column A of the
 * Blocklist tab and press Enter. This trigger fires on that edit, tidies the
 * address, ends any session they are holding, and writes back a plain-English
 * confirmation in column D so you are never left wondering whether it worked.
 *
 * To unblock: delete the row. Nothing else to do.
 *
 * install() registers this trigger. A typed-in email still works without it —
 * it just takes up to a minute and gives you no confirmation line.
 */
function onBlocklistEdit(e) {
  try {
    var sh = e.range.getSheet();
    if (sh.getName() !== 'Blocklist') return;
    var row = e.range.getRow(), col = e.range.getColumn();
    if (row < 2 || col !== 1) return;

    var raw = String(sh.getRange(row, 1).getValue()).trim();
    if (!raw) { sh.getRange(row, 4).setValue(''); return; }

    var email = raw.toLowerCase();
    if (email !== raw) sh.getRange(row, 1).setValue(email);   // tidy it silently

    if (email.indexOf('@') < 0) {
      sh.getRange(row, 4).setValue('⚠ not an email address');
      return;
    }

    if (!sh.getRange(row, 3).getValue()) sh.getRange(row, 3).setValue(new Date());

    var ss = sessionSheet_(), v = ss.getDataRange().getValues(), killed = 0;
    for (var i = v.length - 1; i >= 1; i--) {
      if (String(v[i][3]).trim().toLowerCase() === email) { ss.deleteRow(i + 1); killed++; }
    }
    CacheService.getScriptCache().remove('blocked');

    sh.getRange(row, 4).setValue(
      '✓ blocked' + (killed ? ' — signed out of ' + killed + ' device(s)' : '') +
      ' · ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'd MMM HH:mm')
    );
  } catch (err) {
    try { e.range.getSheet().getRange(e.range.getRow(), 4).setValue('⚠ ' + err); } catch (e2) {}
  }
}

/* Run from the editor:  unblock('someone@gmail.com') */
function unblock(email) {
  email = String(email).trim().toLowerCase();
  var sh = blockSheet_(), v = sh.getDataRange().getValues(), n = 0;
  for (var i = v.length - 1; i >= 1; i--) {
    if (String(v[i][0]).trim().toLowerCase() === email) { sh.deleteRow(i + 1); n++; }
  }
  CacheService.getScriptCache().remove('blocked');
  var msg = n ? ('Unblocked ' + email + '.') : (email + ' was not on the Blocklist.');
  Logger.log(msg);
  return msg;
}

function onRoster_(email) {
  var v = rosterSheet_().getDataRange().getValues();
  email = String(email).trim().toLowerCase();
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][0]).trim().toLowerCase() === email) {
      return String(v[i][2]).trim().toLowerCase() !== 'no';
    }
  }
  return false;
}

/* Last sign-in failure, readable in Project Settings > Script Properties >
   AUTH_LAST_ERROR — the same idea as AI_LAST_ERROR. */
function authErr_(msg) {
  try {
    PropertiesService.getScriptProperties().setProperty('AUTH_LAST_ERROR',
      new Date().toISOString() + '  ' + String(msg).slice(0, 450));
  } catch (e) {}
}

function startSession_(idToken, nonce) {
  if (!nonce) return;
  var who = verifyIdToken_(idToken);

  var lock = LockService.getScriptLock();
  try { lock.waitLock(8000); }
  catch (e) { authErr_('startSession_ lock timeout — server busy'); return; }

  try {
    var sh = sessionSheet_();

    if (!who) {
      // Google refused the token, or it was issued for a different OAuth
      // client. Say so, instead of leaving the page waiting forever.
      // The exact reason is in Script Properties > AUTH_LAST_ERROR.
      sh.appendRow([String(nonce).slice(0, 64), 'DENIED:verify', '', '',
                    new Date(Date.now() + 600000)]);
      return;
    }

    var normEmail = String(who.email || '').trim().toLowerCase();

    // A refused sign-in still writes a row, so the page gets a real reason
    // instead of hanging on "not ready". DENIED is never a usable token:
    // sessionOf_ rejects it explicitly.
    if (who.denied) {
      sh.appendRow([String(nonce).slice(0, 64), 'DENIED:' + who.denied, '', normEmail,
                    new Date(Date.now() + 600000)]);
      return;
    }

    sh.appendRow([
      String(nonce).slice(0, 64),
      rnd_(),
      hashUid_('tyn:' + normEmail),
      normEmail,
      new Date(Date.now() + SESSION_HOURS * 3600 * 1000)
    ]);
  } catch (err) {
    authErr_('startSession_ threw: ' + err);
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

function claimSession_(nonce) {
  if (!nonce) return { error: 'no nonce' };
  var v = sessionSheet_().getDataRange().getValues();
  for (var i = v.length - 1; i >= 1; i--) {
    if (String(v[i][0]) === String(nonce)) {
      if (new Date(v[i][4]).getTime() < Date.now()) return { error: 'expired' };
      var tok = String(v[i][1]);
      if (tok.indexOf('DENIED:') === 0) return { error: tok.slice(7) };
      return { t: tok, uid: String(v[i][2]) };
    }
  }
  return { error: 'not ready' };   // token not verified (yet, or at all)
}

/* Returns {uid,email} for a live session token, else null. */
function sessionOf_(t) {
  if (!t) return null;
  var v = sessionSheet_().getDataRange().getValues();
  for (var i = v.length - 1; i >= 1; i--) {
    if (String(v[i][1]) === String(t)) {
      if (String(t).indexOf('DENIED:') === 0) return null;
      if (new Date(v[i][4]).getTime() < Date.now()) return null;
      if (isBlocked_(v[i][3])) return null;   // blocked mid-session: out now
      return { uid: String(v[i][2]), email: String(v[i][3]) };
    }
  }
  return null;
}

/* ================================================================ BANK ==== */

/*
 * THE ONLY FUNCTION YOU EVER RUN FROM THE EDITOR.
 *
 * Creates every tab, loads bank.json from your Drive, and then checks its own
 * work and tells you what it found. Safe to re-run any time: it replaces the
 * bank rather than appending, and leaves Scores, Mistakes and Notes untouched.
 */
function install() {
  logSheet_(); scoreSheet_(); configSheet_();
  bankSheet_(); mistakeSheet_(); noteSheet_(); sessionSheet_(); rosterSheet_(); blockSheet_();
  clearedSheet_(); explainSheet_(); aiLogSheet_();
  studentSheet_(); commentSheet_(); likeSheet_();

  var files = DriveApp.getFilesByName('bank.json');
  if (!files.hasNext()) {
    var miss = 'STOP: no file called bank.json in your Drive. Upload it, then run install() again.';
    Logger.log(miss);
    return miss;
  }
  var data = JSON.parse(files.next().getBlob().getDataAsString());

  var rows = [];
  (data.mcq || []).forEach(function (q) {
    rows.push([q.key, 'mcq', q._page || '', q.topic || q.sub || q.g || '', JSON.stringify(q)]);
  });
  (data.lq || []).forEach(function (q) {
    rows.push([q.key, 'lq', q._page || '', q.topic || q.g || '', JSON.stringify(q)]);
  });
  (data.concepts || []).forEach(function (c) {
    rows.push([c.key, 'concept', c._page || '', c.topic || c.g || '', JSON.stringify(c)]);
  });
  (data.traps || []).forEach(function (t) {
    rows.push([t.key, 'trap', t._page || '', t.topic || t.g || '', JSON.stringify(t)]);
  });
  // groups and diagram map are page furniture, not questions: one row each.
  rows.push(['__groups', 'meta', '', '', JSON.stringify(data.groups || {})]);
  rows.push(['__dia',    'meta', '', '', JSON.stringify(data.dia || {})]);

  var sh = bankSheet_();
  if (sh.getLastRow() > 1) sh.deleteRows(2, sh.getLastRow() - 1);
  for (var i = 0; i < rows.length; i += 500) {
    var chunk = rows.slice(i, i + 500);
    sh.getRange(sh.getLastRow() + 1, 1, chunk.length, 5).setValues(chunk);
  }
  CacheService.getScriptCache().remove('bank_index');

  // Register the Blocklist edit trigger, exactly once.
  var have = ScriptApp.getProjectTriggers().some(function (t) {
    return t.getHandlerFunction() === 'onBlocklistEdit';
  });
  if (!have) {
    ScriptApp.newTrigger('onBlocklistEdit').forSpreadsheet(SHEET_ID).onEdit().create();
  }

  // Make the Blocklist tab explain itself, so it needs no manual.
  var bl = blockSheet_();
  bl.getRange('A1:D1').setValues([['email (type here to block)', 'reason (optional)', 'added', 'status']])
    .setFontWeight('bold');
  bl.setColumnWidth(1, 240); bl.setColumnWidth(2, 180); bl.setColumnWidth(4, 300);

  // Self-check, so you do not have to go looking.
  var warn = [];
  if (!CLIENT_ID) warn.push('CLIENT_ID is empty — sign-in will never verify.');
  if (!PropertiesService.getScriptProperties().getProperty('GEMINI_KEY')) {
    warn.push('No GEMINI_KEY script property — the AI explainer stays off (everything else works).');
  }
  if (rows.length < 100) warn.push('Only ' + rows.length + ' questions loaded — bank.json looks wrong.');
  var msg = 'OK. ' + (data.mcq || []).length + ' MCQ + ' + (data.lq || []).length +
            ' LQ + ' + (data.concepts || []).length + ' concepts + ' +
            (data.traps || []).length + ' traps loaded into "' + ss_().getName() + '".' +
            (warn.length ? '  WARNINGS: ' + warn.join(' ') : '') +
            '  Next: Deploy > Manage deployments > pencil > New version > Deploy.';
  Logger.log(msg);
  return msg;
}

/*
 * Serve ONE section at a time, never the whole bank. A student who wants every
 * question must request every section and leave a Log row for each, which is
 * a visible pattern; a single request can never walk off with the lot.
 */
function serveSection_(type, page, topic) {
  var v = bankSheet_().getDataRange().getValues();
  var out = [];
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][1]) !== String(type)) continue;
    if (page  && String(v[i][2]) !== String(page))  continue;
    if (topic && String(v[i][3]) !== String(topic)) continue;
    try { out.push(JSON.parse(v[i][4])); } catch (e) {}
  }
  return out;
}

/* One question fetched by key — the Correction Album uses this so a student
   can reread and retry a question straight from their own mistake list. Same
   exposure as a section fetch: authenticated, one at a time. */
function serveOne_(key) {
  var v = bankSheet_().getDataRange().getValues();
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][0]) === String(key)) {
      try { return { item: JSON.parse(v[i][4]) }; } catch (e) { return { item: null }; }
    }
  }
  return { item: null };
}

/* One row fetched by its key — used for the groups map and the diagram map. */
function serveMeta_(key) {
  var v = bankSheet_().getDataRange().getValues();
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][0]) === key) { try { return JSON.parse(v[i][4]); } catch (e) { return {}; } }
  }
  return {};
}

function bankIndex_() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get('bank_index');
  if (hit) { try { return JSON.parse(hit); } catch (e) {} }
  var v = bankSheet_().getDataRange().getValues();
  var idx = {};
  for (var i = 1; i < v.length; i++) {
    var t = String(v[i][1]), p = String(v[i][2]), tp = String(v[i][3]);
    if (t === 'meta') continue;
    idx[t] = idx[t] || {};
    idx[t][p] = idx[t][p] || {};
    idx[t][p][tp] = (idx[t][p][tp] || 0) + 1;
  }
  cache.put('bank_index', JSON.stringify(idx), 21600);
  return idx;
}

/* ============================================================ MISTAKES ==== *
 * Append only. There is no update and no delete anywhere in this file, and
 * that is the point: a wrong answer is a permanent part of the record. What a
 * student CAN do is annotate it (Notes) and mark how well they now understand
 * it. Rewriting history is not on the menu.
 * ========================================================================== */
function recordMistake_(sess, b) {
  if (!b.key) return;
  mistakeSheet_().appendRow([
    new Date(), sess.uid, String(b.key).slice(0, 80),
    b.chose === undefined ? '' : b.chose,
    b.correct === undefined ? '' : b.correct
  ]);
}

/* =============================================================== NOTES ==== *
 * One row per (uid, key). The note text and status may be revised as often as
 * the student likes — that is learning. The Mistakes row it refers to stays
 * where it is.
 * ========================================================================== */
var STATUSES = ['understood', 'partly', 'not'];

function saveNote_(sess, b) {
  if (!b.key) return;
  var status = String(b.status || '').toLowerCase();
  if (STATUSES.indexOf(status) < 0) status = 'not';
  var note = String(b.note || '').slice(0, 2000);

  var lock = LockService.getScriptLock();
  try { lock.waitLock(8000); } catch (e) { return; }
  try {
    var sh = noteSheet_(), v = sh.getDataRange().getValues(), row = -1;
    for (var i = 1; i < v.length; i++) {
      if (String(v[i][0]) === sess.uid && String(v[i][1]) === String(b.key)) { row = i + 1; break; }
    }
    var rec = [sess.uid, String(b.key).slice(0, 80), status, note, new Date()];
    if (row > 0) sh.getRange(row, 1, 1, rec.length).setValues([rec]);
    else sh.appendRow(rec);
  } finally { try { lock.releaseLock(); } catch (e) {} }
}

/*
 * Every mistake the student has ever made, newest first, each carrying its
 * note and status if one exists. This is the "mistake book" the page renders.
 */
function myMistakes_(sess) {
  var mv = mistakeSheet_().getDataRange().getValues();
  var nv = noteSheet_().getDataRange().getValues();

  var notes = {};
  for (var i = 1; i < nv.length; i++) {
    if (String(nv[i][0]) === sess.uid) {
      notes[String(nv[i][1])] = { status: String(nv[i][2] || ''), note: String(nv[i][3] || '') };
    }
  }

  var seen = {}, out = [];
  for (var j = mv.length - 1; j >= 1; j--) {
    if (String(mv[j][1]) !== sess.uid) continue;
    var key = String(mv[j][2]);
    if (seen[key]) { seen[key].n++; continue; }   // collapse repeats, keep a count
    var rec = {
      key: key,
      ts: mv[j][0] ? new Date(mv[j][0]).getTime() : 0,
      chose: mv[j][3],
      n: 1,
      status: (notes[key] && notes[key].status) || '',
      note: (notes[key] && notes[key].note) || ''
    };
    seen[key] = rec; out.push(rec);
  }

  // Attach page and topic to each mistake so the album can shelve it under
  // its chapter. One pass over the Bank covers every item at once.
  if (out.length) {
    var want = {};
    out.forEach(function (r) { want[r.key] = r; });
    var bv = bankSheet_().getDataRange().getValues();
    for (var b = 1; b < bv.length; b++) {
      var kk = String(bv[b][0]);
      if (want[kk]) { want[kk].pg = String(bv[b][2]); want[kk].tp = String(bv[b][3]); }
    }
  }
  return { items: out, n: out.length };
}

/* ============================================================= IDENTITY === *
 * Google tells us who the account is; it does not tell us which desk they sit
 * at. Class and class number do that, and they are what a teacher needs in
 * order to act on anything the site records. So they are collected once and
 * every other function stays shut until they are.
 *
 * Class + number is treated as unique: two students both claiming 4A-12 makes
 * every later report ambiguous, so the second one is refused rather than
 * silently accepted.
 *
 * The nickname is the only part other students ever see.
 * ========================================================================== */
function profileOf_(sess) {
  var v = studentSheet_().getDataRange().getValues();
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][0]) === sess.uid) {
      return { cls: String(v[i][2] || ''), num: String(v[i][3] || ''),
               nick: String(v[i][4] || ''), row: i + 1 };
    }
  }
  return null;
}

function saveProfile_(sess, cls, num, nick) {
  cls  = String(cls  || '').trim().toUpperCase().slice(0, 6);
  num  = String(num  || '').trim();
  nick = String(nick || '').trim().slice(0, 16);
  if (!cls || !num || !nick) return { error: 'missing' };
  if (!/^[0-9]{1,2}$/.test(num)) return { error: 'badnum' };

  var lock = LockService.getScriptLock();
  try { lock.waitLock(8000); } catch (e) { return { error: 'busy' }; }
  try {
    var sh = studentSheet_(), v = sh.getDataRange().getValues(), mine = -1;
    for (var i = 1; i < v.length; i++) {
      if (String(v[i][0]) === sess.uid) { mine = i + 1; continue; }
      if (String(v[i][2]).toUpperCase() === cls && String(v[i][3]) === num) {
        return { error: 'taken' };          // that seat already belongs to someone
      }
    }
    if (mine > 0) {
      sh.getRange(mine, 3, 1, 3).setValues([[cls, num, nick]]);
      sh.getRange(mine, 7).setValue(new Date());
    } else {
      sh.appendRow([sess.uid, sess.email, cls, num, nick, new Date(), new Date()]);
    }
    return { ok: true, cls: cls, num: num, nick: nick };
  } finally { try { lock.releaseLock(); } catch (e) {} }
}

/* ============================================================= COMMENTS === *
 * A comment thread hangs off each question. Three rules hold it together:
 *
 *   1. The page only shows the thread AFTER the student has committed to an
 *      answer. Without that, the top comment becomes the answer key and the
 *      whole point of drilling disappears.
 *   2. verified beats likes. A wrong explanation can be popular; a tick from
 *      the teacher pins the right one above the crowd, while likes still say
 *      which wording people found useful.
 *   3. hidden, not deleted. Tick hidden and it stops showing, but the row
 *      stays in the Sheet with the author attached. Nothing said here quietly
 *      disappears — which is most of why it stays civil.
 *
 * Other students see the nickname only. The Sheet carries class, number and
 * email, and only you can read the Sheet.
 * ========================================================================== */
function comments_(key) {
  var v = commentSheet_().getDataRange().getValues(), out = [];
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][1]) !== String(key)) continue;
    if (String(v[i][10]).trim()) continue;                    // hidden
    out.push({
      cid: String(v[i][0]), nick: String(v[i][3] || '—'),
      text: String(v[i][6] || ''),
      ts: v[i][7] ? new Date(v[i][7]).getTime() : 0,
      likes: Number(v[i][8] || 0),
      verified: String(v[i][9]).trim() ? 1 : 0
    });
  }
  out.sort(function (a, b) {
    if (a.verified !== b.verified) return b.verified - a.verified;
    if (a.likes !== b.likes) return b.likes - a.likes;
    return a.ts - b.ts;
  });
  return { items: out.slice(0, 60) };
}

function addComment_(sess, key, text) {
  text = String(text || '').trim().slice(0, 400);
  if (!key || !text) return;
  var p = profileOf_(sess);
  if (!p) return;                                   // no profile, no voice
  commentSheet_().appendRow([
    Utilities.getUuid().slice(0, 8), String(key).slice(0, 80), sess.uid,
    p.nick, p.cls, p.num, text, new Date(), 0, '', ''
  ]);
}

/* One like per student per comment, enforced by a row in Likes. A second tap
   removes it, so a like is a toggle rather than a counter to farm. */
function toggleLike_(sess, cid) {
  if (!cid) return;
  var lock = LockService.getScriptLock();
  try { lock.waitLock(8000); } catch (e) { return; }
  try {
    var ls = likeSheet_(), lv = ls.getDataRange().getValues(), found = -1;
    for (var i = 1; i < lv.length; i++) {
      if (String(lv[i][0]) === String(cid) && String(lv[i][1]) === sess.uid) { found = i + 1; break; }
    }
    var delta;
    if (found > 0) { ls.deleteRow(found); delta = -1; }
    else { ls.appendRow([String(cid), sess.uid, new Date()]); delta = 1; }

    var cs = commentSheet_(), cv = cs.getDataRange().getValues();
    for (var j = 1; j < cv.length; j++) {
      if (String(cv[j][0]) === String(cid)) {
        cs.getRange(j + 1, 9).setValue(Math.max(0, Number(cv[j][8] || 0) + delta));
        return;
      }
    }
  } finally { try { lock.releaseLock(); } catch (e) {} }
}

function myLikes_(sess) {
  var v = likeSheet_().getDataRange().getValues(), out = {};
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][1]) === sess.uid) out[String(v[i][0])] = 1;
  }
  return out;
}

/* ============================================================ PROGRESS ==== *
 * One row per student holding the set of question keys they have cleared. The
 * page keeps its own copy in localStorage and the two are MERGED, never
 * replaced: a student who drills on a phone and then a laptop should end up
 * with the union, not with whichever device reported last.
 * ========================================================================== */
function clearedOf_(sess) {
  var v = clearedSheet_().getDataRange().getValues();
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][0]) === sess.uid) {
      try { return JSON.parse(v[i][1]); } catch (e) { return {}; }
    }
  }
  return {};
}

function addCleared_(sess, items) {
  if (!items || typeof items !== 'object') return;
  var lock = LockService.getScriptLock();
  try { lock.waitLock(8000); } catch (e) { return; }
  try {
    var sh = clearedSheet_(), v = sh.getDataRange().getValues(), row = -1, cur = {};
    for (var i = 1; i < v.length; i++) {
      if (String(v[i][0]) === sess.uid) {
        row = i + 1;
        try { cur = JSON.parse(v[i][1]) || {}; } catch (e) { cur = {}; }
        break;
      }
    }
    var changed = false;
    for (var k in items) { if (!cur[k]) { cur[k] = items[k]; changed = true; } }
    if (!changed && row > 0) return;
    var rec = [sess.uid, JSON.stringify(cur).slice(0, 45000), new Date()];
    if (row > 0) sh.getRange(row, 1, 1, 3).setValues([rec]);
    else sh.appendRow(rec);
  } finally { try { lock.releaseLock(); } catch (e) {} }
}

/* ============================================================ NEW ITEMS === *
 * Adding questions by hand into the Bank tab would mean writing JSON in a
 * spreadsheet cell — fine once, miserable at scale, and one stray comma
 * silently drops a question. So teachers type into a plain "New" tab with one
 * column per field, and this function converts, validates and files them.
 *
 * HOW TO ADD QUESTIONS
 *   1. Run setupNew() once. It creates the "New" tab with the right headings.
 *   2. Type one question per row. Leave "status" empty.
 *   3. Run importNew(). Each row comes back marked in the status column:
 *      "added" (it is live), or a plain-English reason it was skipped.
 *   4. Fix any skipped row and run importNew() again — added rows are never
 *      imported twice.
 *
 * Nothing is deleted and nothing is overwritten: a duplicate id is reported,
 * not merged, because silently replacing a question would also orphan every
 * note and comment already attached to it.
 * ========================================================================== */
function newSheet_() {
  return sheet_('New', ['id', 'type', 'page', 'topic', 'question', 'A', 'B', 'C', 'D',
                        'answer', 'why', 'image_url', 'status']);
}

function setupNew() {
  var sh = newSheet_();
  if (sh.getLastRow() <= 1) {
    sh.appendRow(['DSE2026/P1/Q01', 'mcq', 'macro', 'Inflation / Deflation',
      'Which of the following best describes demand-pull inflation?',
      'A rise in production costs', 'A rise in aggregate demand',
      'A fall in the money supply', 'A rise in unemployment',
      'B', 'Demand-pull inflation comes from the demand side: AD rises faster than output can follow.',
      '', 'EXAMPLE ROW — delete me']);
  }
  sh.setFrozenRows(1);
  SpreadsheetApp.getUi && SpreadsheetApp.flush();
  Logger.log('The "New" tab is ready. Fill one question per row, leave status blank, then run importNew().');
}

function importNew() {
  var sh = newSheet_(), v = sh.getDataRange().getValues();
  if (v.length < 2) { Logger.log('Nothing in the "New" tab yet. Run setupNew() first.'); return; }

  // Every id already in the bank, so a clash is caught before it is written.
  var bank = bankSheet_(), bv = bank.getDataRange().getValues(), have = {};
  for (var b = 1; b < bv.length; b++) have[String(bv[b][0])] = true;

  var rows = [], marks = [], added = 0, skipped = 0;
  for (var i = 1; i < v.length; i++) {
    var r = v[i], status = String(r[12] || '').trim();
    if (status === 'added') { marks.push(['added']); continue; }

    var id = String(r[0] || '').trim();
    if (!id) { marks.push([String(r[4] || '').trim() ? 'skipped: no id' : '']); if (String(r[4]||'').trim()) skipped++; continue; }

    var type  = String(r[1] || 'mcq').trim().toLowerCase();
    var page  = String(r[2] || '').trim();
    var topic = String(r[3] || '').trim();
    var qtext = String(r[4] || '').trim();
    var opts  = [r[5], r[6], r[7], r[8]].map(function (x) { return String(x || '').trim(); });
    var ansL  = String(r[9] || '').trim().toUpperCase();
    var why   = String(r[10] || '').trim();   // col K
    var img   = String(r[11] || '').trim();

    if (have[id])        { marks.push(['skipped: id already in the bank']); skipped++; continue; }
    if (!page || !topic) { marks.push(['skipped: page and topic are both needed']); skipped++; continue; }
    if (!qtext && !img)  { marks.push(['skipped: needs a question or an image_url']); skipped++; continue; }

    var item = { id: id, key: id, q: qtext, why: why, topic: topic, _page: page };
    if (img) item.img = img;

    if (type === 'mcq') {
      var filled = opts.filter(function (o) { return o; });
      if (!img && filled.length < 2) { marks.push(['skipped: an MCQ needs at least options A and B']); skipped++; continue; }
      var ai = ['A', 'B', 'C', 'D'].indexOf(ansL);
      if (ai < 0) { marks.push(['skipped: answer must be A, B, C or D']); skipped++; continue; }
      if (filled.length && ai >= filled.length) { marks.push(['skipped: answer points at a blank option']); skipped++; continue; }
      if (filled.length) item.opts = filled;
      item.ans = ai;
    }

    rows.push([id, type, page, topic, JSON.stringify(item)]);
    have[id] = true;
    marks.push(['added']); added++;
  }

  if (rows.length) bank.getRange(bank.getLastRow() + 1, 1, rows.length, 5).setValues(rows);
  if (marks.length) sh.getRange(2, 13, marks.length, 1).setValues(marks);

  // The section counts are cached for six hours; a new question must show up now.
  CacheService.getScriptCache().remove('bank_index');

  Logger.log(added + ' added, ' + skipped + ' skipped. Check the status column for any reason.'
    + (added ? ' Students see them on their next page load — no redeploy needed.' : ''));
}

/* =========================================================== CLASS TOP 20 == *
 * The twenty questions most students have cleared, tallied across every row of
 * the Cleared tab. Rescanning that on every Overview visit would be wasteful,
 * so the result is cached for five minutes — a class-wide statistic does not
 * need to be fresher than that.
 * ========================================================================== */
function top20_() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get('top20');
  if (hit) { try { return JSON.parse(hit); } catch (e) {} }

  var tally = {};
  var cv = clearedSheet_().getDataRange().getValues();
  for (var i = 1; i < cv.length; i++) {
    var set; try { set = JSON.parse(cv[i][1]) || {}; } catch (e) { continue; }
    for (var k in set) tally[k] = (tally[k] || 0) + 1;
  }
  var keys = Object.keys(tally).sort(function (a, b) { return tally[b] - tally[a]; }).slice(0, 20);

  var where = {};
  var bv = bankSheet_().getDataRange().getValues();
  for (var j = 1; j < bv.length; j++) {
    var kk = String(bv[j][0]);
    if (keys.indexOf(kk) >= 0) where[kk] = [String(bv[j][2]), String(bv[j][3])];
  }
  var out = { items: keys.map(function (k) {
    return { key: k, page: (where[k] || ['', ''])[0], topic: (where[k] || ['', ''])[1], n: tally[k] };
  }) };
  cache.put('top20', JSON.stringify(out), 300);
  return out;
}

/* ================================================================== AI ==== *
 * A second explanation, in simple English, for a student who has read the
 * written one and still does not follow. Three things keep it cheap and keep
 * it honest:
 *
 *   1. CACHE. The same wrong answer to the same question needs the same
 *      explanation, so it is generated once and stored. Later students read
 *      the stored row and cost nothing.
 *   2. A DAILY CAP PER STUDENT, so one student cannot burn the class quota.
 *   3. EVERY GENERATED LINE LANDS IN A SHEET YOU CAN EDIT. Set source to
 *      'tny' and it is yours from then on; the model never overwrites a row.
 *
 * hits counts every read, students counts distinct askers. A high students
 * count means many people fall into that trap; a high hits/students ratio
 * means they read the explanation and still came back — which is the more
 * useful signal, and points at an explanation that is not landing.
 * ========================================================================== */
var AI_DAILY_CAP = 20;
/* Change the model without touching code: add a Script Property AI_MODEL.
   Default follows Google's own redirect notice (Sep 2026): 2.5-flash is closed
   to new users; 3.6-flash is the replacement. */
function aiModel_() {
  return PropertiesService.getScriptProperties().getProperty('AI_MODEL') || 'gemini-3.6-flash';
}

/* The thinking control changed dialect between generations: 2.5 takes
   thinkingBudget (0 = off); the 3.x series takes thinkingLevel and will not
   switch thinking fully off. "minimal" is the cheapest tier that 3.x accepts,
   and a roomy maxOutputTokens keeps whatever thinking remains from starving
   the actual answer — the failure mode that killed 2.5 at 400 tokens. */
function aiGenConfig_() {
  var cfg = { temperature: 0.4, maxOutputTokens: 1024 };
  cfg.thinkingConfig = (aiModel_().indexOf('gemini-2.5') === 0)
    ? { thinkingBudget: 0 }
    : { thinkingLevel: 'minimal' };
  return cfg;
}

var AI_SYSTEM = [
'You are helping a Hong Kong secondary student who just got an HKDSE Economics',
'multiple-choice question wrong. They have already read the standard',
'explanation and still do not understand.',
'',
'WHO YOU ARE WRITING FOR',
'A 15-year-old in Hong Kong. Cantonese is their first language. English is',
'their second language. They can read English, but long sentences lose them.',
'',
'HOW TO WRITE',
'- Plain English only. No Chinese.',
'- Keep every sentence under 15 words. One idea per sentence.',
'- Everyday words: "so" not "thus", "because" not "hence".',
'- No markdown, no bullets, no headings. Plain sentences. 100 words maximum.',
'',
'KEEP THESE WORDS EXACTLY AS THEY ARE',
'Exam terms stay in English and are never swapped for easier words:',
'opportunity cost, marginal product, ceteris paribus, economic good, free good,',
'price elasticity of demand, and any similar term. Explain the idea in simple',
'words around the term.',
'',
'WHAT TO SAY',
'1. Start with the wrong option the student picked. Say plainly why it looks',
'   right. Their mistake is usually reasonable.',
'2. Show exactly where that thinking breaks.',
'3. State the correct idea in one or two short sentences.',
'4. End with one short question that makes them think. Do not answer it.',
'',
'HARD RULES',
'- Do NOT repeat the standard explanation you are given. Say the same idea a',
'  different way.',
'- Do NOT mention marks, marking schemes, examiners, or how many points',
'  anything is worth. Ever.',
'- Do NOT invent history, dates, places, or statistics. If you are not sure a',
'  fact is true, leave it out.',
'- Do NOT add a new example unless it is real.',
'- If you cannot explain this clearly, say exactly: Ask your teacher about this',
'  one. Do not guess.'
].join('\n');

function aiQuotaLeft_(sess) {
  var day = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var sh = aiLogSheet_(), v = sh.getDataRange().getValues();
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][0]) === day && String(v[i][1]) === sess.uid) {
      return { left: AI_DAILY_CAP - Number(v[i][2] || 0), row: i + 1, n: Number(v[i][2] || 0), day: day };
    }
  }
  return { left: AI_DAILY_CAP, row: -1, n: 0, day: day };
}

function aiBump_(sess, q) {
  if (q.row > 0) aiLogSheet_().getRange(q.row, 3).setValue(q.n + 1);
  else aiLogSheet_().appendRow([q.day, sess.uid, 1]);
}

/* The model drifts past the sentence-length rule no matter how firmly the
   prompt states it, so the rule is enforced here rather than requested there. */
function tidy_(txt) {
  txt = String(txt || '').replace(/[*#`_]/g, '').replace(/\s+/g, ' ').trim();
  var parts = txt.split(/(?<=[.?!])\s+/), out = [], words = 0;
  for (var i = 0; i < parts.length; i++) {
    var w = parts[i].split(' ').length;
    if (words + w > 110) break;
    out.push(parts[i]); words += w;
  }
  return out.join(' ');
}

function askModel_(q, chose) {
  var key = PropertiesService.getScriptProperties().getProperty('GEMINI_KEY');
  if (!key) {
    try { PropertiesService.getScriptProperties().setProperty('AI_LAST_ERROR',
      new Date().toISOString() + '  no GEMINI_KEY script property'); } catch (e) {}
    return '';
  }
  var L = ['A','B','C','D','E'];
  var user = 'Question: ' + (q.q || '(the question is a diagram)') + '\n'
    + (q.opts && q.opts.length ? 'Options: ' + q.opts.map(function (o, i) {
        return L[i] + ') ' + o; }).join('  ') + '\n' : '')
    + 'Correct answer: ' + L[Number(q.ans)] + '\n'
    + 'Student picked: ' + L[Number(chose)] + '\n'
    + 'Standard explanation the student already read: ' + (q.why || '(none)');

  var props = PropertiesService.getScriptProperties();
  // filter(Boolean), not filter(String): String(null) is "null", which is
  // truthy, so the old code called a model literally named "null" whenever
  // AI_FALLBACK was unset — and that 404 overwrote the real error.
  var models = [aiModel_(), props.getProperty('AI_FALLBACK')].filter(Boolean);
  var firstErr = '';
  for (var m = 0; m < models.length; m++) {
    var r = callModel_(models[m], key, user);
    if (r.text) return r.text;
    if (!firstErr) firstErr = models[m] + ': ' + r.err;
  }
  // Keep the FIRST model's failure, which is the one that matters. Read it in
  // Project Settings -> Script Properties -> AI_LAST_ERROR, or open ?ping=1.
  try { props.setProperty('AI_LAST_ERROR', new Date().toISOString() + '  ' + firstErr.slice(0, 450)); } catch (e) {}
  return '';
}

/* One model, with retries on 429/503. Returns {text} or {err}. */
function callModel_(model, key, user) {
  var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + model
          + ':generateContent?key=' + encodeURIComponent(key);
  var cfg = aiGenConfig_(), res = null, code = 0, droppedThinking = false;
  for (var attempt = 0; attempt < 3; attempt++) {
    try {
      res = UrlFetchApp.fetch(url, {
        method: 'post', contentType: 'application/json', muteHttpExceptions: true,
        payload: JSON.stringify({
          system_instruction: { parts: [{ text: AI_SYSTEM }] },
          contents: [{ role: 'user', parts: [{ text: user }] }],
          generationConfig: cfg
        })
      });
      code = res.getResponseCode();
    } catch (e) {
      res = null; code = 0;
      // Not a network blip: the script was never authorised to call out.
      // Running diagnose() once in the editor fixes this.
      if (String(e).indexOf('permission') >= 0) return { err: 'UrlFetchApp not authorised — run diagnose() in the editor. ' + e };
    }
    if (code === 200) break;
    var body = res ? res.getContentText() : '';
    // A model that does not accept this thinking setting answers 400. Try once
    // more without it rather than giving up on the model.
    if (code === 400 && !droppedThinking && /thinking/i.test(body)) {
      delete cfg.thinkingConfig; droppedThinking = true; attempt--; continue;
    }
    if (code !== 503 && code !== 429 && code !== 0) break;      // other errors: don't retry
    if (attempt < 2) Utilities.sleep(1000 * Math.pow(2, attempt));   // 1s, 2s
  }
  if (code !== 200) {
    return { err: (code || 'no response') + ' ' + (res ? res.getContentText().slice(0, 350) : '') };
  }
  try {
    var j = JSON.parse(res.getContentText());
    var c = (j.candidates || [])[0];
    if (!c) return { err: '200 but no candidates. promptFeedback: ' + JSON.stringify(j.promptFeedback || {}).slice(0, 200) };
    var parts = (c.content && c.content.parts) || [];
    var txt = parts.filter(function (p) { return !p.thought; })
                   .map(function (p) { return p.text || ''; }).join(' ');
    txt = tidy_(txt);
    if (!txt) return { err: '200 but empty text. finishReason: ' + c.finishReason };
    return { text: txt };
  } catch (e) { return { err: '200 but unreadable: ' + e }; }
}

function explain_(sess, key, chose) {
  var rowKey = key + ':' + chose;
  var sh = explainSheet_(), v = sh.getDataRange().getValues(), row = -1;
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][0]) === rowKey) { row = i + 1; break; }
  }

  // Cache hit: no model call, no quota spent. Just count the read.
  if (row > 0) {
    var hits = Number(v[row - 1][5] || 0) + 1;
    sh.getRange(row, 6).setValue(hits);
    sh.getRange(row, 9).setValue(new Date());
    return { text: String(v[row - 1][4] || ''), cached: true };
  }

  var quota = aiQuotaLeft_(sess);
  if (quota.left <= 0) {
    return { text: '', error: 'You have used today\'s extra explanations. Try again tomorrow.' };
  }

  var q = null, bv = bankSheet_().getDataRange().getValues();
  for (var j = 1; j < bv.length; j++) {
    if (String(bv[j][0]) === key) { try { q = JSON.parse(bv[j][4]); } catch (e) {} break; }
  }
  if (!q) return { text: '', error: 'Question not found.' };
  if (!q.q && q.img) {
    return { text: '', error: 'This one is a diagram, which the explainer cannot see. Ask your teacher about it.' };
  }

  var txt = askModel_(q, chose);
  if (!txt) return { text: '', error: 'The explainer is unavailable right now.' };

  aiBump_(sess, quota);
  sh.appendRow([rowKey, key, chose, q.topic || q.sub || q.g || '', txt,
                1, 1, new Date(), new Date(), 'ai', '']);
  return { text: txt, cached: false };
}

/* Distinct askers, counted once per student per row. Kept in a separate tab so
   the Explain tab stays readable. */
function bumpStudents_(rowKey, sess) {
  var sh = sheet_('ExplainSeen', ['key', 'uid']);
  var v = sh.getDataRange().getValues();
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][0]) === rowKey && String(v[i][1]) === sess.uid) return;
  }
  sh.appendRow([rowKey, sess.uid]);
  var e = explainSheet_(), ev = e.getDataRange().getValues();
  for (var j = 1; j < ev.length; j++) {
    if (String(ev[j][0]) === rowKey) { e.getRange(j + 1, 7).setValue(Number(ev[j][6] || 0) + 1); return; }
  }
}

/* Run this once in the Apps Script editor after adding GEMINI_KEY: it makes a
   single real call and logs either the model's reply or the exact error. */
function testAI() {
  var out = askModel_({
    q: 'Which of the following is an economic good?',
    opts: ['Air in the countryside', 'Sea water at a beach', 'Bottled water in a shop', 'Sunlight'],
    ans: 2,
    why: 'An economic good is scarce: more of it is wanted than is freely available, so it commands a price.'
  }, 0);
  Logger.log(out || ('EMPTY — check Script Properties > AI_LAST_ERROR. Last: '
    + PropertiesService.getScriptProperties().getProperty('AI_LAST_ERROR')));
}

/*
 * RUN THIS FIRST after pasting a new version. Running it is also what asks
 * Google for every permission the web app needs (Sheets, outside calls,
 * triggers); until you click Allow once, sign-in and the AI fail on the live
 * site with no visible error. It checks each piece and logs one line each.
 */
function diagnose() {
  var props = PropertiesService.getScriptProperties(), out = ['BUILD ' + BUILD];
  try { out.push('Sheet OK: "' + ss_().getName() + '", bank rows ' + (bankSheet_().getLastRow() - 1)); }
  catch (e) { out.push('SHEET FAIL: ' + e); }
  try {
    var r = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=x', { muteHttpExceptions: true });
    out.push('Google token check reachable (HTTP ' + r.getResponseCode() + ', 400 is expected here)');
  } catch (e) { out.push('OUTSIDE CALLS FAIL (sign-in cannot work): ' + e); }
  try { sessionSheet_(); blockedSet_(); out.push('Sessions + Blocklist tabs OK'); }
  catch (e) { out.push('SESSIONS FAIL: ' + e); }
  out.push('CLIENT_ID ' + (CLIENT_ID ? CLIENT_ID.slice(0, 12) + '…' : 'EMPTY'));
  out.push('AUTH_LAST_ERROR: ' + (props.getProperty('AUTH_LAST_ERROR') || '(none)'));
  out.push('GEMINI_KEY ' + (props.getProperty('GEMINI_KEY') ? 'set' : 'MISSING') + ', model ' + aiModel_()
           + (props.getProperty('AI_FALLBACK') ? ', fallback ' + props.getProperty('AI_FALLBACK') : ''));
  if (props.getProperty('GEMINI_KEY')) {
    var t = askModel_({
      q: 'Which of the following is an economic good?',
      opts: ['Air in the countryside', 'Sea water at a beach', 'Bottled water in a shop', 'Sunlight'],
      ans: 2, why: 'An economic good is scarce, so it commands a price.'
    }, 0);
    out.push(t ? 'AI OK: ' + t.slice(0, 120) : 'AI FAIL: ' + props.getProperty('AI_LAST_ERROR'));
  }
  var msg = out.join('\n');
  Logger.log(msg);
  return msg;
}

/* If AI_LAST_ERROR says the model is not found, run this: it lists the Gemini
   models your key can actually call. Put one of them in Script Property
   AI_MODEL (no code change needed). */
function listModels() {
  var key = PropertiesService.getScriptProperties().getProperty('GEMINI_KEY');
  if (!key) { Logger.log('No GEMINI_KEY script property.'); return; }
  var res = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key='
                              + encodeURIComponent(key), { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) { Logger.log(res.getResponseCode() + ' ' + res.getContentText().slice(0, 400)); return; }
  var names = (JSON.parse(res.getContentText()).models || []).filter(function (m) {
    return (m.supportedGenerationMethods || []).indexOf('generateContent') >= 0 && /flash/.test(m.name);
  }).map(function (m) { return m.name.replace('models/', ''); });
  Logger.log('Flash models this key can use:\n' + names.join('\n'));
}

/* ------------------------------------------------------------------ POST -- */
function doPost(e) {
  var body = {};
  try { body = JSON.parse(e.postData.contents); } catch (err) { body = {}; }

  try {
    // The one unauthenticated call: exchanging an ID token for a session.
    if (body.event === 'auth') {
      startSession_(body.idToken, body.nonce);
      return ContentService.createTextOutput('ok');
    }

    var sess = sessionOf_(body.t);
    if (!sess) return ContentService.createTextOutput('auth');   // silently ignored

    if (body.event === 'score')   upsertScore_(sess, body);
    if (body.event === 'mistake') recordMistake_(sess, body);
    if (body.event === 'note')    saveNote_(sess, body);
    if (body.event === 'cleared') addCleared_(sess, body.items);
    if (body.event === 'comment') addComment_(sess, body.key, body.text);
    if (body.event === 'like')    toggleLike_(sess, body.cid);

    logSheet_().appendRow([
      new Date(), body.event || '', sess.email, body.session || '',
      body.page || body.pageId || '', body.key || body.qid || '',
      body.correct === undefined ? '' : body.correct,
      body.event === 'score' ? '' : JSON.stringify(body).slice(0, 2000)
    ]);
  } catch (err) {
    // Never throw: a failed write must not break a student's drilling session.
    // But do leave a trace, or a broken deployment looks exactly like silence.
    authErr_('doPost ' + (body.event || '?') + ' threw: ' + err);
  }
  return ContentService.createTextOutput('ok');
}

/* One row per (uid, pageId). A lock keeps two tabs from racing each other. */
function upsertScore_(sess, b) {
  var pageId = String(b.pageId || 'unknown');
  var lock = LockService.getScriptLock();
  try { lock.waitLock(8000); } catch (err) { return; }
  try {
    var sh = scoreSheet_(), vals = sh.getDataRange().getValues(), row = -1;
    for (var i = 1; i < vals.length; i++) {
      if (String(vals[i][0]) === sess.uid && String(vals[i][3]) === pageId) { row = i + 1; break; }
    }
    var prof = profileOf_(sess);
    var rec = [
      sess.uid, sess.email, (prof && prof.nick) || String(b.nick || '').slice(0, 16),
      pageId, b.pageLabel || pageId,
      Number(b.cleared) || 0, Number(b.total) || 0,
      JSON.stringify(b.sections || {}).slice(0, 20000), new Date()
    ];
    if (row > 0) sh.getRange(row, 1, 1, rec.length).setValues([rec]);
    else sh.appendRow(rec);
  } finally { try { lock.releaseLock(); } catch (err) {} }
}

/* ------------------------------------------------------------------- GET -- */
function doGet(e) {
  var p = (e && e.parameter) || {};
  var cb = p.callback;
  var out;
  // A throw here used to reach the page as Google's HTML error page, which the
  // page cannot parse, so it just waited and then said "never confirmed".
  // Now the reason comes back as JSON and is kept in AUTH_LAST_ERROR.
  try { out = route_(p); }
  catch (err) {
    authErr_('doGet ' + Object.keys(p).join(',') + ' threw: ' + err);
    out = { error: 'server', detail: String(err).slice(0, 200) };
  }

  var json = JSON.stringify(out);
  if (cb && /^[A-Za-z_$][\w$]*$/.test(cb)) {
    return ContentService.createTextOutput(cb + '(' + json + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

/* Emails and API keys never leave in ?ping=1, which anyone can open. */
function redact_(s) {
  return String(s || '').replace(/[\w.+-]+@[\w.-]+/g, '<email>')
    .replace(/AIza[\w-]{20,}/g, '<key>').replace(/key=[^&\s"]+/g, 'key=<key>');
}

function route_(p) {
  var out;
  if (p.ping) {
    var props = PropertiesService.getScriptProperties();
    out = { ok: true, build: BUILD, client: CLIENT_ID.slice(0, 12) + '…',
            bank: (function () { try { return bankSheet_().getLastRow() - 1; } catch (e) { return -1; } })(),
            ai_key: !!props.getProperty('GEMINI_KEY'), ai_model: aiModel_(),
            auth_last_error: redact_(props.getProperty('AUTH_LAST_ERROR')),
            ai_last_error: redact_(props.getProperty('AI_LAST_ERROR')) };
  } else if (p.claim) {
    out = claimSession_(p.claim);

  } else if (p.lb === '1') {
    out = leaderboard_(p.uid || '');

  } else if (p.bank === '1' || p.mist === '1' || p.index === '1' || p.meta
             || p.prog === '1' || p.explain || p.cmt || p.setprof === '1'
             || p.prof === '1' || p.likes === '1' || p.top20 === '1' || p.q) {
    var sess = sessionOf_(p.t);
    if (!sess) {
      out = { error: 'sign in' };
    } else if (p.index === '1') {
      out = bankIndex_();
    } else if (p.mist === '1') {
      out = myMistakes_(sess);
    } else if (p.q) {
      out = serveOne_(String(p.q));
    } else if (p.top20 === '1') {
      out = top20_();
    } else if (p.prof === '1') {
      out = profileOf_(sess) || { error: 'none' };
    } else if (p.setprof === '1') {
      out = saveProfile_(sess, p.cls, p.num, p.nick);
    } else if (p.cmt) {
      out = comments_(String(p.cmt));
    } else if (p.likes === '1') {
      out = { liked: myLikes_(sess) };
    } else if (p.prog === '1') {
      out = { cleared: clearedOf_(sess) };
    } else if (p.explain) {
      var rk = String(p.explain) + ':' + String(p.chose || 0);
      out = explain_(sess, String(p.explain), Number(p.chose || 0));
      if (out && out.text) bumpStudents_(rk, sess);
    } else if (p.meta) {
      out = serveMeta_(String(p.meta));
    } else {
      out = { items: serveSection_(p.type || 'mcq', p.page || '', p.topic || '') };
    }

  } else {
    var status = String(configGet_('status', 'OPEN')).toUpperCase();
    out = { open: status !== 'CLOSED', closed_message: configGet_('closed_message', 'This drill is not open right now.') };
  }
  return out;
}

/*
 * Fair denominator: a student who never opens a section should not score 100%.
 * The class-wide universe for each page is the LARGEST total anyone has
 * reported for that page; not opening a page simply scores 0 for it.
 */
function leaderboard_(myUid) {
  var sh = scoreSheet_(), vals = sh.getDataRange().getValues();
  if (vals.length < 2) return { n: 0, top: [], you: null, total: 0 };

  var pageMax = {}, byUid = {};
  for (var i = 1; i < vals.length; i++) {
    var uid = String(vals[i][0]), nick = String(vals[i][2] || '');
    var pageId = String(vals[i][3]);
    var cleared = Number(vals[i][5]) || 0, total = Number(vals[i][6]) || 0;
    if (!uid || !pageId) continue;
    if (!pageMax[pageId] || total > pageMax[pageId]) pageMax[pageId] = total;
    if (!byUid[uid]) byUid[uid] = { nick: '', cleared: 0, updated: 0 };
    byUid[uid].cleared += cleared;
    if (nick) byUid[uid].nick = nick;
    var up = vals[i][8] ? new Date(vals[i][8]).getTime() : 0;
    if (up > byUid[uid].updated) byUid[uid].updated = up;
  }

  var universe = 0;
  for (var k in pageMax) universe += pageMax[k];
  if (!universe) return { n: 0, top: [], you: null, total: 0 };

  var rows = [];
  for (var u in byUid) {
    var r = byUid[u];
    var pc = Math.round((Math.min(r.cleared, universe) / universe) * 1000) / 10;
    rows.push({ uid: u, nick: r.nick, pct: pc, lvl: levelOf_(pc) });
  }
  rows.sort(function (a, b) { return b.pct - a.pct; });

  var you = null;
  for (var j = 0; j < rows.length; j++) {
    if (rows[j].uid === myUid) {
      var gap = j === 0 ? 0 : Math.round((rows[j - 1].pct - rows[j].pct) * 10) / 10;
      you = { rank: j + 1, pct: rows[j].pct, lvl: rows[j].lvl, gap: gap,
              gapQ: Math.ceil(gap / 100 * universe) };
      break;
    }
  }

  var top = rows.slice(0, TOP_N).map(function (r) {
    return { nick: r.nick, pct: r.pct, lvl: r.lvl };   // uid and email deliberately dropped
  });
  return { n: rows.length, total: universe, top: top, you: you };
}

/* ------------------------------------------------------------- utilities -- */

/* Clears expired sessions. Attach a daily time trigger if you like; harmless
   if never run, since sessionOf_ checks the expiry itself. */
function sweepSessions() {
  var sh = sessionSheet_(), v = sh.getDataRange().getValues(), now = Date.now();
  for (var i = v.length - 1; i >= 1; i--) {
    if (new Date(v[i][4]).getTime() < now) sh.deleteRow(i + 1);
  }
}

/* Wipes the leaderboard between terms. Log, Mistakes and Notes are left
   alone on purpose — the mistake record is not something a reset erases. */
function resetLeaderboard() {
  var sh = scoreSheet_();
  if (sh.getLastRow() > 1) sh.deleteRows(2, sh.getLastRow() - 1);
}
