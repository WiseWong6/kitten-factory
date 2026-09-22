'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { atob } = require('node:buffer');
const F = require('../timeline.js');
const S = require('../sound.js');
const clips = require('../assets/audio/clips.js');
const EPS = 1e-6;
const close = (a, b, message) => assert.ok(Math.abs(a - b) < EPS, message || a + ' ≠ ' + b);
let checks = 0;
async function check(label, fn) { await fn(); checks++; console.log('通过：' + label); }
const events = new Map(), decoded = new Map();

function expectedRound(round) {
  const recipe = F.recipes[round % F.recipes.length];
  const result = [['grind', 'grind', .98, 1.42, 1, .28 * .45],
    ['latch', 'latch', 3.08, .27, 1, .22 * .45], ['latch', 'latch', 5.8, .27, 1, .16 * .45],
    ['bean', 'beans', 5.88, .42, 1, .18 * .45], ['land', 'land', 7.27, .18, 1, .18 * .45]];
  if (round === 0) result.push(['bean', 'beans', .68, .42, 1, .18 * .45]);
  if (recipe.malfunction) result.push(['fault', 'latch', 3.4, .27, 1, .18 * .45], ['fault', 'latch', 4.25, .27, 1, .14 * .45]);
  else result.push(['pump', 'brew', 3.35, 1.2, 1, .24 * .45], ['steam', 'steam', 4.2, 1, 1, .23 * .45]);
  const voice = F.voiceFor(recipe);
  result.push(recipe.kind === 'xiaokui' ? ['angry', 'angry', 5.24, 1.2, 1, .58]
    : ['meow', voice.clip, voice.start, voice.duration, voice.pitch, voice.gain]);
  return result;
}

function readWav(filename) {
  const file = fs.readFileSync(filename);
  assert.equal(file.toString('ascii', 0, 4), 'RIFF');
  assert.equal(file.toString('ascii', 8, 12), 'WAVE');
  assert.equal(file.readUInt32LE(4) + 8, file.length);
  let format, data;
  for (let offset = 12; offset + 8 <= file.length;) {
    const name = file.toString('ascii', offset, offset + 4), size = file.readUInt32LE(offset + 4);
    assert.ok(offset + 8 + size <= file.length, 'WAV 数据块不能超出文件');
    const chunk = file.subarray(offset + 8, offset + 8 + size);
    if (name === 'fmt ') format = chunk;
    if (name === 'data') data = chunk;
    offset += 8 + size + (size % 2);
  }
  assert.ok(format && data, 'WAV 必须含格式和音频数据');
  assert.equal(format.readUInt16LE(0), 1, '使用无压缩 PCM');
  assert.equal(format.readUInt16LE(2), 1, '使用单声道');
  assert.equal(format.readUInt16LE(14), 16, '使用 16 位采样');
  assert.equal(format.readUInt16LE(12), 2);
  return { rate: format.readUInt32LE(4), data };
}

const contexts = [];
class FakeAudio {
  constructor() {
    contexts.push(this); this.currentTime = 0; this.sampleRate = 48000;
    this.state = 'suspended'; this.destination = {}; this.sources = []; this.buffers = [];
  }
  async resume() { this.state = 'running'; }
  createGain() {
    const events = [];
    return { gain: { value: 0, events,
      setValueAtTime(value, time) { events.push({ value, time }); },
      linearRampToValueAtTime(value, time) { events.push({ value, time }); } },
      connect() {}, disconnect() {} };
  }
  createBuffer(channels, length, rate) {
    assert.equal(channels, 1);
    const data = new Float32Array(length);
    const buffer = { duration: length / rate, length, sampleRate: rate, getChannelData() { return data; } };
    this.buffers.push(buffer); return buffer;
  }
  createBufferSource() {
    const source = { playbackRate: {}, connect(node) { this.gainNode = node; }, disconnect() {},
      stop() { this.stopped = true; },
      start(clock, offset, duration) {
        assert.ok(Number.isFinite(clock) && Number.isFinite(offset) && Number.isFinite(duration));
        assert.ok(offset >= 0 && duration > 0 && offset + duration <= this.buffer.duration + EPS,
          '恢复播放必须使用有效偏移和片段剩余时长');
        this.clock = clock; this.offset = offset; this.duration = duration;
      } };
    this.sources.push(source); return source;
  }
}
const host = (Audio = FakeAudio, library = clips) => ({ AudioContext: Audio, FactoryAudioClips: library, atob });
const stopped = sources => assert.ok(sources.every(source => source.stopped), '已停止的动作不得继续发声');

async function main() {
  await check('机器保持较低音量，白猫独立轻叫、小葵怒叫与 15 种猫的动作同步', () => {
    assert.equal(F.recipes.length, 15);
    close(S.MASTER_GAIN, .72, '总音量不得随机器音量下调');
    const voices = F.recipes.map(recipe => F.voiceFor(recipe)).filter(Boolean);
    assert.equal(voices.length, 14);
    assert.equal(new Set(voices.map(voice => voice.clip)).size, 5, '普通猫使用五种不同录音，包括白猫独立轻叫');
    const white = F.voiceFor(F.recipes.find(recipe => recipe.kind === 'white'));
    assert.equal(white.clip, 'meow-white'); close(white.gain, .43); close(white.pitch, .98);
    assert.equal(voices.filter(voice => voice.clip === 'meow-white').length, 1, '委屈轻叫只用于白猫');
    assert.equal(F.voiceFor(F.recipes.find(recipe => recipe.kind === 'xiaokui')), null);
    for (let round = 0; round < F.recipes.length; round++) {
      const expected = expectedRound(round);
      const times = new Set(Array.from({ length: 800 }, (_, i) => round * 8 + (i + .5) / 100));
      for (const [, , start, duration] of expected) {
        for (const t of [start - EPS, start + EPS, start + duration - EPS, start + duration + EPS]) times.add(round * 8 + t);
      }
      for (const time of times) {
        const phase = time - round * 8;
        const actual = S.cuesAt(time, F);
        const want = expected.filter(([, , start, duration]) => phase >= start && phase < start + duration);
        assert.deepEqual(actual.map(c => c.type + ':' + c.clip).sort(), want.map(c => c[0] + ':' + c[1]).sort(),
          F.recipes[round].name + ' 在 ' + phase.toFixed(6) + ' 秒的声音不符');
        assert.equal(new Set(actual.map(c => c.key)).size, actual.length, '同一时刻不得重复创建同一动作');
        for (const cue of actual) {
          const match = want.find(c => c[0] === cue.type && Math.abs(round * 8 + c[2] - cue.start) < EPS);
          assert.ok(match); close(cue.duration, match[3]); close(cue.pitch, match[4] || 1); events.set(cue.key, cue);
          close(cue.gain, match[5], ['meow', 'angry'].includes(cue.type)
            ? '猫声使用各自的固定音量' : cue.type + ' 必须统一降到原音量的 45%');
          if (cue.type === 'meow') {
            const voice = F.voiceFor(F.recipes[round]);
            assert.ok(voice.pitch >= .96 && voice.pitch <= 1.08);
            close(cue.gain, voice.gain); close(cue.duration * cue.pitch, .572, '播放完整录音，音高只调整播放时长');
            const next = S.cuesAt(time + F.recipes.length * 8, F).find(item => item.type === 'meow');
            assert.ok(next); assert.equal(next.clip, cue.clip); close(next.pitch, cue.pitch); close(next.gain, cue.gain);
          }
        }
        const state = F.stateAt(time);
        if (!state.malfunction) {
          assert.equal(actual.some(c => c.clip === 'brew'), !!state.flow, '出液录音覆盖完整下落水流');
          assert.equal(actual.some(c => c.clip === 'steam'), state.wand.spraying, '喷气录音与喷色同步');
        } else assert.ok(actual.every(c => !['brew', 'steam'].includes(c.clip)));
        if (actual.some(c => c.type === 'angry')) assert.ok(F.xiaokuiReaction(phase).hiss > 0);
      }
    }
    const beans = [...events.values()].filter(c => c.type === 'bean');
    assert.equal(beans.length, 16, '开场一批与每轮补豆各播放一次');
    assert.equal(beans.filter(c => c.start < 5).length, 1); close(beans[0].start, .68);
    for (let round = 0; round < 15; round++) {
      const refill = F.stateAt(round * 8 + 5.88).hopper.find(bean => bean.id === 0);
      close(refill.y, 293, '补豆声发生在第一颗豆落稳时');
      const catCue = [...events.values()].find(c => c.start >= round * 8 && c.start < (round + 1) * 8 && ['angry', 'meow'].includes(c.type));
      if (round === 0) {
        close(catCue.start + catCue.duration, 6.44);
        assert.ok(F.catX(5.81) > 435, '小葵叫声的后半段伴随离场，不让队列等声音');
      }
      else assert.ok(catCue.start - round * 8 + catCue.duration < 5.8, '每种叫声完整结束后猫咪才离开');
    }
    assert.ok(!S.cuesAt(120.7, F).some(c => c.type === 'bean'), '第二遍播放也不能重新倒开场豆');
  });

  await check('12 段录音与 WAV 一致且无削波，五种普通猫声和怒叫独立，页面加载正确', () => {
    assert.deepEqual(Object.keys(clips).sort(), ['angry', 'beans', 'brew', 'grind', 'land', 'latch', 'meow', 'meow-bright', 'meow-low', 'meow-soft', 'meow-white', 'steam']);
    assert.equal(new Set(['meow', 'meow-soft', 'meow-bright', 'meow-low', 'meow-white', 'angry'].map(name => clips[name].data)).size, 6, '猫声不可使用同一录音重复命名');
    close(clips.angry.frames / clips.angry.rate, 1.2);
    close(clips['meow-white'].frames / clips['meow-white'].rate, .572);
    for (const [name, clip] of Object.entries(clips)) {
      const bytes = Buffer.from(clip.data, 'base64');
      assert.equal(bytes.toString('base64'), clip.data, name + ' 的编码有效');
      const data = S.decodeClip(clip, atob), wav = readWav(path.join(require('node:path').resolve(__dirname, '..'), 'assets/audio/clips', name + '.wav'));
      assert.equal(data.length, clip.frames); assert.equal(bytes.length, clip.frames * 2);
      assert.equal(wav.rate, clip.rate); assert.deepEqual(wav.data, bytes, name + ' 与源 WAV 必须逐字节相同');
      let peak = 0, power = 0;
      for (let i = 0; i < data.length; i++) {
        assert.ok(Number.isFinite(data[i])); assert.equal(data[i], bytes.readInt16LE(i * 2) / 32768);
        peak = Math.max(peak, Math.abs(data[i])); power += data[i] ** 2;
      }
      assert.ok(peak > .01 && peak < .9 && power / data.length > 1e-6, name + ' 不能静音或削波');
      assert.equal(data[0], 0); assert.equal(data.at(-1), 0); decoded.set(name, data);
    }
    assert.equal(new Set([...events.values()].map(c => c.clip)).size, 12);
    for (const cue of events.values()) {
      assert.ok(clips[cue.clip], cue.type + ' 必须引用存在的录音');
      assert.ok(Number.isFinite(cue.gain) && cue.gain > 0 && cue.gain <= 1);
      assert.ok(cue.duration * cue.pitch <= clips[cue.clip].frames / clips[cue.clip].rate + EPS, cue.clip + ' 必须能完整覆盖动作');
    }
    for (const invalid of [undefined, { rate: 0, frames: 1, data: 'AAA=' }, { rate: 24000, frames: 2, data: 'AAA=' }]) {
      assert.throws(() => S.decodeClip(invalid, atob));
    }
    const html = fs.readFileSync(path.join(require('node:path').resolve(__dirname, '..'), 'index.html'), 'utf8');
    const scripts = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/g)].map(m => m[1]);
    const clipIndex = scripts.indexOf('assets/audio/clips.js'), soundIndex = scripts.indexOf('sound.js');
    assert.ok(clipIndex >= 0 && soundIndex > clipIndex);
    const browser = { window: {}, atob };
    vm.runInNewContext(fs.readFileSync(path.join(require('node:path').resolve(__dirname, '..'), 'assets/audio/clips.js'), 'utf8'), browser);
    vm.runInNewContext(fs.readFileSync(path.join(require('node:path').resolve(__dirname, '..'), 'sound.js'), 'utf8'), browser);
    assert.equal(JSON.stringify(browser.window.FactoryAudioClips), JSON.stringify(clips));
    assert.equal(typeof browser.window.FactorySound.create, 'function');
    assert.equal(typeof browser.window.FactorySound.cuesAt, 'function');
  });

  await check('完整 120 秒按真实采样叠加仍保留音量余量', () => {
    const rate = clips.meow.rate;
    assert.ok(Object.values(clips).every(c => c.rate === rate));
    const mix = new Float32Array(120 * rate), bound = new Float32Array(mix.length);
    for (const cue of events.values()) {
      const data = decoded.get(cue.clip), start = Math.round(cue.start * rate), count = Math.round(cue.duration * rate);
      for (let i = 0; i < count; i++) {
        const sourcePosition = i * cue.pitch, sample = Math.floor(sourcePosition), fraction = sourcePosition - sample;
        const value = ((data[sample] || 0) * (1 - fraction) + (data[sample + 1] || 0) * fraction) * cue.gain * S.MASTER_GAIN;
        mix[start + i] += value; bound[start + i] += Math.abs(value);
      }
    }
    let peak = 0, worst = 0;
    for (let i = 0; i < mix.length; i++) { peak = Math.max(peak, Math.abs(mix[i])); worst = Math.max(worst, bound[i]); }
    assert.ok(worst > .1 && worst < .9, '即使忽略播放时淡化并取各声部绝对值，也必须留有余量');
    console.log('  实际采样叠加峰值 ' + peak.toFixed(3) + '，保守上界 ' + worst.toFixed(3) + '（满幅为 1）。');
  });

  const engine = S.create(F, host());
  let context;
  await check('默认不创建播放器，开启才解码真实录音，同一动作连续更新不重复播放', async () => {
    engine.sync(2, true); assert.equal(contexts.length, 0); assert.equal(engine.enabled, false);
    assert.equal(await engine.setEnabled(true), true);
    assert.equal(contexts.length, 1); context = contexts[0]; assert.equal(context.buffers.length, Object.keys(clips).length);
    engine.sync(2, true); assert.equal(context.sources.length, 1);
    close(context.sources[0].offset, 1.02); close(context.sources[0].duration, .4);
    context.currentTime += .02; engine.sync(2.02, true); assert.equal(context.sources.length, 1);
  });
  await check('暂停停止，继续从当前位置接续，前后拖动仅恢复当前声音而不补播历史动作', () => {
    engine.sync(2.02, false); stopped(context.sources);
    context.currentTime += 1; engine.sync(2.02, true);
    close(context.sources.at(-1).offset, 1.04); close(context.sources.at(-1).duration, .38);
    for (const [time, offset, remaining] of [[3.8, .45, .75], [.75, .07, .35], [4.8, .6, .4]]) {
      const before = [...context.sources]; engine.sync(time, true);
      stopped(before); assert.equal(context.sources.length, before.length + 1);
      close(context.sources.at(-1).offset, offset); close(context.sources.at(-1).duration, remaining);
    }
    for (let index = 1; index < F.recipes.length; index++) {
      const voice = F.voiceFor(F.recipes[index]);
      for (const sampleOffset of [.10, .30, .05]) {
        const time = index * 8 + voice.start + sampleOffset / voice.pitch;
        const before = [...context.sources]; engine.sync(time, true); stopped(before);
        const source = context.sources.at(-1);
        close(source.offset, sampleOffset, '跳转偏移必须换算为本录音的原采样秒');
        close(source.duration, .572 - sampleOffset, '恢复播放保留全部剩余录音');
        close(source.playbackRate.value, voice.pitch);
        engine.sync(time, false); stopped(context.sources);
        context.currentTime += .02; engine.sync(time, true);
        close(context.sources.at(-1).offset, sampleOffset, '暂停后从相同采样位置接续');
      }
    }
  });
  await check('倍速重排并保留正确截取长度，静音与隐藏重置停止声音，再开启复用录音', async () => {
    for (const rate of [2, .5]) {
      const before = [...context.sources]; engine.sync(4.8, true, rate); stopped(before);
      const source = context.sources.at(-1);
      assert.equal(source.playbackRate.value, rate); close(source.offset, .6); close(source.duration, .4);
      close(source.gainNode.gain.events.at(-1).time - context.currentTime, .4 / rate);
    }
    for (let index = 1; index < F.recipes.length; index++) {
      const voice = F.voiceFor(F.recipes[index]);
      for (const rate of [.5, 1, 1.5, 2, 3]) {
        const before = [...context.sources]; engine.sync(index * 8 + voice.start + .2 / voice.pitch, true, rate); stopped(before);
        const source = context.sources.at(-1);
        close(source.playbackRate.value, rate * voice.pitch, '用户倍速与固定猫声倍率共同生效');
        close(source.offset, .2); close(source.duration, .372);
        close(source.gainNode.gain.events.at(-1).time - context.currentTime, .372 / (rate * voice.pitch));
      }
    }
    engine.reset(); stopped(context.sources);
    engine.sync(4.8, true); await engine.setEnabled(false); stopped(context.sources);
    const count = context.sources.length; engine.sync(5.5, true); assert.equal(context.sources.length, count);
    assert.equal(await engine.setEnabled(true), true); assert.equal(contexts.length, 1); assert.equal(context.buffers.length, Object.keys(clips).length);
    engine.sync(5.5, false); assert.equal(context.sources.length, count); await engine.setEnabled(false);
  });
  await check('缺少音频能力、录音文件损坏或播放被拒绝时安全返回关闭状态', async () => {
    class Rejected extends FakeAudio { async resume() { throw new Error('blocked'); } }
    class Suspended extends FakeAudio { async resume() {} }
    const incomplete = { ...clips }; delete incomplete.steam;
    const missingVoices = ['meow', 'meow-soft', 'meow-bright', 'meow-low', 'meow-white', 'angry'].map(name => {
      const library = { ...clips }; delete library[name]; return host(FakeAudio, library);
    });
    const corrupt = { ...clips, meow: { ...clips.meow, data: 'AAA=' } };
    for (const candidate of [{}, { AudioContext: FakeAudio }, { AudioContext: FakeAudio, FactoryAudioClips: clips },
      host(Rejected), host(Suspended), host(FakeAudio, incomplete), host(FakeAudio, corrupt), ...missingVoices]) {
      const before = contexts.length, broken = S.create(F, candidate);
      assert.equal(await broken.setEnabled(true), false); assert.equal(broken.enabled, false);
      assert.doesNotThrow(() => { broken.sync(3.8, true); broken.reset(); });
      for (const ctx of contexts.slice(before)) assert.equal(ctx.sources.length, 0);
      assert.equal(await broken.setEnabled(false), false);
    }
  });
  console.log('完成 ' + checks + ' 项音效检查；未进行浏览器或扬声器试听，音色需人工验收。');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
