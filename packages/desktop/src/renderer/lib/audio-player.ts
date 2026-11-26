/**
 * @file lib/audio-player.ts
 * @description 替换式音频播放器，新音频到来时停掉当前播放并立即播放新的
 */

/** 播放器生命周期回调，语音模块用它驱动动画段切换与播放失败提示 */
export interface AudioPlayerCallbacks {
  onStart?: () => void;
  onEnd?: () => void;
  onError?: () => void;
}

class AudioPlayer {
  private currentAudio: HTMLAudioElement | null = null;
  private currentObjectUrl: string | null = null;
  private callbacks: AudioPlayerCallbacks = {};
  /** 当前这段音频的结束通知，stop 停掉它时兑现还在等待的调用方 */
  private finishCurrent: (() => void) | null = null;

  /**
   * 注册生命周期回调，整体替换。
   */
  setPlaybackCallbacks(callbacks: AudioPlayerCallbacks): void {
    this.callbacks = callbacks;
  }

  /**
   * 播放音频，自动停掉当前正在播放的音频
   * @param audio - MP3 格式的音频数据
   * @returns 这段音频播完、播放失败或被替换时兑现，试听用它把播放状态对齐到真实播放
   */
  play(audio: ArrayBuffer): Promise<void> {
    this.stop();

    const blob = new Blob([audio], { type: 'audio/mp3' });
    this.currentObjectUrl = URL.createObjectURL(blob);
    this.currentAudio = new Audio(this.currentObjectUrl);
    let finish: () => void = () => {};
    const playback = new Promise<void>((resolve) => {
      finish = resolve;
    });
    this.finishCurrent = finish;

    this.currentAudio.onended = () => {
      this.releaseUrl();
      this.callbacks.onEnd?.();
      finish();
    };

    this.currentAudio.onerror = () => {
      this.releaseUrl();
      this.callbacks.onError?.();
      finish();
    };

    this.currentAudio
      .play()
      .then(() => this.callbacks.onStart?.())
      .catch(() => {
        this.callbacks.onError?.();
        finish();
      });

    return playback;
  }

  /** 停止当前播放并释放资源，等待播放结束的调用方随之结束等待 */
  stop(): void {
    if (this.currentAudio) {
      this.currentAudio.onended = null;
      this.currentAudio.onerror = null;
      this.currentAudio.pause();
      this.currentAudio.src = '';
      this.currentAudio = null;
    }
    this.releaseUrl();
    this.finishCurrent?.();
    this.finishCurrent = null;
  }

  private releaseUrl(): void {
    if (this.currentObjectUrl) {
      URL.revokeObjectURL(this.currentObjectUrl);
      this.currentObjectUrl = null;
    }
  }
}

export const audioPlayer = new AudioPlayer();
