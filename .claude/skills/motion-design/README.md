# motion-design — a Claude skill for studio-grade motion graphics

Claude writes each film as a program: a pure function of time (`seek(t)`) that paints any frame. The skill
supplies the rest of the studio:

- a render contract and a film project scaffold with a small engine (`lib/mg.js`): closed-form springs, sum-of-springs
  tracks, beat grid and cues, masked text, camera, shape morphs, grain
- a renderer (`render.mjs`) that needs no npm packages: determinism and lint check, stills, labelled contact sheets,
  filmstrips, draft and master renders with motion blur, multi-format output, video inspection for the critic
- sound (`audio.py`): beat and downbeat detection for a supplied track, an original synthesized score, 21 synthesized
  SFX placed by their measured peak on the same cues as the picture, mastering to −14 LUFS / −1 dBTP
- fonts (`fonts.mjs`): bundles OFL fonts from Fontsource (Latin, Cyrillic and other subsets) so renders never fall back
- a workflow: level sizing → brief → reference grammar → sound first → shot list on the 7-beat spine → style frames →
  motion → harsh critique rounds until every axis scores ≥ 8 → final + delivery report

## Install
- **Claude Code, this repo**: it's already at `.claude/skills/motion-design/`, so start Claude Code here and ask for a video.
- **Claude Code, all projects**: `cp -r .claude/skills/motion-design ~/.claude/skills/`
- **Claude.ai / Claude Desktop**: upload `motion-design.skill` (a zip of this folder) in Settings → Capabilities → Skills.
  Rendering needs a code-execution environment with Chrome/Chromium, ffmpeg and Node 22+.

Requirements: Node 22+, Chrome or Chromium (or `npx playwright install chromium`), ffmpeg, Python 3 + numpy.

## Try it
```
Make a 15-second launch film for "Relay", an app that turns voice notes into tasks. 16:9 and 9:16, punchy, 120 BPM.
```
```
Make a dynamic 15-second motion graphics showreel that shows what an incredible motion designer you are. Go all out.
```
```
UI morph loop, 1440×1440, 8 states (button → loader → check → player → slider → toggle → tabs → toast), one shape that never cuts, cursor-driven, last frame = first frame.
```
Claude scaffolds a film folder, shows you the beat sheet, renders stills and drafts, critiques itself, and
delivers `out/final.mp4` with a report.

## Layout
```
SKILL.md                 workflow, contract, craft rules, tools (what Claude reads first)
references/              brief templates, motion craft, engine API + recipes, sound, critique rubric, styles, routes
scripts/                 new_film.mjs, render.mjs, fonts.mjs, audio.py (copied into each film's tools/)
assets/template/         the film project: index.html, film.js (test card), film.json, lib/mg.js, CLAUDE.md, docs/
```

## Background
Built from the "How to build a motion design studio with Opus 5.5" course by @0xMovez (the prompt is 10%, the harness
is 90%; render contract in CLAUDE.md; seek(t); reference grammar; the 7-beat spine; lock the world before motion; XML
specs; springs instead of easing; sound before animation; specialist passes; scoring your own frames; overnight
director's briefs) and from public community practice around it (UI-morph XML specs, deterministic renderers,
critique rubrics). All code here is original.
