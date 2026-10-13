# Brief templates

Pick the template for the level of the request. Fill it into `docs/brief.md` (and the shot list into
`docs/shotlist.md`). A specific brief beats a long one: numbers, hex values, named references, banned lists.

## Contents
1. The 7-beat spine and timings · 2. L1 one-liner · 3. L2 brand reel · 4. L3 state spec (XML) · 5. L4 director's brief

## 1. The 7-beat spine
| Beat | Job | Typical share | Notes |
|---|---|---|---|
| Hook | stop the scroll; something meaningful in frame 0 | 0–8% | motion in the first 0.3 s, no black or empty opening |
| World | establish palette, type, the hero object/shape | 8–20% | the viewer learns the rules of this world |
| Question | tension: the problem, the curiosity gap | 20–35% | one clear question |
| Mechanism | how it works: product/UI/idea in action | 35–60% | concrete, cause → effect |
| Discovery | the hero moment, the "aha" | 60–75% | biggest move, meets the drop |
| Payoff | resolution: name, logo, CTA, the line | 75–92% | composed end frame |
| Loop / button | end on a rhyme with the opening (loop) or a final button | 92–100% | hold ~1 s with micro-motion |

On a grid: at 120 BPM a bar is 2 s. 10 s = 5 bars, 15 s ≈ 7.5 bars (use 16 s = 8 bars or 128 BPM), 30 s = 15 bars,
60 s = 30 bars. Put beat boundaries on downbeats; put the hero moment on the drop.

## 2. L1 — one-liner
A one-liner works because the model invents everything. Its anatomy: **duration + subject + genre + quality bar**.
> "Make a dynamic 15-second motion graphics video that shows what an incredible motion designer you are, like
> it's your showreel. Go all out."

When you get one: pick a concept that is *specific* (not "shapes and text"), write the 7-beat sheet anyway, choose a
named style from `styles.md` (or combine two), and avoid the look-alike trap — showreels made from one-liners tend to
converge on the same black background + white Inter + orange accent + particle burst. Change at least two of those.

## 3. L2 — brand reel
```
Film: <product> — <one-line promise>. <duration> s, <format>, <fps> fps, sound <on/off>.
Audience & platform: <who>, <where it plays>.
Real assets: logo <path/URL>, screenshots <paths>, colours <hex>, fonts <names>, facts <list with sources>.
Story beats: hook <…> → world <…> → question <…> → mechanism <3 UI moments> → discovery <…> → payoff <logo + line>.
Look: <style from styles.md>, <references>.
Sound: <track path + license | synth style>, drop at <beat/time>.
Banned: <list>.
```
Real product = real UI. Capture screenshots (headless Chrome screenshot of the site, or the user's files), rebuild key
UI in HTML when it must morph. Never invent features, numbers or testimonials for a real brand.

## 4. L3 — state spec (XML blocks)
For precise pieces (UI morph loops, product walkthroughs) a structured spec removes guesswork. Write it, show the
state list on the beat grid to the user, then build.
```xml
<inputs>What the user must provide (or you propose): states/scenes, brand colours, product name, the track.</inputs>
<direction>Quality bar and look in 3–5 sentences: e.g. "Dribbble-level UI motion. One shape that never cuts:
every state is the same element morphing size, radius and colour while its content swaps with a short blur.
A cursor drives every change. Light warm-grey canvas, black/white components, one UI font. Springs everywhere,
tiny overshoot at most. The last frame equals the first."
Banned: <the anti-slop items that tempt this piece>.</direction>
<structure>BPM, bars, and the ordered list of states/shots with what triggers each (click, drag, beat).</structure>
<build>Numbered technical rules: seek(t) only; springs as sums per retarget; leading/trailing edges on different
springs; drags computed from cursor position; beat grid from the track; SFX by measured peak; motion blur
subframes; render one frame per beat and fix before the full render.</build>
<gotchas>No will-change on scaled things; swapped text gets its own exit/enter; last frame = first frame including
cursor position and velocity; fade wrappers of 3D elements.</gotchas>
<start>Ask for missing inputs once, then show the state list on the beat grid before writing code.</start>
```

## 5. L4 — director's brief (long-form, autonomous runs)
For minutes-long films, music videos or character stories. Write it fully before any code; it's the contract for
every chapter.
```
FILM IN ONE LINE: logline + the joke/feeling.
REFERENCES: named works and what to take from each (grammar, not content).
TOOLS & BUDGET: route (code-drawn / mixed with image/video models), API keys available, cost cap, time cap.
CHARACTER BIBLE: for each character — proportions, palette, silhouette, expressions, how it moves (motion grammar).
WORLD: palette, textures, lighting, typography, recurring props.
BEAT SHEET: chapters with start/end (bar:beat and seconds), what happens, energy level, transitions between chapters.
TEXT ON SCREEN: exact copy, lyrics/karaoke rules, safe areas.
SOUND: the track (unchanged, licensed), measured beats (`audio.py beats`), SFX plan, voice.
WORKFLOW GATES: brief → storyboard stills per chapter → animatic (draft) → chapter polish → full render → critique.
CRITIQUE LOOP: rubric (`critique.md`), rounds per chapter, stop rule.
DELIVERABLES: final.mp4 (+ formats), poster, report, source.
```
Split the work into chapters (`film/chNN_*.js` imported by `film.js`, each a scene list for its time range) and a
shared library (`film/shared.js`) that chapter authors don't edit. With subagents, give each chapter to one
animator agent with: the contract, the brief, the character bible, its time range, the shared API, and the rule
"only edit your chapter file; report shared bugs". Render and critique per chapter (`--from/--to`), then the whole.
