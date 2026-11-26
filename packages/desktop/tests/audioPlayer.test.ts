/**
 * @file tests/audioPlayer.test.ts
 * @description 替换式播放器的结束通知用例，覆盖播完、播放失败、被新音频替换与被停止四种去向
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { audioPlayer } from '@/lib/audio-player';

/** 假 audio 元素，记录 pause 调用，onended 与 onerror 由用例手动触发 */
class FakeAudio {
  static instances: FakeAudio[] = [];
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  src: string;
  pause = vi.fn();
  play = vi.fn(() => Promise.resolve());

  constructor(src: string) {
    this.src = src;
    FakeAudio.instances.push(this);
  }
}

/** 播放一段空音频，返回它的结束通知与对应的 audio 元素 */
const playFake = () => {
  const playback = audioPlayer.play(new ArrayBuffer(1));
  const audio = FakeAudio.instances[FakeAudio.instances.length - 1];
  return { playback, audio };
};

/** 等一个微任务后判断结束通知是否已兑现 */
const isSettled = async (playback: Promise<void>) => {
  let settled = false;
  playback.then(() => {
    settled = true;
  });
  await Promise.resolve();
  return settled;
};

describe('AudioPlayer.play 的结束通知', () => {
  beforeEach(() => {
    FakeAudio.instances = [];
    vi.stubGlobal('Audio', FakeAudio);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  });

  afterEach(() => {
    audioPlayer.stop();
    audioPlayer.setPlaybackCallbacks({});
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('音频播完后兑现，播完之前保持等待', async () => {
    const { playback, audio } = playFake();

    expect(await isSettled(playback)).toBe(false);

    audio.onended?.();

    await playback;
  });

  it('播放失败时也兑现，试听状态不会卡住', async () => {
    const { playback, audio } = playFake();

    audio.onerror?.();

    await playback;
  });

  it('新音频替换时旧的那段立即兑现，新的继续等待', async () => {
    const replaced = playFake();
    const current = playFake();

    await replaced.playback;
    expect(replaced.audio.pause).toHaveBeenCalled();
    expect(await isSettled(current.playback)).toBe(false);

    current.audio.onended?.();

    await current.playback;
  });

  it('stop 停止播放时兑现等待中的那段', async () => {
    const { playback, audio } = playFake();

    audioPlayer.stop();

    await playback;
    expect(audio.pause).toHaveBeenCalled();
  });
});
