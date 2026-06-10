import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { OcrOptions } from '../../types/resumeImport';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

const MIN_TEXT_LENGTH = 50;

export async function extractTextFromPdf(
  file: File,
  options?: OcrOptions
): Promise<{ text: string; pageCount: number; needsOcr: boolean }> {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const pageCount = pdf.numPages;
  const parts: string[] = [];

  for (let i = 1; i <= pageCount; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map(item => ('str' in item ? item.str : ''))
      .join(' ')
      .trim();
    if (pageText) parts.push(pageText);
    options?.onProgress?.(Math.round((i / pageCount) * 50));
  }

  const text = parts.join('\n\n').trim();
  return {
    text,
    pageCount,
    needsOcr: text.length < MIN_TEXT_LENGTH,
  };
}

export async function renderPdfPagesToImages(
  file: File,
  options?: OcrOptions
): Promise<Blob[]> {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const blobs: Blob[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const context = canvas.getContext('2d');
    if (!context) continue;

    await page.render({ canvasContext: context, viewport }).promise;
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
    if (blob) blobs.push(blob);
    options?.onProgress?.(50 + Math.round((i / pdf.numPages) * 50));
  }

  return blobs;
}

export { MIN_TEXT_LENGTH };
