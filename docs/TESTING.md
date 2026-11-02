# Verbly test plan (v1)

How to check that Verbly works. Run it on a desktop with Chrome 116+ and a real microphone. Tick the **Result** column (✅ pass, ❌ fail, ➖ not applicable) and write what happened in **Notes**.

## 1. Test forms to create
Create these in your own Google account and set each to accept responses.

| Form | Contents | Purpose |
|---|---|---|
| **A: all types** | Short answer (Name), short answer (Email, with email validation), paragraph, multiple choice (4 options), multiple choice (12 options), checkboxes (4 options), dropdown, linear scale 1 to 5, date, time | Every supported question type |
| **B: sections** | Section 1: required short answer and an optional question. Section 2: multiple choice. Section 3: checkboxes | Next/Back, required questions, submit flow |
| **C: unsupported** | Multiple choice grid, file upload, one normal question | Verbly must say it cannot fill these and move on |
| **D: login-only** | Any form with "Restrict to users in your organisation" or "Limit to 1 response" | Verbly must not break; expect the login limit message |

Keep the fill links (the ones ending in `/viewform`) in a private note for the team.

## 2. Setup checks
| ID | Steps | Expected | Result | Notes |
|---|---|---|---|---|
| S1 | Load unpacked in `chrome://extensions` | Verbly appears with no errors | ☐ | |
| S2 | Click the toolbar icon on a form | Side panel opens | ☐ | |
| S3 | Press Alt+Shift+V | Side panel opens | ☐ | |
| S4 | Press Start for the first time | Microphone prompt or permission tab appears; after allowing, Start works | ☐ | |
| S5 | Block the microphone, press Start | Clear message; typed-answer box still works | ☐ | |
| S6 | Open a form, then install/reload Verbly without refreshing | Panel explains to refresh; after refresh it works | ☐ | |

## 3. Question types (use Form A)
| ID | Question | Say | Expected | Result | Notes |
|---|---|---|---|---|---|
| Q1 | Short answer | "Mayukh" then "Y for Yes" | Text appears in the field | ☐ | |
| Q2 | Name by spelling | "spell", then "J O H N space S M I T H", "done", "Y for Yes" | Field shows `John Smith`; read-back is letter by letter | ☐ | |
| Q3 | Email | "john dot smith at gmail dot com" | Field shows `john.smith@gmail.com` | ☐ | |
| Q4 | Paragraph | A sentence | Full sentence filled | ☐ | |
| Q5 | Multiple choice (4) | "option 2", then "the third one", then the option's words | Correct option selected each time | ☐ | |
| Q6 | Multiple choice (12) | Say "read options" | Options are read; saying an option name selects it | ☐ | |
| Q7 | Checkboxes | "Y for Yes" / "N for No" per option | Only the yes options are ticked; final confirmation read | ☐ | |
| Q8 | Dropdown | An option name | Correct item selected in the dropdown | ☐ | |
| Q9 | Linear scale | "four" | 4 selected | ☐ | |
| Q10 | Date | "5 March 2008" | Date field shows 5 March 2008 | ☐ | |
| Q11 | Time | "4 30 PM" | Time field shows 4:30 PM | ☐ | |

## 4. Commands and safety
| ID | Test | Expected | Result | Notes |
|---|---|---|---|---|
| C1 | Say "repeat" on any question | Question is read again | ☐ | |
| C2 | Say "back" on question 3 | Returns to question 2 | ☐ | |
| C3 | Say "skip" on an optional question | Skipped, moves on | ☐ | |
| C4 | Say "skip" on a **required** question | Refused; question is asked again | ☐ | |
| C5 | Say "read my answers" | All answers so far are read | ☐ | |
| C6 | Say "stop" | Stops speaking and listening | ☐ | |
| C7 | Say "N for No" at a confirmation | Question is asked again, nothing wrongly filled | ☐ | |
| C8 | Say nonsense twice | Asks to repeat; does not fill a wrong value | ☐ | |
| C9 | Press Y and N on the keyboard at a confirmation | Works the same as speaking | ☐ | |
| C10 | Reach the end of the form | Reads all answers and waits; does **not** submit until you say "submit" | ☐ | |

## 5. Sections and submit (use Form B)
| ID | Test | Expected | Result | Notes |
|---|---|---|---|---|
| F1 | Finish section 1 | Moves to section 2 and re-reads the new questions | ☐ | |
| F2 | Go "back" from the first question of section 2 | Returns to section 1 | ☐ | |
| F3 | Leave the required question empty on purpose | Verbly will not advance; reads the validation message | ☐ | |
| F4 | Say "submit" at the end | Form is submitted; confirmation is spoken | ☐ | |
| F5 | Open the form's **Responses** tab | Every answer matches what was spoken | ☐ | |

## 6. Unsupported and edge cases (Forms C and D)
| ID | Test | Expected | Result | Notes |
|---|---|---|---|---|
| U1 | Grid question | Says it is not supported, moves on | ☐ | |
| U2 | File upload question | Says it is not supported, moves on | ☐ | |
| U3 | Login-only form | No crash; a clear message | ☐ | |
| U4 | Open a non-form page and press Start | Clear message that no form was found | ☐ | |

## 7. Accessibility checks
| ID | Test | Expected | Result | Notes |
|---|---|---|---|---|
| A1 | Use the panel with the keyboard only (Tab, Shift+Tab, Enter) | Every control reachable, visible focus ring | ☐ | |
| A2 | Tick "I use a screen reader" with NVDA or Narrator on | Verbly stays silent; text appears and is announced once | ☐ | |
| A3 | Change speaker voice and speed in Settings | "Hear this voice" reflects the choice | ☐ | |
| A4 | Zoom the browser to 200% | Panel stays usable | ☐ | |
| A5 | Check text contrast on the panel | Readable (WCAG AA, 4.5:1) | ☐ | |
| A6 | Ask one person who has not seen Verbly to fill Form A with eyes closed | They finish; note where they hesitate | ☐ | |

## 8. Gemini layer
| ID | Test | Expected | Result | Notes |
|---|---|---|---|---|
| G1 | No key, run Q5 with an unusual phrase | Falls back to local matching or asks to repeat | ☐ | |
| G2 | Add a valid key, press **Test Gemini connection** | Shows "Gemini: connected ✓" and a chosen model | ☐ | |
| G3 | With the key, say a messy date ("the fifth of March two thousand eight") | Correct date filled after confirmation | ☐ | |
| G4 | Enter a wrong key | Clear error; Verbly still works locally | ☐ | |
| G5 | Gemini returns an option that does not exist | Rejected; Verbly asks again | ☐ | |

## 9. Test log
| Date | Tester | Chrome version | Form | Passed | Failed | Notes |
|---|---|---|---|---|---|---|
| | | | | | | |

## 10. Bug report template
```
Title:
Form / question type:
Steps:
What I said:
Expected:
Actual:
Chrome version / OS:
Screenshot or panel log:
```

## 11. v1 is ready when
- All of sections 2, 3, 4 and 5 pass on Forms A and B.
- Unsupported questions (section 6) never crash the run.
- Nothing is ever submitted without the spoken word "submit".
- At least one person outside the team has completed Form A using only the voice.
