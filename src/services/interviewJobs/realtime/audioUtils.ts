/**
 * 3-5 模拟面试及职位推送组
 * 本文件提供实时语音音频的采样率转换、PCM 编解码和 WAV 封装工具。
 */

/**
 * 音频工具：采样率转换 + base64 编解码
 *
 * 这些是从智谱官方 SDK（MetaGLM/glm-realtime-sdk）的 chatHelper.ts 翻译过来的，
 * 剥掉了 React/Pica 等依赖，只保留纯函数。
 */

/**
 * Float32Array → 16-bit PCM → base64 字符串
 * 用于把浏览器采集的音频上传给智谱服务端
 */
export function convertFloat32ArrayToPCM16Base64(float32Array: Float32Array): string {
  const arrayBuffer = new ArrayBuffer(float32Array.length * 2);
  const dataView = new DataView(arrayBuffer);
  for (let i = 0; i < float32Array.length; i++) {
    const sample = Math.max(-1, Math.min(1, float32Array[i]));
    const int16Sample = Math.round(sample * 32767);
    dataView.setInt16(i * 2, int16Sample, true);
  }
  return arrayBufferToBase64(arrayBuffer);
}

/**
 * base64 PCM (16-bit) → Float32Array
 * 用于播放服务端返回的音频 delta
 */
export function convertPCM16Base64ToFloat32Array(base64: string): Float32Array {
  const arrayBuffer = base64ToArrayBuffer(base64);
  const dataView = new DataView(arrayBuffer);
  const numSamples = dataView.byteLength / 2;
  const float32Array = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const int16Sample = dataView.getInt16(i * 2, true);
    float32Array[i] = int16Sample / 32768;
  }
  return float32Array;
}

/**
 * 通用 base64 编码
 */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  // 每 0x8000 字符截断一次防止 call stack 溢出
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + 0x8000))
    );
  }
  return window.btoa(binary);
}

/**
 * 通用 base64 解码
 */
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * 重采样：任意采样率 → 目标采样率（线性插值）
 * 用于把浏览器默认 48kHz / 44.1kHz 转成智谱要的 16kHz
 */
export function resample(
  input: Float32Array,
  inputSampleRate: number,
  outputSampleRate: number
): Float32Array {
  if (inputSampleRate === outputSampleRate) return input;
  const ratio = inputSampleRate / outputSampleRate;
  const outputLength = Math.floor(input.length / ratio);
  const output = new Float32Array(outputLength);
  for (let i = 0; i < outputLength; i++) {
    const sourceIndex = i * ratio;
    const intIndex = Math.floor(sourceIndex);
    const frac = sourceIndex - intIndex;
    const a = input[intIndex] ?? 0;
    const b = input[intIndex + 1] ?? 0;
    output[i] = a * (1 - frac) + b * frac;
  }
  return output;
}

/**
 * 把大块音频按目标采样数切成小段
 * 例如：把 1024 个 16kHz 样本按 1600 个一段切（每段 100ms）
 */
export function chunkAudio(
  samples: Float32Array,
  samplesPerChunk: number
): Float32Array[] {
  const chunks: Float32Array[] = [];
  for (let offset = 0; offset < samples.length; offset += samplesPerChunk) {
    const end = Math.min(offset + samplesPerChunk, samples.length);
    chunks.push(samples.subarray(offset, end));
  }
  return chunks;
}

/**
 * 把 Float32Array 包成带 44 字节 WAV 头的 ArrayBuffer
 * 智谱服务端在 pcm16 直传不稳定时,改用 wav 更可靠
 *
 * 来源:智谱官方 SDK (MetaGLM/glm-realtime-sdk) 的 chatHelper.ts createWavFile
 */
export function createWavBuffer(audioData: Float32Array, sampleRate: number): ArrayBuffer {
  const numOfChannels = 1;
  const bitDepth = 16;
  const byteRate = (sampleRate * numOfChannels * bitDepth) / 8;
  const blockAlign = (numOfChannels * bitDepth) / 8;
  const wavHeaderSize = 44;

  const wavBuffer = new ArrayBuffer(wavHeaderSize + audioData.length * 2);
  const view = new DataView(wavBuffer);

  // RIFF chunk descriptor
  writeUTFBytes(view, 0, 'RIFF');
  view.setUint32(4, 36 + audioData.length * 2, true);
  writeUTFBytes(view, 8, 'WAVE');
  // fmt sub-chunk
  writeUTFBytes(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);                  // PCM
  view.setUint16(22, numOfChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  // data sub-chunk
  writeUTFBytes(view, 36, 'data');
  view.setUint32(40, audioData.length * 2, true);

  // PCM 数据
  for (let i = 0; i < audioData.length; i++) {
    const s = Math.max(-1, Math.min(1, audioData[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return wavBuffer;
}

function writeUTFBytes(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}
