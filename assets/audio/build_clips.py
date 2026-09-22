#!/usr/bin/env python3
"""从本地真实录音重建音效；小葵怒叫、白猫轻叫，许可见素材来源。仅需标准库及 ffmpeg。"""

from __future__ import annotations

import array
import base64
import json
import math
from pathlib import Path
import shutil
import subprocess
import sys
import wave


ROOT = Path(__file__).resolve().parent
RATE = 24000
PEAK = round(0.65 * 32767)

# peak_window 是根据制作流程与信号定位的候选窗口，不表示经过试听。
SPECS = {
    "meow": {"source": "cat-meow-mafon2.mp3", "start": 0, "duration": 0.572, "cat": True},
    "angry": {"source": "cat-angry-inspectorj.mp3", "start": 0.20, "duration": 1.20, "cat": True},
    "meow-white": {"source": "cat-sad-fmaudio.mp3", "start": 0.25, "duration": 0.45, "pad_to": 0.572, "cat": True},
    "meow-soft": {"source": "cat-meow-fthgurdy.mp3", "start": 0, "duration": 0.564167, "pad_to": 0.572, "cat": True},
    "meow-bright": {"source": "cat-meow-mbpl.mp3", "start": 0, "duration": 0.552125, "pad_to": 0.572, "cat": True},
    "meow-low": {"source": "cat-meow-jofae.mp3", "start": 0.04, "duration": 0.572, "cat": True},
    "grind": {"source": "machine-grinder.mp3", "start": 0.3, "duration": 1.42},
    "brew": {"source": "machine-espresso-brewing.mp3", "start": 7, "duration": 1.2},
    "steam": {"source": "machine-steam-wand.mp3", "start": 1.5, "duration": 1},
    "beans": {"source": "machine-espresso-full.mp3", "start": 2, "duration": 0.42},
    "latch": {"source": "machine-espresso-full.mp3", "peak_window": [35.7, 36.3], "pre_peak": 0.035, "duration": 0.27},
    "land": {"source": "machine-espresso-full.mp3", "peak_window": [48.7, 49.3], "pre_peak": 0.020, "duration": 0.18},
}


def decode(filename: str, cat: bool) -> array.array:
    command = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(ROOT / "source" / filename)]
    # 在完整录音上滤波，再裁切，避免滤波器在片段起点重新启动。
    if not cat:
        command += ["-af", "highpass=f=70,lowpass=f=8000"]
    command += ["-ac", "1", "-ar", str(RATE), "-f", "f32le", "pipe:1"]
    values = array.array("f", subprocess.check_output(command))
    if sys.byteorder != "little":
        values.byteswap()
    if not values or any(not math.isfinite(value) for value in values):
        raise ValueError(f"无法读取有效采样：{filename}")
    return values


def build() -> None:
    if shutil.which("ffmpeg") is None:
        raise SystemExit("需要已安装的 ffmpeg；本脚本不会自动安装依赖。")
    target = ROOT / "clips"
    target.mkdir(exist_ok=True)
    decoded = {}
    payload = {}
    report = {}
    for key, spec in SPECS.items():
        cache_key = (spec["source"], bool(spec.get("cat")))
        if cache_key not in decoded:
            decoded[cache_key] = decode(*cache_key)
        full = decoded[cache_key]
        peak_at = None
        if "peak_window" in spec:
            lo, hi = (round(value * RATE) for value in spec["peak_window"])
            peak_at = max(range(lo, min(hi, len(full))), key=lambda i: abs(full[i]))
            first = max(0, peak_at - round(spec["pre_peak"] * RATE))
        else:
            first = round(spec["start"] * RATE)
        count = round(spec["duration"] * RATE)
        samples = list(full[first:first + count])
        # MP3 时长显示可比精确帧数长不到一帧，仅允许末端补这一帧静音。
        missing = count - len(samples)
        if missing > 1:
            raise ValueError(f"片段超出原始录音：{key}，缺少 {missing} 帧")
        samples.extend([0.0] * missing)
        fade_in = round(RATE * (0.004 if spec.get("cat") else 0.008))
        fade_out = round(RATE * (0.014 if spec.get("cat") else 0.020))
        for i in range(min(fade_in, count)):
            samples[i] *= i / max(1, fade_in - 1)
        for i in range(min(fade_out, count)):
            samples[count - 1 - i] *= i / max(1, fade_out - 1)
        # 保留新猫叫完整自然尾音，较短录音只在最后补静音到统一容器长度。
        source_count = count
        count = max(count, round(spec.get("pad_to", spec["duration"]) * RATE))
        samples.extend([0.0] * (count - source_count))
        peak = max(abs(value) for value in samples)
        if peak <= 0:
            raise ValueError(f"片段无声音：{key}")
        pcm = array.array("h", (round(value / peak * PEAK) for value in samples))
        assert len(pcm) == count and max(abs(value) for value in pcm) == PEAK
        assert pcm[0] == 0 and pcm[-1] == 0
        if sys.byteorder != "little":
            pcm.byteswap()
        raw = pcm.tobytes()
        with wave.open(str(target / f"{key}.wav"), "wb") as output:
            output.setnchannels(1)
            output.setsampwidth(2)
            output.setframerate(RATE)
            output.writeframes(raw)
        payload[key] = {"rate": RATE, "frames": count, "data": base64.b64encode(raw).decode("ascii")}
        report[key] = {
            "source": spec["source"], "start": first / RATE, "end": (first + source_count) / RATE,
            "duration": count / RATE, "frames": count, "peak": PEAK / 32768,
            "fade_in": fade_in / RATE, "fade_out": fade_out / RATE,
            "source_peak_at": None if peak_at is None else peak_at / RATE,
        }
    script = "// 由 build_clips.py 生成。data 为单声道 16 位小端 PCM，不含 WAV 文件头。\n"
    script += "// angry: Cat, Screaming, A.wav — InspectorJ (www.jshaw.co.uk); https://freesound.org/people/InspectorJ/sounds/415209/ ; 0.20–1.40秒。\n"
    script += "// meow-white: Sad Cat Vocalisation 1.wav — F.M.Audio; https://freesound.org/people/F.M.Audio/sounds/583390/ ; 0.25–0.70秒。\n"
    script += "// 两者 CC BY 4.0: https://creativecommons.org/licenses/by/4.0/ ; 裁切、淡入淡出、归一化；白猫末尾补静音至0.572秒。\n"
    script += "(function (root, factory) {\n  'use strict';\n  const clips = factory();\n"
    script += "  if (typeof module === 'object' && module.exports) module.exports = clips;\n"
    script += "  if (root) root.FactoryAudioClips = clips;\n"
    script += "})(typeof window !== 'undefined' ? window : null, function () {\n  return "
    script += json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    script += ";\n});\n"
    (ROOT / "clips.js").write_text(script, encoding="utf-8")
    (ROOT / "clips" / "裁切记录.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    build()
