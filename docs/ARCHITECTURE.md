# Verbly architecture (v1)

## 1. Goal and scope (v1)
A browser extension that lets a blind or low-literacy user complete a public Google Form by voice, in Indian languages, and submit it safely.
Desktop Chrome only for v1 (Chrome on Android does not run extensions).

## 2. Components
```
Chrome tab (docs.google.com/forms)                Side panel (extension page)
┌──────────────────────────────┐   messages    ┌─────────────────────────────────────┐
│ content.js                   │◄─────────────►│ sidepanel.js                        │
│  parse()  FOCUS  FILL        │ chrome.tabs.  │  Dialogue engine (state machine)    │
│  NEXT  SUBMIT  STATUS        │ sendMessage   │  speak() = speechSynthesis          │
│  reads ARIA roles, clicks    │               │  hear()  = webkitSpeechRecognition  │
└──────────────────────────────┘               │  interpret(): local rules → Gemini  │
                                               └───────────────┬─────────────────────┘
                                                               │ HTTPS (optional)
                                                   Gemini API generateContent (free tier)
```
Why a side panel: it stays open while the page changes (a popup closes), it is an extension origin so the microphone permission is asked once for the extension and not per site, and it keeps speech code out of Google's page.

## 3. Dialogue loop
```
PARSE page → for each question: FOCUS → describe aloud → hear → interpret
  intent = command?  → repeat / options / back / skip / read answers / stop
  intent = spell?    → letter-by-letter mode ("A for Apple", delete, done) → read back
  intent = answer?   → read back "I heard X" → yes → FILL → verify → next
after last question on page: hasNext? → NEXT → re-PARSE   |   hasSubmit? → read all answers → "submit" → SUBMIT → STATUS
```
Rules: never submit without an explicit spoken "submit"; never skip a required question; stop listening while speaking (sequential awaits); a typed-input fallback races the mic.

## 4. Interpretation strategy (cost and latency)
1. Local, instant, free: command phrases (English), option matching (exact, contained, token overlap, number/ordinal), email/phone formatting, simple date/time.
2. Gemini only when local fails (unclear choice, other language, messy date). Request is one short call with `responseMimeType: application/json`, temperature 0, and the answer is validated against the allowed options before use. This keeps free-tier quota usage tiny.

## 5. API research summary (checked Nov 2026)
| Need | Choice for v1 | Notes |
|---|---|---|
| Speech to text | Chrome Web Speech API (`webkitSpeechRecognition`) | Free. v1 is English only (en-IN). Audio is processed by Google's service, needs internet. |
| Text to speech | `speechSynthesis` | Free, uses installed/online voices, supports speed. Quality of regional voices varies by OS. |
| Understanding / normalising | Gemini API, Flash-Lite or Flash class model | Free tier needs no card. Sources disagree on exact model names and limits, and Google now shows limits only in AI Studio, so check your key's model list and set the model name in Settings. Free-tier data may be used by Google to improve products. |
| Better multilingual STT (v2) | Gemini audio input (record with MediaRecorder in side panel, send as inline audio) | Handles Indian languages and code-mixing better than browser STT. Needs mic stream in an extension page (permission page already handles consent). |
| Alternative STT | Whisper via Groq/OpenAI-compatible endpoint | Not used in v1 to avoid another key. |

Chrome facts that shaped the design: the Web Speech engine cannot run in the MV3 service worker; mic access is a browser origin permission and an offscreen document cannot ask for it, so a visible page (our `permission.html`) asks once.

## 6. Why ARIA roles instead of CSS classes
Google Forms class names are obfuscated and change. `role="listitem"`, `role="heading"`, `role="radio"`, `role="checkbox"`, `role="listbox"`, `role="option"`, `aria-checked`, `aria-label` are accessibility contracts and change rarely. Next/Submit are found by visible text plus a `jsname` fallback (the weakest link, isolate fixes in `findButton`).

## 7. Risks and mitigations
| Risk | Mitigation |
|---|---|
| Google changes DOM | All selectors are in `content.js`; keep 5 saved test forms; fix in one place |
| Dropdown/time widgets resist synthetic clicks | `realClick` sends mousedown/mouseup/click; fallback is "unsupported, ask for help" |
| Mic blocked on first run | Permission tab + typed input fallback |
| Browser STT misses names/emails | Spell mode, read-back, confirm every answer |
| Voice collides with a screen reader | "I use a screen reader" switch: no speech output, text goes to an aria-live log |
| Privacy of answers | No backend. Gemini only receives the current question and utterance, and only if a key is set |
| Free-tier rate limit (429) | Local-first interpretation; on error fall back to "please repeat" |

## 8. Roadmap
- v1.1 grids (read row by row), "other" option text, file-upload detection with clear message.
- Later: Indian-language support (Gemini audio STT and localized prompts) if the project scope grows.
- v2 Android/phone: companion web app that rebuilds the form (the dialogue engine is already independent of the page), phone-call (IVR) version for feature phones.
- Testing: accessibility testing with real blind users and screen readers (NVDA, JAWS, VoiceOver).
