/* ======================================================= ADD A PAPER ====== *
 * paper.html "Add a paper" reads a whole paper with the teacher's own Gemini
 * key, the teacher checks every question there, and it downloads a file of
 * Bank rows. This adds that file to the Bank tab.
 *
 * Same rules as importNew() in Code.gs: a number already in the Bank is
 * skipped, never overwritten; page and topic are needed; an MCQ needs at
 * least two options and an answer that points at one. Nothing is deleted.
 * It never calls install().
 *
 * Menu: tyneconbuddy → Add a paper from the paper builder… (EPoints.gs onOpen)
 * ========================================================================== */

function paperImportMenu() {
  var html =
    '<div style="font:14px Arial,sans-serif;line-height:1.45">' +
    '<p>Choose the <b>paper-….json</b> file that paper.html (Add a paper) downloaded.</p>' +
    '<input type="file" id="f" accept=".json,application/json"> ' +
    '<button id="b" disabled>Add to the Bank</button>' +
    '<p id="m" style="color:#555"></p><div id="o" style="max-height:200px;overflow:auto;font-size:12.5px"></div></div>' +
    '<script>var T="",f=document.getElementById("f"),b=document.getElementById("b"),m=document.getElementById("m"),o=document.getElementById("o");' +
    'f.onchange=function(){var x=f.files[0];if(!x)return;x.text().then(function(t){T=t;b.disabled=false;m.textContent=x.name+" is ready."})};' +
    'b.onclick=function(){b.disabled=true;m.textContent="Adding…";' +
    'google.script.run.withFailureHandler(function(e){m.textContent="Could not add: "+e.message;b.disabled=false})' +
    '.withSuccessHandler(function(r){m.innerHTML="<b>"+r.added+" added</b>, "+r.skipped.length+" skipped."+(r.added?" Students see them on their next page load.":"");' +
    'o.innerHTML=r.skipped.map(function(s){return s[0]+": "+s[1]}).join("<br>")}).paperImport(T)};</script>';
  SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutput(html).setWidth(460).setHeight(300), 'Add a paper to the question bank');
}

function paperImport(text) {
  var j;
  try { j = JSON.parse(text); } catch (e) { throw new Error('That file is not readable JSON.'); }
  if (!j || j.kind !== 'tyneconbuddy-paper' || !Array.isArray(j.rows)) throw new Error('That is not a file from paper.html "Add a paper".');

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var bank = bankSheet_(), bv = bank.getDataRange().getValues(), have = {};
    for (var b = 1; b < bv.length; b++) have[String(bv[b][0])] = true;

    var rows = [], skipped = [];
    j.rows.forEach(function (r) {
      var why = paperRowProblem_(r, have);
      if (why) { skipped.push([String((r && r[0]) || '?'), why]); return; }
      var key = String(r[0]).trim(), item = JSON.parse(r[4]);
      item.id = key; item.key = key; item.topic = String(r[3]).trim();
      if (r[1] === 'mcq') item._page = String(r[2]).trim();
      rows.push([key, r[1], String(r[2]).trim(), String(r[3]).trim(), JSON.stringify(item)]);
      have[key] = true;
    });

    if (rows.length) bank.getRange(bank.getLastRow() + 1, 1, rows.length, 5).setValues(rows);
    // The section counts are cached for six hours; new questions must show now.
    CacheService.getScriptCache().remove('bank_index');
    return { added: rows.length, skipped: skipped };
  } finally {
    lock.releaseLock();
  }
}

function paperRowProblem_(r, have) {
  if (!Array.isArray(r) || r.length < 5) return 'not a Bank row';
  var key = String(r[0] || '').trim(), type = r[1], page = String(r[2] || '').trim(), topic = String(r[3] || '').trim();
  if (!key) return 'no question number';
  if (have[key]) return 'already in the Bank';
  if (type !== 'mcq' && type !== 'lq') return 'type must be mcq or lq';
  if (!page || !topic) return 'page and topic are both needed';
  var item;
  try { item = JSON.parse(r[4]); } catch (e) { return 'the question data is broken'; }
  if (!item || typeof item !== 'object') return 'the question data is broken';
  if (!String(item.q || '').trim() && !item.img) return 'the question is empty';
  if (type === 'mcq') {
    var opts = Array.isArray(item.opts) ? item.opts.filter(function (o) { return String(o || '').trim(); }) : [];
    if (opts.length < 2 && !item.img) return 'an MCQ needs at least options A and B';
    var a = Number(item.ans);
    if (!(a >= 0 && a <= 3) || a !== Math.floor(a)) return 'answer must be A, B, C or D';
    if (opts.length && a >= opts.length) return 'answer points at a blank option';
  }
  return '';
}
