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
  ['week5',      20,  0, 'yes', 'Practise on 5 different days in one week (Mon to Sun)'],
  // added 2026-10-14: welcome and come-back rewards
  ['welcome',   150,  0, 'yes', 'Welcome gift, once: enough for your first outfit'],
  ['checkin',     5,  1, 'yes', 'Open the site today (daily check-in)'],
  ['streak3',    15,  0, 'yes', 'Check in 3 days in a row'],
  ['streak7',    50,  0, 'yes', 'Check in 7 days in a row (again every 7 days)'],
  ['first10',    30,  0, 'yes', 'Answer your first 10 MC questions, once'],
  ['first_lq',   20,  0, 'yes', 'Send your first Long Q for AI marking, once'],
  ['level_up',   25,  0, 'yes', 'Reach a new level (cleared % of all MCQs)']
];
function eRulesSheet_() {
  var sh = sheet_('ERules', ['action','E','per_day','on','what it is for']);
  if (sh.getLastRow() < 2) sh.getRange(2, 1, EP_RULES_DEFAULT.length, 5).setValues(EP_RULES_DEFAULT);
  return sh;
}
/* Rules added after a school set up its ERules tab: appended by epSetup,
   rows already there (and any E you changed) are left alone. */
function epAddNewRules_() {
  var sh = eRulesSheet_(), v = sh.getDataRange().getValues(), have = {};
  for (var i = 1; i < v.length; i++) have[String(v[i][0]).trim()] = true;
  var add = EP_RULES_DEFAULT.filter(function (r) { return !have[r[0]]; });
  if (add.length) sh.getRange(sh.getLastRow() + 1, 1, add.length, 5).setValues(add);
  return add.length;
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
               nick: String(v[i][4] || ''), status: String(v[i][7] || '').trim().toLowerCase(),
               email: String(v[i][1] || '').trim().toLowerCase(), order: v[i][8] });
  }
  return out;
}
function ensureStudentStatus_() {
  var sh = studentSheet_();
  if (String(sh.getRange(1, 8).getValue()).trim() !== 'status') sh.getRange(1, 8).setValue('status');
  if (String(sh.getRange(1, 9).getValue()).trim() !== 'order') sh.getRange(1, 9).setValue('order');
}
/* Accounts in the Script Property TEACHER_EMAILS (the same list teacher.html
   uses) go first on class pages, with a Teacher tag. */
function epTeachers_() {
  var raw = PropertiesService.getScriptProperties().getProperty('TEACHER_EMAILS') || '', out = {};
  raw.toLowerCase().split(/[\s,;]+/).forEach(function (e) { if (e) out[e] = 1; });
  return out;
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

/* Classes: {cls: 'open'|'archived'|'everyone'}. Empty when the tab has no
   rows, which the page reads as "type your class" (the old behaviour).
   'everyone' is an open class whose page and leaderboard list every
   registered student, whatever class they picked. */
function classMap_() {
  var c = CacheService.getScriptCache(), hit = c.get('ep_classes');
  if (hit) { try { return JSON.parse(hit); } catch (e) {} }
  var v = classSheet_().getDataRange().getValues(), out = {};
  for (var i = 1; i < v.length; i++) {
    var k = String(v[i][0]).trim().toUpperCase();
    var st = String(v[i][1]).trim().toLowerCase();
    if (k) out[k] = st === 'archived' ? 'archived' : st === 'everyone' ? 'everyone' : 'open';
  }
  c.put('ep_classes', JSON.stringify(out), 60);
  return out;
}
function clsOpen_(st) { return st === 'open' || st === 'everyone'; }
function epFlushCache_() {
  CacheService.getScriptCache().removeAll(['ep_rules', 'ep_store', 'ep_hidden', 'ep_classes', 'ep_pct', 'ep_targets', 'ep_tasks', 'ep_bankchap']);
}
/* Class pages are cached for a minute; a change to one student also changes
   every 'everyone' class page. */
function epDropClassCache_(cls) {
  var keys = ['ep_cp_' + String(cls || '').toUpperCase()], m = classMap_();
  for (var k in m) if (m[k] === 'everyone') keys.push('ep_cp_' + k);
  CacheService.getScriptCache().removeAll(keys);
}

/* Cleared % per uid, for the leaderboard and the level badges.
   Counted from the Cleared tab (the server's merged record of every MCQ a
   student has been credited for, across all devices), against the MCQs in
   the Bank tab. Keys no longer in the Bank are ignored, so a deleted
   question cannot push anyone past 100%. The old count summed the Scores
   tab across pages, which counted a question twice when a student used both
   app.html and an old chapter page, and grew the total by each old page's size. */
function clearedStats_() {
  var c = CacheService.getScriptCache(), hit = c.get('ep_pct');
  if (hit) { try { return JSON.parse(hit); } catch (e) {} }
  var mcq = {}, total = 0, bs = bankSheet_(), bn = bs.getLastRow() - 1;
  if (bn > 0) bs.getRange(2, 1, bn, 2).getValues().forEach(function (r) {
    var k = String(r[0]);
    if (k && String(r[1]).toLowerCase() === 'mcq' && !mcq[k]) { mcq[k] = 1; total++; }
  });
  var by = {}, cv = clearedSheet_().getDataRange().getValues();
  for (var i = 1; i < cv.length; i++) {
    var uid = String(cv[i][0]), set;
    if (!uid) continue;
    try { set = JSON.parse(cv[i][1]) || {}; } catch (e) { set = {}; }
    var n = 0;
    for (var key in set) if (mcq[key]) n++;
    by[uid] = { c: n };
  }
  // app.html also reports its own count as the Scores row 'all'. When a
  // Cleared write was lost (expired session, dropped connection) that count
  // is higher, and it is what the student sees on their page, so take the
  // larger. Old chapter pages use other pageIds and stay out.
  var sv = scoreSheet_().getDataRange().getValues();
  for (var j = 1; j < sv.length; j++) {
    if (String(sv[j][3]) !== 'all') continue;
    var su = String(sv[j][0]), sn = Math.min(Number(sv[j][5]) || 0, total);
    if (su && sn > ((by[su] && by[su].c) || 0)) by[su] = { c: sn };
  }
  for (var u in by) by[u].p = total ? Math.round(by[u].c / total * 1000) / 10 : 0;
  var out = { total: total, by: by };
  c.put('ep_pct', JSON.stringify(out), 120);
  return out;
}
function pctMap_() {
  var by = clearedStats_().by, out = {};
  for (var u in by) out[u] = by[u].p;
  return out;
}

/* GET ?lb=1 — the leaderboard.
   With a session it ranks one class: ?cls= if given, else the student's own
   class. An 'everyone' class ranks every student. Every member is listed,
   0% included, by cleared count; ties share a rank. Without a session (the
   old chapter pages) it ranks everyone, top TOP_N only.
   Hidden and removed students never appear. Nicknames come from Students. */
/* Who a class-wide number counts: the class asked for (else the student's
   own), every student for an 'everyone' class or a caller without a
   session, never hidden or removed students. null when the class is closed. */
function classScope_(sess, cls) {
  var m = classMap_(), stu = studentRows_(), me = null, uids = {}, list = [];
  if (sess) stu.forEach(function (s) { if (s.uid === sess.uid && s.status !== 'removed') me = s; });
  cls = String(cls || (me && me.cls) || '').trim().toUpperCase();
  var everyone = !sess || m[cls] === 'everyone';
  if (sess && !everyone && !clsOpen_(m[cls]) && Object.keys(m).length) return null;
  stu.forEach(function (s) {
    if (uids[s.uid] || s.status === 'hidden' || s.status === 'removed') return;
    if (!everyone && s.cls !== cls) return;
    uids[s.uid] = 1; list.push(s);
  });
  return { cls: cls, everyone: everyone, uids: uids, list: list };
}

function epBoard_(sess, cls) {
  var st = clearedStats_(), sc = classScope_(sess, cls), rows = [];
  if (!sc) return { error: 'closed', cls: String(cls || '').toUpperCase() };
  var everyone = sc.everyone; cls = sc.cls;
  sc.list.forEach(function (s) {
    var x = st.by[s.uid] || { c: 0, p: 0 };
    if (!sess && !x.c) return;
    rows.push({ uid: s.uid, nick: s.nick || '—', c: x.c, pct: x.p, lvl: levelOf_(x.p), k: s.cls });
  });
  rows.sort(function (a, b) { return b.c - a.c || (a.nick < b.nick ? -1 : 1); });
  for (var i = 0; i < rows.length; i++) rows[i].rank = i && rows[i].c === rows[i - 1].c ? rows[i - 1].rank : i + 1;
  var you = null;
  if (sess) for (var j = 0; j < rows.length; j++) {
    if (rows[j].uid !== sess.uid) continue;
    var ahead = null;
    for (var a = j - 1; a >= 0; a--) if (rows[a].c > rows[j].c) { ahead = rows[a]; break; }
    you = { rank: rows[j].rank, pct: rows[j].pct, lvl: rows[j].lvl,
            gap: ahead ? Math.round((ahead.pct - rows[j].pct) * 10) / 10 : 0, gapQ: ahead ? ahead.c - rows[j].c : 0 };
    break;
  }
  var top = (sess ? rows : rows.slice(0, TOP_N)).map(function (r) {
    var o = { rank: r.rank, nick: r.nick, pct: r.pct, lvl: r.lvl, c: r.c };   // uid deliberately dropped
    if (everyone && sess) o.k = r.k;                                          // an 'everyone' class mixes real classes
    return o;
  });
  return { cls: everyone && !sess ? '' : cls, n: rows.length, total: st.total, top: top, you: you };
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
    st.ever = (st.ever || 0) + 1;
    st.wk.mc = (st.wk.mc || 0) + 1;                  // for the weekly target

    if (st.ever >= 10 && !st.once.first10 && give_(w, aw, 'first10', 'first 10 questions')) st.once.first10 = 1;
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
    if (photo || words >= 40) {
      give_(w, aw, 'lq_submit', key); active_(w, aw);
      st.wk.lq = (st.wk.lq || 0) + 1;
      if (!st.once.first_lq && give_(w, aw, 'first_lq', key)) st.once.first_lq = 1;
    }
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
    var aw = epSyncComments_(w);
    epVisit_(w, aw);
    return aw;
  });
  if (res.error) return res;
  var w = res.w, rules = epRules_(), list = [];
  EP_RULES_DEFAULT.forEach(function (d) {          // keep the table in the default order
    var r = rules[d[0]]; if (!r || !r.on) return;
    list.push({ a: d[0], p: r.p, lim: r.lim, what: r.what, today: w.st.c[d[0]] || 0 });
  });
  var tg = epTargetOf_(w.cls);
  if (tg) tg = { mc: tg.mc, lq: tg.lq, doneMc: w.st.wk.mc || 0, doneLq: w.st.wk.lq || 0 };
  var tasks = [];
  try { if (epTasks_().length) tasks = epTasksFor_(sess.uid, w.cls, epClearedOf_(sess.uid)); } catch (e) {}
  return { bal: w.bal, earned: w.earned, look: w.look, owned: w.owned, store: epStore_(), rules: list,
           recent: w.st.recent, e: brief_(res.aw), target: tg, tasks: tasks };
}

/* Opening the site: welcome gift once, daily check-in with 3- and 7-day
   streaks, and a reward for each new level since the last visit. Levels
   reached before this rule existed set the starting point and pay nothing. */
function epVisit_(w, aw) {
  var st = w.st, once = st.once, today = epDay_();
  if (!once.welcome && give_(w, aw, 'welcome', 'welcome')) once.welcome = 1;
  st.ck = st.ck || { d: '', n: 0 };
  if (st.ck.d !== today) {
    var yest = Utilities.formatDate(new Date(new Date(today + 'T12:00:00Z').getTime() - 86400000), 'UTC', 'yyyy-MM-dd');
    st.ck.n = st.ck.d === yest ? st.ck.n + 1 : 1;
    st.ck.d = today;
    give_(w, aw, 'checkin', today);
    if (st.ck.n === 3) give_(w, aw, 'streak3', '3 days in a row');
    if (st.ck.n % 7 === 0) give_(w, aw, 'streak7', st.ck.n + ' days in a row');
  }
  var lv = levelOf_(pctMap_()[w.uid] || 0);
  if (st.lv == null) st.lv = lv;
  for (; st.lv < lv; st.lv++) give_(w, aw, 'level_up', 'Lv.' + (st.lv + 1));
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
  epDropClassCache_(res.w.cls);
  return { ok: true, look: res.w.look };
}

/* GET ?classes=1 — open classes, for the seat form and the class switcher. */
function epClasses_() {
  var m = classMap_(), out = [];
  for (var k in m) if (clsOpen_(m[k])) out.push(k);
  out.sort();
  return { classes: out };
}

/* GET ?cpage=5A — that class's characters: nickname, character, level.
   Hidden and removed students are left out; no email, number or score. */
function epClassPage_(cls) {
  cls = String(cls || '').trim().toUpperCase();
  var st = classMap_()[cls];
  if (!clsOpen_(st)) return { error: 'closed', cls: cls };
  var c = CacheService.getScriptCache(), hit = c.get('ep_cp_' + cls);
  if (hit) { try { return JSON.parse(hit); } catch (e) {} }
  var looks = {}, wv = walletSheet_().getDataRange().getValues();
  for (var i = 1; i < wv.length; i++) looks[String(wv[i][0])] = pj_(wv[i][5], null);
  var pct = pctMap_(), tch = epTeachers_(), items = [];
  studentRows_().forEach(function (s) {
    if (s.status === 'hidden' || s.status === 'removed') return;
    if (st !== 'everyone' && s.cls !== cls) return;
    var o = String(s.order === undefined ? '' : s.order).trim();
    items.push({ nick: s.nick || '—', look: looks[s.uid] || null, lv: levelOf_(pct[s.uid] || 0), t: tch[s.email] ? 1 : 0,
                 o: o !== '' && !isNaN(Number(o)) ? Number(o) : Infinity, n: Number(s.num) || 0, k: s.cls });
  });
  // Teacher first; then any number typed in the Students tab's 'order'
  // column (smallest first); then highest level; then class and number.
  items.sort(function (a, b) {
    return b.t - a.t || (a.o === b.o ? 0 : a.o < b.o ? -1 : 1) || b.lv - a.lv
        || (a.k < b.k ? -1 : a.k > b.k ? 1 : a.n - b.n);
  });
  items.forEach(function (x) {                       // seat numbers and order stay private
    if (st === 'everyone' && !x.t && x.k) x.cl = x.k;  // an 'everyone' page shows each student's real class
    delete x.n; delete x.k; delete x.o; if (!x.t) delete x.t;
  });
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
    .addItem('Show every student in a class…', 'epMenuEveryone')
    .addSeparator()
    .addItem('Hide or unhide a student…', 'epMenuHide')
    .addItem('Remove a student from their class…', 'epMenuRemove')
    .addSeparator()
    .addItem('Give or take E-points…', 'epMenuGive')
    .addItem('Apply E-point gifts (EGive tab)', 'epMenuApplyGifts')
    .addItem('Recount balances from ELedger', 'epMenuRecount')
    .addSeparator()
    .addItem('Set up E-point tabs', 'epSetup')
    .addSeparator()
    .addItem('Update the Progress tab', 'epBuildProgress')
    .addItem('Update the Weak topics tab', 'epBuildWeak')
    .addItem('Update Progress, Weak topics and Dashboard every morning', 'epMenuDaily')
    .addItem('Email me a summary every Monday', 'epMenuEmail')
    .addItem('Reward everyone on track this week…', 'epMenuReward')
    .addItem('Build Dashboard', 'buildDashboard')
    .addSeparator()
    .addItem('Export question bank for the paper builder', 'epExportBank')
    .addSeparator()
    .addItem('Choose tabs to show…', 'epChooseTabs')
    .addItem('Show all tabs', 'epShowAllTabs')
    .addToUi();
}

function ask_(title, hint) {
  var ui = SpreadsheetApp.getUi(), r = ui.prompt(title, hint, ui.ButtonSet.OK_CANCEL);
  return r.getSelectedButton() === ui.Button.OK ? String(r.getResponseText() || '').trim() : '';
}
function tell_(s) { SpreadsheetApp.getUi().alert(s); }

/* paper.html (the past-paper builder) has no server route: the bank, answers
   included, never goes online. The teacher downloads a copy of the Bank tab
   straight from this dialog and opens it in paper.html. The download is made
   in the browser: a Drive "uc?export=download" link gave 403 for teachers
   signed in to more than one Google account. */
function epBankJson() {
  var sh = ss_().getSheetByName('Bank');
  if (!sh || sh.getLastRow() < 2) return '';
  var v = sh.getDataRange().getValues(), h = v.shift().map(String), cols = ['key', 'type', 'page', 'topic', 'payload'], ix = {};
  cols.forEach(function (k) { ix[k] = h.indexOf(k); });
  if (ix.key < 0 || ix.payload < 0) return '';
  var rows = v.filter(function (r) { return r[ix.key] && r[ix.payload]; }).map(function (r) {
    return cols.map(function (k) { return ix[k] < 0 ? '' : String(r[ix[k]]); });
  });
  return JSON.stringify({ exported: new Date().toISOString(), rows: rows });
}
function epExportBank() {
  var sh = ss_().getSheetByName('Bank');
  if (!sh || sh.getLastRow() < 2) return tell_('There is no Bank tab with questions.');
  var name = 'tyneconbuddy-bank-' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd') + '.json';
  SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutput(
    '<div style="font:14px Arial,sans-serif"><p id="m">Preparing ' + (sh.getLastRow() - 1) + ' questions…</p>' +
    '<p><a id="a" style="display:none;font-weight:bold" download="' + name + '">Download ' + name + '</a></p>' +
    '<p style="color:#666">Then open it in paper.html (Choose File). Export again after you add questions.</p></div>' +
    '<script>google.script.run.withFailureHandler(function(e){document.getElementById("m").textContent="Could not read the Bank tab: "+e.message})' +
    '.withSuccessHandler(function(t){var m=document.getElementById("m");if(!t){m.textContent="The Bank tab needs key and payload columns.";return}' +
    'var a=document.getElementById("a");a.href=URL.createObjectURL(new Blob([t],{type:"application/json"}));a.style.display="";' +
    'm.textContent="Ready.";a.click()}).epBankJson();</script>').setWidth(440).setHeight(190), 'Export question bank');
}

/* Makes every new tab and fills in defaults. Safe to run again: it never
   overwrites a tab that already has rows. */
function epSetup() {
  classSheet_(); eRulesSheet_(); eStoreSheet_(); eGiveSheet_(); walletSheet_(); ledgerSheet_(); targetSheet_(); taskSheet_();
  ensureStudentStatus_();
  var added = epAddNewItems_(), rulesAdded = epAddNewRules_();
  epFlushCache_();
  var msg = 'E-point tabs are ready: Classes, ERules, EStore, EGive, Wallet, ELedger, Targets.' + (added ? ' Added ' + added + ' new store items to EStore.' : '')
          + (rulesAdded ? ' Added ' + rulesAdded + ' new ways to earn to ERules.' : '');
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
function epMenuEveryone() {
  var cls = ask_('Show every student in a class', 'Class name, e.g. LKSCEC (up to 6 characters). Its class page and leaderboard will list every registered student. Set its status back to open in the Classes tab to undo.').toUpperCase().slice(0, 6);
  if (!cls) return;
  if (!setClassStatus_(cls, 'everyone')) { classSheet_().appendRow([cls, 'everyone', new Date(), 'lists every student']); epFlushCache_(); }
  tell_('Class ' + cls + ' now lists every registered student.');
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


/* ============================================================ PROGRESS ==== *
 * One "Progress" tab the teacher can read at a glance, with no formulas:
 * a line per class, then a line per student, worst-off first within each
 * class, so the students who need a nudge are at the top. Built from the
 * Wallet, ELedger and Cleared tabs; nothing for students to hand in.
 * ========================================================================== */
var EP_TASK_COLS = 6;
/* Every tab the code uses: [name, what the teacher does there, which part of
   the site writes it]. Group 'show' is ticked by default in Choose tabs;
   'data' tabs are the app's memory: hide them, never delete them (sheet_()
   would quietly make a new empty one and students would lose that data). */
var EP_TABS = {
  show: [['Progress', 'Who is on track, who needs a nudge, effort vs result, tasks', 'E-points'],
         ['Tasks', 'Set homework: class, chapter, MCQs, due date', 'E-points'],
         ['Weak topics', 'Which chapters each student gets wrong', 'E-points'],
         ['Students', 'Class, number, nickname, order on the class page', 'Main app'],
         ['Classes', 'Open or archive a class; LKSECO = everyone', 'E-points'],
         ['Comments', 'Hide or verify student comments', 'Main app'],
         ['LQ Marking', 'Saved marks from teacher.html', 'Teacher marking']],
  settings: [['Targets', 'Weekly target per class', 'E-points'],
             ['History', 'One line per student per week', 'E-points'],
             ['Dashboard', 'Older class summary', 'Teacher dashboard'],
             ['EGive', 'Give E-points by hand', 'E-points'],
             ['ERules', 'How many E each action earns', 'E-points'],
             ['EStore', 'Store items and prices', 'E-points'],
             ['New', 'Add new questions, then run importNew', 'Main app'],
             ['Roster', 'Allowed emails', 'Main app'],
             ['Blocklist', 'Blocked users', 'Main app'],
             ['Config', 'Settings', 'Main app']],
  data: [['Bank', 'Every question', 'Main app'], ['Sessions', 'Logins', 'Main app'],
         ['Cleared', 'Questions each student has cleared', 'Main app'], ['Scores', 'Leaderboard scores', 'Main app'],
         ['Mistakes', 'Wrong answers', 'Main app'], ['Log', 'Every answer', 'Main app'],
         ['Wallet', 'E-point balances', 'E-points'], ['ELedger', 'Every E-point given or spent', 'E-points'],
         ['Notes', 'Correction Album notes', 'Correction Album'], ['LQAlbum', 'Correction Album Long Qs', 'Correction Album'],
         ['LQMarks', 'Student AI Long Q marks', 'Long Q marking'], ['LQUsage', 'Daily AI marking limit', 'Long Q marking'],
         ['Explain', 'Saved AI explanations', 'Main app'], ['ExplainSeen', 'Who saw each explanation', 'Main app'],
         ['AIUsage', 'Daily AI explain limit', 'Main app'], ['Likes', 'Comment likes', 'Main app']]
};
var EP_TEACHER_TABS = EP_TABS.show.map(function (t) { return t[0]; });

function epBuildProgress() {
  var stats = clearedStats_(), wk = epWeek_(), today = epDay_(), DAY = 86400000, now = Date.now();
  var wal = {}, wv = walletSheet_().getDataRange().getValues();
  for (var i = 1; i < wv.length; i++) {
    var st = pj_(wv[i][7], {}) || {};
    wal[String(wv[i][0])] = { bal: Number(wv[i][3]) || 0, st: st, upd: wv[i][8] ? new Date(wv[i][8]).getTime() : 0 };
  }
  // E earned this week (Mon to today), from the ledger; spending is not effort
  var weekE = {}, lv = ledgerSheet_().getDataRange().getValues(), wkStart = new Date(wk + 'T00:00:00+08:00').getTime();
  for (var j = lv.length - 1; j >= 1; j--) {
    var t = lv[j][0] ? new Date(lv[j][0]).getTime() : 0;
    if (t < wkStart) break;                                  // the ledger is append-only, so newest rows are last
    var e = Number(lv[j][5]) || 0, a = String(lv[j][4]);
    if (e > 0 && a !== 'teacher' && a !== 'welcome') weekE[String(lv[j][1])] = (weekE[String(lv[j][1])] || 0) + e;
  }
  var rows = [], cls = {}, hist = [], perf = epPerf_(), tasks = epTasks_();
  var accs = {};                                     // class -> accuracies, for the median
  studentRows_().forEach(function (s) {
    var a = perf.acc(s.uid);
    if (a !== null) (accs[s.cls] = accs[s.cls] || []).push(a);
  });
  var med = {};
  Object.keys(accs).forEach(function (k) { var x = accs[k].sort(function (a, b) { return a - b; }); med[k] = x[Math.floor(x.length / 2)]; });
  studentRows_().forEach(function (s) {
    if (s.status === 'removed') return;
    var w = wal[s.uid] || { bal: 0, st: {}, upd: 0 }, x = stats.by[s.uid] || { c: 0, p: 0 };
    var days = (w.st.wk && w.st.wk.w === wk) ? (w.st.wk.days || []).length : 0;
    var ck = w.st.ck || {}, streak = 0;
    if (ck.d === today || ck.d === Utilities.formatDate(new Date(now - DAY), EP_TZ, 'yyyy-MM-dd')) streak = ck.n || 0;
    var ago = w.upd ? Math.floor((now - w.upd) / DAY) : '';
    var inWk = w.st.wk && w.st.wk.w === wk, mc = inWk ? w.st.wk.mc || 0 : 0, lq = inWk ? w.st.wk.lq || 0 : 0;
    var tg = epTargetText_(epTargetOf_(s.cls), mc, lq);
    var flag = !x.c && !days ? 'Not started' : ago !== '' && ago >= 7 ? 'Quiet 7+ days'
             : days >= 3 || tg === 'Met' ? 'On track' : 'Needs a nudge';
    var acc = perf.acc(s.uid), working = days >= 3 || tg === 'Met', grp;
    if (acc === null) grp = 'Not started';
    else if (working) grp = acc >= med[s.cls] ? 'Working, doing well' : 'Working but stuck';
    else grp = acc >= med[s.cls] ? 'Coasting' : 'Falling behind';
    var tcells = tasks.slice(0, EP_TASK_COLS).map(function (t) {
      if (t.cls !== 'ALL' && t.cls !== s.cls) return '';
      var d = 0, set = perf.cleared[s.uid] || {};
      for (var k in set) if (epInScope_(t.sc, perf.bank[k])) d++;
      return d >= t.n ? 'Done' : d + '/' + t.n + (t.due && t.due < epDay_() ? ' late' : '');
    });
    rows.push([s.cls, Number(s.num) || '', s.nick, flag, grp, tg].concat(tcells, [days, mc, lq, weekE[s.uid] || 0, x.c, x.p / 100,
               acc === null ? '' : acc, levelOf_(x.p), streak, w.bal, w.upd ? new Date(w.upd) : '', s.status === 'hidden' ? 'hidden' : '']));
    hist.push([s.uid, s.cls, Number(s.num) || '', s.nick, days, mc, lq, tg, weekE[s.uid] || 0, x.c, x.p / 100]);
    var c = cls[s.cls] || (cls[s.cls] = { n: 0, on: 0, nudge: 0, quiet: 0, none: 0, met: 0, days: 0, cleared: 0 });
    c.n++; c.days += days; c.cleared += x.c; if (tg === 'Met') c.met++;
    c[{ 'On track': 'on', 'Needs a nudge': 'nudge', 'Quiet 7+ days': 'quiet', 'Not started': 'none' }[flag]]++;
  });
  var rank = { 'Not started': 0, 'Quiet 7+ days': 1, 'Needs a nudge': 2, 'On track': 3 };
  rows.sort(function (a, b) { return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : rank[a[3]] - rank[b[3]] || a[1] - b[1]; });
  var csum = Object.keys(cls).sort().map(function (k) {
    var c = cls[k];
    return [k, c.n, c.on, c.nudge, c.quiet, c.none, c.met, Math.round(c.days / c.n * 10) / 10, Math.round(c.cleared / c.n)];
  });
  try { epSaveHistory_(wk, hist); } catch (e) { Logger.log('History not saved: ' + e); }

  var ss = ss_(), sh = ss.getSheetByName('Progress') || ss.insertSheet('Progress', 0);
  sh.clear();
  sh.getRange(1, 1).setValue('Progress · week of ' + wk + ' · updated ' +
    Utilities.formatDate(new Date(), EP_TZ, 'd MMM HH:mm')).setFontWeight('bold').setFontSize(14);
  sh.getRange(2, 1).setValue('On track = practised on 3+ days this week, or met the weekly target (Targets tab). ' +
    'Needs a nudge = 1–2 days. Effort vs result: working = on track; doing well = accuracy at or above the class median. ' +
    '"Working but stuck" needs teaching, "Coasting" needs a push. Tasks come from the Tasks tab. Nothing here needs students to hand anything in.').setFontStyle('italic').setFontColor('#666666');
  var r = 4, ch = ['Class', 'Students', 'On track', 'Needs a nudge', 'Quiet 7+ days', 'Not started', 'Met target', 'Avg days this week', 'Avg MCQs cleared'];
  sh.getRange(r, 1, 1, ch.length).setValues([ch]).setFontWeight('bold').setBackground('#eeeeee');
  if (csum.length) sh.getRange(r + 1, 1, csum.length, ch.length).setValues(csum);
  r += csum.length + 3;
  var tcols = tasks.slice(0, EP_TASK_COLS).map(function (t) { return 'Task: ' + t.what + ' (' + t.n + (t.due ? ', due ' + t.due : '') + ')'; });
  var hd = ['Class', 'No.', 'Nickname', 'Status', 'Effort vs result', 'Target'].concat(tcols, ['Days this week', 'MCQs this week',
            'Long Qs this week', 'E earned this week', 'MCQs cleared', 'Cleared %', 'Accuracy', 'Level', 'Check-in streak',
            'E balance', 'Last active', 'Note']);
  var off = tcols.length;
  sh.getRange(r, 1, 1, hd.length).setValues([hd]).setFontWeight('bold').setBackground('#eeeeee');
  sh.setFrozenRows(0);
  if (rows.length) {
    sh.getRange(r + 1, 1, rows.length, hd.length).setValues(rows);
    sh.getRange(r + 1, 12 + off, rows.length, 2).setNumberFormat('0.0%');
    sh.getRange(r + 1, 18 + off, rows.length, 1).setNumberFormat('d mmm hh:mm');
    var gcol = { 'Working, doing well': '#d9ead3', 'Working but stuck': '#fce5cd', 'Coasting': '#fff2cc', 'Falling behind': '#f4cccc', 'Not started': '#efefef' };
    sh.getRange(r + 1, 5, rows.length, 1).setBackgrounds(rows.map(function (x) { return [gcol[x[4]]]; }));
    var colour = { 'On track': '#d9ead3', 'Needs a nudge': '#fff2cc', 'Quiet 7+ days': '#f4cccc', 'Not started': '#efefef' };
    sh.getRange(r + 1, 4, rows.length, 1).setBackgrounds(rows.map(function (x) { return [colour[x[3]]]; }));
  }
  sh.autoResizeColumns(1, hd.length);
  var msg = 'Progress tab updated: ' + rows.length + ' students.';
  try { ss.setActiveSheet(sh); ss.toast(msg); } catch (e) { Logger.log(msg); }
  return msg;
}

/* Rebuild Progress (and the Dashboard) every morning around 7. */
function epMenuDaily() {
  var have = {};
  ScriptApp.getProjectTriggers().forEach(function (t) { have[t.getHandlerFunction()] = 1; });
  if (!have.epBuildProgress) ScriptApp.newTrigger('epBuildProgress').timeBased().everyDays(1).atHour(7).create();
  if (!have.epBuildWeak) ScriptApp.newTrigger('epBuildWeak').timeBased().everyDays(1).atHour(7).create();
  if (!have.buildDashboard) ScriptApp.newTrigger('buildDashboard').timeBased().everyDays(1).atHour(7).create();
  if (!have.epTidyTabs) ScriptApp.newTrigger('epTidyTabs').timeBased().everyDays(1).atHour(8).create();
  tell_('Progress, Weak topics and Dashboard will update every morning around 7:00.');
}

/* The site keeps many working tabs (Log, Sessions, Cleared, Wallet…). The
   teacher ticks the tabs they want in a side panel; the rest are hidden.
   Only tabs the code never uses can be deleted, from the same panel. */
function epTabChoice_() {
  try { var v = JSON.parse(PropertiesService.getDocumentProperties().getProperty('ep_tabs') || 'null'); if (v && v.length) return v; } catch (e) {}
  return EP_TEACHER_TABS.slice();
}
function epKnownTabs_() {
  var k = {};
  ['show', 'settings', 'data'].forEach(function (g) { EP_TABS[g].forEach(function (t) { k[t[0]] = g; }); });
  return k;
}
function epChooseTabs() {
  var ss = ss_(), known = epKnownTabs_(), on = {}, have = {};
  epTabChoice_().forEach(function (n) { on[n] = 1; });
  ss.getSheets().forEach(function (sh) { have[sh.getName()] = 1; });
  var row = function (t, del) {
    return '<label class="r"><input type="checkbox" value="' + esc_(t[0]) + '"' + (on[t[0]] ? ' checked' : '') + '>' +
      '<span><b>' + esc_(t[0]) + '</b>' + (t[1] ? '<br><small>' + esc_(t[1]) + (t[2] ? ' · ' + esc_(t[2]) : '') + '</small>' : '') + '</span>' +
      (del ? '<button type="button" class="del" data-n="' + esc_(t[0]) + '">Delete</button>' : '') + '</label>';
  };
  var grp = function (title, note, list, del) {
    list = list.filter(function (t) { return have[t[0]]; });
    return list.length ? '<h4>' + title + '</h4>' + (note ? '<p class="n">' + note + '</p>' : '') + list.map(function (t) { return row(t, del); }).join('') : '';
  };
  var other = ss.getSheets().map(function (sh) { return sh.getName(); })
    .filter(function (n) { return !known[n]; }).map(function (n) { return [n, '', '']; });
  var html = '<style>body{font:13px Arial,sans-serif;margin:10px}h4{margin:14px 0 4px}.n{color:#666;margin:0 0 6px}' +
    '.r{display:flex;gap:6px;align-items:flex-start;padding:4px 0;border-bottom:1px solid #eee}.r span{flex:1}small{color:#666}' +
    '.del{font-size:11px;color:#b00}.bar{position:sticky;bottom:0;background:#fff;padding:8px 0;display:flex;gap:6px}</style>' +
    grp('Teacher tabs', 'Ticked tabs show, in this order. Untick to hide. Nothing is deleted.', EP_TABS.show) +
    grp('Settings', 'Tick when you need them.', EP_TABS.settings) +
    grp('App data', 'Safe to look at, but never delete or edit: students would lose their data.', EP_TABS.data) +
    grp('Not used by the app', 'Old or extra tabs. Look before you delete: Delete cannot be undone.', other, true) +
    '<div class="bar"><button id="save">Save</button><span id="m"></span></div>' +
    '<script>' +
    'document.getElementById("save").onclick=function(){var v=[].map.call(document.querySelectorAll("input:checked"),function(i){return i.value});' +
    'if(!v.length){document.getElementById("m").textContent="Tick at least one tab.";return}' +
    'document.getElementById("m").textContent="Saving…";google.script.run.withSuccessHandler(function(t){document.getElementById("m").textContent=t}).epSaveTabs(v)};' +
    '[].forEach.call(document.querySelectorAll(".del"),function(b){b.onclick=function(e){e.preventDefault();' +
    'if(b.textContent!=="Really delete?"){b.textContent="Really delete?";return}' +
    'google.script.run.withSuccessHandler(function(t){b.closest(".r").remove();document.getElementById("m").textContent=t}).epDeleteTab(b.dataset.n)}});' +
    '</script>';
  SpreadsheetApp.getUi().showSidebar(HtmlService.createHtmlOutput(html).setTitle('Choose tabs to show'));
}
function esc_(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
function epSaveTabs(names) {
  names = (names || []).map(String).filter(Boolean);
  if (!names.length) return 'Tick at least one tab.';
  PropertiesService.getDocumentProperties().setProperty('ep_tabs', JSON.stringify(names));
  epApplyTabs_(names);
  return 'Saved: ' + names.length + ' tabs showing.';
}
function epApplyTabs_(names) {
  var ss = ss_(), keep = {}, pos = 1, first = null;
  names.forEach(function (n) {
    var sh = ss.getSheetByName(n);
    if (!sh) return;
    keep[n] = 1; first = first || sh;
    sh.showSheet(); ss.setActiveSheet(sh); ss.moveActiveSheet(pos++);
  });
  if (!first) return;
  ss.getSheets().forEach(function (sh) { if (!keep[sh.getName()]) sh.hideSheet(); });
  ss.setActiveSheet(first);
}
/* Only a tab the code never uses can go; the app's own tabs are refused. */
function epDeleteTab(name) {
  if (epKnownTabs_()[name]) return name + ' is used by the app, so it was not deleted.';
  var ss = ss_(), sh = ss.getSheetByName(name);
  if (!sh) return name + ' is already gone.';
  if (ss.getSheets().length < 2) return 'A spreadsheet needs at least one tab.';
  ss.deleteSheet(sh);
  return name + ' deleted.';
}
/* Kept for old menus and triggers: applies the saved choice. */
function epTidyTabs() { epApplyTabs_(epTabChoice_()); }
function epShowAllTabs() {
  ss_().getSheets().forEach(function (sh) { sh.showSheet(); });
  tell_('All tabs are showing again.');
}


/* ============================================================== TARGETS === *
 * The teacher's weekly target, per class, in a Targets tab. A row for ALL
 * applies to every class without its own row. Students see a progress bar
 * on Home; the Progress tab shows who met it. Counting starts the week this
 * version is deployed (MCQs = different questions answered each day).
 * ========================================================================== */
function targetSheet_() {
  var sh = sheet_('Targets', ['class', 'MCQs a week', 'Long Qs a week', 'on', 'note']);
  if (sh.getLastRow() < 2) sh.appendRow(['ALL', 30, 1, 'yes', 'every class without its own row']);
  return sh;
}
function epTargets_() {
  var c = CacheService.getScriptCache(), hit = c.get('ep_targets');
  if (hit) { try { return JSON.parse(hit); } catch (e) {} }
  var v = targetSheet_().getDataRange().getValues(), out = {};
  for (var i = 1; i < v.length; i++) {
    var k = String(v[i][0]).trim().toUpperCase();
    if (k && yes_(v[i][3])) out[k] = { mc: Math.max(0, Math.round(Number(v[i][1]) || 0)), lq: Math.max(0, Math.round(Number(v[i][2]) || 0)) };
  }
  c.put('ep_targets', JSON.stringify(out), 120);
  return out;
}
function epTargetOf_(cls) {
  var t = epTargets_(), x = t[String(cls || '').toUpperCase()] || t.ALL;
  return x && (x.mc || x.lq) ? x : null;
}
function epTargetText_(tg, mc, lq) {
  if (!tg) return '';
  var met = mc >= tg.mc && lq >= tg.lq;
  if (met) return 'Met';
  var part = function (n, of, what) { return of ? (n >= of ? what + ' done' : n + '/' + of + ' ' + what) : ''; };
  return [part(mc, tg.mc, 'MCQ'), part(lq, tg.lq, 'LQ')].filter(String).join(', ');
}

/* ============================================================== HISTORY === *
 * Each Progress update also keeps this week's line per student in a History
 * tab (one row per student per week, overwritten until the week ends), so
 * effort over the term is on record without anyone saving anything.
 * ========================================================================== */
function historySheet_() {
  return sheet_('History', ['week', 'uid', 'class', 'no.', 'nickname', 'days', 'MCQs this week', 'Long Qs this week',
                            'target', 'E this week', 'MCQs cleared', 'cleared %', 'updated']);
}
function epSaveHistory_(wk, lines) {
  var sh = historySheet_(), v = sh.getDataRange().getValues(), at = {};
  for (var i = 1; i < v.length; i++) if (String(v[i][0]) === wk) at[String(v[i][1])] = i + 1;
  var add = [];
  lines.forEach(function (l) {
    var row = [wk].concat(l, [new Date()]);
    if (at[l[0]]) sh.getRange(at[l[0]], 1, 1, row.length).setValues([row]); else add.push(row);
  });
  if (add.length) sh.getRange(sh.getLastRow() + 1, 1, add.length, add[0].length).setValues(add);
}

/* ========================================================= MONDAY EMAIL === *
 * Every Monday morning the script emails a short summary of last week to
 * the teacher (TEACHER_EMAILS, else the Sheet owner). Only the teacher gets
 * it; students are never emailed.
 * ========================================================================== */
function epWeeklyEmail() {
  var last = Utilities.formatDate(new Date(new Date(epWeek_() + 'T12:00:00Z').getTime() - 7 * 86400000), 'UTC', 'yyyy-MM-dd');
  var v = historySheet_().getDataRange().getValues().slice(1).filter(function (r) { return String(r[0]) === last; });
  var to = Object.keys(epTeachers_()).join(',') || Session.getEffectiveUser().getEmail();
  if (!to) return 'No teacher email.';
  var cls = {}, quiet = [], met = 0;
  v.forEach(function (r) {
    var c = cls[r[2]] || (cls[r[2]] = { n: 0, met: 0, active: 0 });
    c.n++;
    if (r[8] === 'Met') { c.met++; met++; }
    if (Number(r[5]) > 0) c.active++; else quiet.push(r[2] + '-' + r[3] + ' ' + r[4]);
  });
  var lines = ['tyneconbuddy · week of ' + last, ''];
  Object.keys(cls).sort().forEach(function (k) {
    var c = cls[k];
    lines.push(k + ': ' + c.active + '/' + c.n + ' practised, ' + c.met + ' met the target');
  });
  lines.push('', 'No practice last week (' + quiet.length + '):', quiet.slice(0, 60).join(', ') || 'nobody', '',
             'Details: the Progress and History tabs in the Sheet ' + ss_().getUrl());
  MailApp.sendEmail(to, 'tyneconbuddy weekly summary · ' + last + ' · ' + met + ' met the target', lines.join('\n'));
  return 'Sent to ' + to;
}
function epMenuEmail() {
  var have = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'epWeeklyEmail'; });
  if (!have) ScriptApp.newTrigger('epWeeklyEmail').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(7).create();
  tell_('Every Monday around 7:00 you will get a summary of last week by email. ' +
        'Keep "Update Progress and Dashboard every morning" on so the numbers are there.');
}

/* ====================================================== ONE-CLICK REWARD === *
 * Gives the same E to every student marked On track or Met this week in
 * the Progress tab (rebuilt first). Once per student per week.
 * ========================================================================== */
function epMenuReward() {
  epBuildProgress();
  var e = Math.round(Number(ask_('Reward this week\'s hard workers', 'How many E for each student who is On track or met the target this week? e.g. 30')) || 0);
  if (!e) return;
  var wk = epWeek_(), sh = ss_().getSheetByName('Progress'), v = sh.getDataRange().getValues(), hdr = -1;
  for (var i = 0; i < v.length; i++) if (v[i][0] === 'Class' && v[i][2] === 'Nickname') { hdr = i; break; }
  var seat = {};
  studentRows_().forEach(function (s) { if (s.status !== 'removed') seat[s.cls + '-' + Number(s.num)] = s.uid; });
  var n = 0;
  var cS = hdr >= 0 ? v[hdr].indexOf('Status') : -1, cT = hdr >= 0 ? v[hdr].indexOf('Target') : -1;
  for (var j = hdr + 1; hdr >= 0 && j < v.length; j++) {
    if (!(v[j][cS] === 'On track' || v[j][cT] === 'Met')) continue;
    var uid = seat[v[j][0] + '-' + Number(v[j][1])];
    if (!uid) continue;
    var res = withWallet_(uid, function (w) {
      if (w.st.once['rw:' + wk]) return [];
      w.st.once['rw:' + wk] = 1;
      return [{ a: 'teacher', p: e, ref: 'hard work, week of ' + wk, by: 'teacher', note: 'Weekly reward from the teacher' }];
    });
    if (res.aw && res.aw.length) n++;
  }
  tell_(n ? n + ' students got ' + e + ' E for this week.' : 'Nobody new to reward this week (each student can get it once a week).');
}


/* ================================================================ TASKS === *
 * The teacher assigns work in a Tasks tab: class (or ALL), a chapter or a
 * topic, how many MCQs, a due date. Progress is counted from the Cleared tab
 * (MCQs of that chapter or topic the student has got right), so students hand
 * nothing in; their Home page shows each open task with a Start button.
 * Chapters as the site lists them; keep in step with CHAPTERS in app.html.
 * ========================================================================== */
var EP_CHAPTERS = [
 ['ch1','Ch 1 · Basic Economic Concepts','core',['scarcity','oppcost','goods','types','posnorm','property','economy','interest','basic']],
 ['ch2','Ch 2 · Factors of Production & Labour','core',['factors','dol','labprod','labmob','labsup','wage']],
 ['ch3','Ch 3 · Firms & Production','core',['cprod','typeprod','dimret','shortlong','scale','expansion','profitmax','ownership','sharesbonds','pubpriv']],
 ['ch4','Ch 4 · Price Theory','core',['supdem','relprice','elasticity','shortsurp','funcprice']],
 ['ch5','Ch 5 · Market Structures & Welfare','core',['market','efficiency','extern','equity']],
 ['u11','Unit 11 · Market Intervention','ch11',['tax','sub','quo','flr','cel']],
 ['tf','Tax & Fiscal / Monetary','ch22',['fm','prp','tax']],
 ['micro','Efficiency & Equity','macro',['Efficiency','Externalities','Equity','Principles of Taxation','micro','mtax','elect']],
 ['natl','National Income','macro',['Circular Flow','GNP / GNI','Real / Nominal GDP','AD-AS','natl','gni','realgdp','adas']],
 ['money','Money & Banking','macro',['Problems of Barter','Functions of Money','Properties of Good Money','Banking System','Liquidity','M1 / M2 / M3','Monetary Base','Deposit Creation / Contraction','Function of HKMA','Money Demand','Money Market Equilibrium','Quantity Theory of Money','money','balsheet','qtm']],
 ['macro','Macro Problems','macro',['Business Cycle','Inflation / Deflation','Nominal / Real Interest Rate','Unemployment','macro','bizcycle','inflation','realint','unemp','policy']],
 ['trade','Trade & Forex','macro',["Int'l Trade (Concept)","Int'l Trade (Calculation)",'Trade Barriers','Balance of Payments','Exchange Rate','Linked Exchange Rate','trade','bop','fx','barrier']],
];

function taskSheet_() {
  var sh = sheet_('Tasks', ['class', 'chapter or topic', 'MCQs', 'due', 'on', 'note']);
  if (sh.getLastRow() < 2) sh.appendRow(['ALL', 'ch4', 20, new Date(Date.now() + 7 * 86400000), 'no',
    'example: type yes in "on" to use it. Chapter id (ch1-ch5, u11, tf, micro, natl, money, macro, trade), its name, or a topic such as elasticity']);
  return sh;
}
/* "ch4", "Price Theory", "elasticity" -> {label, chap?, page?, topic?} */
function epScope_(txt) {
  var t = String(txt || '').trim().toLowerCase();
  if (!t) return null;
  for (var i = 0; i < EP_CHAPTERS.length; i++) {
    var c = EP_CHAPTERS[i];
    if (t === c[0] || c[1].toLowerCase().indexOf(t) >= 0) return { label: c[1], chap: c[0], page: c[2], topics: c[3] };
  }
  for (var j = 0; j < EP_CHAPTERS.length; j++) {
    var c2 = EP_CHAPTERS[j];
    for (var k = 0; k < c2[3].length; k++) if (c2[3][k].toLowerCase() === t)
      return { label: c2[3][k] + ' (' + c2[1].split(' · ')[0] + ')', page: c2[2], topics: [c2[3][k]], topic: c2[3][k] };
  }
  return null;
}
/* MCQ keys in a scope, cached; and the chapter of every Bank MCQ. */
function epBankChap_() {
  var c = CacheService.getScriptCache(), hit = c.get('ep_bankchap');
  if (hit) { try { return JSON.parse(hit); } catch (e) {} }
  var out = {};
  rows_(bankSheet_(), 4).forEach(function (r) {
    if (String(r[1]).toLowerCase() !== 'mcq') return;
    var pg = String(r[2]), tp = String(r[3]), ch = '';
    for (var i = 0; i < EP_CHAPTERS.length && !ch; i++) if (EP_CHAPTERS[i][2] === pg && EP_CHAPTERS[i][3].indexOf(tp) >= 0) ch = EP_CHAPTERS[i][0];
    for (var j = 0; j < EP_CHAPTERS.length && !ch; j++) if (EP_CHAPTERS[j][2] === pg) ch = EP_CHAPTERS[j][0];
    out[String(r[0])] = [ch, pg, tp];
  });
  try { c.put('ep_bankchap', JSON.stringify(out), 600); } catch (e) {}   // over 100 KB: just not cached
  return out;
}
function epInScope_(sc, b) {
  return !!b && (sc.topic ? b[1] === sc.page && b[2] === sc.topic : b[0] === sc.chap);
}
function epTasks_() {
  var c = CacheService.getScriptCache(), hit = c.get('ep_tasks');
  if (hit) { try { return JSON.parse(hit); } catch (e) {} }
  var v = taskSheet_().getDataRange().getValues(), out = [];
  for (var i = 1; i < v.length; i++) {
    if (!yes_(v[i][4])) continue;
    var sc = epScope_(v[i][1]), n = Math.max(1, Math.round(Number(v[i][2]) || 0)), due = v[i][3] ? new Date(v[i][3]) : null;
    if (!sc) continue;
    out.push({ id: i + 1, cls: String(v[i][0]).trim().toUpperCase() || 'ALL', what: String(v[i][1]).trim(), sc: sc, n: n,
               due: due && !isNaN(due.getTime()) ? Utilities.formatDate(due, EP_TZ, 'yyyy-MM-dd') : '' });
  }
  c.put('ep_tasks', JSON.stringify(out), 120);
  return out;
}
/* Open tasks for one student: [{label, n, done, due, late, chap, page, topic}] */
function epTasksFor_(uid, cls, clearedSet) {
  var list = epTasks_().filter(function (t) { return t.cls === 'ALL' || t.cls === String(cls || '').toUpperCase(); });
  if (!list.length) return [];
  var bank = epBankChap_(), today = epDay_();
  return list.map(function (t) {
    var done = 0;
    for (var k in clearedSet) if (epInScope_(t.sc, bank[k])) done++;
    return { label: t.sc.label, n: t.n, done: Math.min(done, t.n), due: t.due, late: !!t.due && t.due < today && done < t.n,
             chap: t.sc.chap || '', page: t.sc.page, topic: t.sc.topic || '' };
  });
}
function epClearedOf_(uid) {
  var v = clearedSheet_().getDataRange().getValues();
  for (var i = 1; i < v.length; i++) if (String(v[i][0]) === uid) return pj_(v[i][1], {}) || {};
  return {};
}


/* ============================================================ ANALYSIS ==== *
 * Per student and chapter: MCQs answered (cleared or ever wrong) and MCQs
 * ever got wrong, from the Mistakes and Cleared tabs. acc(uid) = share of
 * answered MCQs never got wrong, or null before any answer.
 * ========================================================================== */
function epPerf_() {
  var bank = epBankChap_(), by = {}, cleared = {};
  function cell(u, ch) { var x = by[u] || (by[u] = {}); return x[ch] || (x[ch] = { a: {}, w: {} }); }
  clearedSheet_().getDataRange().getValues().slice(1).forEach(function (r) {
    var u = String(r[0]), set = pj_(r[1], {}) || {};
    cleared[u] = set;
    for (var k in set) if (bank[k]) cell(u, bank[k][0]).a[k] = 1;
  });
  rows_(mistakeSheet_(), 3).forEach(function (r) {
    var u = String(r[1]), k = String(r[2]);
    if (!bank[k]) return;
    var c = cell(u, bank[k][0]); c.a[k] = 1; c.w[k] = 1;
  });
  function n(o) { return Object.keys(o).length; }
  return {
    bank: bank, cleared: cleared, by: by,
    acc: function (u) {
      var a = 0, w = 0, x = by[u] || {};
      for (var ch in x) { a += n(x[ch].a); w += n(x[ch].w); }
      return a ? Math.round((1 - w / a) * 1000) / 1000 : null;
    },
    rate: function (u, ch) {
      var c = (by[u] || {})[ch]; if (!c) return null;
      var a = n(c.a); return a >= EP_WEAK_MIN ? n(c.w) / a : null;
    }
  };
}
var EP_WEAK_MIN = 5;   // fewer answers in a chapter than this: too few to judge

/* Weak topics tab: wrong rate per student per chapter, with each class's
   average on top. Red = 15+ points worse than the class average (and 30%+
   wrong): the students to pull into a small-group re-teach. */
function epBuildWeak() {
  var perf = epPerf_(), chs = EP_CHAPTERS.map(function (c) { return c; });
  var studs = studentRows_().filter(function (s) { return s.status !== 'removed' && s.status !== 'hidden'; })
    .sort(function (a, b) { return a.cls < b.cls ? -1 : a.cls > b.cls ? 1 : (Number(a.num) || 0) - (Number(b.num) || 0); });
  var avg = {};
  studs.forEach(function (s) {
    chs.forEach(function (c) {
      var r = perf.rate(s.uid, c[0]); if (r === null) return;
      var k = s.cls + '|' + c[0], x = avg[k] || (avg[k] = { s: 0, n: 0 }); x.s += r; x.n++;
    });
  });
  var classes = studs.map(function (s) { return s.cls; }).filter(function (c, i, a) { return a.indexOf(c) === i; });
  var head = ['Class', 'No.', 'Nickname'].concat(chs.map(function (c) { return c[1]; }));
  var body = [], bg = [];
  classes.forEach(function (k) {
    body.push([k, '', 'Class average'].concat(chs.map(function (c) { var x = avg[k + '|' + c[0]]; return x ? x.s / x.n : ''; })));
    bg.push(head.map(function () { return '#eeeeee'; }));
  });
  studs.forEach(function (s) {
    var row = [s.cls, Number(s.num) || '', s.nick], b = ['#ffffff', '#ffffff', '#ffffff'];
    chs.forEach(function (c) {
      var r = perf.rate(s.uid, c[0]), x = avg[s.cls + '|' + c[0]], a = x ? x.s / x.n : null;
      row.push(r === null ? '' : r);
      b.push(r !== null && a !== null && r >= 0.3 && r - a >= 0.15 ? '#f4cccc' : r !== null && r <= 0.1 ? '#d9ead3' : '#ffffff');
    });
    body.push(row); bg.push(b);
  });
  var ss = ss_(), sh = ss.getSheetByName('Weak topics') || ss.insertSheet('Weak topics', 1);
  sh.clear();
  sh.getRange(1, 1).setValue('Weak topics · wrong rate per chapter · updated ' + Utilities.formatDate(new Date(), EP_TZ, 'd MMM HH:mm'))
    .setFontWeight('bold').setFontSize(14);
  sh.getRange(2, 1).setValue('Wrong rate = MCQs ever got wrong ÷ MCQs answered in that chapter. Blank = fewer than ' + EP_WEAK_MIN +
    ' answered. Red = 15+ points worse than the class average: candidates for a small-group re-teach. Green = 10% or less.')
    .setFontStyle('italic').setFontColor('#666666');
  sh.getRange(4, 1, 1, head.length).setValues([head]).setFontWeight('bold').setBackground('#eeeeee').setWrap(true);
  if (body.length) {
    sh.getRange(5, 1, body.length, head.length).setValues(body).setBackgrounds(bg);
    sh.getRange(5, 4, body.length, chs.length).setNumberFormat('0%');
  }
  var msg = 'Weak topics updated: ' + studs.length + ' students.';
  try { ss.setActiveSheet(sh); ss.toast(msg); } catch (e) { Logger.log(msg); }
  return msg;
}
