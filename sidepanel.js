// Verbly v1 | side panel: the "brain". Speaks questions, listens, understands, and fills the form.
// English only (en-IN recognizer, which also handles Indian-accented English well).
'use strict';

const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LANG = 'en-IN';
const GEM = 'https://generativelanguage.googleapis.com/v1beta';

const state = {
  running: false,
  rate: 1,
  muted: false,
  apiKey: '',
  model: '',
  models: [],
  rec: null,
  lastAlts: null,
  typedResolve: null,
  answers: new Map(),
  audioCtx: null,
  voiceName: '',
};

/* ---------- Spoken strings ---------- */
const S = {
  welcome: (t, n) => `Form: ${t}. This page has ${n} questions. You can say repeat, back, skip, options, spell, read my answers, or stop at any time.`,
  qOf: (i, n) => `Question ${i} of ${n}.`,
  required: 'This is required.',
  optional: 'This is optional, you can say skip.',
  chooseOne: 'Choose one option.',
  chooseMany: 'Choose one or more options.',
  manyOptions: (n) => `There are ${n} options. Say read options to hear them, or just say your answer.`,
  scale: (a, b) => `Say a number from ${a} to ${b}.`,
  date: 'Say the date, for example 5 March 2008.',
  time: 'Say the time, for example 4 30 PM.',
  speakAnswer: 'Speak your answer after the beep.',
  confirm: (a) => `I heard: ${a}. Say Y for Yes, or N for No.`,
  yesNo: 'Please say the full phrase: Y for Yes, or N for No.',
  confirmSel: (a) => `You selected: ${a}. Say Y for Yes to confirm, or N for No to choose again.`,
  checkIntro: 'I will read each option one by one. For each option, say Y for Yes to select it, or N for No to leave it out.',
  checkOpt: (k, n, o) => `Option ${k} of ${n}: ${o}. Select this? Say Y for Yes, or N for No.`,
  mustChoose: 'This question is required, so please select at least one option.',
  notHeard: 'I did not hear anything. Please say it again after the beep.',
  struggle: 'If speaking is hard, say spell, and give letters like A for Apple.',
  unclear: 'Sorry, I did not understand. Please try again.',
  again: 'Okay, let us try again.',
  saved: 'Done.',
  mustAnswer: 'This question is required, so it cannot be skipped.',
  finishFirst: 'Let us finish the questions first.',
  unsupported: (i) => `Question ${i} cannot be filled by voice. Please ask someone to help with it. Moving on.`,
  spellIntro: 'Spell it now, after each beep. Say letters, or words like A for Apple. Say done when finished, or delete to remove the last letter.',
  spellBack: (s) => `I have: ${s.split('').join(', ')}. `,
  reviewIntro: 'Here are your answers.',
  submitAsk: 'Say submit to send the form, or say change and a number to fix an answer.',
  submitted: 'Your form has been submitted. Thank you.',
  submitFail: 'The form did not go through.',
  pageErrors: (e) => `The form says: ${e}. Let us fix that.`,
  stopped: 'Stopped.',
  noForm: 'I cannot see a Google Form in this tab. Open the form link you want to fill, then press Start.',
  noQuestions: 'I could not find questions on this page. Make sure this is the fill-in link of the form, not the editor.',
  micNeeded: 'I need microphone permission. A new tab has opened. Allow the microphone there, then press Start again.',
  cannotChange: 'I can only change answers on this last page.',
};
const T = (k, ...a) => (typeof S[k] === 'function' ? S[k](...a) : S[k]);

/* ---------- Vocabulary ---------- */
const CMD = {
  repeat: ['repeat', 'again', 'say again', 'read again', 'repeat that', 'repeat the question'],
  options: ['options', 'read options', 'read the options', 'what are the options'],
  back: ['back', 'go back', 'previous', 'previous question'],
  skip: ['skip', 'pass', 'next', 'skip this', 'skip it'],
  read_answers: ['read my answers', 'read answers', 'my answers', 'read all answers'],
  submit: ['submit', 'submit form', 'submit the form', 'send', 'send form', 'send the form'],
  stop: ['stop', 'exit', 'quit', 'stop it'],
  spell: ['spell', 'spell it', 'let me spell', 'i will spell'],
};
// The user must say the full phrase "Y for Yes" or "N for No".
// The recognizer often writes the letter as a word ("why", "and", "end"), so those are tolerated.
const FOR = '(?:for|fore|four|4)';
const YES_RE = new RegExp('\\b(?:y|why|wye|wy|i)\\s+' + FOR + '\\s+yes\\b');
const NO_RE = new RegExp('\\b(?:n|en|end|and|in|an|nn)\\s+' + FOR + '\\s+no\\b');
const DONE = ['done', 'finished', 'finish', 'that is it', 'thats it', 'i am done'];
const UNDO = ['delete', 'undo', 'backspace', 'remove', 'delete last'];
const NUM = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10,
};

const norm = (t) =>
  String(t || '')
    .toLowerCase()
    .replace(/[.,!?"“”'’]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
const isYes = (t) => YES_RE.test(t);
const isNo = (t) => NO_RE.test(t);

function matchCommand(t) {
  for (const [name, phrases] of Object.entries(CMD)) if (phrases.includes(t)) return name;
  return null;
}
function numberFrom(t) {
  const d = t.match(/\b(\d+)\b/);
  if (d) return parseInt(d[1], 10);
  for (const w of t.split(' ')) if (NUM[w] !== undefined) return NUM[w];
  return null;
}

/* ---------- Local option matching ---------- */
function matchOne(q, t) {
  const opts = q.options || [];
  if (q.type === 'scale') {
    const n = numberFrom(t);
    return opts.findIndex((o) => o === String(n));
  }
  const labels = opts.map(norm);
  let best = -1;
  let bestScore = 0;
  labels.forEach((l, i) => {
    if (!l) return;
    let s = 0;
    if (t === l) s = 1;
    else if (l.length >= 3 && t.includes(l)) s = 0.9;
    else if (t.length >= 3 && l.includes(t)) s = 0.8;
    else {
      const a = new Set(l.split(' '));
      const b = t.split(' ');
      const hit = b.filter((x) => a.has(x)).length;
      s = (hit / Math.max(a.size, b.length)) * 0.8;
    }
    if (s > bestScore) {
      bestScore = s;
      best = i;
    }
  });
  if (bestScore >= 0.6) return best;
  const n = numberFrom(t);
  if (n && n >= 1 && n <= opts.length) return n - 1;
  return -1;
}
function localChoice(q, t) {
  if (q.type === 'checkbox') {
    if (['none', 'nothing', 'none of them'].includes(t)) return [];
    const parts = t.split(/\band\b|,/).map((p) => p.trim()).filter(Boolean);
    const picked = [];
    for (const p of parts) {
      const i = matchOne(q, p);
      if (i >= 0 && !picked.includes(q.options[i])) picked.push(q.options[i]);
    }
    return picked.length ? picked : null;
  }
  const i = matchOne(q, t);
  return i >= 0 ? q.options[i] : null;
}

/* ---------- Local text / date / time ---------- */
function formatText(q, raw) {
  let v = raw.trim();
  const looksEmail = q.inputType === 'email' || /e-?mail/i.test(q.title);
  if (looksEmail) {
    v = v.toLowerCase().replace(/\s+(at the rate( of)?|at)\s+/g, '@').replace(/\s+dot\s+/g, '.').replace(/\s+/g, '');
  } else if (q.inputType === 'tel' || q.inputType === 'number') {
    v = v.split(/\s+/).map((w) => (NUM[w.toLowerCase()] !== undefined ? NUM[w.toLowerCase()] : w)).join('').replace(/[\s-]/g, '');
  }
  return v;
}
function localDate(t) {
  const d = new Date(t);
  if (isNaN(d)) return null;
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function localTime(t) {
  const m = t.match(/(\d{1,2})(?:[: ](\d{2}))?\s*(am|pm|a m|p m)?/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  const mer = (m[3] || '').replace(' ', '').toLowerCase();
  if (mer === 'pm' && h < 12) h += 12;
  if (mer === 'am' && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

/* ---------- Gemini: connection, model discovery, calls ---------- */
function setGem(text, ok) {
  const cls = ok === true ? 'ok' : ok === false ? 'bad' : '';
  $('geminiStatus').textContent = text;
  $('geminiStatus').className = cls;
  const b = $('geminiBadge');
  b.textContent = text.startsWith('Gemini') ? text : 'Gemini: ' + text;
  b.className = 'badge ' + cls;
}

async function errText(r) {
  let msg = '';
  try { msg = (await r.json()).error?.message || ''; } catch (_) {}
  const hint =
    r.status === 400 || r.status === 403 ? ' (key rejected or not allowed: check the key)' :
    r.status === 404 ? ' (model not found: run Test Gemini connection)' :
    r.status === 429 ? ' (free-tier rate limit reached: wait a minute)' : '';
  return `HTTP ${r.status}${hint} ${msg}`.trim();
}

function pickModel(models) {
  const stable = (m) => !/(preview|exp|latest)/.test(m);
  return (
    models.find((m) => /flash-lite/.test(m) && stable(m)) ||
    models.find((m) => /flash/.test(m) && !/lite/.test(m) && stable(m)) ||
    models.find((m) => /flash-lite/.test(m)) ||
    models.find((m) => /flash/.test(m)) ||
    models[0]
  );
}

function renderModels() {
  const sel = $('model');
  sel.innerHTML = '';
  const list = state.models.length ? state.models : state.model ? [state.model] : [];
  if (!list.length) sel.innerHTML = '<option value="">Test the connection to load models</option>';
  for (const m of list) {
    const o = document.createElement('option');
    o.value = m;
    o.textContent = m;
    sel.appendChild(o);
  }
  if (state.model) sel.value = state.model;
}

async function gemini(prompt) {
  if (!state.apiKey) throw new Error('no key');
  if (!state.model) throw new Error('no model selected');
  const r = await fetch(`${GEM}/models/${encodeURIComponent(state.model)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': state.apiKey },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0, responseMimeType: 'application/json' },
    }),
  });
  if (!r.ok) throw new Error(await errText(r));
  const j = await r.json();
  const text = (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
  return JSON.parse(text.replace(/```json|```/g, '').trim());
}

// Lists models for this key, picks one automatically, then makes a real test call.
async function testGemini() {
  if (!state.apiKey) {
    setGem('Gemini: no key set. Built-in matching only.', null);
    return false;
  }
  setGem('Gemini: checking your key...', null);
  try {
    const r = await fetch(`${GEM}/models?pageSize=200`, { headers: { 'x-goog-api-key': state.apiKey } });
    if (!r.ok) throw new Error(await errText(r));
    const j = await r.json();
    const models = (j.models || [])
      .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map((m) => m.name.replace(/^models\//, ''))
      .filter((n) => /gemini/.test(n) && !/(image|tts|live|audio|embed|robotics|computer|vision|veo|imagen)/.test(n));
    if (!models.length) throw new Error('No usable Gemini models found for this key');
    state.models = models;
    if (!models.includes(state.model)) state.model = pickModel(models);
    await chrome.storage.local.set({ models, model: state.model });
    renderModels();
    setGem(`Gemini: key accepted, testing ${state.model}...`, null);
    const out = await gemini('Reply with exactly this JSON: {"ok": true}');
    if (!out || typeof out !== 'object') throw new Error('Unexpected reply from Gemini');
    setGem(`Gemini: connected ✓ using ${state.model}`, true);
    return true;
  } catch (e) {
    setGem(`Gemini: NOT connected. ${e.message}`, false);
    return false;
  }
}

async function geminiInterpret(q, utterance) {
  const prompt = `You are the voice engine of an accessibility tool that fills web forms for blind users.
The user speaks English (possibly with an Indian accent). The speech recognizer may have made mistakes.
Form question: "${q.title}"
Question type: ${q.type}${q.options ? `\nAllowed options: ${JSON.stringify(q.options)}` : ''}
The user said: "${utterance}"
Return ONLY JSON: {"intent": "answer|repeat|options|back|skip|read_answers|submit|stop|spell|unclear", "value": ...}
Rules:
- choice/dropdown/scale: value = the exact string from Allowed options that best matches (the user may say a number or ordinal).
- checkbox: value = array of exact strings from Allowed options.
- date: value = "YYYY-MM-DD". time: value = "HH:MM" in 24h.
- number-like text (phone, age): digits only.
- email: lowercase email address.
- other text: the cleaned answer. Fix obvious transcription errors but do not invent.
- If the user gives a navigation command, set intent accordingly. If nothing fits, intent = "unclear".`;
  return gemini(prompt);
}

function validateAnswer(q, it) {
  if (!it || it.intent !== 'answer') return it || { intent: 'unclear' };
  const opts = q.options || [];
  if (['choice', 'dropdown', 'scale'].includes(q.type) && !opts.includes(it.value)) return { intent: 'unclear' };
  if (q.type === 'checkbox') {
    const arr = Array.isArray(it.value) ? it.value.filter((v) => opts.includes(v)) : [];
    return arr.length ? { intent: 'answer', value: arr } : { intent: 'unclear' };
  }
  if (q.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(String(it.value))) return { intent: 'unclear' };
  if (q.type === 'time' && !/^\d{2}:\d{2}$/.test(String(it.value))) return { intent: 'unclear' };
  return it;
}

/* ---------- Interpretation: local first, Gemini as fallback ---------- */
async function interpret(q, heard) {
  const t = norm(heard);
  const cmd = matchCommand(t);
  if (cmd) return { intent: cmd };

  if (['choice', 'dropdown', 'scale', 'checkbox'].includes(q.type)) {
    const v = localChoice(q, t);
    if (v !== null) return { intent: 'answer', value: v };
  } else if (q.type === 'date') {
    const v = localDate(heard);
    if (v) return { intent: 'answer', value: v };
  } else if (q.type === 'time') {
    const v = localTime(heard);
    if (v) return { intent: 'answer', value: v };
  } else {
    const plain = q.inputType === 'email' || q.inputType === 'tel' || q.inputType === 'number' || /e-?mail/i.test(q.title);
    if (!plain) {
      const sp = spellParse(heard);
      if (sp.spelled && sp.text) {
        const text = /^[a-z ]+$/.test(sp.text) ? titleCase(sp.text) : sp.text;
        return { intent: 'answer', value: text, spelled: true };
      }
    }
    return { intent: 'answer', value: formatText(q, heard) };
  }

  if (state.apiKey && state.model) {
    try {
      const it = validateAnswer(q, await geminiInterpret(q, heard));
      setGem(`Gemini: connected ✓ using ${state.model} (just used)`, true);
      log('bot', '(Gemini helped understand that)');
      return it;
    } catch (e) {
      setGem(`Gemini: NOT connected. ${e.message}`, false);
      if (/404/.test(e.message)) testGemini();
    }
  }
  return { intent: 'unclear' };
}

/* ---------- Speech output / input ---------- */
function log(who, text) {
  const li = document.createElement('li');
  li.className = who;
  li.textContent = (who === 'you' ? 'You: ' : '') + text;
  $('log').appendChild(li);
  $('log').scrollTop = $('log').scrollHeight;
}
const setStatus = (t) => ($('status').textContent = t);
function setMic(on) {
  $('mic').textContent = 'Microphone: ' + (on ? 'LISTENING, speak now' : 'off');
  $('mic').classList.toggle('on', on);
}

function beep() {
  try {
    state.audioCtx = state.audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const ctx = state.audioCtx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = 880;
    g.gain.value = 0.15;
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.12);
  } catch (_) {}
}

function speak(text) {
  log('bot', text);
  setStatus(text);
  if (state.muted) return sleep(300);
  return new Promise((resolve) => {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const v = speechSynthesis.getVoices().find((x) => x.name === state.voiceName);
    if (v) u.voice = v;
    u.lang = v ? v.lang : LANG;
    u.rate = state.rate;
    u.onend = resolve;
    u.onerror = resolve;
    speechSynthesis.speak(u);
  });
}

// Resolves with the best transcript, or null if nothing was heard.
// The beep plays at the exact moment the recognizer is really listening, so the
// user never speaks "too early". opts.accept(normalizedText) lets us stop on an
// interim result as soon as a valid answer (e.g. "yes") is detected.
async function hear(opts = {}) {
  await sleep(250); // let our own speech die down so it is not picked up
  state.lastAlts = null;
  return new Promise((resolve) => {
    let settled = false;
    const fin = (v) => {
      if (settled) return;
      settled = true;
      state.typedResolve = null;
      try { state.rec && state.rec.abort(); } catch (_) {}
      setMic(false);
      resolve(v);
    };
    state.typedResolve = (t) => fin(t);
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setStatus('Speech recognition is not available here. Type your answer below.');
      return;
    }
    const rec = new SR();
    state.rec = rec;
    rec.lang = LANG;
    rec.interimResults = !!opts.accept;
    rec.maxAlternatives = 5;
    rec.continuous = false;
    rec.onstart = () => { setMic(true); beep(); };
    rec.onresult = (e) => {
      const res = e.results[e.results.length - 1];
      const alts = Array.from(res).map((a) => a.transcript);
      state.lastAlts = alts;
      if (res.isFinal) return fin(alts[0]);
      if (opts.accept) {
        const hit = alts.find((a) => opts.accept(norm(a)));
        if (hit) fin(hit);
      }
    };
    rec.onerror = async (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        fin(null);
        await needMic();
      } else fin(null);
    };
    rec.onend = () => fin(null);
    try { rec.start(); } catch (_) { fin(null); }
  });
}

async function needMic() {
  if (!state.running) return;
  state.running = false;
  await speak(T('micNeeded'));
  chrome.tabs.create({ url: chrome.runtime.getURL('permission.html') });
  endRun();
}

/* ---------- Voice picker ---------- */
function loadVoices() {
  const all = speechSynthesis.getVoices();
  if (!all.length) return;
  const en = all.filter((v) => /^en/i.test(v.lang));
  const list = (en.length ? en : all).slice().sort((a, b) => {
    const rank = (v) => (/en-IN/i.test(v.lang) ? 0 : /^en/i.test(v.lang) ? 1 : 2);
    return rank(a) - rank(b) || a.name.localeCompare(b.name);
  });
  const sel = $('voice');
  sel.innerHTML = '';
  const def = document.createElement('option');
  def.value = '';
  def.textContent = 'Default voice';
  sel.appendChild(def);
  for (const v of list) {
    const o = document.createElement('option');
    o.value = v.name;
    o.textContent = `${v.name} (${v.lang})`;
    sel.appendChild(o);
  }
  sel.value = list.some((v) => v.name === state.voiceName) ? state.voiceName : '';
}

function sampleVoice() {
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance('Hello, this is how I will read your form. Say Y for Yes, or N for No.');
  const v = speechSynthesis.getVoices().find((x) => x.name === state.voiceName);
  if (v) u.voice = v;
  u.lang = v ? v.lang : LANG;
  u.rate = state.rate;
  speechSynthesis.speak(u);
}

/* ---------- Talking to the content script ---------- */
async function getTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}
async function send(type, data = {}) {
  const tab = await getTab();
  if (!tab || !/^https:\/\/docs\.google\.com\/forms\//.test(tab.url || '')) throw new Error('NOFORM');
  try {
    return await chrome.tabs.sendMessage(tab.id, { type, ...data });
  } catch (_) {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    return await chrome.tabs.sendMessage(tab.id, { type, ...data });
  }
}

/* ---------- Dialogue ---------- */
function describe(q, i, n, all = false) {
  const p = [T('qOf', i + 1, n), q.title + '.', q.required ? T('required') : T('optional')];
  if (q.type === 'choice' || q.type === 'dropdown') p.push(T('chooseOne'));
  if (q.type === 'checkbox') p.push(T('chooseMany'), T('checkIntro'));
  if (q.options && q.type !== 'scale' && q.type !== 'checkbox') {
    if (q.options.length <= 8 || all) p.push(q.options.map((o, k) => `${k + 1}. ${o}.`).join(' '));
    else p.push(T('manyOptions', q.options.length));
  }
  if (q.type === 'scale') p.push(T('scale', q.options[0], q.options[q.options.length - 1]));
  if (q.type === 'date') p.push(T('date'));
  if (q.type === 'time') p.push(T('time'));
  if (q.type === 'text' || q.type === 'paragraph') p.push(T('speakAnswer'));
  return p.join(' ');
}

// Letter-by-letter dictation. "j o h n space s m i t h" -> "John Smith".
// Letters are joined with no gaps and the spoken word "space" becomes a real space.
const SYM = { dot: '.', at: '@', dash: '-', hyphen: '-', underscore: '_', apostrophe: "'" };
const DIG = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };
// How the recognizer often writes the NAME of a letter ("see" for C, "why" for Y ...)
const HOMO = {
  ay: 'a', bee: 'b', be: 'b', see: 'c', sea: 'c', dee: 'd', eff: 'f', gee: 'g', aitch: 'h', eye: 'i',
  jay: 'j', kay: 'k', ell: 'l', el: 'l', em: 'm', en: 'n', oh: 'o', pee: 'p', queue: 'q', cue: 'q',
  are: 'r', ess: 's', tea: 't', tee: 't', you: 'u', vee: 'v', ex: 'x', why: 'y', wye: 'y', zee: 'z', zed: 'z',
};
const titleCase = (t) => t.replace(/\b[a-z]/g, (c) => c.toUpperCase());

// "J.O.H.N" / "J-O-H-N" -> "J O H N"
const expandDots = (raw) => raw.replace(/\b([A-Za-z])[.\-](?=[A-Za-z]\b)/g, '$1 ');

// force=true: the user explicitly asked to spell (every word counts, "apple" -> "a").
// force=false: auto-detect, only treat as spelling when most tokens are single letters.
function spellParse(raw, { force = false } = {}) {
  const t = expandDots(raw).toLowerCase().replace(/[,!?"“”]/g, '').replace(/\s+/g, ' ').trim();
  const w = t.split(' ').filter(Boolean);
  const singles = w.filter((x) => /^[a-z0-9]$/.test(x)).length;
  const spaces = w.filter((x) => x === 'space').length;
  const rest = w.length - singles - spaces;
  const spelled = force || (singles >= 2 && singles / (singles + rest) >= 0.7);
  if (!spelled) return { spelled: false, text: raw.trim(), loose: raw };
  let s = '';
  for (let i = 0; i < w.length; i++) {
    const x = w[i];
    if (x === 'space') s += ' ';
    else if (x === 'capital' || x === 'letter' || x === 'small') continue;
    else if (SYM[x]) s += SYM[x];
    else if (/^[a-z0-9]$/.test(x)) {
      s += x;
      if (w[i + 1] === 'for') i += 2; // "a for apple"
    } else if (/^\d+$/.test(x)) s += x;
    else if (DIG[x] !== undefined) s += DIG[x];
    else if (HOMO[x]) s += HOMO[x];
    else if (force) s += x[0]; // "apple" -> "a"
    else s += x; // a whole word spoken among letters: keep it
  }
  s = s.replace(/ +/g, ' ');
  return { spelled: true, text: s.trim(), loose: s };
}
const spellOut = (v) => v.split('').map((c) => (c === ' ' ? 'space' : c.toUpperCase())).join(', ');

async function spellMode(q) {
  await speak(T('spellIntro'));
  let out = '';
  let silent = 0;
  while (state.running) {
    const h = await hear();
    if (h === null) {
      if (++silent >= 2) break;
      continue;
    }
    silent = 0;
    log('you', h);
    const t = norm(h);
    if (DONE.includes(t)) break;
    if (UNDO.includes(t)) out = out.slice(0, -1);
    else out += spellParse(h, { force: true }).loose;
  }
  out = out.replace(/ +/g, ' ').trim();
  if (!out) return null;
  const isEmail = q.inputType === 'email' || /e-?mail/i.test(q.title);
  if (!isEmail && /^[a-z ]+$/.test(out)) out = out.replace(/\b[a-z]/g, (c) => c.toUpperCase());
  await speak(T('spellBack', out));
  return out;
}

// Asks a question that must be answered with the full phrase "Y for Yes" / "N for No".
// The prompt is spoken ONCE; after that we keep listening (beep each time).
// Returns true, false, 'back' or 'stop'.
async function askYesNo(prompt) {
  await speak(prompt);
  let silent = 0;
  for (let k = 0; k < 10 && state.running; k++) {
    const h = await hear({ accept: (t) => isYes(t) || isNo(t) });
    if (!state.running) return 'stop';
    if (h === null) {
      if (++silent % 2 === 0) await speak(T('yesNo'));
      continue;
    }
    log('you', h);
    const typed = !(state.lastAlts && state.lastAlts.length);
    const alts = (typed ? [h] : state.lastAlts).map(norm);
    const yes = alts.some((t) => isYes(t) || (typed && /^(y|yes)$/.test(t)));
    const no = alts.some((t) => isNo(t) || (typed && /^(n|no)$/.test(t)));
    if (yes && !no) return true;
    if (no && !yes) return false;
    if (yes && no) return !isNo(norm(h));
    const cmd = matchCommand(norm(h));
    if (cmd === 'stop') { stopRun(); return 'stop'; }
    if (cmd === 'back') return 'back';
    if (cmd === 'repeat') { await speak(prompt); continue; }
    await speak(T('yesNo'));
  }
  return false;
}

async function confirmAnswer(display, key = 'confirm', spoken) {
  return (await askYesNo(T(key, spoken ?? display))) === true;
}

// Checkbox questions: read each option, user answers "Y for Yes" / "N for No" per option.
async function checkboxFlow(q, pageNo) {
  while (state.running) {
    const picked = [];
    for (let k = 0; k < q.options.length && state.running; k++) {
      const r = await askYesNo(T('checkOpt', k + 1, q.options.length, q.options[k]));
      if (r === 'stop') return 'stop';
      if (r === 'back') return 'back';
      if (r === true) picked.push(q.options[k]);
    }
    if (!state.running) return 'stop';
    if (!picked.length && q.required) { await speak(T('mustChoose')); continue; }
    const display = picked.length ? picked.join(', ') : 'nothing';
    if (!(await confirmAnswer(display, 'confirmSel'))) {
      if (!state.running) return 'stop';
      await speak(T('again'));
      continue;
    }
    const r = await send('FILL', { idx: q.idx, value: picked });
    if (!r || !r.ok) { await speak(T('unclear')); continue; }
    state.answers.set(`${pageNo}:${q.idx}`, { page: pageNo, idx: q.idx, title: q.title, display });
    await speak(T('saved'));
    return 'next';
  }
  return 'stop';
}

async function readAnswers() {
  let k = 1;
  for (const a of state.answers.values()) {
    if (!state.running) return;
    await speak(`${k++}. ${a.title}: ${a.display}`);
  }
}

async function askQuestion(q, i, n, pageNo) {
  if (q.type === 'unsupported') {
    await speak(T('unsupported', i + 1));
    return 'skip';
  }
  await send('FOCUS', { idx: q.idx }).catch(() => {});
  await speak(describe(q, i, n));
  if (q.type === 'checkbox') return checkboxFlow(q, pageNo);
  let misses = 0;
  while (state.running) {
    const heard = await hear();
    if (!state.running) return 'stop';
    if (heard === null) {
      misses++;
      await speak(misses >= 2 ? T('struggle') : T('notHeard'));
      if (misses >= 2) misses = 0;
      continue;
    }
    log('you', heard);
    let it = await interpret(q, heard);
    if (it.intent === 'spell') {
      const s = await spellMode(q);
      if (s == null) continue;
      it = { intent: 'answer', value: s, spelled: true };
    }
    if (it.intent === 'repeat') { await speak(describe(q, i, n)); continue; }
    if (it.intent === 'options') { await speak(describe(q, i, n, true)); continue; }
    if (it.intent === 'back') return 'back';
    if (it.intent === 'skip') {
      if (q.required) { await speak(T('mustAnswer')); continue; }
      return 'skip';
    }
    if (it.intent === 'read_answers') { await readAnswers(); continue; }
    if (it.intent === 'stop') { stopRun(); return 'stop'; }
    if (it.intent === 'submit') { await speak(T('finishFirst')); continue; }
    if (it.intent !== 'answer' || it.value == null || it.value === '') {
      await speak(T('unclear'));
      continue;
    }
    const display = Array.isArray(it.value) ? it.value.join(', ') : String(it.value);
    if (!(await confirmAnswer(display, 'confirm', it.spelled ? spellOut(display) : undefined))) {
      if (!state.running) return 'stop';
      await speak(T('again'));
      continue;
    }
    const r = await send('FILL', { idx: q.idx, value: it.value });
    if (!r || !r.ok) {
      await speak(T('unclear'));
      continue;
    }
    state.answers.set(`${pageNo}:${q.idx}`, { page: pageNo, idx: q.idx, title: q.title, display });
    await speak(T('saved'));
    return 'next';
  }
  return 'stop';
}

async function reviewAndSubmit(qs, pageNo) {
  while (state.running) {
    await speak(T('reviewIntro'));
    await readAnswers();
    await speak(T('submitAsk'));
    const h = await hear();
    if (h === null) continue;
    log('you', h);
    const t = norm(h);
    const cmd = matchCommand(t);
    if (cmd === 'stop') { stopRun(); return; }
    const ch = t.match(/(?:change|edit|fix)\D*(\d+|\w+)/);
    if (ch) {
      const n = numberFrom(ch[1]) || NUM[ch[1]];
      const entry = [...state.answers.values()][n - 1];
      if (!entry) continue;
      if (entry.page !== pageNo) { await speak(T('cannotChange')); continue; }
      const idx = qs.findIndex((q) => q.idx === entry.idx);
      await askQuestion(qs[idx], idx, qs.length, pageNo);
      continue;
    }
    if (cmd === 'submit') {
      await send('SUBMIT').catch(() => {});
      await sleep(2500);
      const st = await send('STATUS').catch(() => ({}));
      if (st.done) { await speak(T('submitted')); return; }
      if (st.errors && st.errors.length) { await speak(T('pageErrors', st.errors[0])); continue; }
      await speak(T('submitFail'));
    }
  }
}

async function run() {
  state.running = true;
  state.answers = new Map();
  $('start').hidden = true;
  $('stop').hidden = false;
  $('stop').focus();
  beep(); // creates/unlocks the audio context inside the click gesture
  try {
    let page = await send('PARSE');
    if (!page.questions.length) { await speak(T('noQuestions')); return; }
    let pageNo = 0;
    await speak(T('welcome', page.title || 'Untitled', page.questions.length));
    while (state.running) {
      const qs = page.questions;
      let i = 0;
      while (i < qs.length && state.running) {
        const r = await askQuestion(qs[i], i, qs.length, pageNo);
        if (r === 'stop') break;
        i = r === 'back' ? Math.max(0, i - 1) : i + 1;
      }
      if (!state.running) break;
      if (page.hasNext) {
        await send('NEXT');
        await sleep(900);
        const st = await send('STATUS').catch(() => ({ errors: [] }));
        const next = await send('PARSE');
        const same = next.questions.length === qs.length && next.questions[0]?.title === qs[0]?.title;
        if (same && st.errors && st.errors.length) {
          await speak(T('pageErrors', st.errors[0]));
          page = next;
          continue;
        }
        page = next;
        pageNo++;
        continue;
      }
      if (page.hasSubmit) await reviewAndSubmit(qs, pageNo);
      break;
    }
  } catch (e) {
    if (String(e.message) === 'NOFORM') await speak(T('noForm'));
    else { console.error(e); setStatus('Error: ' + e.message); }
  } finally {
    endRun();
  }
}

function stopRun() {
  state.running = false;
  speechSynthesis.cancel();
  try { state.rec && state.rec.abort(); } catch (_) {}
  if (state.typedResolve) state.typedResolve(null);
}
function endRun() {
  state.running = false;
  setMic(false);
  $('start').hidden = false;
  $('stop').hidden = true;
  $('start').focus();
}

/* ---------- Settings & wiring ---------- */
async function loadCfg() {
  const c = await chrome.storage.local.get(['apiKey', 'model', 'models', 'rate', 'muted', 'voiceName']);
  state.voiceName = c.voiceName || '';
  state.apiKey = c.apiKey || '';
  state.model = c.model || '';
  state.models = c.models || [];
  state.rate = c.rate || 1;
  state.muted = !!c.muted;
  $('apiKey').value = state.apiKey;
  $('rate').value = state.rate;
  $('rateVal').textContent = Number(state.rate).toFixed(1);
  $('muted').checked = state.muted;
  $('log').setAttribute('aria-live', state.muted ? 'polite' : 'off');
  renderModels();
}

document.addEventListener('DOMContentLoaded', async () => {
  await loadCfg();
  loadVoices();
  speechSynthesis.onvoiceschanged = loadVoices;
  $('voice').addEventListener('change', () => {
    state.voiceName = $('voice').value;
    chrome.storage.local.set({ voiceName: state.voiceName });
    sampleVoice();
  });
  $('voiceTest').addEventListener('click', sampleVoice);
  if (state.apiKey) testGemini();
  else setGem('Gemini: no key set (optional). Built-in matching only.', null);

  $('apiKey').addEventListener('change', async () => {
    state.apiKey = $('apiKey').value.trim();
    await chrome.storage.local.set({ apiKey: state.apiKey });
    testGemini();
  });
  $('gemTest').addEventListener('click', () => {
    state.apiKey = $('apiKey').value.trim();
    chrome.storage.local.set({ apiKey: state.apiKey });
    testGemini();
  });
  $('model').addEventListener('change', async () => {
    state.model = $('model').value;
    await chrome.storage.local.set({ model: state.model });
    testGemini();
  });
  $('rate').addEventListener('input', () => {
    state.rate = parseFloat($('rate').value);
    $('rateVal').textContent = state.rate.toFixed(1);
    chrome.storage.local.set({ rate: state.rate });
  });
  $('muted').addEventListener('change', () => {
    state.muted = $('muted').checked;
    $('log').setAttribute('aria-live', state.muted ? 'polite' : 'off');
    chrome.storage.local.set({ muted: state.muted });
  });
  $('start').addEventListener('click', run);
  $('stop').addEventListener('click', async () => { stopRun(); await speak(T('stopped')); });
  $('micTest').addEventListener('click', () => chrome.tabs.create({ url: chrome.runtime.getURL('permission.html') }));
  $('typed').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = $('typedText').value.trim();
    $('typedText').value = '';
    if (v && state.typedResolve) state.typedResolve(v);
  });
  // Keyboard shortcut during yes/no: press Y or N when not typing in a field.
  document.addEventListener('keydown', (e) => {
    if (!state.typedResolve || /INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName || '')) return;
    if (e.key === 'y' || e.key === 'Y') state.typedResolve('y for yes');
    if (e.key === 'n' || e.key === 'N') state.typedResolve('n for no');
  });
});
