(function () {
  "use strict";
  const A = window.QuizAudio;
  const API = (window.QUIZ_CONFIG && window.QUIZ_CONFIG.API_URL || "").trim();
  const app = document.getElementById("app");
  const LIMIT = { mc: 25, tf: 15, short: 40, match: 90 };

  /* ---------- Storage helpers ---------- */
  const store = {
    get(k, d) { try { const v = localStorage.getItem("cqs." + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem("cqs." + k, JSON.stringify(v)); } catch (e) {} },
    del(k) { try { localStorage.removeItem("cqs." + k); } catch (e) {} }
  };

  /* ---------- Small DOM helpers ---------- */
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  function el(html) { const d = document.createElement("div"); d.innerHTML = html.trim(); return d.firstElementChild; }
  function show(node) { app.innerHTML = ""; app.appendChild(node); }
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  /* ---------- Keyboard: one handler at a time ---------- */
  let keyHandler = null;
  document.addEventListener("keydown", e => {
    if (e.key === "m" && !(e.target && e.target.tagName === "INPUT")) { toggleMusic(); return; }
    if (keyHandler) keyHandler(e);
  });

  /* ---------- Music toggle ---------- */
  const musicBtn = document.getElementById("musicToggle");
  function paintMusic() { const on = A.isMusicOn(); musicBtn.textContent = "Music: " + (on ? "on" : "off"); musicBtn.setAttribute("aria-pressed", on); }
  function toggleMusic() { A.setMusic(!A.isMusicOn()); paintMusic(); if (A.isMusicOn() && inRound) A.startMusic(); }
  musicBtn.addEventListener("click", toggleMusic);
  paintMusic();

  /* ---------- Talking to the Google Sheet ---------- */
  let data = null, player = null, inRound = false;

  async function load(code, who) {
    const url = API + "?code=" + encodeURIComponent(code) + (who ? "&player=" + encodeURIComponent(who) : "");
    const r = await fetch(url, { redirect: "follow" });
    return r.json();
  }

  let sending = false;
  async function flush() {
    const q = store.get("queue", []);
    if (!q.length || sending || !API) return paintSaved();
    sending = true;
    const batch = q.slice(0, 100);
    try {
      const r = await fetch(API, { method: "POST", body: JSON.stringify({ code: store.get("code", ""), rows: batch }) });
      const j = await r.json();
      if (j.ok) store.set("queue", store.get("queue", []).slice(batch.length));
    } catch (e) { /* keep the queue and try again later */ }
    sending = false;
    paintSaved();
    if (store.get("queue", []).length && store.get("queue", []).length < q.length) flush();
  }
  function record(row) {
    const q = store.get("queue", []);
    q.push(row); store.set("queue", q);
    flush();
  }
  function paintSaved() {
    const n = store.get("queue", []).length;
    document.querySelectorAll("[data-saved]").forEach(s => {
      s.className = "saved " + (n ? "warn" : "ok");
      s.textContent = n ? n + " answer" + (n > 1 ? "s" : "") + " still saving. They'll send next time you play." : "All answers saved.";
    });
  }
  window.addEventListener("online", flush);

  /* ---------- Screens ---------- */
  function setupScreen() {
    show(el(`<div class="center">
      <span class="tag">Almost ready</span>
      <div class="big">The game isn't connected to the Google Sheet yet</div>
      <p class="muted">Paste the Apps Script web app address into config.js as API_URL.</p>
    </div>`));
  }

  function codeScreen(msg) {
    keyHandler = null;
    const n = el(`<form class="center" autocomplete="off">
      <div class="big">Enter the family code</div>
      <p class="muted">You only need to do this once on this computer.</p>
      <input type="password" id="code" aria-label="Family code" placeholder="Family code">
      <div class="err" id="err">${esc(msg || "")}</div>
      <button class="btn" type="submit">Continue</button>
    </form>`);
    n.addEventListener("submit", async e => {
      e.preventDefault();
      const code = n.querySelector("#code").value.trim();
      if (!code) return;
      n.querySelector("#err").textContent = "Checking...";
      try {
        const j = await load(code);
        if (!j.ok) { n.querySelector("#err").textContent = j.error === "bad_code" ? "That code didn't work. Try again." : (j.message || "Something went wrong."); return; }
        store.set("code", code); data = j; afterLoad();
      } catch (err) { n.querySelector("#err").textContent = "Couldn't reach the Google Sheet. Check the internet connection."; }
    });
    show(n);
    n.querySelector("#code").focus();
  }

  async function boot() {
    if (!API) return setupScreen();
    const code = store.get("code", "");
    if (!code) return codeScreen();
    show(el(`<div class="center"><div class="big">Loading...</div></div>`));
    try {
      const j = await load(code, store.get("player", ""));
      if (!j.ok) { store.del("code"); return codeScreen(j.error === "bad_code" ? "The family code changed. Enter the new one." : j.message); }
      data = j; afterLoad();
    } catch (e) {
      show(el(`<div class="center"><div class="big">Can't reach the Google Sheet</div><p class="muted">Check the internet connection, then try again.</p><button class="btn" type="button" id="retry">Try again</button></div>`));
      document.getElementById("retry").addEventListener("click", boot);
    }
    flush();
  }

  function afterLoad() {
    const players = data.settings.players;
    if (players.length === 1) { player = players[0]; return home(); }
    keyHandler = null;
    const n = el(`<div class="center"><div class="big">Who's playing?</div><div class="row"></div></div>`);
    players.forEach(p => {
      const b = el(`<button class="btn" type="button">${esc(p)}</button>`);
      b.addEventListener("click", async () => {
        player = p; store.set("player", p);
        try { const j = await load(store.get("code", ""), p); if (j.ok) data = j; } catch (e) {}
        home();
      });
      n.querySelector(".row").appendChild(b);
    });
    show(n);
  }

  function chapters() { return [...new Set(data.questions.map(q => q.chapter))].sort((a, b) => Number(b) - Number(a)); }

  function missedIds(ch) {
    return data.questions.filter(q => q.chapter === ch && data.history[q.id] && !data.history[q.id].lastRight).map(q => q.id);
  }

  function home() {
    inRound = false; A.stopMusic(); A.setTempo(128);
    const chs = chapters();
    let ch = store.get("chapter", chs[0]);
    if (!chs.includes(ch)) ch = chs[0];
    const readAloud = store.get("readAloud", data.settings.readQuestionsAloud);
    const n = el(`<div class="center">
      <span class="tag">Player: ${esc(player)}</span>
      <div class="big">Ready to play?</div>
      ${chs.length > 1 ? `<label class="card" style="text-align:left">Chapter
        <select id="ch" style="margin-left:10px;font:inherit;padding:6px;border-radius:8px">${chs.map(c => `<option ${c === ch ? "selected" : ""}>${esc(c)}</option>`).join("")}</select></label>` : `<p class="muted">Chapter ${esc(ch)}</p>`}
      <div class="options">
        <label class="opt"><input type="radio" name="mode" value="round" checked> <span><b>Quick round</b> · ${data.settings.roundSize} questions, focused on what you've missed</span></label>
        <label class="opt" id="missedOpt"><input type="radio" name="mode" value="missed"> <span><b>Missed questions only</b> · <span id="missedCount"></span></span></label>
        <label class="opt"><input type="radio" name="mode" value="all"> <span><b>Whole chapter</b> · every question</span></label>
        <label class="opt"><input type="checkbox" id="ra" ${readAloud ? "checked" : ""}> <span>Read each question out loud</span></label>
      </div>
      <button class="btn" type="button" id="go">Start <span class="kbd">Enter</span></button>
      <p class="muted" style="font-size:14px">Answer with keys <span class="kbd">1</span>–<span class="kbd">4</span>, <span class="kbd">T</span>/<span class="kbd">F</span>, or <span class="kbd">Enter</span>. <span class="kbd">M</span> turns music on or off.</p>
      <p class="saved" data-saved></p>
    </div>`);
    const paintMissed = () => {
      const m = missedIds(ch).length;
      n.querySelector("#missedCount").textContent = m ? m + " to practice" : "none yet";
      n.querySelector("#missedOpt input").disabled = !m;
    };
    paintMissed();
    const sel = n.querySelector("#ch");
    if (sel) sel.addEventListener("change", () => { ch = sel.value; store.set("chapter", ch); paintMissed(); });
    const go = () => {
      const mode = n.querySelector("input[name=mode]:checked").value;
      store.set("readAloud", n.querySelector("#ra").checked);
      startRound(ch, mode, n.querySelector("#ra").checked);
    };
    n.querySelector("#go").addEventListener("click", go);
    keyHandler = e => { if (e.key === "Enter" && e.target.tagName !== "SELECT") { e.preventDefault(); go(); } };
    show(n);
    paintSaved();
  }

  /* ---------- Building a round ---------- */
  function buildRound(ch, mode) {
    const qs = data.questions.filter(q => q.chapter === ch);
    const singles = qs.filter(q => q.type !== "match");
    const groups = {};
    qs.filter(q => q.type === "match").forEach(q => (groups[q.group] = groups[q.group] || []).push(q));
    const matchItems = Object.keys(groups).map(g => ({ type: "match", group: g, items: groups[g] }));
    const h = data.history;
    const isMissed = q => h[q.id] && !h[q.id].lastRight;

    if (mode === "all") return shuffle(singles).concat(shuffle(matchItems)).sort(() => 0).filter(Boolean);
    if (mode === "missed") {
      const ms = singles.filter(isMissed);
      const mg = matchItems.filter(m => m.items.some(isMissed));
      return shuffle(ms).concat(mg);
    }
    const size = data.settings.roundSize;
    const out = [];
    const missed = shuffle(singles.filter(isMissed)).slice(0, Math.ceil(size * 0.4));
    out.push(...missed);
    const used = new Set(out.map(q => q.id));
    // unseen first, then least practiced
    const rest = shuffle(singles.filter(q => !used.has(q.id)))
      .sort((a, b) => ((h[a.id] && h[a.id].seen) || 0) - ((h[b.id] && h[b.id].seen) || 0));
    const nMatch = Math.min(2, matchItems.length);
    out.push(...rest.slice(0, Math.max(0, size - out.length - nMatch)));
    const mPick = shuffle(matchItems).sort((a, b) => (b.items.some(isMissed) ? 1 : 0) - (a.items.some(isMissed) ? 1 : 0)).slice(0, nMatch);
    const mixed = shuffle(out);
    // spread the matching sets through the round
    mPick.forEach((m, k) => mixed.splice(Math.floor((mixed.length * (k + 1)) / (mPick.length + 1)), 0, m));
    return mixed;
  }

  /* ---------- Playing a round ---------- */
  let R = null, timerId = null;

  function startRound(ch, mode, readAloud) {
    const items = buildRound(ch, mode);
    if (!items.length) return home();
    R = { ch, items, i: 0, score: 0, streak: 0, right: 0, total: 0, missed: [], retry: false, readAloud,
          id: new Date().toISOString().slice(0, 16).replace("T", " ") + " " + Math.random().toString(36).slice(2, 6) };
    inRound = true;
    A.audio(); A.startMusic();
    next();
  }

  function next() {
    clearInterval(timerId); A.stopSpeaking(); A.setTempo(128);
    if (R.i >= R.items.length) {
      const again = R.missed.filter(m => m.q.type !== "match" && !m.retried);
      if (!R.retry && again.length) return retryIntro(again);
      return finish();
    }
    const item = R.items[R.i];
    if (item.type === "match") askMatch(item); else ask(item);
  }

  function retryIntro(again) {
    R.retry = true; R.firstLen = R.items.length;
    again.forEach(m => (m.retried = true));
    R.items = R.items.concat(shuffle(again.map(m => m.q)));
    keyHandler = e => { if (e.key === "Enter") { e.preventDefault(); next(); } };
    show(el(`<div class="center"><span class="tag">Second chance</span><div class="big">Let's try the ${again.length} you missed one more time</div>
      <button class="btn" type="button" id="go">Go <span class="kbd">Enter</span></button></div>`));
    document.getElementById("go").addEventListener("click", next);
    A.speak("Second chance. Let's try the ones you missed.");
  }

  function hud() {
    const left = R.items.length;
    return `<div class="hud"><span>${R.retry && R.i >= R.firstLen ? "Second chance" : "Question"} <b>${R.i + 1}</b> of ${left}</span><span>Score <b>${R.score}</b></span></div>
      <div class="timer" id="tw"><i id="bar"></i></div>`;
  }

  function startTimer(limit, onTimeout) {
    const bar = document.getElementById("bar"), tw = document.getElementById("tw");
    tw.classList.remove("wait");
    const start = performance.now(); let lastTick = -1;
    R.qStart = start; R.limit = limit;
    clearInterval(timerId);
    timerId = setInterval(() => {
      const left = Math.max(0, limit - (performance.now() - start) / 1000);
      R.tLeft = left;
      bar.style.transform = `scaleX(${left / limit})`;
      const whole = Math.ceil(left);
      if (left <= 5 && left > 0 && whole !== lastTick) { lastTick = whole; A.setTempo(150); A.sfx("tick"); }
      if (left <= 0) { clearInterval(timerId); onTimeout(); }
    }, 100);
  }

  function readThenTime(text, limit, onTimeout) {
    const tw = document.getElementById("tw");
    R.limit = limit; R.tLeft = limit;
    if (!R.readAloud || !text) return startTimer(limit, onTimeout);
    tw.classList.add("wait");
    R.waiting = true;
    A.speak(text, () => { R.waiting = false; if (!R.locked) startTimer(limit, onTimeout); });
  }

  const LABEL = { mc: "Multiple choice", tf: "True or false", short: "Short answer" };

  function ask(q) {
    R.locked = false;
    const isTF = q.type === "tf";
    const choices = isTF ? ["True", "False"] : q.type === "mc" ? q.choices : [];
    const n = el(`<div class="stage">${hud()}
      <div class="kind">${LABEL[q.type] || ""}</div>
      <div class="qcard">${esc(q.question)}</div></div>`);
    if (q.type === "short") {
      const f = el(`<form class="typein" autocomplete="off"><input type="text" id="ans" aria-label="Your answer" placeholder="Type your answer"><button class="btn" type="submit">Lock in <span class="kbd">Enter</span></button></form>`);
      f.addEventListener("submit", e => { e.preventDefault(); answer(q, f.querySelector("#ans").value); });
      n.appendChild(f);
      keyHandler = null;
    } else {
      const g = el(`<div class="tiles ${choices.length === 2 ? "two" : ""}"></div>`);
      choices.forEach((c, k) => {
        const key = isTF ? (k === 0 ? "T" : "F") : String(k + 1);
        const b = el(`<button class="tile t${k}" type="button" data-v="${esc(c)}"><span class="kbd">${key}</span><span>${esc(c)}</span></button>`);
        b.addEventListener("click", () => answer(q, c));
        g.appendChild(b);
      });
      n.appendChild(g);
      keyHandler = e => {
        if (R.locked) return;
        const k = e.key.toLowerCase();
        let idx = -1;
        if (isTF) { if (k === "t" || k === "1") idx = 0; if (k === "f" || k === "2") idx = 1; }
        else { if ("1234".includes(k) && k) idx = Number(k) - 1; if ("abcd".includes(k) && k) idx = "abcd".indexOf(k); }
        if (idx >= 0 && idx < choices.length) { e.preventDefault(); answer(q, choices[idx]); }
      };
    }
    show(n);
    const inp = n.querySelector("#ans"); if (inp) inp.focus();
    let spoken = q.question.replace(/_{2,}/g, "blank");
    if (q.type === "mc") spoken += ". " + choices.map((c, k) => (k + 1) + ", " + c).join(". ");
    if (isTF) spoken = "True or false. " + spoken;
    readThenTime(spoken, LIMIT[q.type] || 25, () => answer(q, null));
  }

  /* Short-answer checking: forgiving about capitals, punctuation, "the", and small spelling slips. */
  function norm(s) {
    return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
      .replace(/[^a-z0-9 ]/g, " ").replace(/\b(the|a|an)\b/g, " ").replace(/\s+/g, " ").trim();
  }
  // Edit distance where swapping two neighboring letters counts as one slip ("tarrif" vs "tariff").
  function dist(a, b) {
    const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
    const d = Array.from({ length: m + 1 }, (_, i) => [i].concat(new Array(n).fill(0)));
    for (let j = 0; j <= n; j++) d[0][j] = j;
    for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) {
      const c = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
    return d[m][n];
  }
  // Singular and plural count the same: tariff = tariffs, colony = colonies.
  const stem = w => w.split(" ").map(x => x.replace(/ies$/, "y").replace(/(ch|sh|x|ss)es$/, "$1").replace(/(?<!s)s$/, "")).join(" ");
  function checkShort(given, answer) {
    const g = stem(norm(given)); if (!g) return { ok: false };
    const alts = answer.split("|").map(x => stem(norm(x))).filter(Boolean);
    for (const a of alts) {
      if (g === a) return { ok: true, exact: true };
      // Doubled letters are a common slip: tarrif / tariff, Hugenots / Huguenots
      const single = w => w.replace(/(.)\1+/g, "$1");
      if (single(g) === single(a) || dist(single(g), single(a)) <= (a.length >= 9 ? 2 : a.length >= 4 ? 1 : 0)) return { ok: true, exact: false };
      const allowed = a.length >= 9 ? 2 : a.length >= 4 ? 1 : 0;
      if (allowed && dist(g, a) <= allowed) return { ok: true, exact: false };
    }
    return { ok: false };
  }
  // Google Sheets turns the words True/False into TRUE/FALSE, so compare without caring about capitals.
  const same = (x, y) => String(x).trim().toLowerCase() === String(y).trim().toLowerCase();
  const cap = w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  const mainAnswer = q => { const a = String(q.answer).split("|")[0].trim(); return q.type === "tf" ? cap(a) : a; };

  function answer(q, given) {
    if (R.locked) return;
    R.locked = true; clearInterval(timerId); A.stopSpeaking();
    keyHandler = null;
    const secs = R.qStart && !R.waiting ? Math.round((performance.now() - R.qStart) / 100) / 10 : 0;
    let ok, spellingNote = "";
    if (q.type === "short") {
      const c = checkShort(given, q.answer); ok = c.ok;
      if (ok && !c.exact) spellingNote = "Spelling: " + mainAnswer(q);
    } else ok = given !== null && same(given, q.answer);

    let pts = 0;
    R.total++;
    if (ok) {
      R.right++; R.streak++;
      const frac = R.limit ? (R.tLeft || 0) / R.limit : 0.5;
      pts = Math.round(1000 * (0.5 + 0.5 * frac)) + (R.streak > 1 ? 100 : 0);
      if (R.retry && R.missed.some(m => m.q.id === q.id)) pts = Math.round(pts / 2);
      R.score += pts; A.sfx("correct");
    } else {
      R.streak = 0; A.sfx("wrong");
      if (!R.missed.some(m => m.q.id === q.id)) R.missed.push({ q, given });
      else R.missed.find(m => m.q.id === q.id).given = given;
    }
    if (ok && R.retry) { const m = R.missed.find(m => m.q.id === q.id); if (m) m.fixed = true; }

    record({ ts: new Date().toISOString(), player, chapter: q.chapter, id: q.id, type: q.type, question: q.question,
             given: given == null ? "(time ran out)" : given, answer: mainAnswer(q), correct: ok, seconds: secs,
             round: R.id + (R.retry && R.missed.some(m => m.q.id === q.id && m.retried) ? " retry" : "") });

    // Mark tiles
    document.querySelectorAll(".tile").forEach(t => t.classList.add(same(t.dataset.v, q.answer) ? "right" : "dim"));
    const stage = document.querySelector(".stage");
    setTimeout(() => {
      if (ok) {
        stage.appendChild(el(`<div class="overlay good"><div class="big">Correct!</div><div class="pts">+${pts}${R.streak > 1 ? " · streak bonus" : ""}</div>${spellingNote ? `<p class="fix">${esc(spellingNote)}</p>` : ""}</div>`));
        if (spellingNote) A.speak("Correct. It's spelled " + mainAnswer(q).split("").join(" "));
        setTimeout(() => { R.i++; next(); }, spellingNote ? 2600 : 1400);
      } else {
        const fix = fixText(q);
        const o = el(`<div class="overlay bad"><div class="big">${given == null ? "Time's up" : "Not quite"}</div><p class="fix">${esc(fix)}</p>
          <p class="muted listening">Listen to the answer...</p>
          <button class="btn" type="button" hidden>Next question <span class="kbd">Enter</span></button></div>`);
        stage.appendChild(o);
        afterSpeech(o, (given == null ? "Time's up. " : "Not quite. ") + fix);
      }
    }, 400);
  }

  /* Read the correction out loud. The Next button stays hidden until the reading is finished. */
  function afterSpeech(o, text) {
    const btn = o.querySelector("button"), note = o.querySelector(".listening");
    const minMs = Math.min(8000, Math.max(2000, text.length * 45)), t0 = performance.now();
    keyHandler = null;
    const go = () => { R.i++; next(); };
    btn.addEventListener("click", go);
    A.speak(text, () => {
      setTimeout(() => {
        if (!o.isConnected) return;
        note.hidden = true; btn.hidden = false; btn.focus();
        keyHandler = e => { if (e.key === "Enter") { e.preventDefault(); go(); } };
      }, Math.max(300, minMs - (performance.now() - t0)));
    });
  }

  function fixText(q) {
    if (q.fix) return q.fix;
    if (q.type === "tf") return "True. " + q.question;
    return "Correct answer: " + mainAnswer(q) + ".";
  }

  /* ---------- Matching round ---------- */
  function askMatch(m) {
    R.locked = false;
    const items = shuffle(m.items);
    const terms = shuffle(m.items.map(q => q.answer));
    const misses = new Set();
    let selDef = null, selTerm = null, done = 0;
    const n = el(`<div class="stage">${hud()}
      <div class="kind">Matching · click a description, then its term</div>
      <div class="match"><div class="col" id="defs"></div><div class="col" id="terms"></div></div></div>`);
    const defs = n.querySelector("#defs"), tcol = n.querySelector("#terms");
    items.forEach((q, k) => {
      const b = el(`<button class="def" type="button"><span class="kbd">${k + 1}</span><span>${esc(q.question)}</span></button>`);
      b._q = q; b.addEventListener("click", () => pick("def", b)); defs.appendChild(b);
    });
    terms.forEach((t, k) => {
      const b = el(`<button class="term" type="button"><span class="kbd">${"ABCDEFG"[k]}</span><span>${esc(t)}</span></button>`);
      b._t = t; b.addEventListener("click", () => pick("term", b)); tcol.appendChild(b);
    });
    function pick(kind, b) {
      if (R.locked || b.classList.contains("done")) return;
      if (kind === "def") { if (selDef) selDef.classList.remove("sel"); selDef = b; } else { if (selTerm) selTerm.classList.remove("sel"); selTerm = b; }
      b.classList.add("sel");
      if (selDef && selTerm) {
        const d = selDef, t = selTerm; selDef = selTerm = null;
        d.classList.remove("sel"); t.classList.remove("sel");
        if (d._q.answer === t._t) {
          d.classList.add("done"); t.classList.add("done");
          d.appendChild(el(`<span class="paired">${esc(t._t)}</span>`));
          A.sfx("pair"); done++;
          if (done === items.length) finishMatch();
        } else {
          misses.add(d._q.id); A.sfx("wrong");
          [d, t].forEach(x => { x.classList.add("miss"); setTimeout(() => x.classList.remove("miss"), 400); });
        }
      }
    }
    keyHandler = e => {
      const k = e.key.toLowerCase();
      const di = "12345".indexOf(k), ti = "abcde".indexOf(k);
      if (di >= 0 && defs.children[di]) { e.preventDefault(); pick("def", defs.children[di]); }
      if (ti >= 0 && k && tcol.children[ti]) { e.preventDefault(); pick("term", tcol.children[ti]); }
    };
    function finishMatch(timedOut) {
      if (R.locked) return;
      R.locked = true; clearInterval(timerId); A.stopSpeaking(); keyHandler = null;
      const frac = R.limit ? (R.tLeft || 0) / R.limit : 0.5;
      let pts = 0;
      const missedItems = [];
      items.forEach(q => {
        const ok = !misses.has(q.id) && !(timedOut && !isDone(q));
        R.total++;
        if (ok) { R.right++; pts += Math.round(200 * (0.5 + 0.5 * frac)); }
        else { missedItems.push(q); if (!R.missed.some(x => x.q.id === q.id)) R.missed.push({ q, given: "(matching)" }); }
        record({ ts: new Date().toISOString(), player, chapter: q.chapter, id: q.id, type: "match", question: q.question,
                 given: ok ? q.answer : "(mismatched)", answer: q.answer, correct: ok, seconds: 0, round: R.id });
      });
      R.score += pts;
      R.streak = missedItems.length ? 0 : R.streak + 1;
      const stage = n;
      if (!missedItems.length) {
        A.sfx("correct");
        stage.appendChild(el(`<div class="overlay good"><div class="big">All matched!</div><div class="pts">+${pts}</div></div>`));
        setTimeout(() => { R.i++; next(); }, 1500);
      } else {
        A.sfx("wrong");
        const o = el(`<div class="overlay bad"><div class="big">Review these</div>
          <ul>${missedItems.map(q => `<li><b>${esc(q.answer)}</b>: ${esc(q.question)}</li>`).join("")}</ul>
          <p class="muted listening">Listen to the answers...</p>
          <button class="btn" type="button" hidden>Next <span class="kbd">Enter</span></button></div>`);
        stage.appendChild(o);
        afterSpeech(o, "Review these. " + missedItems.map(q => q.answer + ": " + q.question).join(". "));
      }
    }
    function isDone(q) { return [...defs.children].some(b => b._q === q && b.classList.contains("done")); }
    show(n);
    readThenTime(R.readAloud ? "Matching. Click a description, then its term." : "", LIMIT.match, () => finishMatch(true));
  }

  /* ---------- End of round ---------- */
  function finish() {
    inRound = false; A.stopMusic(); A.stopSpeaking(); A.sfx("fanfare");
    // Update local history so "missed only" is right without a reload
    const still = R.missed.filter(m => !m.fixed);
    R.items.forEach(it => (it.type === "match" ? it.items : [it]).forEach(q => {
      const h = data.history[q.id] || (data.history[q.id] = { seen: 0, wrong: 0, lastRight: false });
      h.seen++; const miss = still.some(m => m.q.id === q.id); h.lastRight = !miss; if (miss) h.wrong++;
    }));
    const n = el(`<div class="center">
      <div class="big">Round over</div>
      <div class="score">${R.score}</div>
      <p>${R.right} of ${R.total} answers correct</p>
      ${still.length ? `<div class="review"><b>Study these before the test</b>${still.map(m => `<div><b>${esc(m.q.type === "match" ? m.q.answer : m.q.question)}</b><br>${esc(m.q.type === "match" ? m.q.question : fixText(m.q))}</div>`).join("")}</div>`
                     : `<p>Every miss was fixed on the second try. Nice work.</p>`}
      <p class="saved" data-saved></p>
      <div class="row"><button class="btn" type="button" id="again">Play again <span class="kbd">Enter</span></button></div>
    </div>`);
    n.querySelector("#again").addEventListener("click", home);
    keyHandler = e => { if (e.key === "Enter") { e.preventDefault(); home(); } };
    show(n);
    flush();
  }

  boot();
})();
