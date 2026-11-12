/**
 * Crowder Quiz Show - save script.
 * Lives in the "Quiz Show" Google Sheet (Extensions > Apps Script).
 * Deploy > New deployment > Web app:
 *   Execute as: Me
 *   Who has access: Anyone
 *
 * GET  ?code=FAMILYCODE[&player=Nick]  -> settings, questions, and that player's history
 * POST {code, rows:[...]}               -> appends answers to the Results tab
 */

function doGet(e) {
  var p = (e && e.parameter) || {};
  var s = readSettings_();
  if (!s.FamilyCode) return json_({ ok: false, error: 'setup', message: 'Type a family code into the Settings tab first.' });
  if (!codeOk_(p.code, s.FamilyCode)) return json_({ ok: false, error: 'bad_code' });
  if (p.action === 'ping') return json_({ ok: true });

  var players = String(s.Players || 'Nick').split(',').map(function (x) { return x.trim(); }).filter(String);
  var player = p.player || players[0];
  return json_({
    ok: true,
    settings: {
      players: players,
      roundSize: Number(s.RoundSize) || 20,
      readQuestionsAloud: /^y/i.test(String(s.ReadQuestionsAloud || ''))
    },
    questions: readQuestions_(),
    history: readHistory_(player)
  });
}

function doPost(e) {
  var body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'bad_json' }); }
  var s = readSettings_();
  if (!s.FamilyCode || !codeOk_(body.code, s.FamilyCode)) return json_({ ok: false, error: 'bad_code' });

  var rows = (body.rows || []).slice(0, 200).map(function (r) {
    return [
      r.ts ? new Date(r.ts) : new Date(),
      clip_(r.player, 40), r.chapter, clip_(r.id, 20), clip_(r.type, 10),
      clip_(r.question, 300), clip_(r.given, 200), clip_(r.answer, 200),
      r.correct ? 'Yes' : 'No', Number(r.seconds) || 0, clip_(r.round, 40)
    ];
  });
  if (!rows.length) return json_({ ok: true, saved: 0 });

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sh = SpreadsheetApp.getActive().getSheetByName('Results');
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  } finally {
    lock.releaseLock();
  }
  return json_({ ok: true, saved: rows.length });
}

function readSettings_() {
  var vals = SpreadsheetApp.getActive().getSheetByName('Settings').getDataRange().getValues();
  var out = {};
  for (var i = 1; i < vals.length; i++) if (vals[i][0]) out[String(vals[i][0]).trim()] = vals[i][1];
  return out;
}

function readQuestions_() {
  var vals = SpreadsheetApp.getActive().getSheetByName('Questions').getDataRange().getValues();
  var head = vals[0].map(function (h) { return String(h).trim().toLowerCase(); });
  var col = function (name) { return head.indexOf(name); };
  var out = [];
  for (var i = 1; i < vals.length; i++) {
    var r = vals[i];
    if (!r[col('id')]) continue;
    if (/^n/i.test(String(r[col('active')]))) continue;
    out.push({
      id: String(r[col('id')]),
      chapter: String(r[col('chapter')]),
      type: String(r[col('type')]).trim().toLowerCase(),
      question: String(r[col('question')]),
      choices: String(r[col('choices')] || '').split('|').map(function (x) { return x.trim(); }).filter(String),
      answer: String(r[col('answer')]),
      fix: String(r[col('fix')] || ''),
      group: String(r[col('group')] || '')
    });
  }
  return out;
}

/** Per-question history for one player: times seen, times wrong, and whether the latest try was right. */
function readHistory_(player) {
  var sh = SpreadsheetApp.getActive().getSheetByName('Results');
  var last = sh.getLastRow();
  if (last < 2) return {};
  var vals = sh.getRange(2, 1, last - 1, 9).getValues();
  var h = {};
  vals.forEach(function (r) {
    if (String(r[1]) !== String(player)) return;
    var id = String(r[3]);
    var x = h[id] || (h[id] = { seen: 0, wrong: 0, lastRight: false });
    x.seen++;
    var right = r[8] === 'Yes';
    if (!right) x.wrong++;
    x.lastRight = right;
  });
  return h;
}

function codeOk_(given, real) {
  return String(given || '').trim().toLowerCase() === String(real || '').trim().toLowerCase();
}
function clip_(v, n) { return String(v == null ? '' : v).slice(0, n); }
function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
