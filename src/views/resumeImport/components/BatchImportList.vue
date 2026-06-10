<template>
  <div class="batch-list">
    <a-list :data-source="items" bordered>
      <template #renderItem="{ item }">
        <a-list-item
          :class="{ active: item.id === activeId }"
          @click="emit('select', item.id)"
        >
          <a-list-item-meta>
            <template #title>{{ item.file.name }}</template>
            <template #description>
              <a-tag :color="statusColor(item.status)">{{ statusText(item.status) }}</a-tag>
              <span v-if="item.error" class="error-text">{{ item.error }}</span>
            </template>
          </a-list-item-meta>
        </a-list-item>
      </template>
    </a-list>
  </div>
</template>

<script setup lang="ts">
import type { BatchImportItem } from '../../../types/resumeImport';

defineProps<{
  items: BatchImportItem[];
  activeId?: string;
}>();

const emit = defineEmits<{
  select: [id: string];
}>();

function statusColor(status: BatchImportItem['status']) {
  const map: Record<BatchImportItem['status'], string> = {
    pending: 'default',
    ocr: 'processing',
    parsing: 'processing',
    preview: 'warning',
    done: 'success',
    error: 'error',
  };
  return map[status];
}

function statusText(status: BatchImportItem['status']) {
  const map: Record<BatchImportItem['status'], string> = {
    pending: '等待处理',
    ocr: 'OCR 识别中',
    parsing: 'AI 解析中',
    preview: '待确认',
    done: '已完成',
    error: '失败',
  };
  return map[status];
}
</script>

<style scoped>
.batch-list :deep(.ant-list-item) {
  cursor: pointer;
}

.batch-list :deep(.ant-list-item.active) {
  background: rgba(103, 45, 234, 0.08);
}

.error-text {
  margin-left: 8px;
  color: #ff4d4f;
  font-size: 12px;
}
</style>
