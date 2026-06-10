import { useSettingsStore } from '../../store/useSettingsStore';
import { validateImportFile } from '../../utils/fileValidator';
import type { OcrOptions, OcrResult } from '../../types/resumeImport';
import { extractTextFromPdf, renderPdfPagesToImages } from './extractTextFromPdf';
import { extractTextFromImage, extractTextFromImages } from './extractTextFromImage';
import { extractTextFromImageVision, extractTextFromImagesVision } from './visionOcr';

function shouldUseVisionOcr(): boolean {
  const settings = useSettingsStore();
  return settings.ocrEngine === 'vision' && !!settings.aliApiKey?.trim();
}

async function ocrImages(images: Blob[], options?: OcrOptions): Promise<{ text: string; method: 'tesseract' | 'vision-api' }> {
  if (shouldUseVisionOcr()) {
    const text = await extractTextFromImagesVision(images, options);
    if (text) return { text, method: 'vision-api' };
    console.warn('Vision OCR failed, falling back to Tesseract');
  }
  const text = await extractTextFromImages(images, options);
  return { text, method: 'tesseract' };
}

async function ocrImage(file: File, options?: OcrOptions): Promise<{ text: string; method: 'tesseract' | 'vision-api' }> {
  if (shouldUseVisionOcr()) {
    const text = await extractTextFromImageVision(file, options);
    if (text) return { text, method: 'vision-api' };
    console.warn('Vision OCR failed, falling back to Tesseract');
  }
  const text = await extractTextFromImage(file, options);
  return { text, method: 'tesseract' };
}

function isPdf(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

function isImage(file: File): boolean {
  return file.type.startsWith('image/') || /\.(jpe?g|png)$/i.test(file.name);
}

export async function extractResumeText(
  file: File,
  options?: OcrOptions
): Promise<OcrResult> {
  const validation = validateImportFile(file);
  if (!validation.valid) {
    return { success: false, rawText: '', method: 'tesseract', error: validation.message };
  }

  try {
    if (isPdf(file)) {
      const { text, pageCount, needsOcr } = await extractTextFromPdf(file, options);
      if (!needsOcr && text.length > 0) {
        return { success: true, rawText: text, pageCount, method: 'pdf-text' };
      }
      const images = await renderPdfPagesToImages(file, options);
      const { text: ocrText, method } = await ocrImages(images, options);
      if (!ocrText) {
        return { success: false, rawText: text, pageCount, method, error: 'E003' };
      }
      return { success: true, rawText: ocrText || text, pageCount, method };
    }

    if (isImage(file)) {
      const { text: rawText, method } = await ocrImage(file, options);
      if (!rawText) {
        return { success: false, rawText: '', method, error: 'E003' };
      }
      return { success: true, rawText, pageCount: 1, method };
    }

    return { success: false, rawText: '', method: 'tesseract', error: 'E001' };
  } catch (err) {
    console.error('OCR failed:', err);
    return {
      success: false,
      rawText: '',
      method: 'tesseract',
      error: err instanceof Error ? err.message : 'OCR 识别失败',
    };
  }
}

export type { OcrOptions, OcrResult };
