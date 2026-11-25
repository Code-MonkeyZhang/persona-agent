/**
 * @file 演出状态机的纯逻辑测试
 * 取图、解码、定时器与时钟全部用假实现，门控、竞态、回退、短路、气泡寿命、生成相位与瞬切在此锁定
 */
import { describe, expect, it, vi } from 'vitest';
import { THINKING_BUBBLE, type BubbleName } from '@persona/shared';
import {
  BUBBLE_FADE_MS,
  BUBBLE_VISIBLE_MS,
  INITIAL_STATE,
  PerformanceEngine,
  type PerformanceDeps,
  type PerformanceState,
} from '@/stores/performanceEngine';

/** 可手动推进的假定时器，挂起的回调按推进顺序执行 */
function fakeTimers() {
  let next = 0;
  const pending = new Map<number, () => void>();
  return {
    setTimer: vi.fn((fn: () => void) => {
      next += 1;
      pending.set(next, fn);
      return next;
    }),
    clearTimer: vi.fn((handle: number) => {
      pending.delete(handle);
    }),
    flush: () => {
      const callbacks = [...pending.values()];
      pending.clear();
      for (const cb of callbacks) cb();
    },
    size: () => pending.size,
  };
}

/** 假取图，可指定哪些立绘取不到、哪张图解码失败，并记录解码顺序 */
function fakeImages(
  poses: string[],
  options: { broken?: string[]; hold?: string[] } = {}
) {
  const released = new Map<string, () => void>();
  const decoded: string[] = [];
  return {
    resolvePose: vi.fn(async (pose: string) =>
      poses.includes(pose) ? `img:${pose}` : null
    ),
    decodeImage: vi.fn(
      (url: string) =>
        new Promise<{ width: number; height: number }>((resolve, reject) => {
          decoded.push(url);
          const settle = () => {
            if (options.broken?.includes(url)) {
              reject(new Error('decode failed'));
            } else {
              resolve({ width: 1000, height: 2000 });
            }
          };
          if (options.hold?.includes(url)) {
            released.set(url, settle);
          } else {
            settle();
          }
        })
    ),
    /** 放行一张被扣住的图 */
    release: (url: string) => released.get(url)?.(),
    decoded,
  };
}

/** 组装一台引擎，回传引擎、状态流与各假依赖 */
function setup(
  poses = ['default', 'happy', 'sad'],
  options: { broken?: string[]; hold?: string[] } = {}
) {
  const timers = fakeTimers();
  const images = fakeImages(poses, options);
  const states: PerformanceState[] = [];
  const log = { info: vi.fn(), warn: vi.fn() };
  let clock = 1000;
  const deps: PerformanceDeps<number> = {
    resolvePose: images.resolvePose,
    decodeImage: images.decodeImage,
    preloadBubble: vi.fn(async () => undefined),
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
    now: () => (clock += 1),
    log,
  };
  const engine = new PerformanceEngine(deps, (state) => states.push(state));
  /** 最新发布的状态，引擎尚未发布过时回落到初值 */
  const last = () => states.at(-1) ?? INITIAL_STATE;
  const bubble = (name: BubbleName) => ({ bubble: name });
  return { engine, states, last, timers, images, deps, log, bubble };
}

/** 让出一拍宏任务，已排队的多级微任务全部跑完，异步的门控流程由此走到头 */
const settled = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('PerformanceEngine 换脸门控', () => {
  it('新图解码就绪才落到另一层并切换着色层', async () => {
    const { engine, last, images } = setup();
    engine.perform({ pose: 'happy' });
    await settled();
    expect(images.decoded).toEqual(['img:happy']);
    expect(last()).toMatchObject({
      layers: { a: '', b: 'img:happy' },
      active: 'b',
      shownPose: 'happy',
      aspect: 0.5,
      instant: false,
    });
  });

  it('解码未就绪时旧图保持不动', async () => {
    const { engine, last, images, states } = setup(['default', 'happy'], {
      hold: ['img:happy'],
    });
    engine.restore('default');
    await settled();
    const before = last();
    const count = states.length;

    engine.perform({ pose: 'happy' });
    await settled();
    expect(states).toHaveLength(count);
    expect(last()).toBe(before);

    images.release('img:happy');
    await settled();
    expect(last().shownPose).toBe('happy');
    expect(last().layers).toEqual({ a: 'img:happy', b: 'img:default' });
  });

  it('同名立绘幂等短路，脸不切但气泡照出', async () => {
    const { engine, last, images, deps, bubble } = setup();
    engine.perform({ pose: 'happy' });
    await settled();
    images.resolvePose.mockClear();

    engine.perform({ pose: 'happy', ...bubble('happy') });
    await settled();
    expect(images.resolvePose).not.toHaveBeenCalled();
    expect(last().shownPose).toBe('happy');
    expect(last().bubble).toMatchObject({ name: 'happy', shown: true });
    expect(deps.preloadBubble).toHaveBeenCalledWith('happy');
  });

  it('连点只认最后一次，过期请求丢弃且不落图', async () => {
    const { engine, last, log, images } = setup(['default', 'happy', 'sad'], {
      hold: ['img:happy'],
    });
    engine.restore('default');
    await settled();

    engine.perform({ pose: 'happy' });
    engine.perform({ pose: 'sad' });
    await settled();
    expect(last().shownPose).toBe('sad');

    images.release('img:happy');
    await settled();
    expect(last().shownPose).toBe('sad');
    expect(log.info).toHaveBeenCalledWith(
      'stale request dropped',
      expect.objectContaining({ pose: 'happy' })
    );
  });

  it('差分取不到时回退 default 再试一次', async () => {
    const { engine, last, log } = setup(['default']);
    engine.perform({ pose: 'sad' });
    await settled();
    expect(last()).toMatchObject({
      shownPose: 'default',
      layers: { b: 'img:default' },
    });
    expect(log.warn).toHaveBeenCalledWith(
      'pose unavailable, falling back',
      expect.objectContaining({ pose: 'sad' })
    );
  });

  it('解码失败按取不到处理，同样回退 default', async () => {
    const { engine, last } = setup(['default', 'happy'], {
      broken: ['img:happy'],
    });
    engine.perform({ pose: 'happy' });
    await settled();
    expect(last().shownPose).toBe('default');
  });

  it('首张立绘就失败时标记无脸可显示，已有脸时保持旧图', async () => {
    const empty = setup([]);
    empty.engine.perform({ pose: 'sad' });
    await settled();
    expect(empty.last().failed).toBe(true);

    const kept = setup(['default']);
    kept.engine.restore('default');
    await settled();
    kept.engine.perform({ pose: 'sad' });
    await settled();
    expect(kept.last().failed).toBe(false);
    expect(kept.last().shownPose).toBe('default');
  });
});

describe('PerformanceEngine 动作与气泡', () => {
  it('动作每次重播，key 递增，归位回调清掉动作名', () => {
    const { engine, last } = setup();
    engine.perform({ motion: 'heart-beat' });
    expect(last().motion).toEqual({
      name: 'heart-beat',
      key: 1,
      playing: true,
    });
    engine.motionEnded();
    expect(last().motion).toEqual({ name: null, key: 1, playing: false });
    engine.perform({ motion: 'heart-beat' });
    expect(last().motion).toEqual({
      name: 'heart-beat',
      key: 2,
      playing: true,
    });
    engine.motionEnded();
    engine.motionEnded();
    expect(last().motion.playing).toBe(false);
  });

  it('气泡到点自动隐藏，定时器时长是两秒', async () => {
    const { engine, last, timers, bubble } = setup();
    engine.perform(bubble('sigh'));
    await settled();
    expect(last().bubble).toMatchObject({ name: 'sigh', shown: true });
    expect(timers.setTimer).toHaveBeenCalledWith(
      expect.any(Function),
      BUBBLE_VISIBLE_MS
    );

    timers.flush();
    expect(last().bubble.shown).toBe(false);
  });

  it('重复出泡先清旧定时器，只留最新一个', async () => {
    const { engine, timers, bubble } = setup();
    engine.perform(bubble('sigh'));
    await settled();
    engine.perform(bubble('happy'));
    await settled();
    expect(timers.size()).toBe(1);
    expect(timers.clearTimer).toHaveBeenCalledTimes(1);
  });

  it('气泡随换脸同刻出现，换脸未就绪时不出泡', async () => {
    const { engine, last, images, bubble } = setup(['default', 'happy'], {
      hold: ['img:happy'],
    });
    engine.perform({ pose: 'happy', ...bubble('flutter') });
    await settled();
    expect(last().bubble.shown).toBe(false);

    images.release('img:happy');
    await settled();
    expect(last().bubble).toMatchObject({ name: 'flutter', shown: true });
    expect(last().shownPose).toBe('happy');
  });

  it('作废的换脸请求不带走它的气泡', async () => {
    const { engine, last, images } = setup(['default', 'happy', 'sad'], {
      hold: ['img:happy'],
    });
    engine.perform({ pose: 'happy', bubble: 'angry' });
    engine.perform({ pose: 'sad' });
    await settled();
    images.release('img:happy');
    await settled();
    expect(last().shownPose).toBe('sad');
    expect(last().bubble.shown).toBe(false);
  });
});

describe('PerformanceEngine 瞬切与恢复', () => {
  it('restore 落到另一层并标记瞬切，作废进行中的门控', async () => {
    const { engine, last, images } = setup(['default', 'happy'], {
      hold: ['img:happy'],
    });
    engine.perform({ pose: 'happy' });
    engine.restore('default');
    await settled();
    expect(last()).toMatchObject({
      layers: { a: '', b: 'img:default' },
      active: 'b',
      shownPose: 'default',
      instant: true,
    });

    images.release('img:happy');
    await settled();
    expect(last().shownPose).toBe('default');
    expect(last().layers).toEqual({ a: '', b: 'img:default' });
  });

  it('连续瞬切交替落层，旧层的图留到新层接手', async () => {
    const { engine, last } = setup(['default', 'happy', 'sad']);
    engine.restore('default');
    await settled();
    engine.restore('happy');
    await settled();
    expect(last()).toMatchObject({
      layers: { a: 'img:happy', b: 'img:default' },
      active: 'a',
      shownPose: 'happy',
      instant: true,
    });
  });

  it('restore 清掉进行中的动作与气泡', async () => {
    const { engine, last, timers, bubble } = setup();
    engine.perform({ motion: 'sad-sink', ...bubble('sigh') });
    await settled();
    engine.restore('default');
    await settled();
    expect(last().motion.playing).toBe(false);
    expect(last().bubble.shown).toBe(false);
    expect(timers.size()).toBe(0);
  });

  it('会话记录的立绘已不存在时瞬切回退 default', async () => {
    const { engine, last } = setup(['default']);
    engine.restore('removed');
    await settled();
    expect(last()).toMatchObject({ shownPose: 'default', instant: true });
  });
});

describe('PerformanceEngine 生成相位与思考气泡', () => {
  it('推进到思考相位挂上思考气泡，不起定时器常驻在场，相位变化落日志', () => {
    const { engine, last, timers, log } = setup();
    engine.setPhase('thinking');
    expect(last().bubble).toMatchObject({
      name: THINKING_BUBBLE,
      shown: true,
    });
    expect(timers.size()).toBe(0);
    expect(log.info).toHaveBeenCalledWith('phase', {
      from: 'idle',
      to: 'thinking',
    });
  });

  it('思考切写作相位槽不变，不产生新的发布', () => {
    const { engine, last, states } = setup();
    engine.setPhase('thinking');
    const shown = last().bubble;
    const count = states.length;
    engine.setPhase('replying');
    expect(states).toHaveLength(count);
    expect(last().bubble).toBe(shown);
  });

  it('进入工具相位立即置假并起淡出定时器，淡出走完清槽', () => {
    const { engine, last, timers } = setup();
    engine.setPhase('thinking');
    engine.setPhase('tool');
    expect(last().bubble).toMatchObject({
      name: THINKING_BUBBLE,
      shown: false,
    });
    expect(timers.setTimer).toHaveBeenLastCalledWith(
      expect.any(Function),
      BUBBLE_FADE_MS
    );
    timers.flush();
    expect(last().bubble.name).toBeNull();
  });

  it('工具相位回到思考相位重新出现，换新的 key', () => {
    const { engine, last, timers } = setup();
    engine.setPhase('thinking');
    const first = last().bubble.key;
    engine.setPhase('tool');
    timers.flush();
    engine.setPhase('thinking');
    expect(last().bubble).toMatchObject({
      name: THINKING_BUBBLE,
      shown: true,
    });
    expect(last().bubble.key).not.toBe(first);
  });

  it('推进到空闲相位收起', () => {
    const { engine, last, timers } = setup();
    engine.setPhase('thinking');
    engine.setPhase('idle');
    expect(last().bubble.shown).toBe(false);
    timers.flush();
    expect(last().bubble.name).toBeNull();
  });

  it('淡出途中相位回来，淡出走完原地重新置真，槽没有被清空', () => {
    const { engine, last, states, timers } = setup();
    engine.setPhase('thinking');
    const shown = last().bubble;
    engine.setPhase('tool');
    engine.setPhase('thinking');
    expect(last().bubble.shown).toBe(false);
    const count = states.length;
    timers.flush();
    expect(states).toHaveLength(count + 1);
    expect(last().bubble).toEqual({ ...shown, shown: true });
    expect(last().bubble.key).toBe(shown.key);
  });

  it('思考气泡在场时来了情绪气泡，情绪气泡顶替，两秒到点淡出，淡出走完思考气泡回场', async () => {
    const { engine, last, timers, bubble } = setup();
    engine.setPhase('thinking');
    engine.perform(bubble('sigh'));
    await settled();
    expect(last().bubble).toMatchObject({ name: 'sigh', shown: true });
    expect(timers.setTimer).toHaveBeenLastCalledWith(
      expect.any(Function),
      BUBBLE_VISIBLE_MS
    );

    timers.flush();
    expect(last().bubble).toMatchObject({ name: 'sigh', shown: false });
    expect(timers.size()).toBe(1);

    timers.flush();
    expect(last().bubble).toMatchObject({
      name: THINKING_BUBBLE,
      shown: true,
    });
    expect(timers.size()).toBe(0);
  });

  it('情绪气泡在工具相位里到点，淡出后不回场，相位回来立即回场', async () => {
    const { engine, last, timers, bubble } = setup();
    engine.setPhase('tool');
    engine.perform(bubble('sigh'));
    await settled();
    timers.flush();
    expect(last().bubble).toMatchObject({ name: 'sigh', shown: false });
    expect(timers.size()).toBe(0);

    engine.setPhase('thinking');
    expect(last().bubble).toMatchObject({
      name: THINKING_BUBBLE,
      shown: true,
    });
  });

  it('关闭开关立即置假且不再回场，情绪气泡照出，打开后等情绪气泡收完按当前相位接上', async () => {
    const { engine, last, timers, bubble } = setup();
    engine.setPhase('thinking');
    engine.setThinkingEnabled(false);
    expect(last().bubble.shown).toBe(false);
    timers.flush();
    expect(last().bubble.name).toBeNull();

    engine.setPhase('tool');
    engine.setPhase('replying');
    expect(last().bubble.name).toBeNull();

    engine.perform(bubble('happy'));
    await settled();
    expect(last().bubble).toMatchObject({ name: 'happy', shown: true });

    engine.setThinkingEnabled(true);
    expect(last().bubble).toMatchObject({ name: 'happy', shown: true });
    timers.flush();
    expect(last().bubble.shown).toBe(false);
    timers.flush();
    expect(last().bubble).toMatchObject({
      name: THINKING_BUBBLE,
      shown: true,
    });
  });

  it('思考气泡在场时瞬切恢复，思考气泡原样不动', async () => {
    const { engine, last } = setup();
    engine.setPhase('thinking');
    const shown = last().bubble;
    engine.restore('default');
    await settled();
    expect(last().bubble).toBe(shown);
    expect(last().shownPose).toBe('default');
  });

  it('演出请求带名单外的气泡名，只落警告日志不出泡，立绘与动作照常', async () => {
    const { engine, last, log } = setup();
    // 类型层面气泡名已在名单内，这里模拟旧服务端经网络下发的名单外的值
    engine.perform({
      pose: 'happy',
      motion: 'heart-beat',
      bubble: 'thinking' as BubbleName,
    });
    await settled();
    expect(log.warn).toHaveBeenCalledWith('bubble not in roster, dropped', {
      bubble: 'thinking',
    });
    expect(last().shownPose).toBe('happy');
    expect(last().motion.name).toBe('heart-beat');
    expect(last().bubble.name).toBeNull();
  });

  it('相位没变时重复推进不产生新的发布也不记日志', () => {
    const { engine, states, log } = setup();
    engine.setPhase('thinking');
    const count = states.length;
    const logs = log.info.mock.calls.length;
    engine.setPhase('thinking');
    expect(states).toHaveLength(count);
    expect(log.info.mock.calls.length).toBe(logs);
  });
});
