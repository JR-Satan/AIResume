/**
 * 3-5 模拟面试及职位推送组
 * 本文件负责实时语音方案中的麦克风音频采集、分块、重采样与语音活动检测。
 */

/**
 * 麦克风音频采集器
 *
 * 职责：
 * 1. getUserMedia 拿到麦克风流
 * 2. AudioContext 强制 16kHz 采样率
 * 3. ScriptProcessorNode（已废弃但兼容性好）抓 100ms 帧
 * 4. 转 base64 PCM16 后回调给上层
 * 5. 客户端 VAD：检测静音,触发 onSpeechStart / onSpeechEnd
 *
 * ⚠️ ScriptProcessorNode 已废弃，未来应改用 AudioWorklet。
 * 但 ScriptProcessorNode 在所有浏览器都能用，对测试够用。
 */

import { convertFloat32ArrayToPCM16Base64, resample } from './audioUtils';

const TARGET_SAMPLE_RATE = 16000;     // 智谱要求 16kHz
const CHUNK_MS = 100;                 // 100ms 一帧
const PROCESSOR_BUFFER_SIZE = 4096;   // 浏览器内部缓冲，~256ms @ 16kHz

// 客户端 VAD 参数
const SPEECH_RMS_THRESHOLD = 0.025;   // RMS 超过这个值算"在说话"（从 0.01 调高,过滤环境噪声）
const SILENCE_MS_TO_END = 1000;       // 静音多久触发 onSpeechEnd（之前 700ms 太短,容易把句中停顿当结束）
const PRE_ROLL_MS = 300;              // 说话开始前攒 300ms,避免"你好"被截成"好"
const MIN_SPEECH_MS = 300;            // 最短有效说话时长,短于此视为噪声(椅子响/键盘声)

export interface AudioCaptureHandlers {
  /** 每 ~100ms 触发一次，回调 base64 编码的 PCM16 */
  onAudioChunk: (base64: string) => void;
  /** 麦克风音量（RMS），可用于 UI 音量条 */
  onVolume?: (rms: number) => void;
  /** 客户端 VAD:检测到用户开始说话(从静音到有声) */
  onSpeechStart?: () => void;
  /** 客户端 VAD:检测到用户停止说话(连续静音超过阈值) */
  onSpeechEnd?: () => void;
  /** 设备/权限错误 */
  onError?: (error: Error) => void;
}

export class AudioCapture {
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private processorNode: ScriptProcessorNode | null = null;
  private handlers: AudioCaptureHandlers;
  private running = false;
  /** 累积器：攒够 CHUNK_MS 才发一次 */
  private buffer: Float32Array = new Float32Array(0);
  private samplesPerChunk: number;
  /** 客户端 VAD 状态 */
  private userIsSpeaking = false;
  /** 连续静音累计的采样数 */
  private silenceSampleCount = 0;
  /** 预卷缓冲：始终保留最近 300ms,说话开始时一起发出,避免丢字 */
  private preRollBuffer: Float32Array = new Float32Array(0);
  private maxPreRollSamples: number;
  /** warmup 缓冲：说话开始后的音频先暂存这里,等达到 MIN_SPEECH_MS 才允许发送 */
  private warmupBuffer: Float32Array = new Float32Array(0);
  /** 记录当前说话开始的时刻(performance.now 毫秒) */
  private speechStartedAt = 0;
  /** 统计：捕获的总帧数（onaudioprocess 触发次数） */
  private totalCapturedFrames = 0;
  /** 统计：实际发送出去的帧数 */
  private totalSentFrames = 0;

  constructor(handlers: AudioCaptureHandlers) {
    this.handlers = handlers;
    this.samplesPerChunk = (TARGET_SAMPLE_RATE * CHUNK_MS) / 1000;
    this.maxPreRollSamples = (TARGET_SAMPLE_RATE * PRE_ROLL_MS) / 1000;
  }

  async start(): Promise<void> {
    if (this.running) return;
    try {
      // 1. 申请麦克风
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: TARGET_SAMPLE_RATE,  // 浏览器能拿到 16k 就给 16k
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });

      // 2. 创建 AudioContext，强制 16kHz
      //    Chrome 会尊重，Safari 可能会给 44.1k，所以下面要做兜底重采样
      this.audioContext = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE });
      // Chrome 自动播放策略: AudioContext 默认是 suspended,
      // 必须显式 resume 才会真正开始处理音频
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }
      const actualSampleRate = this.audioContext.sampleRate;

      // 3. 创建源节点
      this.sourceNode = this.audioContext.createMediaStreamSource(this.stream);

      // 4. 创建处理节点（deprecated but works everywhere）
      this.processorNode = this.audioContext.createScriptProcessor(
        PROCESSOR_BUFFER_SIZE,
        1,  // 单声道输入
        1   // 单声道输出（不接 destination 就没事）
      );

      this.processorNode.onaudioprocess = (event) => {
        if (!this.running) return;
        const inputData = event.inputBuffer.getChannelData(0);
        this.handleAudioFrame(inputData, actualSampleRate);
      };

      // 5. 连线：source → processor
      //    ⚠️ ScriptProcessorNode 必须连到 destination 才能触发 onaudioprocess
      //    用 gainNode(0) 占位避免产生回声
      const silentGain = this.audioContext.createGain();
      silentGain.gain.value = 0;
      this.sourceNode.connect(this.processorNode);
      this.processorNode.connect(silentGain);
      silentGain.connect(this.audioContext.destination);

      this.running = true;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.handlers.onError?.(error);
      await this.cleanup();
      throw error;
    }
  }

  /**
   * 处理一帧音频：可能需要重采样 → 维护预卷 → 说话时才累加到主 buffer 并发送
   *                            → 同时做客户端 VAD 检测
   */
  private handleAudioFrame(inputData: Float32Array, actualSampleRate: number) {
    this.totalCapturedFrames++;

    // 1. 算 RMS 音量（无论采样率都基于原始数据）
    let sum = 0;
    for (let i = 0; i < inputData.length; i++) {
      sum += inputData[i] * inputData[i];
    }
    const rms = Math.sqrt(sum / inputData.length);
    this.handlers.onVolume?.(Math.min(1, rms * 4));  // 乘 4 增强可视化

    // 2. 客户端 VAD:检测静音/有声
    this.detectSpeech(rms, inputData.length, actualSampleRate);

    // 3. 重采样（如果需要）
    const samples = actualSampleRate === TARGET_SAMPLE_RATE
      ? inputData
      : resample(inputData, actualSampleRate, TARGET_SAMPLE_RATE);

    // 4. 维护预卷缓冲(始终保留最近 300ms,说话开始时一起发出)
    this.preRollBuffer = concatFloat32(this.preRollBuffer, samples);
    if (this.preRollBuffer.length > this.maxPreRollSamples) {
      // 截断到 maxPreRollSamples 大小
      this.preRollBuffer = this.preRollBuffer.subarray(
        this.preRollBuffer.length - this.maxPreRollSamples
      );
    }

    // 5. 语音门控:只有在"正在说话"时才把音频累加
    if (this.userIsSpeaking) {
      const speechDurationMs = performance.now() - this.speechStartedAt;

      if (speechDurationMs >= MIN_SPEECH_MS) {
        // 已过 warmup 期:把 warmup 合并到主 buffer,正常发
        if (this.warmupBuffer.length > 0) {
          this.buffer = concatFloat32(this.warmupBuffer, this.buffer);
          this.warmupBuffer = new Float32Array(0);
        }
        this.buffer = concatFloat32(this.buffer, samples);
        while (this.buffer.length >= this.samplesPerChunk) {
          const chunk = this.buffer.subarray(0, this.samplesPerChunk);
          this.buffer = this.buffer.subarray(this.samplesPerChunk);
          this.sendChunk(chunk);
        }
      } else {
        // warmup 期:暂存到 warmup buffer,不发送
        this.warmupBuffer = concatFloat32(this.warmupBuffer, samples);
      }
    }
  }

  /**
   * 客户端 VAD:基于 RMS 音量判断说话/静音
   * 关键:从静音 -> 有声时,把预卷缓冲放进 warmup(等达到 MIN_SPEECH_MS 才允许发送)
   *      如果说话太短(< 300ms),整个 warmup 直接丢弃,不发任何音频
   */
  private detectSpeech(rms: number, sampleCount: number, sampleRate: number) {
    const isSpeech = rms > SPEECH_RMS_THRESHOLD;

    if (isSpeech) {
      // 累积的静音清零
      this.silenceSampleCount = 0;
      // 从静音到有声 -> 触发 onSpeechStart(只触发一次)
      if (!this.userIsSpeaking) {
        this.userIsSpeaking = true;
        this.speechStartedAt = performance.now();
        // 把预卷缓冲(最近 300ms)放进 warmup,等达到 MIN_SPEECH_MS 才发
        this.warmupBuffer = concatFloat32(this.preRollBuffer, this.warmupBuffer);
        this.preRollBuffer = new Float32Array(0);
        this.handlers.onSpeechStart?.();
      }
    } else {
      if (this.userIsSpeaking) {
        // 累积静音采样数
        this.silenceSampleCount += sampleCount;
        const silenceMs = (this.silenceSampleCount / sampleRate) * 1000;
        if (silenceMs >= SILENCE_MS_TO_END) {
          const totalSpeechMs = performance.now() - this.speechStartedAt;
          this.userIsSpeaking = false;
          this.silenceSampleCount = 0;

          if (totalSpeechMs >= MIN_SPEECH_MS) {
            // 真说话:触发 onSpeechEnd
            this.handlers.onSpeechEnd?.();
          } else {
            // 短于 300ms:视为噪声,丢弃所有缓冲
            this.warmupBuffer = new Float32Array(0);
            this.buffer = new Float32Array(0);
          }
        }
      }
    }
  }

  private sendChunk(chunk: Float32Array) {
    // Float32 → Int16 PCM → base64
    const base64 = convertFloat32ArrayToPCM16Base64(chunk);
    this.totalSentFrames++;
    this.handlers.onAudioChunk(base64);
  }

  async stop(): Promise<void> {
    this.running = false;
    // 手动关麦语义:用户已经明确"说完了",需要把 warmup 强制 flush
    // 并触发 onSpeechEnd,让上层发 commit + response.create
    // (否则 VAD 不会触发,AI 会一直等)
    if (this.userIsSpeaking) {
      this.userIsSpeaking = false;
      this.silenceSampleCount = 0;
      // 强制把 warmup 移进 buffer(绕过 MIN_SPEECH_MS 检查,因为手动关麦 = 用户意图明确)
      if (this.warmupBuffer.length > 0) {
        this.buffer = concatFloat32(this.warmupBuffer, this.buffer);
        this.warmupBuffer = new Float32Array(0);
      }
      this.handlers.onSpeechEnd?.();
    }
    await this.cleanup();
  }

  private async cleanup() {
    try {
      this.processorNode?.disconnect();
      this.sourceNode?.disconnect();
      if (this.audioContext && this.audioContext.state !== 'closed') {
        await this.audioContext.close();
      }
    } catch {
      // 忽略 cleanup 错误
    }
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
    }
    this.stream = null;
    this.audioContext = null;
    this.sourceNode = null;
    this.processorNode = null;
    this.buffer = new Float32Array(0);
    this.preRollBuffer = new Float32Array(0);
    this.warmupBuffer = new Float32Array(0);
    this.userIsSpeaking = false;
    this.silenceSampleCount = 0;
    this.totalCapturedFrames = 0;
    this.totalSentFrames = 0;
  }

  get isRunning(): boolean {
    return this.running;
  }

  /** 捕获的音频帧总数(onaudioprocess 触发次数,用于统计) */
  get capturedFrames(): number {
    return this.totalCapturedFrames;
  }

  /** 实际发出去的音频帧数(100ms 一帧,用于统计"省了多少") */
  get sentFrames(): number {
    return this.totalSentFrames;
  }
}

function concatFloat32(a: Float32Array, b: Float32Array): Float32Array {
  const out = new Float32Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}
