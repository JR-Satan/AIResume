<template>
  <div class="file-uploader">
    <a-upload-dragger
      :multiple="multiple"
      :max-count="maxCount"
      :show-upload-list="showList"
      :before-upload="() => false"
      :file-list="fileList"
      accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf"
      @change="handleChange"
      @remove="handleRemove"
    >
      <p class="ant-upload-drag-icon">
        <InboxOutlined />
      </p>
      <p class="upload-title">点击或拖拽文件到此区域上传</p>
      <p class="upload-hint">支持 JPG、PNG、PDF，单文件不超过 10MB{{ multiple ? '，最多 5 个文件' : '' }}</p>
    </a-upload-dragger>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { InboxOutlined } from '@ant-design/icons-vue';
import { message } from 'ant-design-vue';
import type { UploadChangeParam, UploadProps } from 'ant-design-vue';
import { IMPORT_FILE_CONSTRAINTS, validateBatchFiles, validateImportFile } from '../../../utils/fileValidator';

const props = withDefaults(defineProps<{
  multiple?: boolean;
  maxCount?: number;
  showList?: boolean;
}>(), {
  multiple: false,
  maxCount: 1,
  showList: true,
});

const emit = defineEmits<{
  select: [files: File[]];
}>();

const fileList = ref<UploadProps['fileList']>([]);

function extractFiles(list: UploadProps['fileList']): File[] {
  return (list ?? [])
    .map(item => item.originFileObj as File | undefined)
    .filter((f): f is File => !!f);
}

function handleChange(info: UploadChangeParam) {
  const files = extractFiles(info.fileList);

  if (props.multiple) {
    if (files.length > IMPORT_FILE_CONSTRAINTS.maxBatchCount) {
      message.error(`单次最多上传 ${IMPORT_FILE_CONSTRAINTS.maxBatchCount} 个文件`);
      fileList.value = info.fileList.slice(0, IMPORT_FILE_CONSTRAINTS.maxBatchCount);
      emit('select', extractFiles(fileList.value));
      return;
    }
    const validation = validateBatchFiles(files);
    if (!validation.valid && files.length > 0) {
      message.error(validation.message ?? '文件校验失败');
      return;
    }
    fileList.value = info.fileList;
    emit('select', files);
    return;
  }

  const file = files[files.length - 1];
  if (!file) {
    fileList.value = [];
    emit('select', []);
    return;
  }
  const validation = validateImportFile(file);
  if (!validation.valid) {
    message.error(validation.message ?? '文件校验失败');
    fileList.value = [];
    emit('select', []);
    return;
  }
  fileList.value = [info.fileList[info.fileList.length - 1]];
  emit('select', [file]);
}

const handleRemove: UploadProps['onRemove'] = () => {
  fileList.value = [];
  emit('select', []);
  return true;
};

function reset() {
  fileList.value = [];
}

defineExpose({ reset });
</script>

<style scoped>
.file-uploader {
  width: 100%;
}

.upload-title {
  font-size: 16px;
  color: var(--text-color, #333);
}

.upload-hint {
  color: #888;
  font-size: 13px;
}
</style>
