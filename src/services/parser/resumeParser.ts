import type { FieldMeta, ParseOptions, ParseResult } from '../../types/resumeImport';
import { useSettingsStore } from '../../store/useSettingsStore';
import { callLlmForJson } from './llmClient';
import { buildParseUserPrompt, RESUME_PARSE_SYSTEM_PROMPT } from './promptBuilder';
import {
  buildFieldMeta,
  extractJsonFromResponse,
  normalizeFieldMeta,
  normalizeParsedResume,
} from './schemaValidator';

export async function parseResumeText(
  rawText: string,
  options?: ParseOptions
): Promise<ParseResult> {
  if (!rawText.trim()) {
    return { success: false, rawText, error: 'E003' };
  }

  options?.onProgress?.('parsing');

  const settingsStore = useSettingsStore();
  const llmResult = await callLlmForJson({
    systemPrompt: RESUME_PARSE_SYSTEM_PROMPT,
    userPrompt: buildParseUserPrompt(rawText),
    model: settingsStore.modelName,
    temperature: 0.1,
  });

  if (!llmResult.success || !llmResult.rawResponse) {
    return {
      success: false,
      rawText,
      error: llmResult.error === 'E004'
        ? 'E004'
        : llmResult.error ?? 'E005',
    };
  }

  options?.onProgress?.('validating');

  try {
    const parsed = extractJsonFromResponse(llmResult.rawResponse) as Record<string, unknown>;
    const llmMeta = Array.isArray(parsed._meta)
      ? (parsed._meta.map(normalizeFieldMeta).filter(Boolean) as FieldMeta[])
      : [];
    delete parsed._meta;

    const data = normalizeParsedResume(parsed);
    const fieldMeta = buildFieldMeta(data, llmMeta);

    return { success: true, data, fieldMeta, rawText };
  } catch (err) {
    console.error('Parse validation failed:', err);
    return {
      success: false,
      rawText,
      error: 'E005',
    };
  }
}

export type { ParseOptions, ParseResult };
