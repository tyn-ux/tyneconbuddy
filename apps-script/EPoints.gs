/* ============================================================================
 * E-POINTS, STORE, CHARACTERS AND CLASSES  (third file in the Apps Script project)
 *
 * Students earn E-points (E) for effort and spend them on a cartoon character:
 * animals, outfits, Hong Kong backgrounds and effects. Classmates see each
 * other's characters with nickname and level, and nothing else.
 *
 * WHO DECIDES THE POINTS
 *   The server. The page only says "I answered question X" or "I saved this
 *   album entry"; every award is worked out here against the ERules tab and
 *   the student's own record for today. A student who edits their browser can
 *   at most do what the rules already allow (each rule has its own daily
 *   limit, and most are once per question), never add points directly.
 *
 * TABS (each is made by itself the first time it is needed)
 *   Wallet   one row per student: balance, what they own, what they wear, and
 *            the day's counters. The server's working copy; do not edit.
 *   ELedger  every point ever given or spent, one line each. Edit freely, then
 *            run Recount from the menu so balances follow.
 *   ERules   points and daily limit per activity. per_day 0 = no daily limit.
 *            on = no switches an activity off. Read live, no redeploy.
 *   EStore   price, on sale, and names of every item. Read live.
 *   Classes  class, status (open / archived). Students pick from open classes.
 *   EGive    type class, number, E (negative takes away), reason; it is applied
 *            from the menu or the next time that student opens the site.
 *   Students gains a "status" column: blank, hidden or removed.
 *
 * THE MENU
 *   Opening the Sheet adds a "tyneconbuddy" menu (onOpen below) for opening
 *   and archiving classes, hiding or removing a student, and giving E. There
 *   is no admin web route: everything here needs the Sheet itself.
 *
 * Wiring in Code.gs: doPost calls epAnswer_ / epBuy_ / epWear_, route_ serves
 * ?wallet=1, ?classes=1 and ?cpage=, saveLqAlbum_ and addComment_ call
 * epAlbumPoints_ and epComment_, lqMark_ (LongQMark.gs) calls epLqMarked_.
 * ========================================================================== */
var EP_TZ = 'Asia/Hong_Kong';
var EP_RECENT = 12;          // ledger lines kept on the Wallet row for the page
var EP_WRONG_MAX = 800;      // open mistakes remembered per student for the fix bonus
var EP_FIX_GAP = 5;          // other questions in between, same as the page
var EP_FIX_MS = 10 * 60 * 1000;

/* ------------------------------------------------------------------ tabs -- */
function walletSheet_() { return sheet_('Wallet',  ['uid','nick','class','balance','earned','look','owned','state','updated']); }
function ledgerSheet_() { return sheet_('ELedger', ['ts','uid','class','nick','action','E','ref','by','note']); }
function eGiveSheet_()  { return sheet_('EGive',   ['class','num','E','reason','status']); }

function classSheet_() {
  var fresh = !ss_().getSheetByName('Classes');
  var sh = sheet_('Classes', ['class','status','opened','note']);
  if (fresh) {
    // First run: every class students already typed in becomes an open class,
    // so nobody is locked out the day this goes live.
    var seen = {}, rows = [];
    studentRows_().forEach(function (s) {
      if (s.cls && !seen[s.cls]) { seen[s.cls] = 1; rows.push([s.cls, 'open', new Date(), 'from existing students']); }
    });
    rows.sort(function (a, b) { return a[0] < b[0] ? -1 : 1; });
    if (rows.length) sh.getRange(2, 1, rows.length, 4).setValues(rows);
    ensureStudentStatus_();
  }
  return sh;
}

var EP_RULES_DEFAULT = [
  ['mc_answer',   1, 40, 'yes', 'Answer an MC question (first time today)'],
  ['mc_correct',  1, 40, 'yes', '...and it was correct'],
  ['mc_fix',      3,  0, 'yes', 'Fix a wrong MC later (after 5 other questions or 10 minutes), once per question'],
  ['mc_ten',      5,  4, 'yes', 'Every 10 MC questions answered in a day'],
  ['lq_submit',   8,  4, 'yes', 'Send a Long Q answer for AI marking (40+ words, or a photo)'],
  ['lq_better',  10,  0, 'yes', 'Beat your last AI score on a Long Q (once per question a day)'],
  ['album_point', 2, 10, 'yes', 'Mark a missing marking point into the Correction Album'],
  ['album_retry', 4,  0, 'yes', 'Get an album MC right a day or more after getting it wrong (once per question)'],
  ['comment',     3,  3, 'yes', 'Comment on a question (15+ characters). Taken back if the teacher hides it'],
  ['verified',   10,  0, 'yes', 'Teacher ticks your comment as verified'],
  ['week5',      20,  0, 'yes', 'Practise on 5 different days in one week (Mon to Sun)']
];
function eRulesSheet_() {
  var sh = sheet_('ERules', ['action','E','per_day','on','what it is for']);
  if (sh.getLastRow() < 2) sh.getRange(2, 1, EP_RULES_DEFAULT.length, 5).setValues(EP_RULES_DEFAULT);
  return sh;
}

/* id must match a drawing in app.html (EP_ART). Price 0 = free for everyone. */
var EP_STORE_DEFAULT = [
  ['boy',       'character',  0,   'yes', 'Teen boy',                  '少年'],
  ['girl',      'character',  0,   'yes', 'Teen girl',                 '少女'],
  ['cat',       'character',  450, 'yes', 'Ginger cat',                '橘貓'],
  ['shiba',     'character',  500, 'yes', 'Shiba',                     '柴犬'],
  ['penguin',   'character',  600, 'yes', 'Penguin',                   '企鵝'],
  ['panda',     'character',  750, 'yes', 'Panda',                     '熊貓'],
  ['dolphin',   'character',  900, 'yes', 'Pink dolphin',              '中華白海豚'],
  ['uniform',   'outfit',     0,   'yes', 'School uniform',            '校服'],
  ['hoodie',    'outfit',     120, 'yes', 'Red hoodie',                '紅色衛衣'],
  ['raincoat',  'outfit',     150, 'yes', 'Rainstorm raincoat',        '黃雨褸'],
  ['varsity',   'outfit',     220, 'yes', 'Varsity jacket',            '棒球褸'],
  ['gown',      'outfit',     350, 'yes', 'Graduation gown',           '畢業袍'],
  ['classroom', 'background', 0,   'yes', 'Classroom',                 '課室'],
  ['library',   'background', 150, 'yes', 'Library',                   '圖書館'],
  ['mtr',       'background', 200, 'yes', 'MTR platform',              '港鐵月台'],
  ['tram',      'background', 250, 'yes', 'Ding ding tram',            '叮叮'],
  ['harbour',   'background', 350, 'yes', 'Victoria Harbour at night', '維港夜景'],
  ['none',      'effect',     0,   'yes', 'No effect',                 '無'],
  ['sparkle',   'effect',     250, 'yes', 'Sparkles',                  '閃閃'],
  ['coins',     'effect',     300, 'yes', 'Floating E coins',          'E 幣飄飄'],
  ['confetti',  'effect',     400, 'yes', 'Confetti',                  '彩紙'],
  ['curves',    'effect',     500, 'yes', 'Supply & demand halo',      '供求光環'],
  ['aura',      'effect',     600, 'yes', 'Golden aura',               '金光'],
  // added 2026-10-13: 10 + 10 more per category
  ['frog',          'character', 350,  'yes', 'Frog',                    '青蛙'],
  ['hamster',       'character', 400,  'yes', 'Hamster',                 '倉鼠'],
  ['rabbit',        'character', 550,  'yes', 'Rabbit',                  '兔仔'],
  ['corgi',         'character', 550,  'yes', 'Corgi',                   '哥基'],
  ['koala',         'character', 600,  'yes', 'Koala',                   '樹熊'],
  ['fox',           'character', 650,  'yes', 'Fox',                     '狐狸'],
  ['otter',         'character', 650,  'yes', 'Otter',                   '水獺'],
  ['owl',           'character', 700,  'yes', 'Owl',                     '貓頭鷹'],
  ['alpaca',        'character', 700,  'yes', 'Alpaca',                  '羊駝'],
  ['cow',           'character', 800,  'yes', 'Lantau cow',              '大嶼山牛'],
  ['redpanda',      'character', 800,  'yes', 'Red panda',               '小熊貓'],
  ['tiger',         'character', 950,  'yes', 'Tiger',                   '老虎'],
  ['dragon',        'character', 1200, 'yes', 'Little dragon',           '小龍'],
  ['pe',            'outfit',    100,  'yes', 'PE jersey',               '運動服'],
  ['cardigan',      'outfit',    140,  'yes', 'Cardigan',                '冷衫'],
  ['basketball',    'outfit',    160,  'yes', 'Basketball jersey',       '籃球衣'],
  ['chef',          'outfit',    180,  'yes', 'Chef',                    '廚師服'],
  ['puffer',        'outfit',    200,  'yes', 'Puffer jacket',           '羽絨'],
  ['labcoat',       'outfit',    240,  'yes', 'Lab coat',                '實驗袍'],
  ['dragonboat',    'outfit',    260,  'yes', 'Dragon boat vest',        '龍舟背心'],
  ['kungfu',        'outfit',    300,  'yes', 'Kung fu suit',            '功夫服'],
  ['trench',        'outfit',    320,  'yes', 'Detective coat',          '偵探褸'],
  ['cheongsam',     'outfit',    380,  'yes', 'Cheongsam',               '長衫'],
  ['suit',          'outfit',    400,  'yes', 'Business suit',           '西裝'],
  ['pilot',         'outfit',    420,  'yes', 'Pilot',                   '機師'],
  ['firefighter',   'outfit',    440,  'yes', 'Firefighter',             '消防員'],
  ['cape',          'outfit',    500,  'yes', 'Hero cape',               '英雄披風'],
  ['astronaut',     'outfit',    600,  'yes', 'Astronaut',               '太空人'],
  ['chachaanteng',  'background', 180,  'yes', 'Cha chaan teng',          '茶餐廳'],
  ['wetmarket',     'background', 200,  'yes', 'Wet market',              '街市'],
  ['saikung',       'background', 220,  'yes', 'Sai Kung beach',          '西貢海灘'],
  ['dimsum',        'background', 260,  'yes', 'Dim sum restaurant',      '酒樓飲茶'],
  ['estate',        'background', 280,  'yes', 'Rainbow estate',          '彩虹邨'],
  ['ferry',         'background', 300,  'yes', 'Star Ferry',              '天星小輪'],
  ['taio',          'background', 300,  'yes', 'Tai O',                   '大澳棚屋'],
  ['templestreet',  'background', 320,  'yes', 'Temple Street',           '廟街夜市'],
  ['bigbuddha',     'background', 360,  'yes', 'Big Buddha',              '天壇大佛'],
  ['peak',          'background', 380,  'yes', 'The Peak at night',       '山頂夜景'],
  ['lionrock',      'background', 400,  'yes', 'Lion Rock',               '獅子山'],
  ['containerport', 'background', 420,  'yes', 'Kwai Chung port',         '葵涌貨櫃碼頭'],
  ['mongkok',       'background', 450,  'yes', 'Mong Kok neon',           '旺角霓虹'],
  ['tradingfloor',  'background', 480,  'yes', 'Trading floor',           '交易大堂'],
  ['galaxy',        'background', 600,  'yes', 'Galaxy',                  '銀河'],
  ['rain',          'effect',    180,  'yes', 'Rain',                    '落雨'],
  ['hearts',        'effect',    200,  'yes', 'Hearts',                  '心心'],
  ['bubbles',       'effect',    220,  'yes', 'Bubbles',                 '泡泡'],
  ['snow',          'effect',    240,  'yes', 'Snow',                    '雪花'],
  ['sakura',        'effect',    260,  'yes', 'Sakura',                  '櫻花'],
  ['notes',         'effect',    280,  'yes', 'Music notes',             '音符'],
  ['butterflies',   'effect',    300,  'yes', 'Butterflies',             '蝴蝶'],
  ['rainbow',       'effect',    380,  'yes', 'Rainbow',                 '彩虹'],
  ['lightning',     'effect',    450,  'yes', 'Lightning',               '閃電'],
  ['banknotes',     'effect',    550,  'yes', 'Money rain',              '鈔票雨'],
  ['orbit',         'effect',    620,  'yes', 'Orbit',                   '星球環繞'],
  ['stocks',        'effect',    650,  'yes', 'Stock rally',             '股市升'],
  ['flames',        'effect',    680,  'yes', 'Flames',                  '火焰'],
  ['fireworks',     'effect',    700,  'yes', 'Fireworks',               '煙花'],
  ['dshift',        'effect',    750,  'yes', 'Demand shift',            '需求曲線右移']
];
var EP_KIND = { character: 'base', outfit: 'outfit', background: 'bg', effect: 'fx' };
function eStoreSheet_() {
  var sh = sheet_('EStore', ['item','kind','price','on sale','name','name (zh)']);
  if (sh.getLastRow() < 2) sh.getRange(2, 1, EP_STORE_DEFAULT.length, 6).setValues(EP_STORE_DEFAULT);
  return sh;
}
/* Adds store items this version knows about but the EStore tab does not have
   yet, at the bottom. Rows already there (and any prices you changed) are
   left alone. Runs from "Set up E-point tabs"; to stop selling an item, set
   "on sale" to no rather than deleting its row, or the next setup adds it back. */
function epAddNewItems_() {
  var sh = eStoreSheet_(), v = sh.getDataRange().getValues(), have = {};
  for (var i = 1; i < v.length; i++) have[String(v[i][0]).trim()] = true;
  var add = EP_STORE_DEFAULT.filter(function (r) { return !have[r[0]]; });
  if (add.length) sh.getRange(sh.getLastRow() + 1, 1, add.length, 6).setValues(add);
  return add.length;
}

/* ------------------------------------------------------------ reading ---- */
function yes_(v) { v = String(v).trim().toLowerCase(); return v === 'yes' || v === 'y' || v === 'true' || v === '1'; }

function epRules_() {
  var c = CacheService.getScriptCache(), hit = c.get('ep_rules');
  if (hit) { try { return JSON.parse(hit); } catch (e) {} }
  var v = eRulesSheet_().getDataRange().getValues(), out = {};
  for (var i = 1; i < v.length; i++) {
    var a = String(v[i][0]).trim();
    if (!a) continue;
    out[a] = { p: Math.round(Number(v[i][1]) || 0), lim: Math.max(0, Math.floor(Number(v[i][2]) || 0)),
               on: yes_(v[i][3]), what: String(v[i][4] || '') };
  }
  c.put('ep_rules', JSON.stringify(out), 120);
  return out;
}

function epStore_() {
  var c = CacheService.getScriptCache(), hit = c.get('ep_store');
  if (hit) { try { return JSON.parse(hit); } catch (e) {} }
  var v = eStoreSheet_().getDataRange().getValues(), out = [];
  for (var i = 1; i < v.length; i++) {
    var id = String(v[i][0]).trim(), kind = EP_KIND[String(v[i][1]).trim().toLowerCase()];
    if (!id || !kind) continue;
    out.push({ id: id, k: kind, p: Math.max(0, Math.round(Number(v[i][2]) || 0)), on: yes_(v[i][3]),
               n: String(v[i][4] || id), zh: String(v[i][5] || '') });
  }
  c.put('ep_store', JSON.stringify(out), 120);
  return out;
}

/* Students with their status (blank / hidden / removed). Status is column 8;
   older Sheets have no header there until ensureStudentStatus_ runs. */
function studentRows_() {
  var v = studentSheet_().getDataRange().getValues(), out = [];
  for (var i = 1; i < v.length; i++) {
    out.push({ row: i + 1, uid: String(v[i][0]), cls: String(v[i][2] || '').toUpperCase(), num: String(v[i][3] || ''),
               nick: String(v[i][4] || ''), status: String(v[i][7] || '').trim().toLowerCase() });
  }
  return out;
}
function ensureStudentStatus_() {
  var sh = studentSheet_();
  if (String(sh.getRange(1, 8).getValue()).trim() !== 'status') sh.getRange(1, 8).setValue('status');
}

/* uids that must not appear on class pages or the leaderboard. */
function hiddenUids_() {
  var c = CacheService.getScriptCache(), hit = c.get('ep_hidden');
  if (hit) { try { return JSON.parse(hit); } catch (e) {} }
  var out = {};
  studentRows_().forEach(function (s) { if (s.status === 'hidden' || s.status === 'removed') out[s.uid] = 1; });
  c.put('ep_hidden', JSON.stringify(out), 60);
  return out;
}

/* Classes: {cls: 'open'|'archived'}. Empty when the tab has no rows, which
   the page reads as "type your class" (the old behaviour). */
function classMap_() {
  var c = CacheService.getScriptCache(), hit = c.get('ep_classes');
  if (hit) { try { return JSON.parse(hit); } catch (e) {} }
  var v = classSheet_().getDataRange().getValues(), out = {};
  for (var i = 1; i < v.length; i++) {
    var k = String(v[i][0]).trim().toUpperCase();
    if (k) out[k] = String(v[i][1]).trim().toLowerCase() === 'archived' ? 'archived' : 'open';
  }
  c.put('ep_classes', JSON.stringify(out), 60);
  return out;
}
function epFlushCache_() {
  CacheService.getScriptCache().removeAll(['ep_rules', 'ep_store', 'ep_hidden', 'ep_classes', 'ep_pct']);
}

/* Cleared % per uid, the same sum the leaderboard uses, for the level badge. */
function pctMap_() {
  var c = CacheService.getScriptCache(), hit = c.get('ep_pct');
  if (hit) { try { return JSON.parse(hit); } catch (e) {} }
  var v = scoreSheet_().getDataRange().getValues(), pageMax = {}, byUid = {}, out = {};
  for (var i = 1; i < v.length; i++) {
    var uid = String(v[i][0]), pg = String(v[i][3]);
    if (!uid || !pg) continue;
    var tot = Number(v[i][6]) || 0;
    if (!pageMax[pg] || tot > pageMax[pg]) pageMax[pg] = tot;
    byUid[uid] = (byUid[uid] || 0) + (Number(v[i][5]) || 0);
  }
  var universe = 0; for (var k in pageMax) universe += pageMax[k];
  for (var u in byUid) out[u] = universe ? Math.round(Math.min(byUid[u], universe) / universe * 1000) / 10 : 0;
  c.put('ep_pct', JSON.stringify(out), 120);
  return out;
}

/* --------------------------------------------------------------- dates --- */
function epDay_(t) { return Utilities.formatDate(t ? new Date(t) : new Date(), EP_TZ, 'yyyy-MM-dd'); }
function epWeek_() {
  // Monday of this week, Hong Kong time.
  var d = new Date(epDay_() + 'T00:00:00Z'), dow = (d.getUTCDay() + 6) % 7;
  return Utilities.formatDate(new Date(d.getTime() - dow * 86400000), 'UTC', 'yyyy-MM-dd');
}

/* ------------------------------------------------------------- wallet ---- *
 * withWallet_ is the one way points change. It takes the script lock, loads
 * (or makes) the student's Wallet row, lets fn add awards, then writes the
 * row and appends one ELedger line per award. fn returns an array of awards
 * {a: action, p: points, ref: what it was for, by: 'auto'|'teacher'|'store'}.
 * ------------------------------------------------------------------------ */
function withWallet_(uid, fn) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(10000); } catch (e) { return { error: 'busy' }; }
  try {
    var sh = walletSheet_(), v = sh.getDataRange().getValues(), row = -1;
    for (var i = 1; i < v.length; i++) if (String(v[i][0]) === uid) { row = i + 1; break; }
    var w;
    if (row > 0) {
      var r = v[row - 1];
      w = { uid: uid, nick: String(r[1] || ''), cls: String(r[2] || ''), bal: Number(r[3]) || 0, earned: Number(r[4]) || 0,
            look: pj_(r[5], null), owned: pj_(r[6], []), st: pj_(r[7], {}) };
    } else {
      var me = null;
      studentRows_().some(function (s) { if (s.uid === uid) { me = s; return true; } return false; });
      w = { uid: uid, nick: me ? me.nick : '', cls: me ? me.cls : '', bal: 0, earned: 0, look: null, owned: [], st: {} };
    }
    epRoll_(w);
    var aw = fn(w) || [];
    aw.forEach(function (x) {
      w.bal += x.p;
      if (x.p > 0) w.earned += x.p;
      w.st.recent.unshift([Date.now(), x.a, x.p, String(x.ref || '').slice(0, 40)]);
    });
    w.st.recent = w.st.recent.slice(0, EP_RECENT);
    var wrongKeys = Object.keys(w.st.wrong);
    if (wrongKeys.length > EP_WRONG_MAX) {
      wrongKeys.sort(function (a, b) { return w.st.wrong[a][1] - w.st.wrong[b][1]; })
        .slice(0, wrongKeys.length - EP_WRONG_MAX).forEach(function (k) { delete w.st.wrong[k]; });
    }
    var rec = [uid, w.nick, w.cls, w.bal, w.earned, w.look ? JSON.stringify(w.look) : '',
               JSON.stringify(w.owned), JSON.stringify(w.st).slice(0, 49000), new Date()];
    if (row > 0) sh.getRange(row, 1, 1, rec.length).setValues([rec]);
    else sh.appendRow(rec);
    if (aw.length) {
      var rules = epRules_(), led = ledgerSheet_();
      var lines = aw.map(function (x) {
        return [new Date(), uid, w.cls, w.nick, x.a, x.p, cellText_(String(x.ref || '').slice(0, 120)), x.by || 'auto',
                cellText_(x.note || (rules[x.a] ? rules[x.a].what : ''))];
      });
      led.getRange(led.getLastRow() + 1, 1, lines.length, lines[0].length).setValues(lines);
    }
    return { w: w, aw: aw };
  } finally { try { lock.releaseLock(); } catch (e) {} }
}

function pj_(s, d) { if (!s) return d; try { var x = JSON.parse(s); return x == null ? d : x; } catch (e) { return d; } }

/* New day: the per-day counters start again. The week counts practice days. */
function epRoll_(w) {
  var st = w.st, today = epDay_(), wk = epWeek_();
  st.c = st.c || {}; st.r = st.r || {}; st.once = st.once || {}; st.wrong = st.wrong || {};
  st.lqb = st.lqb || {}; st.recent = st.recent || []; st.tot = st.tot || 0;
  if (st.d !== today) { st.d = today; st.c = {}; st.r = {}; st.n = 0; }
  if (!st.wk || st.wk.w !== wk) st.wk = { w: wk, days: [] };
}

/* One award, if the rule is on and today's limit has room. */
function give_(w, aw, action, ref) {
  var r = epRules_()[action];
  if (!r || !r.on || !r.p) return false;
  var used = w.st.c[action] || 0;
  if (r.lim && used >= r.lim) return false;
  w.st.c[action] = used + 1;
  aw.push({ a: action, p: r.p, ref: ref });
  return true;
}

/* Called on every real practice action: marks the day, pays the 5-day bonus. */
function active_(w, aw) {
  var today = epDay_(), wk = w.st.wk;
  if (wk.days.indexOf(today) < 0) wk.days.push(today);
  if (wk.days.length >= 5 && !w.st.once['wk:' + wk.w] && give_(w, aw, 'week5', 'week of ' + wk.w)) w.st.once['wk:' + wk.w] = 1;
}

/* ------------------------------------------------------- earning hooks --- */

/* MC answers from drill, warm-up, an album retry, or a whole exam at once.
   b = {key, ok, page} or {items:[{key, ok}], page}. Returns {e:[awards], bal}. */
var EP_BATCH_MAX = 40;
function epAnswer_(sess, b) {
  var page = String(b.page || '');
  var list = Array.isArray(b.items) ? b.items.slice(0, EP_BATCH_MAX) : [b];
  list = list.map(function (x) {
    x = x || {};
    return { key: String(x.key || '').slice(0, 80), ok: x.ok === true || x.ok === 1 || x.ok === '1' || x.correct === true };
  }).filter(function (x) { return x.key; });
  if (!list.length) return { error: 'no key' };
  var res = withWallet_(sess.uid, function (w) {
    var aw = [];
    list.forEach(function (x) { epOne_(sess, w, aw, x.key, x.ok, page); });
    return aw;
  });
  if (res.error) return res;
  return { ok: true, e: brief_(res.aw), bal: res.w.bal };
}

function epOne_(sess, w, aw, key, ok, page) {
  var st = w.st, now = Date.now();
  st.tot++;
  if (!st.r['a:' + key]) {                           // first answer to this question today
    st.r['a:' + key] = 1; st.n = (st.n || 0) + 1;
    give_(w, aw, 'mc_answer', key);
    if (ok) give_(w, aw, 'mc_correct', key);
    if (st.n % 10 === 0) give_(w, aw, 'mc_ten', st.n + ' questions today');
    active_(w, aw);
  }
  if (!ok) {
    var old = st.wrong[key];
    st.wrong[key] = [old ? old[0] : now, now, st.tot];   // [first wrong, last wrong, answer count then]
    return;
  }
  var wr = st.wrong[key];
  if (!wr && page === 'album') wr = oldMistake_(sess.uid, key);
  if (!wr) return;
  var gapOk = (wr[2] >= 0 && st.tot - wr[2] >= EP_FIX_GAP) || now - wr[1] >= EP_FIX_MS;
  if (gapOk && !st.once['f:' + key] && give_(w, aw, 'mc_fix', key)) st.once['f:' + key] = 1;
  if (page === 'album' && epDay_(wr[0]) < epDay_() && !st.once['ar:' + key] && give_(w, aw, 'album_retry', key)) st.once['ar:' + key] = 1;
  if (gapOk) delete st.wrong[key];
}

/* Mistakes made before E-points existed: look them up once, for album retries. */
function oldMistake_(uid, key) {
  var sh = mistakeSheet_(), hits = sh.getRange(1, 3, sh.getLastRow(), 1).createTextFinder(key).matchEntireCell(true).findAll();
  var first = 0, last = 0;
  hits.forEach(function (c) {
    var r = sh.getRange(c.getRow(), 1, 1, 2).getValues()[0];
    if (String(r[1]) !== uid) return;
    var t = new Date(r[0]).getTime();
    if (!first || t < first) first = t;
    if (t > last) last = t;
  });
  return first ? [first, last, -1] : null;
}

/* Long Q marked by the AI (LongQMark.gs). sum = AI mark this time. */
function epLqMarked_(sess, key, sum, words, photo) {
  var res = withWallet_(sess.uid, function (w) {
    var st = w.st, aw = [];
    if (photo || words >= 40) { give_(w, aw, 'lq_submit', key); active_(w, aw); }
    var prev = st.lqb[key];
    if (prev != null && sum > prev && !st.r['lb:' + key]) { st.r['lb:' + key] = 1; give_(w, aw, 'lq_better', key); }
    if (prev == null || sum > prev) st.lqb[key] = sum;
    return aw;
  });
  return res.error ? null : { e: brief_(res.aw), bal: res.w.bal };
}

/* Correction Album Long Q save: +E for each marking point newly put in the
   album (missing or already fixed). Each point pays once, ever. */
function epAlbumPoints_(sess, key, missing, fixed) {
  var ids = {};
  [missing, fixed].forEach(function (a) { (a || []).forEach(function (p) { if (Array.isArray(p) && p[0]) ids[String(p[0]).slice(0, 12)] = 1; }); });
  if (!Object.keys(ids).length) return null;
  var res = withWallet_(sess.uid, function (w) {
    var aw = [];
    Object.keys(ids).forEach(function (id) {
      var k = 'ap:' + key + ':' + id;
      if (!w.st.once[k] && give_(w, aw, 'album_point', key + ' ' + id)) w.st.once[k] = 1;
    });
    return aw;
  });
  return res.error ? null : { e: brief_(res.aw), bal: res.w.bal };
}

/* A comment on a question (not the cheer wall). */
function epComment_(sess, cid, key, text) {
  if (key === '__cheer' || String(text || '').trim().length < 15) return null;
  var res = withWallet_(sess.uid, function (w) {
    var aw = [];
    if (give_(w, aw, 'comment', key)) { aw[aw.length - 1].ref = key + ' #' + cid; w.st.once['cm:' + cid] = 1; }
    return aw;
  });
  return res.error ? null : { e: brief_(res.aw), bal: res.w.bal };
}

/* Teacher ticks and hides happen in the Sheet, so they are settled when the
   student next opens the site: +verified for a new tick, and the comment's
   points back out if it was hidden. */
function epSyncComments_(w) {
  var v = commentSheet_().getDataRange().getValues(), aw = [], r = epRules_();
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][2]) !== w.uid) continue;
    var cid = String(v[i][0]), key = String(v[i][1]);
    var hidden = !!String(v[i][10]).trim(), verified = !!String(v[i][9]).trim();
    if (verified && !hidden && !w.st.once['ver:' + cid] && r.verified && r.verified.on && r.verified.p) {
      w.st.once['ver:' + cid] = 1;
      aw.push({ a: 'verified', p: r.verified.p, ref: key + ' #' + cid, by: 'teacher' });
    }
    if (hidden && w.st.once['cm:' + cid] && !w.st.once['hid:' + cid]) {
      w.st.once['hid:' + cid] = 1;
      aw.push({ a: 'comment_hidden', p: -((r.comment && r.comment.p) || 0), ref: key + ' #' + cid, by: 'teacher',
                note: 'Comment hidden by the teacher, its points taken back' });
    }
  }
  return aw;
}

/* EGive rows with an empty status: applied for one student (onlyUid) or all. */
function applyGifts_(onlyUid) {
  var sh = eGiveSheet_(), v = sh.getDataRange().getValues();
  if (v.length < 2) return 0;
  var seat = {};
  studentRows_().forEach(function (s) { if (s.status !== 'removed') seat[s.cls + '-' + Number(s.num)] = s.uid; });
  var done = 0;
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][4]).trim()) continue;
    var cls = String(v[i][0]).trim().toUpperCase(), num = Number(v[i][1]), e = Math.round(Number(v[i][2]) || 0);
    var uid = seat[cls + '-' + num];
    if (!uid) { if (!onlyUid) sh.getRange(i + 1, 5).setValue('no student at ' + cls + '-' + v[i][1]); continue; }
    if (onlyUid && uid !== onlyUid) continue;
    if (!e) { sh.getRange(i + 1, 5).setValue('skipped: E is 0'); continue; }
    var reason = String(v[i][3] || '').slice(0, 120);
    var res = withWallet_(uid, function () {
      return [{ a: 'teacher', p: e, ref: reason, by: 'teacher', note: 'Given by the teacher' }];
    });
    if (res.error) continue;
    sh.getRange(i + 1, 5).setValue('done ' + epDay_());
    done++;
  }
  return done;
}

function brief_(aw) { return (aw || []).map(function (x) { return { a: x.a, p: x.p }; }); }

/* ----------------------------------------------------------- the page ---- */

/* GET ?wallet=1 — everything the store page needs. */
function epWallet_(sess) {
  try { applyGifts_(sess.uid); } catch (e) {}
  var res = withWallet_(sess.uid, function (w) {
    var me = null;
    studentRows_().some(function (s) { if (s.uid === sess.uid) { me = s; return true; } return false; });
    if (me) { w.nick = me.nick; w.cls = me.cls; }
    return epSyncComments_(w);
  });
  if (res.error) return res;
  var w = res.w, rules = epRules_(), list = [];
  EP_RULES_DEFAULT.forEach(function (d) {          // keep the table in the default order
    var r = rules[d[0]]; if (!r || !r.on) return;
    list.push({ a: d[0], p: r.p, lim: r.lim, what: r.what, today: w.st.c[d[0]] || 0 });
  });
  return { bal: w.bal, earned: w.earned, look: w.look, owned: w.owned, store: epStore_(), rules: list,
           recent: w.st.recent, e: brief_(res.aw) };
}

/* POST {event:'ebuy', item} */
function epBuy_(sess, b) {
  var id = String(b.item || ''), it = null;
  epStore_().some(function (x) { if (x.id === id) { it = x; return true; } return false; });
  if (!it) return { error: 'unknown' };
  if (!it.on) return { error: 'off' };
  var err = '';
  var res = withWallet_(sess.uid, function (w) {
    if (!it.p || w.owned.indexOf(id) >= 0) { err = 'owned'; return []; }
    if (w.bal < it.p) { err = 'poor'; return []; }
    w.owned.push(id);
    return [{ a: 'buy', p: -it.p, ref: id, by: 'store', note: 'Bought ' + it.n }];
  });
  if (res.error) return res;
  if (err) return { error: err, bal: res.w.bal };
  return { ok: true, bal: res.w.bal, owned: res.w.owned };
}

/* POST {event:'ewear', look:{base,outfit,bg,fx}}: only owned or free items. */
function epWear_(sess, b) {
  var want = b.look || {}, store = {}, look = {};
  epStore_().forEach(function (x) { store[x.id] = x; });
  var res = withWallet_(sess.uid, function (w) {
    ['base', 'outfit', 'bg', 'fx'].forEach(function (k) {
      var id = String(want[k] || ''), it = store[id];
      if (it && it.k === k && (it.p === 0 || w.owned.indexOf(id) >= 0)) look[k] = id;
    });
    if (!look.base) return [];
    look.outfit = look.outfit || 'uniform'; look.bg = look.bg || 'classroom'; look.fx = look.fx || 'none';
    w.look = look;
    return [];
  });
  if (res.error) return res;
  CacheService.getScriptCache().remove('ep_cp_' + res.w.cls);
  return { ok: true, look: res.w.look };
}

/* GET ?classes=1 — open classes, for the seat form and the class switcher. */
function epClasses_() {
  var m = classMap_(), out = [];
  for (var k in m) if (m[k] === 'open') out.push(k);
  out.sort();
  return { classes: out };
}

/* GET ?cpage=5A — that class's characters: nickname, character, level.
   Hidden and removed students are left out; no email, number or score. */
function epClassPage_(cls) {
  cls = String(cls || '').trim().toUpperCase();
  if (classMap_()[cls] !== 'open') return { error: 'closed', cls: cls };
  var c = CacheService.getScriptCache(), hit = c.get('ep_cp_' + cls);
  if (hit) { try { return JSON.parse(hit); } catch (e) {} }
  var looks = {}, wv = walletSheet_().getDataRange().getValues();
  for (var i = 1; i < wv.length; i++) looks[String(wv[i][0])] = pj_(wv[i][5], null);
  var pct = pctMap_(), items = [];
  studentRows_().forEach(function (s) {
    if (s.cls !== cls || s.status === 'hidden' || s.status === 'removed') return;
    items.push({ nick: s.nick || '—', look: looks[s.uid] || null, lv: levelOf_(pct[s.uid] || 0), n: Number(s.num) || 0 });
  });
  items.sort(function (a, b) { return a.n - b.n; });
  items.forEach(function (x) { delete x.n; });       // the order is by number; the number itself stays private
  var out = { cls: cls, items: items };
  c.put('ep_cp_' + cls, JSON.stringify(out), 60);
  return out;
}

/* =============================================================== MENU ==== */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('tyneconbuddy')
    .addItem('Open a new class…', 'epMenuOpenClass')
    .addItem('Archive a class…', 'epMenuArchiveClass')
    .addItem('Restore an archived class…', 'epMenuRestoreClass')
    .addSeparator()
    .addItem('Hide or unhide a student…', 'epMenuHide')
    .addItem('Remove a student from their class…', 'epMenuRemove')
    .addSeparator()
    .addItem('Give or take E-points…', 'epMenuGive')
    .addItem('Apply E-point gifts (EGive tab)', 'epMenuApplyGifts')
    .addItem('Recount balances from ELedger', 'epMenuRecount')
    .addSeparator()
    .addItem('Set up E-point tabs', 'epSetup')
    .addItem('Build Dashboard', 'buildDashboard')
    .addToUi();
}

function ask_(title, hint) {
  var ui = SpreadsheetApp.getUi(), r = ui.prompt(title, hint, ui.ButtonSet.OK_CANCEL);
  return r.getSelectedButton() === ui.Button.OK ? String(r.getResponseText() || '').trim() : '';
}
function tell_(s) { SpreadsheetApp.getUi().alert(s); }

/* Makes every new tab and fills in defaults. Safe to run again: it never
   overwrites a tab that already has rows. */
function epSetup() {
  classSheet_(); eRulesSheet_(); eStoreSheet_(); eGiveSheet_(); walletSheet_(); ledgerSheet_();
  ensureStudentStatus_();
  var added = epAddNewItems_();
  epFlushCache_();
  var msg = 'E-point tabs are ready: Classes, ERules, EStore, EGive, Wallet, ELedger.' + (added ? ' Added ' + added + ' new store items to EStore.' : '');
  try { tell_(msg); } catch (e) { Logger.log(msg); }
}

function setClassStatus_(cls, status) {
  var sh = classSheet_(), v = sh.getDataRange().getValues();
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][0]).trim().toUpperCase() === cls) { sh.getRange(i + 1, 2).setValue(status); epFlushCache_(); return true; }
  }
  return false;
}
function epMenuOpenClass() {
  var cls = ask_('Open a new class', 'Class name, e.g. 4C (up to 6 characters)').toUpperCase().slice(0, 6);
  if (!cls) return;
  if (!setClassStatus_(cls, 'open')) { classSheet_().appendRow([cls, 'open', new Date(), '']); epFlushCache_(); }
  tell_('Class ' + cls + ' is open. Students can pick it when they sign in.');
}
function epMenuArchiveClass() {
  var cls = ask_('Archive a class', 'Class name, e.g. 6A. It disappears from the site; all records stay.').toUpperCase();
  if (!cls) return;
  tell_(setClassStatus_(cls, 'archived') ? 'Class ' + cls + ' is archived. Restore it any time from the menu.' : 'No class called ' + cls + ' in the Classes tab.');
}
function epMenuRestoreClass() {
  var cls = ask_('Restore a class', 'Class name, e.g. 6A').toUpperCase();
  if (!cls) return;
  tell_(setClassStatus_(cls, 'open') ? 'Class ' + cls + ' is open again.' : 'No class called ' + cls + ' in the Classes tab.');
}

/* "5A-12" or "5A 12" -> the Students row for that seat. */
function seatRow_(txt) {
  var m = String(txt || '').toUpperCase().match(/^\s*([A-Z0-9]{1,6})\s*[- ]\s*(\d{1,2})\s*$/);
  if (!m) return null;
  var hit = null;
  studentRows_().some(function (s) {
    if (s.cls === m[1] && Number(s.num) === Number(m[2]) && s.status !== 'removed') { hit = s; return true; }
    return false;
  });
  return hit;
}
function epMenuHide() {
  var t = ask_('Hide or unhide a student', 'Class and number, e.g. 5A-12. Hidden students can still practise but do not appear on class pages or the leaderboard.');
  if (!t) return;
  var s = seatRow_(t); if (!s) { tell_('No student at ' + t + '.'); return; }
  ensureStudentStatus_();
  var next = s.status === 'hidden' ? '' : 'hidden';
  studentSheet_().getRange(s.row, 8).setValue(next); epFlushCache_();
  tell_(s.nick + ' (' + s.cls + '-' + s.num + ') is now ' + (next ? 'hidden.' : 'visible again.'));
}
function epMenuRemove() {
  var t = ask_('Remove a student from their class', 'Class and number, e.g. 5A-12. They keep their account, points and history, and pick a class again next time they sign in.');
  if (!t) return;
  var s = seatRow_(t); if (!s) { tell_('No student at ' + t + '.'); return; }
  ensureStudentStatus_();
  studentSheet_().getRange(s.row, 8).setValue('removed'); epFlushCache_();
  tell_(s.nick + ' was taken out of ' + s.cls + '. Seat ' + s.cls + '-' + s.num + ' is free again.');
}
function epMenuGive() {
  var t = ask_('Give or take E-points', 'Class-number, E, reason. For example:\n5A-12, 30, helped run the class quiz\n5A-12, -50, points earned by spamming');
  if (!t) return;
  var m = t.match(/^\s*([A-Za-z0-9]{1,6})\s*[- ]\s*(\d{1,2})\s*,\s*(-?\d+)\s*,?\s*(.*)$/);
  if (!m) { tell_('Write it as: 5A-12, 30, reason'); return; }
  eGiveSheet_().appendRow([m[1].toUpperCase(), Number(m[2]), Number(m[3]), m[4] || '', '']);
  var n = applyGifts_('');
  tell_(n ? 'Done: ' + m[3] + ' E for ' + m[1].toUpperCase() + '-' + m[2] + '.' : 'Saved in EGive, but no student sits at ' + m[1].toUpperCase() + '-' + m[2] + '. See the status column.');
}
function epMenuApplyGifts() { tell_(applyGifts_('') + ' gift row(s) applied. Check the status column in EGive.'); }

/* Balances = the sum of ELedger. Run after editing ELedger by hand. */
function epMenuRecount() {
  var lv = ledgerSheet_().getDataRange().getValues(), sum = {}, earned = {};
  for (var i = 1; i < lv.length; i++) {
    var u = String(lv[i][1]), p = Number(lv[i][5]) || 0;
    if (!u) continue;
    sum[u] = (sum[u] || 0) + p;
    if (p > 0) earned[u] = (earned[u] || 0) + p;
  }
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var sh = walletSheet_(), v = sh.getDataRange().getValues(), n = 0;
    for (var j = 1; j < v.length; j++) {
      var uid = String(v[j][0]), b = sum[uid] || 0, e = earned[uid] || 0;
      if (Number(v[j][3]) !== b || Number(v[j][4]) !== e) { sh.getRange(j + 1, 4, 1, 2).setValues([[b, e]]); n++; }
    }
  } finally { lock.releaseLock(); }
  try { tell_('Recounted. ' + n + ' balance(s) changed.'); } catch (e) { Logger.log('Recounted ' + n); }
}
