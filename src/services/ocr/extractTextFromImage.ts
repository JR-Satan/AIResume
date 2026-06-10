import { createWorker, type Worker } from 'tesseract.js';
import type { OcrOptions } from '../../types/resumeImport';

/** Vite 打包后 worker 路径易失效，显式使用 CDN 与 PDF OCR 路径保持一致 */
const TESSERACT_OPTS = {
  workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js',
  corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1',
} as const;

const STATUS_PROGRESS_BASE: Record<string, number> = {
  'loading tesseract core': 0,
  'initializing tesseract': 12,
  'loading language traineddata': 22,
  'initializing api': 55,
  'recognizing text': 68,
};

type TesseractLoggerMessage = {
  status: string;
  progress?: number;
};

function loggerToPercent(message: TesseractLoggerMessage): number {
  const base = STATUS_PROGRESS_BASE[message.status];
  if (base === undefined) return 0;
  const p = typeof message.progress === 'number' ? message.progress : 0;
  if (message.status === 'recognizing text') {
    return Math.min(99, base + Math.round(p * 31));
  }
  const nextBase =
    message.status === 'loading tesseract core'
      ? 12
      : message.status === 'initializing tesseract'
        ? 22
        : message.status === 'loading language traineddata'
          ? 55
          : 68;
  return Math.min(67, base + Math.round(p * (nextBase - base)));
}

/** 将上传文件规范为 PNG Blob，与 PDF 页渲染输出一致，避免 File/MIME 导致 recognize 挂起 */
async function toRecognizableBlob(source: File | Blob): Promise<Blob> {
  const blob = source instanceof File ? source : source;
  if (typeof createImageBitmap !== 'function') {
    return blob;
  }

  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return blob;
    ctx.drawImage(bitmap, 0, 0);
    const png = await new Promise<Blob | null>(resolve =>
      canvas.toBlob(resolve, 'image/png')
    );
    return png ?? blob;
  } catch {
    return blob;
  } finally {
    bitmap?.close();
  }
}

async function createOcrWorker(
  options: OcrOptions | undefined,
  onLoggerProgress: (percent: number) => void
): Promise<Worker> {
  return createWorker(options?.language ?? 'chi_sim+eng', 1, {
    ...TESSERACT_OPTS,
    logger: message => {
      onLoggerProgress(loggerToPercent(message));
    },
  });
}

export async function extractTextFromImage(
  source: File | Blob,
  options?: OcrOptions
): Promise<string> {
  const worker = await createOcrWorker(options, percent => {
    options?.onProgress?.(percent);
  });

  try {
    const image = await toRecognizableBlob(source);
    const result = await worker.recognize(image);
    options?.onProgress?.(100);
    return result.data.text.trim();
  } finally {
    await worker.terminate();
  }
}

export async function extractTextFromImages(
  images: Blob[],
  options?: OcrOptions
): Promise<string> {
  if (images.length === 0) return '';

  const scale = { index: 0, total: images.length };
  const worker = await createOcrWorker(options, percent => {
    if (scale.total <= 1) {
      options?.onProgress?.(percent);
      return;
    }
    const overall = Math.round(((scale.index + percent / 100) / scale.total) * 100);
    options?.onProgress?.(Math.min(99, overall));
  });

  const parts: string[] = [];
  try {
    for (let i = 0; i < images.length; i++) {
      scale.index = i;
      const image = await toRecognizableBlob(images[i]);
      const result = await worker.recognize(image);
      const text = result.data.text.trim();
      if (text) parts.push(text);
    }
    options?.onProgress?.(100);
    return parts.join('\n\n').trim();
  } finally {
    await worker.terminate();
  }
}
