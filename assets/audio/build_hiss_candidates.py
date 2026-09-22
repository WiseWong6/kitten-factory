#!/usr/bin/env python3
"""保留真实猫哈气候选原速，只调整首尾和峰值；不会写入主动画声音包。"""

import array
import json
import sys
import wave

sys.dont_write_bytecode = True
from build_clips import ROOT, RATE, PEAK, decode


CANDIDATES = {
    "hiss-patchy": ("cat-hiss-patchy-audacitier.mp3", 0, None),
    "hiss-aunrea": ("cat-hiss-aunrea.mp3", 0, None),
    "hiss-lucy": ("cat-hiss-lucy.mp3", 6.1, 9.5),
}


def build():
    target = ROOT / "candidates"
    target.mkdir(exist_ok=True)
    report = {}
    for key, (source, start, end) in CANDIDATES.items():
        full = decode(source, True)
        first = round(start * RATE)
        last = len(full) if end is None else round(end * RATE)
        assert 0 <= first < last <= len(full)
        values = list(full[first:last])
        for i in range(round(.004 * RATE)):
            values[i] *= i / (round(.004 * RATE) - 1)
        for i in range(round(.014 * RATE)):
            values[-1 - i] *= i / (round(.014 * RATE) - 1)
        peak = max(abs(v) for v in values)
        assert peak > 0
        pcm = array.array("h", (round(v / peak * PEAK) for v in values))
        assert pcm[0] == pcm[-1] == 0
        if sys.byteorder != "little":
            pcm.byteswap()
        with wave.open(str(target / f"{key}.wav"), "wb") as output:
            output.setnchannels(1)
            output.setsampwidth(2)
            output.setframerate(RATE)
            output.writeframes(pcm.tobytes())
        report[key] = {"source": source, "start": first / RATE, "end": last / RATE,
                       "duration": len(values) / RATE, "peak": PEAK / 32768,
                       "processing": "保留原速原音调；4毫秒淡入、14毫秒淡出，峰值统一"}
    (target / "裁切记录.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    build()
