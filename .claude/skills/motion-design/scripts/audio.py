#!/usr/bin/env python3
"""audio.py — sound for seek(t) films: beat analysis, synthesized score + SFX on the film's cues, mastering.

Picture and sound read the same film.json (beat grid + cues), so every hit lands where the picture hits.

  python3 tools/audio.py build                 score (synth or supplied track) + SFX + voice → out/audio.wav (-14 LUFS, TP -1)
  python3 tools/audio.py beats audio/track.mp3 [--write] [--start S] [--drop-at T] [--hint 120]
                                               measure BPM, beats, downbeats, drop, hits → audio/beats.json (+ film.json)
  python3 tools/audio.py sfx whoosh [--pitch 0 --dur 0.6] [--out out/sfx-whoosh.wav]   audition one sound
  python3 tools/audio.py list                  SFX names, music styles, cue fields

Needs: Python 3.9+, numpy, ffmpeg on PATH.
"""
import argparse
import json
import math
import os
import re
import shutil
import struct
import subprocess
import sys

try:
    import numpy as np
except ImportError:
    sys.exit("numpy is required: python3 -m pip install numpy")

SR = 48000

# ───────────────────────────── io ─────────────────────────────


def write_wav(path, x, sr=SR):
    """Write float32 WAV (IEEE float). x: (n,) or (n, 2)."""
    x = np.asarray(x, dtype=np.float32)
    if x.ndim == 1:
        x = x[:, None]
    ch = x.shape[1]
    data = x.astype('<f4').tobytes()
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    with open(path, 'wb') as f:
        f.write(b'RIFF' + struct.pack('<I', 36 + len(data)) + b'WAVE')
        f.write(b'fmt ' + struct.pack('<IHHIIHH', 16, 3, ch, sr, sr * ch * 4, ch * 4, 32))
        f.write(b'data' + struct.pack('<I', len(data)) + data)


def need_ffmpeg():
    if not shutil.which('ffmpeg'):
        sys.exit('ffmpeg not found on PATH')


def decode(path, sr=SR, channels=2):
    need_ffmpeg()
    r = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-f', 'f32le', '-ac', str(channels), '-ar', str(sr), '-'], capture_output=True)
    if r.returncode != 0:
        sys.exit(f'could not decode {path}: {r.stderr.decode()[-400:]}')
    a = np.frombuffer(r.stdout, dtype='<f4').astype(np.float64)
    return a.reshape(-1, channels) if channels > 1 else a


# ───────────────────────────── film.json & time ─────────────────────────────


class Grid:
    def __init__(self, cfg):
        self.bpm = float(cfg.get('bpm') or 120)
        self.offset = float(cfg.get('offset') or 0)
        self.bpb = int(cfg.get('beatsPerBar') or 4)
        self.spb = 60.0 / self.bpm

    def beat(self, n):
        return self.offset + n * self.spb

    def bar(self, n, b=0):
        return self.offset + (n * self.bpb + b) * self.spb


TIME_RE = re.compile(r'^(?:(bar|beat|b):(-?[\d.]+)(?::(-?[\d.]+))?)?\s*([+-]\s*[\d.]+)?s?$')


def parse_time(x, grid):
    """Same grammar as mg.js parseTime: 3.25 | "beat:8" | "bar:4" | "bar:4:2" (+/- seconds)."""
    if isinstance(x, (int, float)):
        return float(x)
    s = str(x).strip()
    m = TIME_RE.match(s)
    if not m:
        return float(s)
    t = 0.0
    if m.group(1) == 'bar':
        t = grid.bar(float(m.group(2)), float(m.group(3) or 0))
    elif m.group(1):
        t = grid.beat(float(m.group(2)))
    if m.group(4):
        t += float(m.group(4).replace(' ', ''))
    return t


def load_film(path):
    if not os.path.exists(path):
        sys.exit(f'{path} not found (run from the film folder or pass --film)')
    with open(path) as f:
        return json.load(f)


# ───────────────────────────── dsp helpers ─────────────────────────────


def tvec(n):
    return np.arange(n) / SR


def db(x):
    return 10 ** (x / 20.0)


def fft_filter(x, lo=None, hi=None, order=2, sr=SR):
    """Zero-phase Butterworth-shaped band filter via FFT. x: 1D or (n,2)."""
    n = x.shape[0]
    nf = 1 << (n - 1).bit_length()
    X = np.fft.rfft(x, nf, axis=0)
    f = np.fft.rfftfreq(nf, 1 / sr)
    H = np.ones_like(f)
    if hi:
        H *= 1 / np.sqrt(1 + (f / hi) ** (2 * order))
    if lo:
        with np.errstate(divide='ignore'):
            H *= 1 / np.sqrt(1 + (lo / np.maximum(f, 1e-6)) ** (2 * order))
    if x.ndim == 2:
        H = H[:, None]
    return np.fft.irfft(X * H, nf, axis=0)[:n]


def stft_band(x, center_fn, q=1.2, nfft=2048, hop=256):
    """Time-varying band-pass: center_fn(times) → centre Hz per STFT frame. Mono in, mono out."""
    n = len(x)
    win = np.hanning(nfft)
    pad = np.concatenate([np.zeros(nfft), x, np.zeros(nfft)])
    frames = 1 + (len(pad) - nfft) // hop
    f = np.fft.rfftfreq(nfft, 1 / SR)
    out = np.zeros(len(pad))
    norm = np.zeros(len(pad))
    times = (np.arange(frames) * hop - nfft + nfft / 2) / SR
    cents = center_fn(np.clip(times, 0, n / SR))
    for i in range(frames):
        s = i * hop
        seg = pad[s:s + nfft] * win
        S = np.fft.rfft(seg)
        c = max(40.0, cents[i])
        bw = c / q
        H = np.exp(-0.5 * ((f - c) / bw) ** 2)
        out[s:s + nfft] += np.fft.irfft(S * H, nfft) * win
        norm[s:s + nfft] += win ** 2
    out = out / np.maximum(norm, 1e-6)
    return out[nfft:nfft + n]


def env_exp(n, decay, attack=0.002):
    t = tvec(n)
    a = np.clip(t / max(attack, 1e-5), 0, 1)
    return a * np.exp(-t / max(decay, 1e-5))


def env_ar(n, attack, release_start, release):
    t = tvec(n)
    e = np.clip(t / max(attack, 1e-5), 0, 1)
    rel = np.clip((t - release_start) / max(release, 1e-5), 0, 1)
    return e * (1 - rel) ** 2


def pan_stereo(x, p=0.0):
    p = float(np.clip(p, -1, 1))
    a = (p + 1) * math.pi / 4
    return np.stack([x * math.cos(a), x * math.sin(a)], axis=1) * math.sqrt(2)


def softclip(x, drive=1.0):
    return np.tanh(x * drive) / np.tanh(drive)


def reverb(x, seconds=1.8, wet=0.25, predelay=0.02, tone=7000, seed=7):
    """Convolution reverb with a synthetic decorrelated stereo tail. x: (n,2)."""
    rng = np.random.default_rng(seed)
    n_ir = int(seconds * SR)
    t = tvec(n_ir)
    decay = np.exp(-6.91 * t / seconds)
    ir = rng.standard_normal((n_ir, 2)) * decay[:, None]
    ir = fft_filter(ir, lo=120, hi=tone, order=1)
    pd = int(predelay * SR)
    ir = np.concatenate([np.zeros((pd, 2)), ir])
    ir /= np.sqrt(np.sum(ir ** 2, axis=0, keepdims=True)) + 1e-9
    n = x.shape[0] + ir.shape[0]
    nf = 1 << (n - 1).bit_length()
    Y = np.fft.rfft(x, nf, axis=0) * np.fft.rfft(ir, nf, axis=0)
    y = np.fft.irfft(Y, nf, axis=0)[:x.shape[0] + ir.shape[0] - 1]
    out = np.zeros_like(y)
    out[:x.shape[0]] += x * (1 - wet * 0.5)
    out += y * wet
    return out


def delay(x, time_s, fb=0.35, wet=0.25, pingpong=True):
    d = int(time_s * SR)
    out = x.copy()
    tap = x.copy() * wet
    for i in range(1, 6):
        shifted = np.zeros_like(x)
        if d * i >= len(x):
            break
        shifted[d * i:] = tap[:len(x) - d * i]
        if pingpong and i % 2 == 1:
            shifted = shifted[:, ::-1]
        out += shifted
        tap = tap * fb
    return out


def additive(freq, n, partials=24, tilt=1.0, decay=None, detune_cents=0.0, seed=0, phase_rand=True):
    """Band-limited saw-like tone; decay=(base, per_partial) makes high partials die first (plucks)."""
    t = tvec(n)
    rng = np.random.default_rng(seed)
    y = np.zeros(n)
    f0 = freq * 2 ** (detune_cents / 1200)
    for k in range(1, partials + 1):
        fk = f0 * k
        if fk > SR * 0.45:
            break
        amp = 1.0 / (k ** tilt)
        ph = rng.uniform(0, 2 * math.pi) if phase_rand else 0
        part = amp * np.sin(2 * math.pi * fk * t + ph)
        if decay:
            part *= np.exp(-t / (decay[0] / (1 + decay[1] * (k - 1))))
        y += part
    return y


def note_hz(midi):
    return 440.0 * 2 ** ((midi - 69) / 12)


KEYS = {'C': 0, 'C#': 1, 'DB': 1, 'D': 2, 'D#': 3, 'EB': 3, 'E': 4, 'F': 5, 'F#': 6, 'GB': 6, 'G': 7, 'G#': 8, 'AB': 8, 'A': 9, 'A#': 10, 'BB': 10, 'B': 11}
SCALES = {'minor': [0, 2, 3, 5, 7, 8, 10], 'major': [0, 2, 4, 5, 7, 9, 11], 'dorian': [0, 2, 3, 5, 7, 9, 10]}
PROGRESSIONS = {
    'minor': [[0, 2, 4], [5, 7, 9], [2, 4, 6], [6, 8, 10]],   # i – VI – III – VII
    'major': [[0, 2, 4], [4, 6, 8], [5, 7, 9], [3, 5, 7]],    # I – V – vi – IV
    'dorian': [[0, 2, 4], [3, 5, 7], [0, 2, 4], [6, 8, 10]],  # i – IV – i – VII
}


def degree_midi(root_midi, scale, deg):
    oct_, d = divmod(deg, 7)
    return root_midi + 12 * oct_ + scale[d]


# ───────────────────────────── drums & instruments ─────────────────────────────


def kick(rng, pitch=0.0, length=0.45, punch=1.0):
    n = int(length * SR)
    t = tvec(n)
    f_hi, f_lo = 150 * 2 ** (pitch / 12), 46 * 2 ** (pitch / 12)
    f = f_lo + (f_hi - f_lo) * np.exp(-t / 0.035)
    ph = 2 * math.pi * np.cumsum(f) / SR
    body = np.sin(ph) * env_exp(n, 0.32, 0.001)
    click = fft_filter(rng.standard_normal(n) * env_exp(n, 0.004, 0.0003), lo=1500, hi=9000) * 0.5 * punch
    return softclip(body + click, 1.6) * 0.95


def clap(rng, length=0.35):
    n = int(length * SR)
    noise = rng.standard_normal(n)
    e = np.zeros(n)
    for i, off in enumerate([0, 0.011, 0.022, 0.031]):
        s = int(off * SR)
        e[s:] += env_exp(n - s, 0.012 if i < 3 else 0.09, 0.0005)
    return fft_filter(noise * e, lo=900, hi=5000) * 0.9


def snare(rng, length=0.3):
    n = int(length * SR)
    t = tvec(n)
    tone = np.sin(2 * math.pi * 185 * t) * env_exp(n, 0.06)
    nz = fft_filter(rng.standard_normal(n), lo=1800, hi=11000) * env_exp(n, 0.11)
    return (tone * 0.6 + nz * 0.8) * 0.8


def hat(rng, open_=False):
    n = int((0.32 if open_ else 0.06) * SR)
    nz = fft_filter(rng.standard_normal(n), lo=7000, hi=16000, order=3)
    return nz * env_exp(n, 0.12 if open_ else 0.018, 0.0005) * 0.55


def shaker(rng):
    n = int(0.09 * SR)
    nz = fft_filter(rng.standard_normal(n), lo=4500, hi=12000)
    return nz * env_ar(n, 0.012, 0.02, 0.06) * 0.35


def tom(rng, pitch=0.0):
    n = int(0.9 * SR)
    t = tvec(n)
    f0 = 90 * 2 ** (pitch / 12)
    f = f0 * (1 + 0.6 * np.exp(-t / 0.05))
    body = np.sin(2 * math.pi * np.cumsum(f) / SR) * env_exp(n, 0.35, 0.002)
    skin = fft_filter(rng.standard_normal(n), lo=200, hi=2500) * env_exp(n, 0.05)
    return softclip(body + skin * 0.4, 1.3)


def bass_note(freq, length, rng, style='pulse'):
    n = int(length * SR)
    t = tvec(n)
    if style == 'soft':
        y = np.sin(2 * math.pi * freq * t) * env_ar(n, 0.02, length * 0.85, length * 0.15)
        return y * 0.8
    sub = np.sin(2 * math.pi * freq * t)
    grit = additive(freq, n, partials=10, tilt=1.3, decay=(0.25, 0.4), seed=int(freq))
    y = sub * 0.85 + softclip(grit * 0.6, 2.0) * 0.3
    return y * env_ar(n, 0.004, length * 0.75, length * 0.25)


def pad_chord(midis, length, rng, bright=0.5, attack=0.35):
    n = int(length * SR)
    out = np.zeros((n, 2))
    for i, m in enumerate(midis):
        f = note_hz(m)
        for j, det in enumerate([-7, 0, 7]):
            v = additive(f, n, partials=int(10 + 14 * bright), tilt=1.15 + (1 - bright) * 0.5, detune_cents=det, seed=m * 10 + j)
            out += pan_stereo(v, [-0.6, 0.0, 0.6][j] * 0.8) * (0.33 / len(midis))
    e = env_ar(n, attack, max(0.0, length - 0.35), 0.35)
    return out * e[:, None] * 0.5


def pluck(freq, length, rng, bright=0.6):
    n = int(length * SR)
    y = additive(freq, n, partials=int(12 + 12 * bright), tilt=1.0, decay=(0.35, 0.55), seed=int(freq * 7))
    return y * env_exp(n, 0.5, 0.002) * 0.5


def drone(freq, length, rng):
    n = int(length * SR)
    t = tvec(n)
    y = additive(freq, n, partials=16, tilt=1.4, seed=int(freq)) + 0.5 * additive(freq * 2.003, n, partials=8, tilt=1.6, seed=int(freq) + 1)
    lfo = 0.75 + 0.25 * np.sin(2 * math.pi * 0.11 * t)
    return y * lfo * env_ar(n, min(1.5, length * 0.3), length - min(1.5, length * 0.3), min(1.5, length * 0.3)) * 0.35


# ───────────────────────────── SFX library ─────────────────────────────
# Each returns (stereo array, peak index). The peak is what lands on the cue time.

def _peak(x):
    m = np.abs(x).max(axis=1) if x.ndim == 2 else np.abs(x)
    k = max(1, int(0.004 * SR))
    sm = np.convolve(m, np.ones(k) / k, mode='same')
    return int(np.argmax(sm))


def sfx_whoosh(rng, dur=0.6, pitch=0.0, pan=None, bright=0.5, **_):
    n = int(dur * SR)
    nz = rng.standard_normal(n)
    pk = 0.62
    shift = 2 ** (pitch / 12)
    lo, hi = 350 * shift, (2200 + 2600 * bright) * shift
    center = lambda tt: lo + (hi - lo) * np.exp(-((tt / dur - pk) / 0.22) ** 2)
    y = stft_band(nz, center, q=1.6)
    amp = np.exp(-((tvec(n) / dur - pk) / 0.2) ** 2)
    y = y * amp
    y /= np.abs(y).max() + 1e-9
    p0 = -0.6 if pan is None else pan
    left = np.linspace(p0, -p0, n)
    st = np.stack([y * np.cos((left + 1) * math.pi / 4), y * np.sin((left + 1) * math.pi / 4)], axis=1) * math.sqrt(2)
    return st * 0.8, int(pk * n)


def sfx_swish(rng, dur=0.26, pitch=4.0, **kw):
    return sfx_whoosh(rng, dur=dur, pitch=pitch, bright=0.8, **{k: v for k, v in kw.items() if k not in ('dur', 'pitch', 'bright')})


def sfx_riser(rng, dur=2.0, pitch=0.0, **_):
    n = int(dur * SR)
    t = tvec(n)
    k = t / dur
    nz = stft_band(rng.standard_normal(n), lambda tt: 300 + 7000 * (tt / dur) ** 2.2, q=1.0)
    f = 180 * 2 ** (pitch / 12) * 2 ** (2.5 * k ** 1.6)
    tone = np.sin(2 * math.pi * np.cumsum(f) / SR) + 0.3 * np.sin(4 * math.pi * np.cumsum(f) / SR)
    y = (nz / (np.abs(nz).max() + 1e-9) * 0.8 + tone * 0.25) * (k ** 2.2)
    y[-int(0.004 * SR):] *= np.linspace(1, 0, int(0.004 * SR))
    st = pan_stereo(y, 0) * 0.7
    st[:, 0] *= 1 + 0.15 * np.sin(2 * math.pi * 3 * t)
    return st, n - 1


def sfx_downlifter(rng, dur=1.6, pitch=0.0, **_):
    x, _p = sfx_riser(rng, dur=dur, pitch=pitch)
    x = x[::-1].copy()
    return x * env_exp(len(x), dur * 0.5, 0.001)[:, None] / (np.abs(x).max() + 1e-9) * 0.7, 0


def sfx_impact(rng, dur=1.6, pitch=0.0, **_):
    n = int(dur * SR)
    t = tvec(n)
    f = 58 * 2 ** (pitch / 12) * (1 + 0.8 * np.exp(-t / 0.04))
    boom = np.sin(2 * math.pi * np.cumsum(f) / SR) * env_exp(n, 0.55, 0.001)
    crack = fft_filter(rng.standard_normal(n), lo=800, hi=9000) * env_exp(n, 0.035, 0.0005)
    tail = fft_filter(rng.standard_normal(n), lo=300, hi=4500) * env_exp(n, 0.45, 0.002) * 0.25
    y = softclip(boom * 1.1 + crack * 0.7 + tail, 1.4)
    st = reverb(pan_stereo(y, 0), seconds=1.6, wet=0.22)[:n]
    return st * 0.9, _peak(st[: int(0.1 * SR)])


def sfx_boom(rng, dur=2.4, pitch=0.0, **_):
    n = int(dur * SR)
    t = tvec(n)
    f = 44 * 2 ** (pitch / 12) * (1 + 1.2 * np.exp(-t / 0.06))
    sub = np.sin(2 * math.pi * np.cumsum(f) / SR) * env_exp(n, 0.9, 0.002)
    hitn = fft_filter(rng.standard_normal(n), lo=150, hi=3000) * env_exp(n, 0.08, 0.0008) * 0.6
    st = reverb(pan_stereo(softclip(sub * 1.2 + hitn, 1.5), 0), seconds=2.2, wet=0.3)[:n]
    return st * 0.9, _peak(st[: int(0.12 * SR)])


def sfx_hit(rng, pitch=0.0, **_):
    x = tom(rng, pitch + 5)
    click = fft_filter(rng.standard_normal(len(x)), lo=2000, hi=10000) * env_exp(len(x), 0.005, 0.0003) * 0.6
    st = reverb(pan_stereo(softclip(x + click, 1.2), 0), seconds=0.9, wet=0.15)[:len(x)]
    return st * 0.8, _peak(st[: int(0.05 * SR)])


def sfx_click(rng, pitch=0.0, **_):
    n = int(0.05 * SR)
    t = tvec(n)
    tick = fft_filter(rng.standard_normal(n), lo=2500, hi=12000) * env_exp(n, 0.0025, 0.0002)
    body = np.sin(2 * math.pi * 1700 * 2 ** (pitch / 12) * t) * env_exp(n, 0.006, 0.0002) * 0.5
    y = tick + body
    return pan_stereo(y / (np.abs(y).max() + 1e-9), 0) * 0.6, 0


def sfx_tick(rng, pitch=0.0, **_):
    n = int(0.03 * SR)
    t = tvec(n)
    y = np.sin(2 * math.pi * 3200 * 2 ** (pitch / 12) * t) * env_exp(n, 0.004, 0.0002) + fft_filter(rng.standard_normal(n), lo=5000) * env_exp(n, 0.0015) * 0.4
    return pan_stereo(y / (np.abs(y).max() + 1e-9), 0) * 0.4, 0


def sfx_pop(rng, pitch=0.0, **_):
    n = int(0.12 * SR)
    t = tvec(n)
    f = 300 * 2 ** (pitch / 12) * (1 + 2.2 * np.exp(-t / 0.012))
    y = np.sin(2 * math.pi * np.cumsum(f) / SR) * env_exp(n, 0.035, 0.0015)
    return pan_stereo(y, 0) * 0.7, _peak(y)


def sfx_blip(rng, pitch=0.0, **_):
    n = int(0.08 * SR)
    t = tvec(n)
    f = 1250 * 2 ** (pitch / 12)
    y = np.sign(np.sin(2 * math.pi * f * t)) * 0.3 + np.sin(2 * math.pi * f * t) * 0.7
    y = fft_filter(y * env_ar(n, 0.002, 0.045, 0.03), hi=6000)
    return pan_stereo(y, 0) * 0.45, 0


def sfx_ding(rng, pitch=0.0, dur=1.4, **_):
    n = int(dur * SR)
    t = tvec(n)
    f = 1046.5 * 2 ** (pitch / 12)
    y = np.zeros(n)
    for r, a, d in [(1, 1.0, 0.9), (2.76, 0.45, 0.35), (5.4, 0.25, 0.18), (8.93, 0.12, 0.09)]:
        y += a * np.sin(2 * math.pi * f * r * t) * np.exp(-t / d)
    y *= np.clip(t / 0.002, 0, 1)
    st = reverb(pan_stereo(y, 0.1), seconds=1.4, wet=0.18)[:n]
    return st * 0.35, _peak(st[: int(0.02 * SR)])


def sfx_chime(rng, pitch=0.0, **_):
    a, _p = sfx_ding(rng, pitch=pitch, dur=1.2)
    b, _p = sfx_ding(rng, pitch=pitch + 4, dur=1.4)
    n = len(b) + int(0.09 * SR)
    out = np.zeros((n, 2))
    out[:len(a)] += a
    out[int(0.09 * SR):] += b
    return out * 0.8, 0


def sfx_type(rng, pitch=0.0, **_):
    n = int(0.06 * SR)
    t = tvec(n)
    clack = fft_filter(rng.standard_normal(n), lo=1800 * 2 ** (pitch / 12), hi=6500) * env_exp(n, 0.006, 0.0003)
    thud = np.sin(2 * math.pi * 210 * t) * env_exp(n, 0.012) * 0.4
    return pan_stereo(clack + thud, rng.uniform(-0.3, 0.3)) * 0.35, 0


def sfx_glitch(rng, dur=0.32, **_):
    n = int(dur * SR)
    y = np.zeros(n)
    pos = 0
    while pos < n:
        seg = int(rng.uniform(0.012, 0.05) * SR)
        kind = rng.integers(0, 3)
        tt = tvec(seg)
        if kind == 0:
            s = np.sign(np.sin(2 * math.pi * rng.uniform(200, 2400) * tt))
        elif kind == 1:
            s = rng.standard_normal(seg)
        else:
            s = np.zeros(seg)
        step = int(rng.integers(4, 24))
        s = np.repeat(s[::step], step)[:seg]
        y[pos:pos + seg] = s[:max(0, min(seg, n - pos))] * rng.uniform(0.3, 1)
        pos += seg
    y = fft_filter(y, hi=9000) * env_ar(n, 0.002, dur * 0.8, dur * 0.2)
    return pan_stereo(y, 0) * 0.35, 0


def sfx_shimmer(rng, dur=0.9, pitch=0.0, **_):
    n = int(dur * SR)
    out = np.zeros((n, 2))
    for _i in range(26):
        s = int(rng.uniform(0, 0.55) * SR)
        f = rng.choice([2093, 2349, 2637, 3136, 3520, 4186]) * 2 ** (pitch / 12)
        m = n - s
        tt = tvec(m)
        p = np.sin(2 * math.pi * f * tt) * env_exp(m, rng.uniform(0.05, 0.2), 0.001)
        out[s:] += pan_stereo(p, rng.uniform(-0.8, 0.8)) * rng.uniform(0.2, 0.5)
    out = reverb(out, seconds=1.2, wet=0.35)[:n]
    return out / (np.abs(out).max() + 1e-9) * 0.4, 0


def sfx_snap(rng, **_):
    n = int(0.08 * SR)
    y = fft_filter(rng.standard_normal(n), lo=1500, hi=4500, order=3) * env_exp(n, 0.012, 0.0003)
    return pan_stereo(y / (np.abs(y).max() + 1e-9), 0) * 0.6, 0


def sfx_thud(rng, pitch=0.0, **_):
    n = int(0.3 * SR)
    t = tvec(n)
    f = 95 * 2 ** (pitch / 12) * (1 + 0.5 * np.exp(-t / 0.02))
    y = np.sin(2 * math.pi * np.cumsum(f) / SR) * env_exp(n, 0.08, 0.001) + fft_filter(rng.standard_normal(n), hi=900) * env_exp(n, 0.02) * 0.4
    return pan_stereo(y, 0) * 0.8, _peak(y)


def sfx_sub(rng, dur=1.4, pitch=0.0, **_):
    n = int(dur * SR)
    t = tvec(n)
    f = 80 * 2 ** (pitch / 12) * np.exp(-t / dur * 1.2)
    y = np.sin(2 * math.pi * np.cumsum(f) / SR) * env_exp(n, dur * 0.45, 0.005)
    return pan_stereo(softclip(y, 1.4), 0) * 0.9, _peak(y)


def sfx_swipe(rng, dur=0.35, pitch=0.0, **_):
    x, pk = sfx_whoosh(rng, dur=dur, pitch=pitch + 2, bright=0.7)
    t = tvec(len(x))
    tone = np.sin(2 * math.pi * np.cumsum(500 * 2 ** (pitch / 12) * (1 + t / dur)) / SR) * np.exp(-((t / dur - 0.6) / 0.2) ** 2) * 0.15
    return x + pan_stereo(tone, 0), pk


def sfx_shutter(rng, **_):
    a, _p = sfx_click(rng, pitch=-5)
    b, _p = sfx_click(rng, pitch=-2)
    n = len(b) + int(0.055 * SR)
    out = np.zeros((n, 2))
    out[:len(a)] += a
    out[int(0.055 * SR):] += b * 0.8
    return out, 0


SFX = {
    'whoosh': (sfx_whoosh, 'airy pass-by, peaks ~60% in: transitions, big moves (dur, pitch, pan, bright)'),
    'swish': (sfx_swish, 'short fast whoosh: small moves, card flips, text swipes'),
    'swipe': (sfx_swipe, 'whoosh with a rising tone: UI swipes, wipes'),
    'riser': (sfx_riser, 'build-up that ENDS on the cue: place on the drop / reveal (dur 1–4)'),
    'downlifter': (sfx_downlifter, 'falling sweep that starts on the cue: after a drop, exits'),
    'impact': (sfx_impact, 'cinematic hit + tail: hook, logo slam, title land'),
    'boom': (sfx_boom, 'deep sub boom with room: drops, big reveals'),
    'hit': (sfx_hit, 'punchy tom hit: counters, stats, stamps'),
    'click': (sfx_click, 'crisp UI click: cursor clicks, toggles, buttons'),
    'tick': (sfx_tick, 'tiny high tick: counters rolling, small snaps, typing accents'),
    'pop': (sfx_pop, 'bubbly pop: icons/stickers appearing, bubbles'),
    'blip': (sfx_blip, 'digital beep: HUD, notifications, data points'),
    'ding': (sfx_ding, 'bell: success, notification, end tag (pitch)'),
    'chime': (sfx_chime, 'two-note rising bell: success / completion'),
    'type': (sfx_type, 'single keystroke: use with repeat/every for typing'),
    'glitch': (sfx_glitch, 'digital stutter: glitch cuts, errors'),
    'shimmer': (sfx_shimmer, 'sparkle: reveals, magic, premium moments'),
    'snap': (sfx_snap, 'finger-snap transient: hard cuts, snaps into place'),
    'thud': (sfx_thud, 'soft low landing: objects settling, drops onto a surface'),
    'sub': (sfx_sub, 'sub-bass drop: weight under a cut or logo'),
    'shutter': (sfx_shutter, 'camera shutter: screenshots, captures'),
}


def render_sfx(name, seed, **params):
    if name not in SFX:
        sys.exit(f'unknown sfx "{name}". Available: {", ".join(SFX)}')
    rng = np.random.default_rng(seed)
    x, pk = SFX[name][0](rng, **params)
    if x.ndim == 1:
        x = pan_stereo(x, 0)
    return x, pk


# ───────────────────────────── score ─────────────────────────────

STYLES = {
    'pulse': 'modern minimal electronic: four-on-the-floor kick, claps, hats, sub bass, pluck arps, pad (launches, UI, tech)',
    'soft': 'warm and light: pads, plucks, soft kick, shaker, round bass (explainers, lifestyle, calm brands)',
    'cinematic': 'drones, toms on downbeats, ticking hats, swells, risers and big hits (trailers, reveals, drama)',
    'none': 'no music: SFX (and voice) only',
}


def energy_at(t, pts):
    e = pts[0][1] if pts else 0.8
    for tt, v in pts:
        if t + 1e-6 >= tt:
            e = v
    return e


def place(buf, x, t, gain=1.0, peak=0):
    """Mix x into buf so that sample `peak` of x lands at time t (seconds)."""
    start = int(round(t * SR)) - peak
    a, b = max(0, start), min(buf.shape[0], start + x.shape[0])
    if b <= a:
        return
    buf[a:b] += x[a - start:b - start] * gain


def build_score(cfg, grid, dur, seed=1):
    mus = cfg.get('music') or {}
    style = mus.get('style', 'pulse')
    if style == 'none':
        return np.zeros((int(dur * SR), 2))
    rng = np.random.default_rng(seed)
    key = KEYS.get(str(mus.get('key', 'A')).upper(), 9)
    scale_name = mus.get('scale', 'minor') if mus.get('scale') in SCALES else 'minor'
    scale = SCALES[scale_name]
    prog = PROGRESSIONS[scale_name]
    root = 36 + key  # bass octave root (C2..B2)
    pts = sorted([(parse_time(t, grid), float(v)) for t, v in mus.get('energy', [[0, 0.8]])])
    drop = parse_time(mus['drop'], grid) if mus.get('drop') is not None else None
    tail = 3.0
    n = int((dur + tail) * SR)
    drums = np.zeros((n, 2))
    bass = np.zeros((n, 2))
    harm = np.zeros((n, 2))
    sidechain = np.ones(n)
    spb, bpb = grid.spb, grid.bpb
    first_beat = math.floor((0 - grid.offset) / spb)
    last_beat = math.ceil((dur - grid.offset) / spb)
    K = kick(rng)
    CL = clap(rng)
    SN = snare(rng)
    HC = [hat(np.random.default_rng(seed + i)) for i in range(4)]
    HO = hat(rng, open_=True)
    SH = [shaker(np.random.default_rng(seed + 10 + i)) for i in range(4)]
    for b in range(first_beat, last_beat + 1):
        t = grid.beat(b)
        if t < -0.05 or t > dur + 0.05:
            continue
        e = energy_at(t, pts)
        in_bar = b % bpb
        breath = drop is not None and drop - spb - 1e-6 <= t < drop - 1e-6  # silence the beat before the drop
        if style == 'pulse':
            if e >= 0.5 and not breath:
                place(drums, pan_stereo(K, 0), t, 0.9)
                sc_len = int(0.22 * SR)
                s = int(t * SR)
                if 0 <= s < n:
                    seg = 1 - 0.65 * np.exp(-tvec(min(sc_len, n - s)) / 0.07)
                    sidechain[s:s + len(seg)] = np.minimum(sidechain[s:s + len(seg)], seg)
            if e >= 0.6 and in_bar in (1, 3) and not breath:
                place(drums, pan_stereo(CL, 0.05), t, 0.55)
            if e >= 0.35 and not breath:
                for s8 in (0.5,) if e < 0.75 else (0.25, 0.5, 0.75):
                    place(drums, pan_stereo(HC[(b * 4 + int(s8 * 4)) % 4], 0.25), t + s8 * spb, 0.28 + (0.1 if s8 == 0.5 else 0))
            if e >= 0.85 and in_bar == 3 and not breath:
                place(drums, pan_stereo(HO, -0.2), t + 0.5 * spb, 0.18)
        elif style == 'soft':
            if e >= 0.6 and in_bar in (0, 2) and not breath:
                place(drums, pan_stereo(kick(rng, pitch=-2, punch=0.3), 0), t, 0.55)
            if e >= 0.75 and in_bar in (1, 3) and not breath:
                place(drums, pan_stereo(SN, 0.1), t, 0.18)
            if e >= 0.3 and not breath:
                for q in range(4):
                    place(drums, pan_stereo(SH[q], 0.3 * (1 if q % 2 else -1)), t + q * spb / 4, 0.25 if q % 2 == 0 else 0.15)
        elif style == 'cinematic':
            if in_bar == 0 and e >= 0.45 and not breath:
                place(drums, pan_stereo(tom(rng, -5), -0.1), t, 0.7 * e)
                if e >= 0.8:
                    place(drums, pan_stereo(tom(rng, -9), 0.1), t + spb * 0.5, 0.45)
            if e >= 0.55 and not breath:
                for q in range(4):
                    place(drums, pan_stereo(HC[q], 0.4), t + q * spb / 4, 0.14 if q else 0.22)
            if in_bar == 2 and e >= 0.9 and not breath:
                place(drums, pan_stereo(tom(rng, -2), 0.2), t, 0.45)
    # Harmony per bar
    first_bar = math.floor((0 - grid.offset) / (spb * bpb))
    last_bar = math.ceil((dur - grid.offset) / (spb * bpb))
    for bar in range(first_bar, last_bar + 1):
        t = grid.bar(bar)
        if t > dur:
            break
        e = energy_at(max(0, t), pts)
        chord = prog[bar % len(prog)]
        bar_len = spb * bpb
        mids = [degree_midi(root + 24, scale, d) for d in chord]
        if style in ('pulse', 'soft'):
            place(harm, pad_chord(mids + [mids[0] + 12], bar_len + 0.4, rng, bright=0.45 + 0.3 * e, attack=0.25 if style == 'pulse' else 0.5), t, 0.6 if style == 'pulse' else 0.8)
            arp = [mids[0] + 12, mids[1] + 12, mids[2] + 12, mids[1] + 12]
            steps = 8 if style == 'soft' else 16
            if e >= (0.3 if style == 'pulse' else 0.4):
                for s in range(steps):
                    if style == 'soft' and s % 2:
                        continue
                    note = arp[s % 4] + (12 if (s // 4) % 2 and e > 0.7 else 0)
                    place(harm, pan_stereo(pluck(note_hz(note), spb * 1.5, rng, bright=0.4 + 0.4 * e), 0.35 * math.sin(s)), t + s * bar_len / steps, 0.3 if style == 'pulse' else 0.36)
            if e >= 0.4:
                br = degree_midi(root, scale, chord[0])
                if style == 'pulse':
                    for s in range(8):
                        tt = t + s * bar_len / 8
                        if drop is not None and drop - spb - 1e-6 <= tt < drop - 1e-6:
                            continue
                        place(bass, pan_stereo(bass_note(note_hz(br + (12 if s % 4 == 3 else 0)), bar_len / 8 * 0.9, rng), 0), tt, 0.42)
                else:
                    place(bass, pan_stereo(bass_note(note_hz(br), bar_len * 0.95, rng, style='soft'), 0), t, 0.42)
        elif style == 'cinematic':
            place(harm, pan_stereo(drone(note_hz(degree_midi(root + 12, scale, chord[0])), bar_len + 1.0, rng), 0) * (0.6 + 0.4 * e), t, 0.9)
            place(harm, pad_chord(mids, bar_len + 0.6, rng, bright=0.2 + 0.4 * e, attack=0.8), t, 0.55)
            if e >= 0.6:
                place(bass, pan_stereo(bass_note(note_hz(degree_midi(root, scale, chord[0])), bar_len, rng, style='soft'), 0), t, 0.6)
    harm = delay(harm, spb * 0.75, fb=0.3, wet=0.18)
    harm = reverb(harm, seconds=2.2, wet=0.28)[:n]
    music = drums * 0.85 + (bass * 0.8 + harm * 0.75) * sidechain[:, None]
    music = reverb(music, seconds=0.8, wet=0.06)[:n]
    # Drop: riser into it + impact on it
    if drop is not None and 0 < drop < dur:
        r, pk = render_sfx('riser', seed + 99, dur=min(4 * spb, drop))
        place(music, r, drop, 0.35, pk)
        if style != 'soft':
            b_, pk2 = render_sfx('boom', seed + 98)
            place(music, b_, drop, 0.5, pk2)
    return music


# ───────────────────────────── build ─────────────────────────────


def load_track(mus, grid, dur):
    path = mus.get('path')
    if not path or not os.path.exists(path):
        sys.exit(f'music.path "{path}" not found')
    x = decode(path)
    start = float(mus.get('start', 0))
    s = int(start * SR)
    x = x[s:] if s >= 0 else np.concatenate([np.zeros((-s, 2)), x])
    n = int(dur * SR)
    if len(x) < n:
        x = np.concatenate([x, np.zeros((n - len(x), 2))])
    x = x[:n + int(2 * SR)].copy()
    fi = float(mus.get('fadeIn', 0))
    if fi > 0:
        k = int(fi * SR)
        x[:k] *= np.linspace(0, 1, k)[:, None]
    return x * db(float(mus.get('gain', 0)))


def duck(music, voice, amount_db=8.0):
    env = np.abs(voice).max(axis=1)
    k = int(0.05 * SR)
    env = np.convolve(env, np.ones(k) / k, mode='same')
    thr = 0.02
    g = np.where(env > thr, db(-amount_db), 1.0)
    k2 = int(0.25 * SR)
    g = np.convolve(g, np.ones(k2) / k2, mode='same')
    return music * g[:, None]


def ffmpeg_master(src, dst, dur, lufs=-14.0, tp=-1.0):
    need_ffmpeg()
    base = ['ffmpeg', '-hide_banner', '-nostats', '-y', '-i', src]
    an = f'loudnorm=I={lufs}:TP={tp}:LRA=11:print_format=json'
    r = subprocess.run(base + ['-af', an, '-f', 'null', '-'], capture_output=True, text=True)
    m = re.search(r'\{[^{}]*"input_i"[^{}]*\}', r.stderr, re.S)
    if not m:
        sys.exit('loudnorm analysis failed:\n' + r.stderr[-800:])
    st = json.loads(m.group(0))
    af = (f'loudnorm=I={lufs}:TP={tp}:LRA=11:measured_I={st["input_i"]}:measured_TP={st["input_tp"]}:'
          f'measured_LRA={st["input_lra"]}:measured_thresh={st["input_thresh"]}:offset={st["target_offset"]}:linear=true,'
          f'aresample=48000,apad,atrim=0:{dur:.6f}')
    r = subprocess.run(base + ['-af', af, '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s16le', dst], capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit('mastering failed:\n' + r.stderr[-800:])
    r = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', dst, '-af', 'ebur128=peak=true', '-f', 'null', '-'], capture_output=True, text=True)
    I = re.findall(r'I:\s+(-?[\d.]+) LUFS', r.stderr)
    P = re.findall(r'Peak:\s+(-?[\d.]+) dBFS', r.stderr)
    return (float(I[-1]) if I else None), (float(P[-1]) if P else None)


def cmd_build(a):
    cfg = load_film(a.film)
    grid = Grid(cfg)
    dur = float(cfg.get('duration', 10))
    n = int(dur * SR)
    mus = cfg.get('music') or {'source': 'synth', 'style': 'pulse'}
    seed = int(mus.get('seed', 1))
    loop = bool(cfg.get('loop'))
    stems_dir = os.path.join('audio', 'stems')
    # Music
    if mus.get('source', 'synth') == 'file':
        music = load_track(mus, grid, dur)
        src_desc = f"track {mus.get('path')} from {mus.get('start', 0)}s"
    elif mus.get('source') == 'none' or mus.get('style') == 'none':
        music = np.zeros((n, 2))
        src_desc = 'no music'
    else:
        music = build_score(cfg, grid, dur, seed)
        src_desc = f"synth '{mus.get('style', 'pulse')}' {grid.bpm:g} BPM in {mus.get('key', 'A')} {mus.get('scale', 'minor')}"
    # SFX on cues
    sfx = np.zeros((n + int(3 * SR), 2))
    table = []
    for i, c in enumerate(cfg.get('cues', [])):
        name = c.get('sfx')
        if not name:
            continue
        t = parse_time(c.get('t', 0), grid)
        params = {k: c[k] for k in ('pitch', 'dur', 'pan', 'bright') if k in c}
        reps = int(c.get('repeat', 1))
        every = float(c.get('every', 0.1))
        for r_ in range(reps):
            cs = seed * 1000 + i * 37 + r_
            jitter = (np.random.default_rng(cs).uniform(-0.15, 0.15) * every) if reps > 1 else 0.0
            x, pk = render_sfx(name, cs, **params)
            place(sfx, x, t + r_ * every + jitter, db(float(c.get('gain', -6))), pk)
        table.append((c.get('id', f'#{i}'), t, name, reps))
    # Voice
    voice = np.zeros((n + int(3 * SR), 2))
    vo = cfg.get('voice')
    if vo and vo.get('path'):
        v = decode(vo['path'])
        place(voice, v, parse_time(vo.get('start', 0), grid), db(float(vo.get('gain', 0))))
    m = np.zeros((n + int(3 * SR), 2))
    m[:min(len(m), len(music))] += music[:len(m)]
    if vo and vo.get('path'):
        m = duck(m, voice, float(vo.get('duck', 8)))
    mix = m * db(float(mus.get('mix', -3))) + sfx + voice
    # Loops: fold the tail back onto the start so reverb/decay crosses the seam; otherwise fade the end.
    if loop:
        tail = mix[n:].copy()
        mix = mix[:n]
        mix[:len(tail)] += tail[:n]
    else:
        mix = mix[:n]
        fo = float(mus.get('fadeOut', 0.6 if mus.get('source', 'synth') == 'file' else 0.25))
        k = int(min(fo, dur) * SR)
        if k > 0:
            mix[-k:] *= np.linspace(1, 0, k)[:, None] ** 1.5
    peak = np.abs(mix).max() + 1e-9
    mix = softclip(mix / peak * 1.25, 1.0) * 0.89  # gentle glue before loudness normalisation
    os.makedirs(stems_dir, exist_ok=True)
    write_wav(os.path.join(stems_dir, 'music.wav'), m[:n])
    write_wav(os.path.join(stems_dir, 'sfx.wav'), sfx[:n])
    pre = os.path.join(stems_dir, 'premaster.wav')
    write_wav(pre, mix)
    out = a.out
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    I, TP = ffmpeg_master(pre, out, dur, a.lufs, a.tp)
    print(f'✓ {out}  {dur:.3f}s  {src_desc}  →  {I} LUFS, true peak {TP} dBTP')
    if table:
        print('  cue sync (SFX peak lands on cue time):')
        for cid, t, name, reps in table:
            print(f'    {t:7.3f}s  {cid:<16} {name}{f" ×{reps}" if reps > 1 else ""}')
    with open(os.path.join('out', 'audio.json'), 'w') as f:
        json.dump({'out': out, 'duration': dur, 'music': src_desc, 'lufs': I, 'truePeak': TP,
                   'cues': [{'id': c, 't': round(t, 4), 'sfx': s, 'repeat': r} for c, t, s, r in table]}, f, indent=2)


# ───────────────────────────── beat analysis ─────────────────────────────


def _flux(B):
    """Band-wise positive log-energy change, averaged over bands, detrended and normalised."""
    L = np.log1p(1000 * B)
    flux = np.maximum(0, np.diff(L, axis=0)).mean(axis=1)
    flux = np.concatenate([[0], flux])
    k = 16
    flux = np.maximum(flux - np.convolve(flux, np.ones(k) / k, mode='same'), 0)
    return flux / (flux.std() + 1e-9)


def onset_envelope(y, sr, hop=512, nfft=2048):
    win = np.hanning(nfft)
    y = np.concatenate([np.zeros(nfft // 2), y, np.zeros(nfft // 2)])  # frame i is centred on i*hop
    nfr = 1 + (len(y) - nfft) // hop
    if nfr < 8:
        sys.exit('track too short to analyse')
    idx = np.arange(nfft)[None, :] + hop * np.arange(nfr)[:, None]
    P = np.abs(np.fft.rfft(y[idx] * win, axis=1)) ** 2
    f = np.fft.rfftfreq(nfft, 1 / sr)
    # Log-spaced bands (mel-like): every octave counts equally, so hi-hat noise can't drown the kick.
    edges = np.geomspace(30, min(11000, sr / 2 - 1), 49)
    bands = np.stack([P[:, (f >= lo) & (f < hi)].sum(axis=1) for lo, hi in zip(edges[:-1], edges[1:])], axis=1)
    full = _flux(bands)
    lowf = _flux(bands[:, edges[1:] <= 200])  # kick / bass onsets: the usual beat carriers
    low = P[:, (f >= 30) & (f <= 160)].sum(axis=1)
    rms = np.sqrt(P.sum(axis=1))
    return full, lowf, low, rms, np.log1p(1000 * bands)


def estimate_tempo(env, fps, hint=120.0):
    lo_lag, hi_lag = int(fps * 60 / 200), int(fps * 60 / 60)
    e = env - env.mean()
    ac = np.correlate(e, e, mode='full')[len(e) - 1:]
    ac = ac / (ac[0] + 1e-9)
    lags = np.arange(lo_lag, min(hi_lag, len(ac) - 1))
    bpms = 60 * fps / lags
    prior = np.exp(-0.5 * (np.log2(bpms / hint) / 0.6) ** 2)
    score = ac[lags] * prior
    i = int(np.argmax(score))
    lag = lags[i]
    if 1 <= i < len(lags) - 1:
        a_, b_, c_ = score[i - 1], score[i], score[i + 1]
        den = a_ - 2 * b_ + c_
        if abs(den) > 1e-12:
            lag = lag + 0.5 * (a_ - c_) / den
    return 60 * fps / lag


def track_beats(env, fps, bpm, tightness=100.0):
    period = 60 * fps / bpm
    n = len(env)
    score = env.copy()
    back = np.full(n, -1)
    lo, hi = int(round(period / 2)), int(round(period * 2))
    for i in range(n):
        a_, b_ = i - hi, i - lo
        if b_ < 0:
            continue
        a_ = max(0, a_)
        prev = np.arange(a_, b_ + 1)
        pen = -tightness * np.log((i - prev) / period) ** 2
        cand = score[prev] + pen
        j = int(np.argmax(cand))
        if cand[j] > 0:
            score[i] = env[i] + cand[j]
            back[i] = prev[j]
    tail = max(1, int(period))
    i = int(np.argmax(score[-tail:])) + n - tail
    beats = []
    while i >= 0:
        beats.append(i)
        i = back[i]
    return np.array(beats[::-1])


def calibrate_to_kicks(y, sr, times, window=0.07):
    """Shift a fixed grid so beats sit on the measured low-end attacks (kick/bass): for each beat, find the
    strongest envelope peak nearby and take the point where it first rose through half of that peak."""
    lp = fft_filter(y, hi=400, sr=sr)
    k = max(1, int(0.004 * sr))
    env = np.sqrt(np.convolve(lp ** 2, np.ones(k) / k, mode='same'))
    w = int(window * sr)
    res, strength = [], []
    for t in times:
        c = int(t * sr)
        a_, b_ = max(0, c - w), min(len(env), c + w)
        if b_ - a_ < 16:
            continue
        seg = env[a_:b_]
        p = int(np.argmax(seg))
        rise = seg[p] - seg[:p + 1].min()
        j = p
        while j > 0 and seg[j] > seg[p] * 0.5:
            j -= 1
        res.append((a_ + j - c) / sr)
        strength.append(rise)
    if len(res) < 4:
        return 0.0, 0.0
    res, strength = np.array(res), np.array(strength)
    strong = strength > 0.5 * np.median(strength)
    if strong.sum() < max(3, 0.3 * len(res)):
        return 0.0, 0.0
    shift = float(np.median(res[strong]))
    spread = float(np.median(np.abs(res[strong] - shift)))
    return (shift, spread) if spread < 0.02 else (0.0, spread)


def cmd_beats(a):
    sr = 22050
    y = decode(a.track, sr=sr, channels=1)
    hop = 256
    fps = sr / hop
    full, lowf, low, rms, logbands = onset_envelope(y, sr, hop)
    env = full + 2.0 * lowf
    env /= env.std() + 1e-9
    if a.bpm:
        bpm = float(a.bpm)
    else:
        bpm = estimate_tempo(env, fps, a.hint)
        if bpm > 165:
            bpm /= 2
        elif bpm < 65:
            bpm *= 2
    frames = track_beats(env, fps, bpm)
    period = 60 * fps / bpm
    # Phase check: beats should sit on kick/bass onsets, not on off-beat hats.
    half = int(round(period / 2))
    on = lowf[np.clip(frames, 0, len(lowf) - 1)].mean()
    off = lowf[np.clip(frames + half, 0, len(lowf) - 1)].mean()
    if off > on * 1.25:
        frames = frames + half
        frames = frames[frames < len(env)]
    # Fit a straight, fixed-tempo grid through the tracked beats (robust to a few misses).
    times = frames * hop / sr
    if len(times) > 4:
        idx = np.arange(len(times))
        slope, icpt = np.polyfit(idx, times, 1)
        if a.bpm:
            slope = 60.0 / bpm
            icpt = float(np.median(times - slope * idx))
        resid = times - (slope * idx + icpt)
        keep = np.abs(resid) < 0.05
        if keep.sum() > 4 and not a.bpm:
            slope, icpt = np.polyfit(idx[keep], times[keep], 1)
        elif keep.sum() > 4:
            icpt = float(np.median(times[keep] - slope * idx[keep]))
        bpm = 60 / slope
        first = icpt - slope * math.floor(icpt / slope)  # extend the grid back to the start of the track
        nb = int((len(y) / sr - first) / slope) + 1
        times = first + slope * np.arange(nb)
    shift, spread = calibrate_to_kicks(y, sr, times)
    times = times + shift
    if times[0] < 0:
        times = times[1:]
    spb = 60 / bpm
    # Downbeats: the beat phase (mod 4) where the harmony/texture changes most (bars start chords and
    # sections) and the low end is heaviest.
    bf = np.clip(np.round(times * fps).astype(int), 0, len(low) - 1)
    segs = [logbands[bf[i]:max(bf[i] + 1, bf[i + 1])].mean(axis=0) for i in range(len(bf) - 1)]
    nov = np.array([0.0] + [float(np.linalg.norm(segs[i] - segs[i - 1])) for i in range(1, len(segs))] + [0.0])
    lowb = low[bf] / (low.max() + 1e-9)
    nov = nov / (nov.max() + 1e-9)
    score = [(nov[p::4].mean() if len(nov[p::4]) else 0) + 0.5 * (lowb[p::4].mean() if len(lowb[p::4]) else 0) for p in range(4)]
    phase = int(np.argmax(score))
    downbeats = times[phase::4]
    # Energy per bar and the drop (largest sustained jump after the intro).
    def energy(t0, t1):
        f0 = int(t0 * fps)
        f1 = max(f0 + 1, int(t1 * fps))
        return float(rms[f0:f1].mean() + 0.5 * low[f0:f1].mean()) if f0 < len(rms) else 0.0
    bars = [(float(downbeats[i]), energy(downbeats[i], downbeats[i + 1])) for i in range(len(downbeats) - 1)]
    drop = None
    if len(bars) > 5:
        e = np.array([b[1] for b in bars])
        e = e / (e.max() + 1e-9)
        jumps = [(np.mean(e[i:i + 2]) - np.mean(e[max(0, i - 2):i]), i) for i in range(2, len(e) - 1)]
        best = max(jumps)
        if best[0] > 0.08:
            drop = bars[best[1]][0]
    hv = full + lowf
    pk = hv > (hv.mean() + 2.5 * hv.std())
    hits = [round(float(i * hop / sr), 3) for i in range(1, len(hv) - 1) if pk[i] and hv[i] >= hv[i - 1] and hv[i] >= hv[i + 1]]
    dur = len(y) / sr
    res = {'track': a.track, 'duration': round(dur, 3), 'bpm': round(float(bpm), 3), 'beats': [round(float(t), 4) for t in times],
           'downbeats': [round(float(t), 4) for t in downbeats], 'drop': round(drop, 3) if drop else None, 'hits': hits[:400],
           'barEnergy': [[round(t, 3), round(e_, 3)] for t, e_ in bars],
           'kickCalibration': {'shift': round(shift, 4), 'spread': round(spread, 4)}}
    os.makedirs('audio', exist_ok=True)
    with open(os.path.join('audio', 'beats.json'), 'w') as f:
        json.dump(res, f, indent=1)
    print(f'✓ audio/beats.json  {res["bpm"]} BPM, {len(times)} beats, first downbeat {downbeats[0]:.3f}s, '
          f'drop {res["drop"]}s, {len(hits)} strong hits, kick-calibrated {shift * 1000:+.1f} ms')
    if not a.bpm:
        print(f'  if it feels like half/double time, re-run with --bpm {bpm / 2:.2f} or --bpm {bpm * 2:.2f}')
    start = a.start
    if a.drop_at is not None:
        if drop is None:
            print('  no clear drop found; pass --start yourself')
        else:
            start = drop - a.drop_at
            print(f'  to land the drop at film t={a.drop_at}s start the track at {start:.3f}s')
    if a.write:
        cfg = load_film(a.film)
        start = start or 0.0
        nxt = [d for d in downbeats if d >= start - 1e-6]
        off = (nxt[0] - start) if nxt else 0.0
        while off - 4 * spb >= -1e-6:
            off -= 4 * spb
        cfg['bpm'] = round(float(bpm), 4)
        cfg['offset'] = round(float(off), 4)
        cfg['beatsPerBar'] = 4
        mus = cfg.get('music') or {}
        mus.update({'source': 'file', 'path': a.track, 'start': round(float(start), 4)})
        cfg['music'] = mus
        with open(a.film, 'w') as f:
            json.dump(cfg, f, indent=2)
            f.write('\n')
        print(f'  film.json: bpm {cfg["bpm"]}, offset {cfg["offset"]}s (film time of bar 0), music.start {start:.3f}s')
        print('  fixed-tempo grid: if the track was played live, spot-check downbeats with a strip around a few cues')


def cmd_sfx(a):
    params = {}
    for k in ('pitch', 'dur', 'pan', 'bright'):
        v = getattr(a, k)
        if v is not None:
            params[k] = v
    x, pk = render_sfx(a.name, a.seed, **params)
    out = a.out or os.path.join('out', f'sfx-{a.name}.wav')
    write_wav(out, x / (np.abs(x).max() + 1e-9) * 0.7)
    print(f'✓ {out}  {len(x) / SR:.2f}s, peak at {pk / SR:.3f}s')


def cmd_list(_a):
    print('SFX (cue fields: id, t, sfx, gain dB (default -6), pitch semitones, dur, pan, bright, repeat, every):')
    for k, (_f, d) in SFX.items():
        print(f'  {k:<11} {d}')
    print('\nmusic.style (source "synth"):')
    for k, d in STYLES.items():
        print(f'  {k:<10} {d}')
    print('\nmusic fields: source synth|file|none, style, key (A, C#…), scale minor|major|dorian, seed, drop (time),')
    print('              energy [[time, 0..1], …] (step curve), mix dB (default -3), path/start/gain/fadeIn/fadeOut for files')
    print('voice: {"path": "audio/vo.wav", "start": 0.5, "gain": 0, "duck": 8}')


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest='cmd')
    b = sub.add_parser('build')
    b.add_argument('--film', default='film.json')
    b.add_argument('--out', default=os.path.join('out', 'audio.wav'))
    b.add_argument('--lufs', type=float, default=-14.0)
    b.add_argument('--tp', type=float, default=-1.0)
    bt = sub.add_parser('beats')
    bt.add_argument('track')
    bt.add_argument('--film', default='film.json')
    bt.add_argument('--write', action='store_true', help='write bpm/offset/music into film.json')
    bt.add_argument('--start', type=float, default=0.0, help='seconds into the track where the film starts')
    bt.add_argument('--drop-at', type=float, default=None, help='film time where the drop should land (sets --start)')
    bt.add_argument('--hint', type=float, default=120.0, help='expected tempo (prior)')
    bt.add_argument('--bpm', type=float, default=None, help='known tempo: skip estimation, only find the phase')
    s = sub.add_parser('sfx')
    s.add_argument('name')
    s.add_argument('--out')
    s.add_argument('--seed', type=int, default=1)
    for k in ('pitch', 'dur', 'pan', 'bright'):
        s.add_argument('--' + k, type=float)
    sub.add_parser('list')
    a = p.parse_args()
    if a.cmd == 'build':
        cmd_build(a)
    elif a.cmd == 'beats':
        cmd_beats(a)
    elif a.cmd == 'sfx':
        cmd_sfx(a)
    elif a.cmd == 'list':
        cmd_list(a)
    else:
        p.print_help()


if __name__ == '__main__':
    main()
