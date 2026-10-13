# Critique loop

The maker's eye forgives; the critic's doesn't. Critique real frames from a real render, score honestly, fix the
three worst problems, repeat.

## Evidence (gather every round)
```bash
python3 tools/audio.py build                    # if cues/music changed
node tools/render.mjs draft                     # half-res, with audio
node tools/render.mjs inspect out/draft.mp4     # metrics.json + contact sheet from the encoded video
node tools/render.mjs sheet --beats             # one frame per beat (rhythm, dead beats)
node tools/render.mjs strip <t> --span 0.5      # around the 2–3 fastest / most important moves
node tools/render.mjs stills <hero> <end>       # full-res: type setting, edges, banding
```
Open every image with the Read tool. Look at small details at full resolution.

## Rubric (score 1–10 each)
Anchors: 5 = competent student work · 6 = template level · 7 = solid professional · 8 = high-end agency ·
9 = award shortlist · 10 = best in the world. First renders usually deserve 5–7.

| Axis | What earns an 8+ |
|---|---|
| Hook & concept | a clear idea; frame 0 and the first 0.5 s make you stay; an unmistakable hero moment; a satisfying end frame |
| Motion craft | springs fit each role; spacing/arcs/overlap/anticipation; transitions carried by elements; no pops or jitter |
| Design & typography | every key frame works as a poster; hierarchy, grid, negative space, type set properly, controlled palette |
| Rhythm & sound sync | cuts on downbeats, hits on beats, energy follows the music, SFX land on their visual events, clean mix |
| Retention & variety | something changes on every beat or holds on purpose; contrast busy/calm; no dead spans; no repetition fatigue |
| Finish & technical | spec exact (duration, size, fps, −14 LUFS, TP ≤ −1); fonts right; no clipping, banding, aliasing, shimmer |
| Brief fidelity | says what the brief says, in the brief's style, for the brief's audience; facts and brand correct |

## Severity
- **P0** — breaks the film or the brief: wrong/missing text, fallback font or tofu, broken frame, black/empty frame 0,
  wrong duration/format, audio missing or clipping, a real brand misrepresented. Must be fixed before delivery.
- **P1** — clearly visible quality problem: dead span, pop/jump, unreadable text, cramped layout, off-beat hit,
  generic/AI-template moment, ghosted motion blur on a key move.
- **P2** — polish: spacing nits, minor timing, small inconsistencies.

## review_log.md format
```
## Round 2 — draft 0:15 (out/draft.mp4)
Scores: hook 7 · motion 6 · design 7 · rhythm 6 · retention 5 · finish 8 · brief 8
Problems:
1. P1 3.4–4.6s dead span: nothing moves while the headline holds → start the UI build under the headline at 3.6s (bar 1:3).
2. P1 7.1s pop: the card restarts its spring on retarget → use track() with keys at 6.5s and 7.1s.
3. P1 9.0s drop lands on a static frame → move the colour flood to the drop, push camera 1.0→1.35.
4. P2 ...
FIXES (after re-render): 1 fixed · 2 fixed · 3 fixed (flood now at 8.98s, camera push 0.6s)
```
Fix the three highest-impact problems each round (at least one should raise the wow factor, not just polish).
Prefer a few big upgrades over many nitpicks. Don't regress strengths.

## Stop rule
Stop when the latest round scores every axis ≥ 8 with no open P0, or after 4 rounds. Then render the final. In the
delivery report, state the final scores honestly and the top-3 remaining weaknesses.

## Critic subagent prompt (when you can spawn agents)
```
You are a senior motion-design jury member (Buck / ManvsMachine / Apple keynote motion level). You did NOT make this
film. Judge it harshly and precisely; kindness is useless, specificity is everything.
Brief: <path to docs/brief.md>. Shot list: <docs/shotlist.md>.
Evidence: <out/review/metrics.json>, <out/review/video-contact*.png>, <out/sheets/beats*.png>, <strips>, <stills>.
Open and look at every image. Then:
1. Score the 7 axes 1–10 using these anchors: 5 student, 6 template, 7 solid pro, 8 high-end agency, 9 award shortlist.
2. List problems as P0/P1/P2 with timecodes, what is observably wrong, why it matters, and a concrete fix (technique
   and numbers: spring preset, frames, px, hex, layout change). At least one fix must raise the wow factor.
3. Flag anything that reads as generic or AI-template, any fallback font, any spec failure as P0/P1.
Return the score line, the problem list ordered by impact, and nothing else.
```
