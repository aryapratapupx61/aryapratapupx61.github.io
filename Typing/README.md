# GODXSHADOW — Neon Typing Arena

A self-contained, neon-styled typing speed test. No frameworks, no build step, no
backend, no tracking — plain HTML/CSS/JS plus a tiny Node static server.

## Run it

```bash
node server.js          # http://localhost:4173
PORT=8080 node server.js
```

Or just open `index.html` in a browser — everything works from `file://` too.

## Pages

| File              | What it does                                                        |
| ----------------- | ------------------------------------------------------------------- |
| `index.html`      | The typing test: live WPM/raw/accuracy HUD, caret, live graph, results |
| `passages.html`   | **Page Type** — 34 built-in passages + "enter your passage" composer |
| `practice.html`   | Untimed passage typing view with the same HUD, graph and results     |
| `results.html`    | Local run history, WPM trend chart, sorting, CSV export, personal bests |
| `leaderboard.html`| Offline standings: your best run ranked against a fixed reference roster |
| `lessons.html`    | Nine training drills, finger map, 14-day plan                       |
| `about.html`      | Scoring rules, shortcuts, FAQ                                       |

## Passages

`passages.html` holds the passage library — warm-ups, home-row ladders, common-word
runs, rhythm drills, punctuation and caps, numbers, shell/code snippets, technical
prose, short stories, rare-letter and long-word challenges, and endurance paragraphs.

Below the library is the composer, **enter your passage**: write or paste any text,
give it a title, category and difficulty, then either

- **type this now** — saves it and jumps straight into the typing view, or
- **save passage** — keeps it in `my passages` for later.

Saved passages live in `localStorage` under `gx.passages.v1` and can be exported or
imported as JSON. `practice.html` accepts `?id=<built-in>`, `?custom=<saved-id>`, or
a passage handed over through `sessionStorage`.

Passage runs are untimed: the clock counts up and the run ends on the final word.
They are stored in your history with mode `passage`.

## Layout

```
godxshadow/
├── index.html  results.html  leaderboard.html  lessons.html  about.html
├── css/neon.css          neon theme: animated grid floor, glows, glass panels
├── js/words.js           word banks + deterministic text generator
├── js/engine.js          pure measurement: WPM, raw, accuracy, consistency
├── js/store.js           localStorage, DOM/chart helpers, audio blips
├── js/app.js             typing test controller
├── js/history.js         results page
├── js/leaderboard.js     offline leaderboard
├── js/lessons.js         drills page
├── server.js             dependency-free static server
└── test/                 jsdom test suites
```

## Timer

The time picker is a dropdown, not a row of pills: **1 min, 2 min, 5 min, 10 min,
15 min, 30 min, 1 hour**, plus **custom…**. Choosing custom reveals a number box
with a min/sec unit selector — anything from 5 seconds to 2 hours, clamped at both
ends. The countdown reads `mm:ss` once a run is a minute or longer, and the
progress bar turns red in the last 20% (never later than the final 30 seconds).

Word-count tests (10 / 25 / 50 / 100) stay as pills next to the dropdown.

## HCM — hardcore mix

The **HCM** pill in the text row is an all-in-one hardcore list: pick it and the
run comes fully mixed, no extra toggles needed.

- Sentences end with a full stop every 3–9 words.
- The word after every break (and the very first word) always starts with a
  **capital** — never a number.
- **Numbers** are scattered mid-sentence (~15% of tokens, 10–9009).
- Everything else draws from the common-500 vocabulary.

Example: `The 804 laugh series window. House 6934 make final. Usual again ten start.`

The punct / caps / 123 toggles don't change HCM — the mix is baked in. HCM has
its own personal-best track like every other list.

## Full screen

The icon button in the nav, right of **About**, toggles full screen: tap it and
the page goes full screen with the expand icon flipping to a collapse icon
(neon-filled while active). Tap again — or press Esc — and it exits, the icon
always following the real fullscreen state. It is on every page, with webkit
fallbacks for older Safari.

## Sound

Key clicks are synthesised, not sampled. Each press builds three layers with the
Web Audio API:

1. a band-passed noise transient — the *tak* of the keycap bottoming out
2. a short pitched triangle thump — the plate resonance under it
3. a quieter, brighter noise tick ~40 ms later — the key coming back up

Pitch, filter frequency and playback rate are randomised per press so it never
loops audibly, and the space bar gets a lower, longer variant because it sits on
a stabiliser. A volume slider appears when sound is on; moving it plays one
click so you can hear the level.

## 35 WPM flash

While a run is live, the moment your settled pace crosses **35 WPM** a
full-screen `35 WPM` flash fires once. The first five seconds (or the first 15
correct characters) are a settling window — a half-second-old "WPM of 300" is
noise, so the flash waits until the number means something. It does not repeat
on every keystroke; it arms itself again only if you drop back below 35 and
climb past it once more. A restart clears it.

The same celebration also fires on the **results screen** — full-screen, in the
NEW PB style, in green — when the final WPM is 35 or more. It names your actual
pace, so a run finished at 39 WPM flashes `39 WPM`; if that run also beat your
personal best it reads `NEW PB · 39 WPM`. Below 35 the reveal stays quiet (a
beaten PB still gets the plain `NEW PB` flash). The Page Type results screen
does the same.

The threshold lives in settings as `wpmFlash`; set it to `0` to turn the flash
off. It is suppressed entirely when the OS asks for reduced motion.

## Results gauge

The result dial is a speedometer, not a static ring. On the results screen the
coloured sweep and a white needle rev up from the bottom-left over ~1.1s with
an ease-out curve and settle exactly on your WPM. Ticks light up cyan as the
needle passes them, major ticks carry their number, and the last 15% of the
dial is a redline zone. `prefers-reduced-motion` draws the final dial in one
shot instead.

## Scoring

- **WPM** = correct chars ÷ 5 ÷ minutes.
- **Raw WPM** = every char typed, right or wrong.
- **Accuracy** = correct keystrokes ÷ all keystrokes (extras count against you).
- **Consistency** = `100 × (1 − CV)` over per-second *instant* WPM samples.
  Sampling instant pace rather than the running average is what makes this
  number meaningful — a cumulative average flattens out and hides every wobble.

## Shortcuts

`any key` start · `space` next word · `backspace` fix · `ctrl+backspace` wipe word ·
`tab` restart · `shift+tab` new text · `esc` abort

## Tests

```bash
node test/e2e.js       # 123 assertions — real app.js in jsdom, simulated typing
node test/pages.js     # 144 assertions — secondary pages, audio, hero typewriter
node test/passages.js  # 127 assertions — passages, composer, practice runs, WPM flash
```

`test/e2e.js` loads the actual `index.html` and `js/app.js` under jsdom with a
controlled clock and a stubbed canvas, then types words through real `keydown`
events and asserts on the rendered DOM, the WPM math and localStorage.
`test/pages.js` boots each secondary page, feeds it seeded storage, and exercises
sorting, filtering, CSV export, mode switching and cross-page nav consistency.

## Notes

All text content — the word banks, the quote sentences, the drill copy and the
FAQ — is original work written for this project. Results never leave the browser.
