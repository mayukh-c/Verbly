// Verbly v1 | content script: the "hands" of the extension.
// It reads the real Google Form DOM (ARIA roles, not obfuscated class names)
// and performs fills/clicks on request from the side panel.
(() => {
  if (window.__verblyLoaded) return;
  window.__verblyLoaded = true;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const visible = (el) => !!el && el.getClientRects().length > 0;
  const txt = (el) => ((el && (el.innerText || el.textContent)) || '').replace(/\s+/g, ' ').trim();
  const labelOf = (el) => el.getAttribute('aria-label') || el.getAttribute('data-value') || txt(el);

  let items = [];
  let lastOutlined = null;

  function getItems() {
    return [...document.querySelectorAll('div[role="listitem"]')].filter(
      (li) =>
        li.querySelector('[role="heading"]') &&
        !li.parentElement.closest('div[role="listitem"]') &&
        visible(li)
    );
  }

  const titleOf = (li) => txt(li.querySelector('[role="heading"]')).replace(/\s*\*\s*$/, '').trim();
  const isRequired = (li) =>
    !!li.querySelector('[aria-label="Required question"]') ||
    /\*\s*$/.test(txt(li.querySelector('[role="heading"]')));

  function classify(li) {
    const q = {};
    // Time: Hour + Minute inputs
    if (li.querySelector('input[aria-label="Hour"]') && li.querySelector('input[aria-label="Minute"]')) {
      q.type = 'time';
      return q;
    }
    const radios = [...li.querySelectorAll('[role="radio"]')];
    if (radios.length) {
      if (li.querySelectorAll('[role="radiogroup"]').length > 1) return { type: 'unsupported', why: 'grid' };
      const labels = radios.map(labelOf);
      q.type = labels.every((l) => /^\d+$/.test(l)) ? 'scale' : 'choice';
      q.options = labels;
      return q;
    }
    const checks = [...li.querySelectorAll('[role="checkbox"]')];
    if (checks.length) {
      q.type = 'checkbox';
      q.options = checks.map(labelOf);
      return q;
    }
    if (li.querySelector('[role="listbox"]')) {
      const opts = [...li.querySelectorAll('[role="option"]')]
        .map((o) => o.getAttribute('data-value') || '')
        .filter(Boolean);
      q.type = 'dropdown';
      q.options = [...new Set(opts)];
      return q;
    }
    if (li.querySelector('input[type="date"]')) return { type: 'date' };
    if (li.querySelector('textarea')) return { type: 'paragraph' };
    const inp = [...li.querySelectorAll('input')].find(
      (i) => !['hidden', 'checkbox', 'radio', 'file', 'submit', 'button'].includes(i.type) && visible(i)
    );
    if (inp) return { type: 'text', inputType: inp.type };
    return { type: 'unsupported', why: 'unknown or file upload' };
  }

  function findButton(kind) {
    const btns = [...document.querySelectorAll('[role="button"]')].filter(visible);
    const re = kind === 'next' ? /^(next|आगे|अगला)$/i : /^(submit|सबमिट|सबमिट करें|जमा करें)$/i;
    const jsname = kind === 'next' ? 'OCpkoe' : 'M2UYVd';
    return btns.find((b) => re.test(txt(b))) || btns.find((b) => b.getAttribute('jsname') === jsname);
  }

  function parse() {
    items = getItems();
    const questions = items.map((li, idx) => ({ idx, title: titleOf(li), required: isRequired(li), ...classify(li) }));
    return {
      ok: true,
      title: document.title.replace(/\s*-\s*Google Forms\s*$/i, '').trim(),
      questions,
      hasNext: !!findButton('next'),
      hasSubmit: !!findButton('submit'),
    };
  }

  function realClick(el) {
    for (const t of ['mousedown', 'mouseup', 'click']) {
      el.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window }));
    }
  }

  function setText(el, value) {
    el.focus();
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  async function pickOption(li, listbox, value) {
    realClick(listbox);
    await sleep(400);
    const scope = [...li.querySelectorAll('[role="option"]')];
    const all = scope.length ? scope : [...document.querySelectorAll('[role="option"]')];
    const matches = all.filter((o) => (o.getAttribute('data-value') || txt(o)) === value);
    const target = matches[matches.length - 1];
    if (!target) throw new Error('option not found: ' + value);
    realClick(target);
    await sleep(300);
  }

  async function fill(idx, value) {
    const li = items[idx];
    if (!li) return { ok: false, error: 'no such question' };
    const q = classify(li);
    switch (q.type) {
      case 'text':
      case 'paragraph': {
        const el = li.querySelector('textarea') || [...li.querySelectorAll('input')].find(visible);
        setText(el, String(value));
        return { ok: el.value === String(value) };
      }
      case 'date': {
        setText(li.querySelector('input[type="date"]'), String(value)); // YYYY-MM-DD
        return { ok: true };
      }
      case 'time': {
        const [h, m] = String(value).split(':').map(Number);
        const lb = li.querySelector('[role="listbox"]');
        const hour = lb ? h % 12 || 12 : h;
        setText(li.querySelector('input[aria-label="Hour"]'), String(hour));
        setText(li.querySelector('input[aria-label="Minute"]'), String(m).padStart(2, '0'));
        if (lb) await pickOption(li, lb, h >= 12 ? 'PM' : 'AM');
        return { ok: true };
      }
      case 'choice':
      case 'scale': {
        const radios = [...li.querySelectorAll('[role="radio"]')];
        const r = radios.find((x) => labelOf(x) === String(value));
        if (!r) return { ok: false, error: 'option not found' };
        if (r.getAttribute('aria-checked') !== 'true') realClick(r);
        await sleep(150);
        return { ok: r.getAttribute('aria-checked') === 'true' };
      }
      case 'checkbox': {
        const want = new Set(Array.isArray(value) ? value : [value]);
        for (const c of li.querySelectorAll('[role="checkbox"]')) {
          const on = c.getAttribute('aria-checked') === 'true';
          if (on !== want.has(labelOf(c))) {
            realClick(c);
            await sleep(120);
          }
        }
        return { ok: true };
      }
      case 'dropdown': {
        await pickOption(li, li.querySelector('[role="listbox"]'), String(value));
        return { ok: true };
      }
      default:
        return { ok: false, error: 'unsupported question type' };
    }
  }

  function focusQuestion(idx) {
    const li = items[idx];
    if (!li) return { ok: false };
    if (lastOutlined) lastOutlined.style.outline = '';
    li.style.outline = '4px solid #1a73e8';
    li.style.outlineOffset = '4px';
    lastOutlined = li;
    li.scrollIntoView({ block: 'center', behavior: 'smooth' });
    return { ok: true };
  }

  function status() {
    const errors = [...document.querySelectorAll('[role="alert"]')].map(txt).filter(Boolean);
    const done =
      /formResponse/.test(location.href) ||
      /your response has been recorded|response has been recorded/i.test(document.body.innerText || '');
    return { ok: true, done, errors };
  }

  async function handle(msg) {
    switch (msg.type) {
      case 'PING':
        return { ok: true };
      case 'PARSE':
        return parse();
      case 'FOCUS':
        return focusQuestion(msg.idx);
      case 'FILL':
        return fill(msg.idx, msg.value);
      case 'NEXT': {
        const b = findButton('next');
        if (!b) return { ok: false, error: 'no next button' };
        realClick(b);
        await sleep(900);
        return { ok: true };
      }
      case 'SUBMIT': {
        const b = findButton('submit');
        if (!b) return { ok: false, error: 'no submit button' };
        realClick(b);
        return { ok: true };
      }
      case 'STATUS':
        return status();
      default:
        return { ok: false, error: 'unknown message' };
    }
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    handle(msg)
      .then(sendResponse)
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  });
})();
