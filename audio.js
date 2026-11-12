// Original theme music, sound effects, and read-aloud. No audio files: everything is generated in the browser.
(function () {
  let ctx = null, master = null, noiseBuf = null;
  let playing = false, step = 0, nextTime = 0, sched = null, tempo = 128;
  let musicOn = true, baseGain = 0.2;
  try { musicOn = localStorage.getItem("cqs.music") !== "off"; } catch (e) {}

  function audio() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = baseGain; master.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
  function tone(freq, t, dur, type, vol) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(t, dur, vol, hp) {
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf; f.type = "highpass"; f.frequency.value = hp;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + dur + 0.02);
  }
  function kick(t) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.2);
  }
  const CHORDS = [
    { root: 45, notes: [57, 60, 64] },
    { root: 41, notes: [57, 60, 65] },
    { root: 48, notes: [55, 60, 64] },
    { root: 43, notes: [55, 59, 62] }
  ];
  const ARP = [0, 1, 2, 1, 2, 1, 0, 1, 0, 1, 2, 2, 1, 2, 0, 2];
  function scheduleStep(s, t) {
    const sixteenth = 60 / tempo / 4;
    const bar = Math.floor(s / 16) % 4, i = s % 16, ch = CHORDS[bar];
    if (i % 8 === 0 || i === 14) kick(t);
    if (i === 4 || i === 12) noise(t, 0.16, 0.35, 1200);
    if (i % 2 === 0) noise(t, 0.04, i % 4 === 2 ? 0.18 : 0.08, 7000);
    if (i % 2 === 0) tone(mtof(ch.root + (i % 4 === 2 ? 12 : 0)), t, sixteenth * 1.8, "sawtooth", 0.18);
    if (i === 0) ch.notes.forEach(n => tone(mtof(n), t, sixteenth * 15, "triangle", 0.06));
    tone(mtof(ch.notes[ARP[i]] + 12), t, sixteenth * 0.9, "square", 0.05);
  }
  function scheduler() {
    const sixteenth = 60 / tempo / 4;
    while (nextTime < ctx.currentTime + 0.12) { scheduleStep(step, nextTime); nextTime += sixteenth; step++; }
  }
  function startMusic() {
    if (!musicOn || playing || !audio()) return;
    playing = true; step = 0; nextTime = ctx.currentTime + 0.05;
    sched = setInterval(scheduler, 25);
  }
  function stopMusic() { playing = false; clearInterval(sched); sched = null; }
  function setTempo(bpm) { tempo = bpm; }

  const SFX = {
    correct() { const t = ctx.currentTime; [72, 76, 79, 84].forEach((n, k) => tone(mtof(n), t + k * 0.07, 0.25, "triangle", 0.35)); },
    wrong() {
      const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "sawtooth"; o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(80, t + 0.45);
      g.gain.setValueAtTime(0.3, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.55);
    },
    tick() { tone(1400, ctx.currentTime, 0.05, "square", 0.2); },
    pair() { const t = ctx.currentTime; tone(mtof(79), t, 0.12, "triangle", 0.3); tone(mtof(84), t + 0.06, 0.18, "triangle", 0.3); },
    fanfare() {
      const t = ctx.currentTime;
      [60, 64, 67, 72].forEach((n, k) => tone(mtof(n), t + k * 0.12, 0.3, "square", 0.12));
      [60, 64, 67, 72].forEach(n => tone(mtof(n), t + 0.55, 1.1, "triangle", 0.12)); kick(t + 0.55);
    }
  };
  function sfx(name) { if (audio() && SFX[name]) SFX[name](); }

  function duck(on) { if (master && ctx) master.gain.setTargetAtTime(on ? 0.04 : baseGain, ctx.currentTime, 0.1); }

  // Read aloud. Calls onDone when finished (or after a safety timeout).
  function speak(text, onDone) {
    let done = false;
    const finish = () => { if (done) return; done = true; duck(false); if (onDone) onDone(); };
    if (!("speechSynthesis" in window)) { finish(); return; }
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 0.95; u.lang = "en-US";
      const v = speechSynthesis.getVoices().find(x => /en-US/i.test(x.lang) && /Google|Natural|Aria|Jenny|Samantha/i.test(x.name));
      if (v) u.voice = v;
      u.onend = finish; u.onerror = finish;
      duck(true); speechSynthesis.speak(u);
      setTimeout(finish, Math.max(4000, text.length * 90));
    } catch (e) { finish(); }
  }
  function stopSpeaking() { try { speechSynthesis.cancel(); } catch (e) {} duck(false); }
  if ("speechSynthesis" in window) { try { speechSynthesis.getVoices(); } catch (e) {} }

  function setMusic(on) {
    musicOn = on;
    try { localStorage.setItem("cqs.music", on ? "on" : "off"); } catch (e) {}
    if (!on) stopMusic();
  }

  window.QuizAudio = { audio, startMusic, stopMusic, setTempo, sfx, speak, stopSpeaking, setMusic, isMusicOn: () => musicOn };
})();
