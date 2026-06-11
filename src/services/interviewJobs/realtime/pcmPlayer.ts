/**
 * 3-5 模拟面试及职位推送组
 * 本文件负责实时语音面试中模型返回 PCM 音频的连续播放与中断控制。
 */

/**
 * PCM 流式播放器
 *
 * 职责：把服务端分片推回来的 24kHz Int16 PCM 一段段拼起来无 gap 播放
 *
 * 实现思路（最简单的"buffer-source-per-chunk"模式）：
 * - 维护 nextPlayTime 时刻
 * - 每个 chunk 创建一个 AudioBufferSourceNode
 * - 在 max(now, nextPlayTime) 时刻播放
 * - 播放完 nextPlayTime 自然向后推进
 *
 * 缺点：每段之间有微小间隙（理论上一个采样周期）。
 * 优点：实现简单，兼容性好。
 *
 * 未来如果出现"听起来卡顿"，可换成 scheduler 队列 + 单个 source 模式。
 */

import { convertPCM16Base64ToFloat32Array } from './audioUtils';

const OUTPUT_SAMPLE_RATE = 24000;  // 智谱固定输出 24kHz

export class PcmPlayer {
  private ctx: AudioContext | null = null;
  private nextPlayTime = 0;
  private gainNode: GainNode | null = null;
  private playing = false;
  /** 已排队但还没播放完的 source 数量（用于打断时清空） */
  private activeSources = new Set<AudioBufferSourceNode>();

  init() {
    if (this.ctx) return;
    // iOS Safari 需要用户交互后才能创建 AudioContext
    this.ctx = new AudioContext({ sampleRate: OUTPUT_SAMPLE_RATE });
    this.gainNode = this.ctx.createGain();
    this.gainNode.gain.value = 1.0;
    this.gainNode.connect(this.ctx.destination);
    this.nextPlayTime = this.ctx.currentTime;
    this.playing = true;
  }

  /**
   * 追加一段 base64 PCM16 数据，立即排队播放
   */
  append(base64: string) {
    if (!this.ctx || !this.gainNode) {
      this.init();
    }
    if (!this.ctx || !this.gainNode) return;

    // Safari 等需要 resume
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => { /* ignore */ });
    }

    const float32 = convertPCM16Base64ToFloat32Array(base64);
    const buffer = this.ctx.createBuffer(1, float32.length, OUTPUT_SAMPLE_RATE);
    buffer.copyToChannel(float32, 0);

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.gainNode);

    // 关键：保证每段之间无缝衔接
    const now = this.ctx.currentTime;
    const startTime = Math.max(now, this.nextPlayTime);
    source.start(startTime);
    this.nextPlayTime = startTime + buffer.duration;

    // 播放完清理引用
    source.onended = () => {
      this.activeSources.delete(source);
    };
    this.activeSources.add(source);
  }

  /**
   * 打断当前正在播放的所有音频（用户开始说话时调用）
   */
  interrupt() {
    if (!this.ctx) return;
    for (const source of this.activeSources) {
      try {
        source.stop();
      } catch {
        // 忽略已经 stop 的
      }
    }
    this.activeSources.clear();
    this.nextPlayTime = this.ctx.currentTime;
  }

  /**
   * 重置（保留 AudioContext，只重置时间游标）
   */
  reset() {
    this.interrupt();
  }

  /**
   * 销毁（关闭 AudioContext，不可恢复）
   */
  async destroy() {
    this.playing = false;
    this.interrupt();
    if (this.ctx) {
      try {
        await this.ctx.close();
      } catch {
        // ignore
      }
    }
    this.ctx = null;
    this.gainNode = null;
    this.nextPlayTime = 0;
  }

  get isPlaying(): boolean {
    return this.playing && this.activeSources.size > 0;
  }
}
