export interface FileValidationResult {
  valid: boolean;
  error?: 'INVALID_TYPE' | 'FILE_TOO_LARGE' | 'EMPTY_FILE';
  message?: string;
}

export const IMPORT_FILE_CONSTRAINTS = {
  allowedTypes: ['image/jpeg', 'image/png', 'application/pdf'] as const,
  allowedExtensions: ['.jpg', '.jpeg', '.png', '.pdf'] as const,
  maxSizeBytes: 10 * 1024 * 1024,
  maxBatchCount: 5,
} as const;

const EXTENSION_TYPE_MAP: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.pdf': 'application/pdf',
};

function resolveMimeType(file: File): string {
  if (file.type && IMPORT_FILE_CONSTRAINTS.allowedTypes.includes(file.type as typeof IMPORT_FILE_CONSTRAINTS.allowedTypes[number])) {
    return file.type;
  }
  const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
  return EXTENSION_TYPE_MAP[ext] ?? file.type;
}

export function validateImportFile(file: File): FileValidationResult {
  if (!file || file.size === 0) {
    return { valid: false, error: 'EMPTY_FILE', message: '文件为空，请重新选择' };
  }

  if (file.size > IMPORT_FILE_CONSTRAINTS.maxSizeBytes) {
    return { valid: false, error: 'FILE_TOO_LARGE', message: '文件超过 10MB 限制' };
  }

  const mime = resolveMimeType(file);
  const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
  const typeValid = IMPORT_FILE_CONSTRAINTS.allowedTypes.includes(mime as typeof IMPORT_FILE_CONSTRAINTS.allowedTypes[number]);
  const extValid = IMPORT_FILE_CONSTRAINTS.allowedExtensions.includes(ext as typeof IMPORT_FILE_CONSTRAINTS.allowedExtensions[number]);

  if (!typeValid && !extValid) {
    return { valid: false, error: 'INVALID_TYPE', message: '文件格式不支持，请上传 JPG、PNG 或 PDF' };
  }

  return { valid: true };
}

export function validateBatchFiles(files: File[]): FileValidationResult {
  if (files.length === 0) {
    return { valid: false, error: 'EMPTY_FILE', message: '请选择至少一个文件' };
  }
  if (files.length > IMPORT_FILE_CONSTRAINTS.maxBatchCount) {
    return { valid: false, error: 'INVALID_TYPE', message: `单次最多上传 ${IMPORT_FILE_CONSTRAINTS.maxBatchCount} 个文件` };
  }
  for (const file of files) {
    const result = validateImportFile(file);
    if (!result.valid) return result;
  }
  return { valid: true };
}
