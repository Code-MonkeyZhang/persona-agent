/**
 * @file lib/audio-player.ts
 * @description 替换式音频播放器，新音频到来时停掉当前播放并立即播放新的
 */

class AudioPlayer {
  private currentAudio: HTMLAudioElement | null = null;
  private currentObjectUrl: string | null = null;

  /**
   * 播放音频，自动停掉当前正在播放的音频
   * @param audio - MP3 格式的音频数据
   */
  play(audio: ArrayBuffer): void {
    this.stop();

    const blob = new Blob([audio], { type: 'audio/mp3' });
    this.currentObjectUrl = URL.createObjectURL(blob);
    this.currentAudio = new Audio(this.currentObjectUrl);

    this.currentAudio.onended = () => {
      this.releaseUrl();
    };

    this.currentAudio.onerror = () => {
      this.releaseUrl();
    };

    void this.currentAudio.play();
  }

  /** 停止当前播放并释放资源 */
  stop(): void {
    if (this.currentAudio) {
      this.currentAudio.onended = null;
      this.currentAudio.onerror = null;
      this.currentAudio.pause();
      this.currentAudio.src = '';
      this.currentAudio = null;
    }
    this.releaseUrl();
  }

  private releaseUrl(): void {
    if (this.currentObjectUrl) {
      URL.revokeObjectURL(this.currentObjectUrl);
      this.currentObjectUrl = null;
    }
  }
}

export const audioPlayer = new AudioPlayer();
