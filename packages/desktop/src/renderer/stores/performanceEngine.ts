/**
 * @file 陪伴演出状态机，四层舞台的驱动源，纯逻辑不碰任何平台 API
 * 换脸走双图层交叉淡化 300ms linear，新图解码就绪才切，递增 token 竞态保护，差分缺失回退 default
 * 动作 one-shot 播完归位；情绪气泡两秒自动淡出，思考气泡随生成相位出入场，素材自己无限循环
 * 气泡层只有一个槽，思考气泡与情绪气泡写同一个槽，由裁定函数决定槽里站谁
 * 取图、定时器、时钟与日志经依赖注入，两端用各自的平台实现装配同一份逻辑
 */
import {
  THINKING_BUBBLE,
  isBubbleName,
  type BubbleName,
  type LayerBubbleName,
  type MotionName,
  type ShowPoseParams,
} from '@persona/shared';

/** 情绪气泡的显示时长，到点后开始淡出 */
export const BUBBLE_VISIBLE_MS = 2000;

/** 气泡的淡出时长，走完才清槽卸载节点 */
export const BUBBLE_FADE_MS = 300;

/** 生成相位，思考气泡只在思考与写作两态在线，空闲与工具执行两态离线 */
export type GeneratingPhase = 'idle' | 'thinking' | 'tool' | 'replying';

/** 首张立绘到位前的宽高比兜底，取立绘常见比例 */
const FALLBACK_ASPECT = 0.5;

/** 日志依赖的最小形状，两端的 logger 都满足 */
export interface PerformanceLog {
  info: (message: string, detail?: Record<string, unknown>) => void;
  warn: (message: string, detail?: Record<string, unknown>) => void;
}

/** 演出状态机的可注入依赖，全部是平台相关的取图、定时器与时钟 */
export interface PerformanceDeps<TTimer> {
  /** 按立绘名解析图片地址，差分缺失或清单拉取失败时返回 null */
  resolvePose: (pose: string) => Promise<string | null>;
  /** 取图的就绪门控，返回自然尺寸，加载或解码失败时 reject */
  decodeImage: (url: string) => Promise<{ width: number; height: number }>;
  /** 预解码一张气泡图，失败不阻断出泡 */
  preloadBubble: (name: BubbleName) => Promise<void>;
  setTimer: (fn: () => void, ms: number) => TTimer;
  clearTimer: (handle: TTimer) => void;
  /** 气泡 key 的时间戳来源 */
  now: () => number;
  log: PerformanceLog;
}

/** 演出状态，引擎每次变化整体发布，store 原样落进状态库 */
export interface PerformanceState {
  /** 双图层各自的图片地址 */
  layers: { a: string; b: string };
  /** 当前着色的图层 */
  active: 'a' | 'b';
  /** 已实际显示的立绘名，门控完成后才更新，空串表示还没有脸 */
  shownPose: string;
  /** 立绘挂载点宽高比，跟随当前立绘自然尺寸 */
  aspect: number;
  /** 本次落图是否跳过淡化，会话恢复的瞬切为 true */
  instant: boolean;
  /** 首张立绘都加载失败，没有任何脸可显示 */
  failed: boolean;
  /** 动作层，key 变化即重播，playing 随归位回调复位 */
  motion: { name: MotionName | null; key: number; playing: boolean };
  /** 气泡层，情绪气泡与思考气泡共用这一个槽，key 携带时间戳让动态图每次从头播 */
  bubble: { name: LayerBubbleName | null; shown: boolean; key: number };
}

/** 演出状态的初值，store 以它起步，引擎每次发布都产出新对象不改写它 */
export const INITIAL_STATE: PerformanceState = {
  layers: { a: '', b: '' },
  active: 'a',
  shownPose: '',
  aspect: FALLBACK_ASPECT,
  instant: true,
  failed: false,
  motion: { name: null, key: 0, playing: false },
  bubble: { name: null, shown: false, key: 0 },
};

/** 一张通过门控的图，地址与自然宽高比 */
interface LoadedImage {
  url: string;
  aspect: number;
}

/**
 * 陪伴演出状态机
 * 门控、token 竞态、回退 default、气泡定时器、生成相位与瞬切全部收在这里，
 * 状态经构造时注入的发布回调交出去，自身不依赖任何状态库
 */
export class PerformanceEngine<TTimer> {
  private state = INITIAL_STATE;
  /** 换脸请求的递增令牌，只认最后一次 */
  private token = 0;
  /** 气泡请求的递增序号，预解码期间到达的新请求作废旧的 */
  private bubbleSeq = 0;
  /** 气泡层在途的定时器，情绪气泡的两秒寿命或任一气泡的淡出 */
  private bubbleTimer: TTimer | null = null;
  private motionKey = 0;
  /** 当前生成相位，由舞台的桥接推进 */
  private phase: GeneratingPhase = 'idle';
  /** 思考气泡开关，引擎默认开启，由舞台的桥接注入 */
  private thinkingEnabled = true;

  constructor(
    private readonly deps: PerformanceDeps<TTimer>,
    private readonly emit: (state: PerformanceState) => void
  ) {}

  private publish(patch: Partial<PerformanceState>): void {
    this.state = { ...this.state, ...patch };
    this.emit(this.state);
  }

  /**
   * 一次 show_pose 的演出入口
   * 名单外的气泡名只落警告日志，立绘与动作照常，新客户端连旧服务端时由此挡住已摘除的思考气泡
   * 动作立即重播；立绘同名或缺省时脸保持不动只重播气泡，否则走就绪门控，气泡等换脸就绪同刻出现
   * @param params 立绘、动作与气泡三参数
   */
  perform({ pose, motion, bubble }: ShowPoseParams): void {
    const emotion = isBubbleName(bubble) ? bubble : undefined;
    if (bubble && !emotion) {
      this.deps.log.warn('bubble not in roster, dropped', { bubble });
    }
    this.deps.log.info('perform', { pose, motion, bubble: emotion });
    if (motion) this.fireMotion(motion);
    const faceKept = !pose || pose === this.state.shownPose;
    if (faceKept) {
      if (pose) {
        this.deps.log.info('same pose, face kept', { pose });
      }
      if (emotion) this.bubbleWhenReady(emotion);
      return;
    }
    this.launch(pose, emotion, false);
  }

  /**
   * 推进生成相位，舞台的桥接按当前会话的实时状态调用
   * 相位没变直接返回，变了落日志再裁定气泡层
   * @param phase 新相位
   */
  setPhase(phase: GeneratingPhase): void {
    if (phase === this.phase) return;
    const from = this.phase;
    this.phase = phase;
    this.deps.log.info('phase', { from, to: phase });
    this.settleBubble();
  }

  /**
   * 注入思考气泡开关，运行中拨动立即生效
   * 值没变直接返回，变了落日志再裁定气泡层
   * @param enabled 开关是否开启
   */
  setThinkingEnabled(enabled: boolean): void {
    if (enabled === this.thinkingEnabled) return;
    this.thinkingEnabled = enabled;
    this.deps.log.info('thinking bubble switch', { enabled });
    this.settleBubble();
  }

  /**
   * 会话恢复等场景的瞬切，跳过淡化直接落到另一层
   * 旧层的图留到新层接手，渲染层等新图加载完成才切换着色，进行中的门控请求一并作废
   * 气泡层只收情绪气泡与在途的气泡请求，思考气泡归相位管，瞬切不动它
   * @param pose 会话元数据记录的立绘名
   */
  restore(pose: string): void {
    this.bubbleSeq += 1;
    const keepThinking = this.state.bubble.name === THINKING_BUBBLE;
    if (!keepThinking) this.clearBubble();
    this.publish({
      motion: { name: null, key: this.state.motion.key, playing: false },
      bubble: keepThinking
        ? this.state.bubble
        : { ...this.state.bubble, shown: false },
    });
    this.deps.log.info('restore', { pose });
    this.launch(pose, undefined, true);
  }

  /** 动作播完归位时由渲染层回调，摘掉动作层状态 */
  motionEnded(): void {
    if (!this.state.motion.playing) return;
    this.publish({
      motion: { name: null, key: this.state.motion.key, playing: false },
    });
  }

  /** 发起一次门控流程，依赖实现里的意外异常收在引擎内只落日志，不外泄成未处理的拒绝 */
  private launch(
    pose: string,
    bubble: BubbleName | undefined,
    instant: boolean
  ): void {
    this.attempt(pose, bubble, instant).catch((error: unknown) => {
      this.deps.log.warn('attempt failed', { pose, error: String(error) });
    });
  }

  /**
   * 就绪门控的换脸主流程
   * 新立绘图先解码，气泡图并行预解码，两者都就绪且令牌未过期才落图
   * 非 default 的立绘取不到时回退 default 再试一次，回退也失败则旧图保持
   * @param pose 目标立绘名
   * @param bubble 随本次换脸同刻出现的气泡
   * @param instant 是否跳过淡化直接落图
   */
  private async attempt(
    pose: string,
    bubble: BubbleName | undefined,
    instant: boolean
  ): Promise<void> {
    const token = ++this.token;
    const bubbleReady = bubble
      ? this.deps.preloadBubble(bubble)
      : Promise.resolve();
    let target = pose;
    let loaded = await this.load(pose);
    if (!loaded && pose !== 'default') {
      this.deps.log.warn('pose unavailable, falling back', {
        pose,
      });
      target = 'default';
      loaded = await this.load('default');
    }
    await bubbleReady;
    if (token !== this.token) {
      this.deps.log.info('stale request dropped', { pose });
      return;
    }
    if (!loaded) {
      this.deps.log.warn('load failed, face kept', { pose });
      if (!this.state.shownPose) this.publish({ failed: true });
      return;
    }
    const active = this.state.active === 'a' ? 'b' : 'a';
    this.publish({
      layers: { ...this.state.layers, [active]: loaded.url },
      active,
      shownPose: target,
      aspect: loaded.aspect,
      instant,
      failed: false,
    });
    this.deps.log.info('face settled', {
      pose: target,
      fallback: target !== pose,
      instant,
    });
    if (bubble) this.bubbleOn(bubble);
  }

  /** 解析地址并过门控，任一环节失败返回 null */
  private async load(pose: string): Promise<LoadedImage | null> {
    const url = await this.deps.resolvePose(pose);
    if (!url) return null;
    try {
      const { width, height } = await this.deps.decodeImage(url);
      return {
        url,
        aspect: width > 0 && height > 0 ? width / height : this.state.aspect,
      };
    } catch {
      return null;
    }
  }

  private fireMotion(name: MotionName): void {
    this.motionKey += 1;
    this.publish({ motion: { name, key: this.motionKey, playing: true } });
    this.deps.log.info('motion fired', { motion: name });
  }

  /** 气泡预解码完成才出泡，等待期间来了新请求则让位 */
  private bubbleWhenReady(name: BubbleName): void {
    const seq = ++this.bubbleSeq;
    this.deps
      .preloadBubble(name)
      .then(() => {
        if (seq === this.bubbleSeq) this.bubbleOn(name);
      })
      .catch((error: unknown) => {
        this.deps.log.warn('bubble preload failed', {
          bubble: name,
          error: String(error),
        });
      });
  }

  /** 出情绪气泡：清旧定时器，换带时间戳的 key 让动态图从头播，两秒到点置假，思考气泡该在线才接淡出让它回场 */
  private bubbleOn(name: BubbleName): void {
    this.clearBubble();
    this.bubbleSeq += 1;
    this.publish({ bubble: { name, shown: true, key: this.deps.now() } });
    this.deps.log.info('bubble shown', { bubble: name });
    this.bubbleTimer = this.deps.setTimer(() => {
      this.bubbleTimer = null;
      this.publish({ bubble: { ...this.state.bubble, shown: false } });
      this.deps.log.info('bubble hidden', { bubble: name });
      if (this.thinkingOnline()) this.startBubbleFade();
    }, BUBBLE_VISIBLE_MS);
  }

  /** 起气泡的淡出定时器，走清掉句柄再裁定一次，思考气泡此时决定回场还是卸载 */
  private startBubbleFade(): void {
    this.bubbleTimer = this.deps.setTimer(() => {
      this.bubbleTimer = null;
      this.settleBubble();
    }, BUBBLE_FADE_MS);
  }

  /** 思考气泡是否该在线，开关开着且相位在思考或写作 */
  private thinkingOnline(): boolean {
    return (
      this.thinkingEnabled &&
      (this.phase === 'thinking' || this.phase === 'replying')
    );
  }

  /**
   * 气泡层的唯一裁定出口，相位变化、开关变化与淡出走完都走这里
   * 情绪气泡的两秒寿命或任一气泡的淡出还在途，层归在途的那个，到点再裁定
   * 思考气泡该在线就挂上，淡出途中相位或开关回来则原地重新置真不换节点
   * 不该在线就置假起淡出，淡出走完仍不在线就把槽清空，节点随之卸载
   */
  private settleBubble(): void {
    if (this.bubbleTimer !== null) return;
    const online = this.thinkingOnline();
    const current = this.state.bubble;
    if (current.name !== THINKING_BUBBLE) {
      if (online) {
        this.publish({
          bubble: { name: THINKING_BUBBLE, shown: true, key: this.deps.now() },
        });
        this.deps.log.info('thinking bubble shown', { phase: this.phase });
      }
      return;
    }
    if (online) {
      if (!current.shown) {
        this.publish({ bubble: { ...current, shown: true } });
        this.deps.log.info('thinking bubble reshown', { phase: this.phase });
      }
      return;
    }
    if (current.shown) {
      this.publish({ bubble: { ...current, shown: false } });
      this.deps.log.info('thinking bubble hidden');
      this.startBubbleFade();
      return;
    }
    this.publish({ bubble: { ...current, name: null } });
    this.deps.log.info('thinking bubble removed');
  }

  private clearBubble(): void {
    if (this.bubbleTimer === null) return;
    this.deps.clearTimer(this.bubbleTimer);
    this.bubbleTimer = null;
  }
}
