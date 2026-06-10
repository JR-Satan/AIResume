import { useSettingsStore } from '../../store/useSettingsStore';
import type { OcrOptions } from '../../types/resumeImport';

const VISION_OCR_PROMPT = `你是一个专业的 OCR 助手。请完整、准确地识别图片中的全部文字内容。

要求：
1. 只输出识别到的纯文本，不要添加任何解释、markdown 代码块或 JSON
2. 尽量保持原文的换行和段落结构
3. 对于表格或分栏排版，按从上到下、从左到右的阅读顺序输出
4. 无法辨认的字用 [?] 标注，不要猜测或编造内容`;

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('图片读取失败'));
    reader.readAsDataURL(blob);
  });
}

/** 压缩过大图片，降低视觉模型请求体积 */
async function normalizeImageBlob(source: File | Blob): Promise<Blob> {
  if (typeof createImageBitmap !== 'function') {
    return source instanceof File ? source : source;
  }

  const blob = source instanceof File ? source : source;
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(blob);
    const maxEdge = 2048;
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return blob;

    ctx.drawImage(bitmap, 0, 0, width, height);
    const png = await new Promise<Blob | null>(resolve =>
      canvas.toBlob(resolve, 'image/jpeg', 0.92)
    );
    return png ?? blob;
  } catch {
    return blob;
  } finally {
    bitmap?.close();
  }
}

async function callVisionOcr(imageBlob: Blob): Promise<string | null> {
  const settingsStore = useSettingsStore();
  const apiKey = settingsStore.aliApiKey?.trim();
  const apiUrl = settingsStore.aliApiUrl?.trim();
  const model = settingsStore.visionModelName?.trim() || 'qwen-vl-max';

  if (!apiKey || !apiUrl) return null;

  const dataUrl = await blobToDataUrl(imageBlob);

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        stream: false,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: VISION_OCR_PROMPT },
              { type: 'image_url', image_url: { url: dataUrl } },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      console.error('Vision OCR failed:', response.status, await response.text());
      return null;
    }

    const json = await response.json();
    const content: string | undefined = json?.choices?.[0]?.message?.content;
    return content?.trim() ?? '';
  } catch (err) {
    console.error('Vision OCR request failed:', err);
    return null;
  }
}

export async function extractTextFromImageVision(
  source: File | Blob,
  options?: OcrOptions
): Promise<string> {
  options?.onProgress?.(10);
  const image = await normalizeImageBlob(source);
  options?.onProgress?.(30);
  const text = await callVisionOcr(image);
  options?.onProgress?.(100);
  return text ?? '';
}

export async function extractTextFromImagesVision(
  images: Blob[],
  options?: OcrOptions
): Promise<string> {
  if (images.length === 0) return '';

  const parts: string[] = [];
  for (let i = 0; i < images.length; i++) {
    const image = await normalizeImageBlob(images[i]);
    const pageProgress = (p: number) => {
      const overall = Math.round(((i + p / 100) / images.length) * 100);
      options?.onProgress?.(Math.min(99, overall));
    };
    pageProgress(20);
    const text = await callVisionOcr(image);
    pageProgress(100);
    if (text) parts.push(text);
  }

  options?.onProgress?.(100);
  return parts.join('\n\n').trim();
}
