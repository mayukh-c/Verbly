# Verbly

**Verbly is an AI-powered, multilingual, voice-first Chrome extension that transforms traditional online forms into interactive conversations.** It empowers visually impaired individuals and people with limited digital literacy to navigate, understand, and complete forms independently using natural speech.

`Version 1.0.0 (v1)` · Chrome extension (Manifest V3) · Works on Google Forms

---

## The problem
Online forms are the gateway to admissions, scholarships, surveys, registrations and government schemes, yet they assume you can see the screen, read quickly, and are comfortable with web interfaces. For blind and low-vision users, and for people with limited digital literacy, that gateway is often closed or needs someone else to fill the form for them.

## What Verbly does
Verbly turns a Google Form into a spoken conversation:

1. It reads the form title and each question aloud.
2. It listens to your spoken answer after a beep.
3. It repeats what it heard and waits for you to confirm.
4. It fills the **real** form for you, moves through sections, and reads a full summary.
5. It submits **only after you say so**.

## v1 scope (what works today)
| Area | v1 status |
|---|---|
| Platform | Desktop Chrome 116+ with the side panel |
| Forms | Public Google Forms (`docs.google.com/forms/.../viewform`) |
| Question types | Short answer, paragraph, multiple choice, checkboxes, dropdown, linear scale, date, time, multi-section forms (Next/Back) |
| Not supported yet | Grids, file upload, forms that need a different login (Verbly says so and moves on) |
| Speech language | English, tuned for Indian accents (`en-IN` recognizer) |
| AI layer | Optional Gemini API fallback for answers that local rules cannot match |
| Multilingual | Planned next: Indian-language speech and prompts (see Roadmap) |

---

## How it works (the mechanism)

### 1. Two parts, one conversation
Verbly is split into the **hands** (touch the form) and the **brain** (talk and think). They exchange small messages.

```
Google Form tab                          Verbly side panel
┌──────────────────────────────┐ messages ┌─────────────────────────────────────┐
│ content.js  (hands)          │◄────────►│ sidepanel.js  (brain)               │
│  PARSE  FOCUS  FILL          │ chrome.  │  dialogue engine (state machine)    │
│  NEXT   SUBMIT  STATUS       │ tabs.    │  speech out = speechSynthesis       │
│  reads ARIA roles, clicks    │ sendMsg  │  speech in  = Web Speech API        │
└──────────────────────────────┘          │  understanding = local rules        │
                                          │                → Gemini (optional)  │
                                          └──────────────────┬──────────────────┘
                                                             │ HTTPS, only if a key is set
                                                      Gemini API (generateContent)
```
- **`content.js` (hands)** runs inside the form page. It reads the questions, fills answers, and clicks Next/Submit. It contains no speech logic.
- **`sidepanel.js` (brain)** runs in Chrome's side panel. It speaks, listens, understands, and decides what to do next.
- **Why a side panel:** it stays open while the form changes sections, the microphone permission is asked once for the extension (not per site), and the speech code stays out of Google's page.

### 2. Reading the form without breaking when Google changes it
Google Forms class names are scrambled and change often. Verbly reads the page through **ARIA roles** (`listitem`, `heading`, `radio`, `checkbox`, `listbox`, `option`, `aria-checked`, `aria-label`), which are accessibility contracts and change rarely. Each question is classified (text, paragraph, choice, scale, checkbox, dropdown, date, time, or unsupported) and returned to the panel as structured data. Next and Submit are found by their visible text, with a Google attribute as a fallback. All of this lives in `content.js`, so if Google changes its markup there is one file to fix.

### 3. The messages between hands and brain
| Message | What happens |
|---|---|
| `PING` | Checks the form page is ready |
| `PARSE` | Returns every question on the current section: title, type, options, required or not, and whether Next or Submit exists |
| `FOCUS` | Scrolls to and outlines the current question |
| `FILL` | Types text, picks an option, ticks checkboxes, chooses a dropdown item, or sets a date/time |
| `NEXT` / `SUBMIT` | Clicks the real button |
| `STATUS` | Reads validation errors or the "response recorded" page |

### 4. The dialogue loop
```
PARSE the section → for each question:
   FOCUS → describe aloud → beep → listen → interpret
   ├─ command?  repeat · options · back · skip · read my answers · stop
   ├─ spell?    letter-by-letter mode → read back letter by letter
   └─ answer?   "I heard X. Say Y for Yes or N for No" → Yes → FILL → verify → next question
After the last question of a section:
   Next exists   → NEXT → PARSE the new section
   Submit exists → read all answers → wait for the spoken word "submit" → SUBMIT → STATUS
```
Safety rules built in:
- Verbly **never submits** without an explicit spoken "submit".
- It **never skips a required question**.
- It stops listening while it is speaking, so it never hears itself.
- Every answer is **read back and confirmed** with "Y for Yes" or "N for No" (speech recognisers confuse plain yes/no less when the letter phrase is used). Y and N keys also work.
- A typed-answer box races the microphone, so a failed mic never blocks the user.

### 5. Understanding what the user said: local first, AI second
1. **Local, instant, free:** command phrases, option matching (exact, contained, word overlap, "option 2", "the second one"), spelled names ("J O H N space S M I T H" becomes "John Smith"), spoken email and phone formatting, and simple dates and times.
2. **Gemini, only when local rules fail** (for example an unclear choice or a messy date). It is one short request in JSON mode with temperature 0, and the reply is **validated against the real options** before it is used, so the AI can never invent an answer. If Gemini is unavailable or rate-limited, Verbly simply asks the user to repeat.

Without a Gemini key, everything still works with local matching.

### 6. Speech in and out
| Need | What Verbly uses |
|---|---|
| Speech to text | Chrome's Web Speech API (`webkitSpeechRecognition`, `en-IN`). Free, needs internet. It cannot run in an extension service worker, so it runs in the side panel |
| Text to speech | `speechSynthesis` with a voice picker (India voices first) and a speed slider |
| Microphone permission | A small visible page (`permission.html`) asks once, because Chrome does not let hidden extension pages ask |
| Screen reader users | "I use a screen reader" mode stops speech and writes text to a live region instead |

---

## Install Verbly (about 3 minutes)

> Requirements: a desktop computer with **Google Chrome 116 or newer**, a working microphone, and an internet connection (Chrome's speech recognition needs it).

### Option A: download from GitHub
1. On this repository's page click **Code → Download ZIP**.
2. **Unzip it** into a folder you will keep (Chrome loads the extension from this folder, so do not delete it). Open the unzipped folder and make sure you can see `manifest.json` directly inside it.
3. Open Chrome and go to `chrome://extensions`.
4. Turn on **Developer mode** (top-right switch).
5. Click **Load unpacked** and select the folder that contains `manifest.json`.
6. Verbly appears in the list. Click the puzzle-piece icon in Chrome's toolbar and **pin** Verbly.

### Option B: clone with git
```bash
git clone <this repository's URL> verbly
```
Then follow steps 3 to 6 above and choose the cloned folder. After editing code, click the **reload** icon on Verbly's card in `chrome://extensions` and **refresh the form tab**.

---

## First run
1. Open a Google Form fill link (the address contains `/viewform`). If the form was already open before you installed Verbly, **refresh the tab**.
2. Click the Verbly toolbar icon, or press **Alt+Shift+V**. The side panel opens.
3. Press **Start voice filling**.
4. When Chrome asks, choose **Allow** for the microphone. If a small "Allow the microphone" tab opens, allow it there, close the tab, return to the form and press Start again.
5. Listen, and answer after each beep.

### Optional: turn on the Gemini AI layer
1. Open **Settings** in the Verbly panel.
2. Get a free key from https://aistudio.google.com/apikey and paste it in.
3. Press **Test Gemini connection**. Verbly finds a working model for your key by itself and shows **Gemini: connected ✓** (or the exact error).

No key? Everything still works using local matching. You can also type an answer in the text box if the microphone fails.

---

## Using Verbly

### Voice commands
`repeat`, `options`, `back`, `skip` (optional questions only), `spell`, `read my answers`, `submit`, `stop`.

A beep means the microphone is live, so speak after it. To confirm an answer, say the full phrase **"Y for Yes"** or **"N for No"** (you can also press the **Y** or **N** key).

### Spelling names
Say a name letter by letter and say "space" between words: *"J O H N space S M I T H"* is written as **John Smith**. Verbly reads it back letter by letter before you confirm.

### Checkbox questions
Verbly reads each option and you answer each one with "Y for Yes" or "N for No", then it confirms the final selection the same way.

### Accessibility settings
- **Speaker voice** list (English voices first, India voices at the top) with a **Hear this voice** button.
- **Speech speed** slider.
- **"I use a screen reader"** switch: Verbly stops speaking and shows text in a live region instead, so it does not talk over NVDA, JAWS or VoiceOver.
- **Fix / test microphone** button.

---

## Files
| File | Role |
|---|---|
| `manifest.json` | MV3 manifest: side panel, content script on docs.google.com/forms |
| `content.js` | The hands: reads the form by ARIA roles, fills and clicks. No speech logic |
| `sidepanel.js / .html / .css` | The brain: dialogue engine, speech in/out, command parsing, Gemini fallback, settings |
| `permission.html / .js` | One-time microphone permission page |
| `background.js` | Opens the side panel from the toolbar icon or shortcut |
| `docs/ARCHITECTURE.md` | Deeper design notes: APIs considered, risks, roadmap |
| `docs/TESTING.md` | Test forms, test cases, accessibility checks and the v1 done-criteria |

## Troubleshooting
| Problem | Fix |
|---|---|
| Panel says it cannot read the form | Refresh the form tab, make sure the address contains `/viewform`, and that it is not a login-only form |
| No sound | Check the system volume and the speaker voice in Settings. Try **Hear this voice** |
| It does not hear me | Press **Fix / test microphone**, allow the mic in the browser prompt or via the lock icon in the address bar, then press Start again |
| Mic works but nothing is recognised | Speech recognition needs internet. Wait for the beep, then speak |
| Gemini shows an error | Re-paste the key and press **Test Gemini connection**. Rate limits (429) fall back to local matching |
| Verbly talks over my screen reader | Tick **I use a screen reader** in Settings |
| Changes to the code do not show | Click reload on Verbly in `chrome://extensions`, then refresh the form tab |

## Testing
Quick check: build a Google Form with one of each question type plus a 2-section form with a required field, fill it by voice, then compare the form's **Responses** tab with what you said. The full test plan is in [`docs/TESTING.md`](docs/TESTING.md).

## Documentation
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): design, API research, risks and roadmap.
- [`docs/TESTING.md`](docs/TESTING.md): test forms, test cases and accessibility checks.

## Known limits
- Desktop Chrome only (Chrome on Android does not run extensions).
- If Google changes the form markup, selectors in `content.js` may need a small fix. Dropdown and time widgets are the most sensitive.
- Browser speech recognition can miss names and emails, which is why spelling mode and read-back exist.

## Privacy
Verbly has **no backend** and stores nothing on a server.
- Speech recognition is done by Chrome's built-in Web Speech API, so audio is processed by Google's speech service.
- If you add a Gemini key, only the current question text, its options and what you said are sent to Gemini. On the free tier Google may use that content to improve its products, so **do not use a key on forms with sensitive information**.
- Your key, voice and speed settings are stored only in your browser (`chrome.storage.local`).
- Verbly never submits a form unless you say "submit".

## Roadmap
- **v1.1:** grids (read row by row), "Other" option text, clear file-upload detection.
- **Multilingual:** Indian-language speech and prompts (Gemini audio input for better Hindi, Bengali and code-mixed speech).
- **v2:** companion web app that rebuilds the form for phones, and a phone-call (IVR) version for feature phones.
- **Testing:** accessibility testing with real blind users and screen readers (NVDA, JAWS, VoiceOver).

---

## Team

- **Bhakti Parmar** ([@bhaktijparmar](https://github.com/bhaktijparmar))  
  *Mathematics and Computing (MnC), IIT Jodhpur*  
  Email: [bhaktijparmar12@gmail.com](mailto:bhaktijparmar12@gmail.com)

- **Mayukh Choudhury** ([@mayukh-c](https://github.com/mayukh-c))  
  *Aerospace Engineering, IIT Jodhpur*  
  Email: [mayukh891@gmail.com](mailto:mayukh891@gmail.com)