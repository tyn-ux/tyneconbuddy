/*****************************************************************************
 * Access.gs — class list (Roster) gate and the access log  (2026-11-17)
 * ---------------------------------------------------------------------------
 * When the class list is ON, only Google accounts listed in the Roster tab
 * (active not "no") can sign in. Taking an email off the list, or setting
 * active to "no", shuts that account out within a minute, even mid-session.
 * Teachers in the Script Property TEACHER_EMAILS always get in.
 *
 *   Script Property ROSTER_ONLY = on   → class list required (menu toggles it)
 *   Tab "Roster"      email | name | active
 *   Tab "Access log"  ts | email | event | detail
 *     events: sign-in, refused:roster, refused:blocked, refused:domain
 *
 * Sign-ins are logged whether the class list is on or off, so you can always
 * see who has used the site and who was turned away.
 *****************************************************************************/

function accessLogSheet_() { return sheet_('Access log', ['ts','email','event','detail']); }

function rosterOn_() {
  return USE_ROSTER ||
    String(PropertiesService.getScriptProperties().getProperty('ROSTER_ONLY') || '').toLowerCase() === 'on';
}

function accessLog_(email, event, detail) {
  try { accessLogSheet_().appendRow([new Date(), String(email || ''), event, String(detail || '').slice(0, 200)]); }
  catch (e) { authErr_('accessLog_ threw: ' + e); }
}

/* Active roster emails, cached 60 s so the per-request check costs one read a minute. */
function rosterSet_() {
  var c = CacheService.getScriptCache(), hit = c.get('roster_set');
  if (hit) { try { return JSON.parse(hit); } catch (e) {} }
  var v = rosterSheet_().getDataRange().getValues(), out = {};
  for (var i = 1; i < v.length; i++) {
    var e = String(v[i][0]).trim().toLowerCase();
    if (e && String(v[i][2]).trim().toLowerCase() !== 'no') out[e] = 1;
  }
  c.put('roster_set', JSON.stringify(out), 60);
  return out;
}

/* May this email use the site under the class-list rule? */
function rosterOk_(email) {
  if (!rosterOn_()) return true;
  email = String(email || '').trim().toLowerCase();
  return !!(rosterSet_()[email] || epTeachers_()[email]);
}

/* Edits to the Roster tab take effect at once instead of after the 60 s cache. */
function rosterFlush_() { try { CacheService.getScriptCache().remove('roster_set'); } catch (e) {} }

/* ================================================================ MENU ==== */
function accMenuAdd() {
  var ui = SpreadsheetApp.getUi();
  var r = ui.prompt('Add students to the class list',
    'Paste emails, one per line. You may add a name after a comma:\n' +
    'chan.taiman@gmail.com, 5A-12 Chan Tai Man', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  var sh = rosterSheet_(), v = sh.getDataRange().getValues(), have = {}, rows = [], bad = [];
  for (var i = 1; i < v.length; i++) have[String(v[i][0]).trim().toLowerCase()] = 1;
  String(r.getResponseText() || '').split(/\n+/).forEach(function (line) {
    line = line.trim(); if (!line) return;
    var m = line.match(/^([^\s,;]+@[^\s,;]+)\s*[,;\t]?\s*(.*)$/);
    if (!m) { bad.push(line); return; }
    var e = m[1].toLowerCase();
    if (have[e]) return;
    have[e] = 1; rows.push([e, m[2] || '', 'yes']);
  });
  if (rows.length) sh.getRange(sh.getLastRow() + 1, 1, rows.length, 3).setValues(rows);
  rosterFlush_();
  tell_(rows.length + ' email(s) added to the Roster tab.' +
        (bad.length ? '\nNot an email, skipped:\n' + bad.slice(0, 10).join('\n') : '') +
        (rosterOn_() ? '' : '\n\nThe class list is OFF. Use "Turn the class list on / off" when the list is complete.'));
}

function accMenuToggle() {
  var ui = SpreadsheetApp.getUi(), on = rosterOn_();
  if (on && USE_ROSTER) { tell_('USE_ROSTER is true at the top of Code.gs, so the class list is always on. Set it to false there first.'); return; }
  var n = Object.keys(rosterSet_()).length;
  var r = ui.alert(on ? 'The class list is ON' : 'The class list is OFF',
    on ? 'Turn it OFF? Any Google account will be able to sign in again.'
       : 'Turn it ON? ' + n + ' active email(s) are in the Roster tab. Anyone else is signed out within a minute and refused at sign-in. Teachers in TEACHER_EMAILS always get in.',
    ui.ButtonSet.YES_NO);
  if (r !== ui.Button.YES) return;
  PropertiesService.getScriptProperties().setProperty('ROSTER_ONLY', on ? 'off' : 'on');
  rosterFlush_();
  tell_('The class list is now ' + (on ? 'OFF' : 'ON') + '.');
}

/* Copy the emails of students who already picked a seat into the Roster tab,
   so turning the list on does not lock out the class you already have. */
function accMenuFromStudents() {
  var sv = studentSheet_().getDataRange().getValues(), sh = rosterSheet_(), v = sh.getDataRange().getValues(), have = {}, rows = [];
  for (var i = 1; i < v.length; i++) have[String(v[i][0]).trim().toLowerCase()] = 1;
  for (var j = 1; j < sv.length; j++) {
    var e = String(sv[j][1]).trim().toLowerCase();
    if (!e || have[e] || String(sv[j][7] || '').trim().toLowerCase() === 'removed') continue;
    have[e] = 1; rows.push([e, String(sv[j][2]) + '-' + String(sv[j][3]) + ' ' + String(sv[j][4] || ''), 'yes']);
  }
  if (rows.length) sh.getRange(sh.getLastRow() + 1, 1, rows.length, 3).setValues(rows);
  rosterFlush_();
  tell_(rows.length + ' email(s) copied from Students into the Roster tab. Check them: anyone you do not know, set active to "no" or delete the row.');
}

/* Simple trigger: edits to the Roster tab clear the cache, so a removed
   student is out straight away. (The Blocklist has its own installed trigger.) */
function onEdit(e) {
  try { if (e && e.range && e.range.getSheet().getName() === 'Roster') rosterFlush_(); } catch (err) {}
}
