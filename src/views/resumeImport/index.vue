<template>
  <div class="import-page">
    <div class="import-header">
      <h2>智能简历导入</h2>
      <p>上传 JPG、PNG 或 PDF 简历，自动识别并填充至编辑器</p>
    </div>

    <a-steps :current="stepIndex" size="small" class="import-steps">
      <a-step title="上传文件" />
      <a-step title="识别解析" />
      <a-step title="预览修正" />
      <a-step title="导入完成" />
    </a-steps>

    <!-- 上传阶段 -->
    <div v-if="step === 'upload'" class="step-panel">
      <a-tabs v-model:activeKey="uploadMode">
        <a-tab-pane key="single" tab="单文件导入">
          <FileUploader @select="onFilesSelected" />
        </a-tab-pane>
        <a-tab-pane key="batch" tab="批量导入（最多5份）">
          <FileUploader multiple :max-count="5" @select="onBatchSelected" />
        </a-tab-pane>
      </a-tabs>

      <div v-if="selectedFiles.length" class="action-bar">
        <a-button type="primary" size="large" @click="startProcess">
          开始识别
        </a-button>
      </div>
    </div>

    <!-- 处理阶段 -->
    <div v-else-if="step === 'processing'" class="step-panel">
      <OcrProgress
        :stage="processingStage"
        :percent="progressPercent"
        :file-name="currentFileName"
      />
    </div>

    <!-- 预览阶段 -->
    <div v-else-if="step === 'preview'" class="step-panel preview-step">
      <div v-if="uploadMode === 'batch'" class="batch-sidebar">
        <BatchImportList
          :items="batchItems"
          :active-id="activeBatchId"
          @select="switchBatchItem"
        />
      </div>

      <div class="preview-main">
        <ParsePreview
          v-if="editableParsed"
          ref="parsePreviewRef"
          v-model="editableParsed"
          :raw-text="currentRawText"
          :field-meta="currentFieldMeta"
        />

        <div class="preview-actions">
          <a-radio-group v-model:value="importMode" button-style="solid">
            <a-radio-button value="replace">覆盖当前简历</a-radio-button>
            <a-radio-button value="merge">合并到当前简历</a-radio-button>
          </a-radio-group>

          <a-space>
            <a-button @click="cancelImport">取消</a-button>
            <a-button
              v-if="uploadMode === 'batch' && hasNextBatch"
              @click="confirmAndNext"
            >
              确认并处理下一份
            </a-button>
            <a-button type="primary" @click="confirmImport">
              {{ uploadMode === 'batch' && hasNextBatch ? '确认并继续' : '确认导入' }}
            </a-button>
          </a-space>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { message } from 'ant-design-vue';
import FileUploader from './components/FileUploader.vue';
import OcrProgress from './components/OcrProgress.vue';
import ParsePreview from './components/ParsePreview.vue';
import BatchImportList from './components/BatchImportList.vue';
import { extractResumeText } from '../../services/ocr';
import { parseResumeText } from '../../services/parser/resumeParser';
import { createEmptyParsedResume } from '../../services/parser/schemaValidator';
import { resetPreviewIdSequence, stripPreviewIds } from '../../utils/fieldPath';
import type { ItemWithPreviewId } from '../../utils/fieldPath';
import { useResumeStore } from '../../store/useResumeStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useResumeImportBus } from '../../composables/useResumeImportBus';
import type {
  BatchImportItem,
  FieldMeta,
  ParsedResumePayload,
} from '../../types/resumeImport';

type Step = 'upload' | 'processing' | 'preview';

const router = useRouter();
const resumeStore = useResumeStore();
const settingsStore = useSettingsStore();
const importBus = useResumeImportBus();

const step = ref<Step>('upload');
const uploadMode = ref<'single' | 'batch'>('single');
const selectedFiles = ref<File[]>([]);
const batchItems = ref<BatchImportItem[]>([]);
const activeBatchId = ref<string>('');

const processingStage = ref<'ocr' | 'parsing'>('ocr');
const progressPercent = ref(0);
const currentFileName = ref('');

const editableParsed = ref<ParsedResumePayload | null>(null);
const currentRawText = ref('');
const currentFieldMeta = ref<FieldMeta[]>([]);
const importMode = ref<'replace' | 'merge'>('replace');
const parsePreviewRef = ref<InstanceType<typeof ParsePreview> | null>(null);

const stepIndex = computed(() => {
  if (step.value === 'upload') return 0;
  if (step.value === 'processing') return 1;
  return 2;
});

const hasNextBatch = computed(() => {
  if (uploadMode.value !== 'batch') return false;
  const idx = batchItems.value.findIndex(i => i.id === activeBatchId.value);
  return batchItems.value.slice(idx + 1).some(i => i.status === 'pending' || i.status === 'preview');
});

function onFilesSelected(files: File[]) {
  selectedFiles.value = files;
  uploadMode.value = 'single';
}

function onBatchSelected(files: File[]) {
  selectedFiles.value = files;
  uploadMode.value = 'batch';
  batchItems.value = files.map(file => ({
    id: `${file.name}-${file.lastModified}`,
    file,
    status: 'pending',
  }));
  activeBatchId.value = batchItems.value[0]?.id ?? '';
}

function errorMessage(code?: string): string {
  const map: Record<string, string> = {
    E001: '文件格式不支持，请上传 JPG、PNG 或 PDF',
    E002: '文件超过 10MB 限制',
    E003: '未能识别文字，请上传更清晰的文件',
    E004: 'AI 解析失败，请先在网站配置中填写 API Key',
    E005: '解析结果格式异常，请手动修正或重新上传',
  };
  return map[code ?? ''] ?? code ?? '处理失败';
}

async function processFile(file: File, batchId?: string) {
  currentFileName.value = file.name;
  processingStage.value = 'ocr';
  progressPercent.value = 0;

  importBus.emit({ type: 'IMPORT_STARTED', fileName: file.name });

  const ocrResult = await extractResumeText(file, {
    onProgress: p => { progressPercent.value = Math.min(p, 90); },
  });

  if (!ocrResult.success) {
    const err = errorMessage(ocrResult.error);
    importBus.emit({ type: 'IMPORT_FAILED', error: err, stage: 'ocr' });
    if (batchId) updateBatchItem(batchId, { status: 'error', error: err });
    throw new Error(err);
  }

  importBus.emit({ type: 'IMPORT_OCR_DONE', rawTextLength: ocrResult.rawText.length });

  if (!settingsStore.aliApiKey) {
    message.warning('未配置 API Key，已展示 OCR 文本，请手动填写字段');
    return loadPreview(createEmptyParsedResume(), ocrResult.rawText, [], batchId);
  }

  processingStage.value = 'parsing';
  progressPercent.value = 92;

  const parseResult = await parseResumeText(ocrResult.rawText, {
    onProgress: () => { progressPercent.value = 96; },
  });

  progressPercent.value = 100;

  if (!parseResult.success || !parseResult.data) {
    const err = errorMessage(parseResult.error);
    importBus.emit({ type: 'IMPORT_FAILED', error: err, stage: 'parse' });
    message.warning(`${err}，已展示 OCR 原文，请手动填写`);
    return loadPreview(createEmptyParsedResume(), ocrResult.rawText, [], batchId);
  }

  importBus.emit({
    type: 'IMPORT_PARSE_DONE',
    fieldCount: parseResult.fieldMeta?.length ?? 0,
  });

  loadPreview(parseResult.data, ocrResult.rawText, parseResult.fieldMeta ?? [], batchId);
}

function loadPreview(
  data: ParsedResumePayload,
  rawText: string,
  fieldMeta: FieldMeta[],
  batchId?: string
) {
  editableParsed.value = JSON.parse(JSON.stringify(data));
  currentRawText.value = rawText;
  currentFieldMeta.value = fieldMeta;
  step.value = 'preview';
  if (batchId) {
    updateBatchItem(batchId, {
      status: 'preview',
      rawText,
      parsed: data,
      fieldMeta,
    });
  }
}

function updateBatchItem(id: string, patch: Partial<BatchImportItem>) {
  const index = batchItems.value.findIndex(i => i.id === id);
  if (index !== -1) {
    batchItems.value[index] = { ...batchItems.value[index], ...patch };
  }
}

async function startProcess() {
  if (!selectedFiles.value.length) {
    message.warning('请先选择文件');
    return;
  }

  resetPreviewIdSequence();
  step.value = 'processing';

  if (settingsStore.ocrEngine === 'vision' && !settingsStore.aliApiKey?.trim()) {
    message.warning('已选择大模型视觉识别，但未配置 API Key，将使用本地 Tesseract');
  }

  try {
    if (uploadMode.value === 'batch') {
      const first = batchItems.value[0];
      if (!first) return;
      activeBatchId.value = first.id;
      updateBatchItem(first.id, { status: 'ocr' });
      await processFile(first.file, first.id);
    } else {
      await processFile(selectedFiles.value[0]);
    }
  } catch (err) {
    message.error(err instanceof Error ? err.message : '识别失败');
    step.value = 'upload';
  }
}

function switchBatchItem(id: string) {
  activeBatchId.value = id;
  const item = batchItems.value.find(i => i.id === id);
  if (!item) return;

  if (item.status === 'pending') {
    step.value = 'processing';
    updateBatchItem(id, { status: 'ocr' });
    processFile(item.file, id).catch(err => {
      message.error(err instanceof Error ? err.message : '识别失败');
      step.value = 'preview';
    });
    return;
  }

  if (item.parsed) {
    editableParsed.value = JSON.parse(JSON.stringify(item.parsed));
    currentRawText.value = item.rawText ?? '';
    currentFieldMeta.value = item.fieldMeta ?? [];
  }
}

function saveCurrentBatchEdits() {
  if (!activeBatchId.value || !editableParsed.value) return;
  updateBatchItem(activeBatchId.value, {
    parsed: JSON.parse(JSON.stringify(editableParsed.value)),
    fieldMeta: currentFieldMeta.value,
  });
}

function saveToStore() {
  if (!editableParsed.value) return null;
  saveCurrentBatchEdits();

  const fieldMeta = parsePreviewRef.value?.getFieldMeta?.() ?? currentFieldMeta.value;
  const payload = JSON.parse(JSON.stringify(editableParsed.value)) as ParsedResumePayload;
  stripPreviewIds(payload as ParsedResumePayload & {
    education: ItemWithPreviewId[];
    workExperience: ItemWithPreviewId[];
    projects: ItemWithPreviewId[];
    skills: ItemWithPreviewId[];
    honors: ItemWithPreviewId[];
  });

  const result = resumeStore.importParsedResume(
    payload,
    {
      mode: importMode.value,
      source: 'ocr-import',
      fileName: currentFileName.value,
    },
    fieldMeta
  );

  if (uploadMode.value === 'batch' && activeBatchId.value) {
    updateBatchItem(activeBatchId.value, { status: 'done' });
  }

  importBus.emit({ type: 'IMPORT_CONFIRMED', result });
  return result;
}

function confirmImport() {
  const result = saveToStore();
  if (!result) return;
  message.success('导入成功，即将跳转至简历编辑页');
  router.push('/');
}

async function confirmAndNext() {
  const result = saveToStore();
  if (!result) return;

  const idx = batchItems.value.findIndex(i => i.id === activeBatchId.value);
  const next = batchItems.value.slice(idx + 1).find(i => i.status === 'pending');
  if (!next) {
    message.success('全部导入完成');
    router.push('/');
    return;
  }

  message.success('当前文件已导入，继续处理下一份');
  activeBatchId.value = next.id;
  importMode.value = 'merge';
  step.value = 'processing';
  try {
    updateBatchItem(next.id, { status: 'ocr' });
    await processFile(next.file, next.id);
  } catch (err) {
    message.error(err instanceof Error ? err.message : '识别失败');
    step.value = 'preview';
  }
}

function cancelImport() {
  importBus.emit({ type: 'IMPORT_CANCELLED' });
  resetPreviewIdSequence();
  step.value = 'upload';
  selectedFiles.value = [];
  batchItems.value = [];
  editableParsed.value = null;
}
</script>

<style scoped>
.import-page {
  max-width: 1200px;
  margin: 0 auto;
  padding: 24px 20px;
  min-height: calc(100vh - 60px);
}

.import-header h2 {
  margin: 0 0 4px;
  color: var(--text-color, #333);
}

.import-header p {
  margin: 0 0 20px;
  color: #888;
}

.import-steps {
  margin-bottom: 24px;
}

.step-panel {
  background: var(--bg-color, #fff);
  border-radius: 8px;
  padding: 20px;
}

.action-bar {
  margin-top: 20px;
  text-align: center;
}

.preview-step {
  display: flex;
  gap: 16px;
  padding: 0;
  background: transparent;
}

.batch-sidebar {
  width: 260px;
  flex-shrink: 0;
}

.preview-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: var(--bg-color, #fff);
  border-radius: 8px;
  padding: 16px;
}

.preview-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  padding-top: 12px;
  border-top: 1px solid #f0f0f0;
}
</style>
