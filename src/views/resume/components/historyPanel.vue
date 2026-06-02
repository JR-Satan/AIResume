<template>
  <div class="history-panel">
    <!-- 顶部工具栏 -->
    <div class="history-header">
      <div class="header-left">
        <a-button
          v-if="previewingVersion"
          type="text"
          @click="goBackToList"
          class="back-btn"
        >
          <arrow-left-outlined />
          返回列表
        </a-button>
        <span class="header-title">
          {{ previewingVersion ? '版本预览' : '历史版本' }}
        </span>
        <a-tag v-if="previewingVersion" color="orange" class="preview-tag">只读</a-tag>
      </div>
      <div class="header-right">
        <span class="version-count" v-if="!previewingVersion">
          共 {{ historyList.length }} 个版本
        </span>
        <a-button
          v-if="previewingVersion"
          type="primary"
          ghost
          size="small"
          @click="confirmRestore"
        >
          <undo-outlined />
          恢复此版本
        </a-button>
      </div>
    </div>

    <!-- 版本列表视图 -->
    <div v-if="!previewingVersion" class="history-list-wrapper">
      <div v-if="historyList.length === 0" class="empty-state">
        <clock-circle-outlined class="empty-icon" />
        <p class="empty-text">暂无历史版本</p>
        <p class="empty-hint">点击左侧「保存」按钮手动保存历史版本</p>
      </div>
      <div v-else class="version-list">
        <div
          v-for="version in historyList"
          :key="version.id"
          class="version-item"
          @click="previewHistoryVersion(version)"
        >
          <div class="version-info">
            <clock-circle-outlined class="version-icon" />
            <div class="version-text">
              <span class="version-time">{{ formatTime(version.timestamp) }}</span>
              <span class="version-label">点击预览此版本</span>
            </div>
          </div>
          <div class="version-actions">
            <a-button
              type="text"
              size="small"
              danger
              @click.stop="confirmDelete(version)"
              class="delete-btn"
              title="删除此版本"
            >
              <delete-outlined />
            </a-button>
          </div>
        </div>
      </div>
    </div>

    <!-- 版本预览视图 -->
    <div v-else class="history-preview-wrapper">
      <div class="preview-area" ref="previewRef" @mousedown="startDragging" @wheel.prevent="handleZoom">
        <div class="resume-content" :style="contentStyle">
          <component :is="loadedComponent" :colorShades="colorShades" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, defineAsyncComponent, reactive, onBeforeUnmount, onMounted } from 'vue';
import {
  ClockCircleOutlined,
  ArrowLeftOutlined,
  DeleteOutlined,
  UndoOutlined,
} from '@ant-design/icons-vue';
import { Modal, message } from 'ant-design-vue';
import { useResumeStore } from '../../../store/useResumeStore';
import { useUserStore } from '../../../store/useUserStore';
import { listHistory, deleteHistory, migrateHistoryOwner } from '../../../services/archiveService';
import type { HistoryVersion } from '../../../services/archiveService';
import { generateColorShades } from '../../../utils/colorUtils';

// ========== Props ==========
const props = defineProps<{
  open: boolean;
}>();

// ========== Store ==========
const resumeStore = useResumeStore();
const userStore = useUserStore();

// ========== 版本列表 ==========
const historyList = ref<HistoryVersion[]>([]);
const previewingVersion = ref<HistoryVersion | null>(null);

const currentTemplateId = computed(() => resumeStore.resumeSetting.currentTemplate as string);
const currentUsername = computed(() => userStore.currentUser?.username || null);
const currentUserId = computed(() => userStore.currentUser?.id || null);

// 加载历史版本列表
const loadHistoryList = () => {
  const templateId = currentTemplateId.value;
  const username = currentUsername.value?.trim();
  if (!templateId || !username) {
    historyList.value = [];
    return;
  }

  migrateHistoryOwner(templateId, currentUserId.value, username);
  historyList.value = listHistory(templateId, username);
};

// 监听面板打开状态
watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      previewingVersion.value = null;
      loadHistoryList();
    } else {
      // 关闭面板时，如果正在预览，退出预览
      if (previewingVersion.value) {
        resumeStore.exitHistoryPreview();
        previewingVersion.value = null;
      }
    }
  },
  { immediate: true }
);

watch(currentTemplateId, () => {
  if (props.open && !previewingVersion.value) {
    loadHistoryList();
  }
});

watch(currentUsername, () => {
  if (props.open && !previewingVersion.value) {
    loadHistoryList();
  }
});

// ========== 预览逻辑 ==========
const previewHistoryVersion = (version: HistoryVersion) => {
  resumeStore.enterHistoryPreview(version.snapshot);
  previewingVersion.value = version;
  // 等待 DOM 更新后初始化预览尺寸
  nextTick(() => {
    updateBounds();
  });
};

const goBackToList = () => {
  resumeStore.exitHistoryPreview();
  previewingVersion.value = null;
  // 返回列表后重新加载（以防有变化）
  loadHistoryList();
};

// ========== 恢复版本 ==========
const confirmRestore = () => {
  if (!previewingVersion.value) return;
  Modal.confirm({
    title: '确认恢复',
    content: '这将把当前简历数据替换为该历史版本的内容，确定要继续吗？',
    okText: '确定恢复',
    cancelText: '取消',
    onOk: () => {
      restoreVersion(previewingVersion.value!);
    },
  });
};

const restoreVersion = (version: HistoryVersion) => {
  // 退出历史预览模式（恢复原始数据）
  resumeStore.exitHistoryPreview();
  previewingVersion.value = null;

  // 将快照数据写入 store
  const snapshot = version.snapshot;
  resumeStore.personalInfo = JSON.parse(JSON.stringify(snapshot.personalInfo));
  resumeStore.education = JSON.parse(JSON.stringify(snapshot.education));
  resumeStore.workExperience = JSON.parse(JSON.stringify(snapshot.workExperience));
  resumeStore.skills = JSON.parse(JSON.stringify(snapshot.skills));
  resumeStore.projects = JSON.parse(JSON.stringify(snapshot.projects));
  resumeStore.honors = JSON.parse(JSON.stringify(snapshot.honors));
  resumeStore.summary = snapshot.summary;
  resumeStore.sectionOrder = [...snapshot.sectionOrder];
  resumeStore.resumeSetting = JSON.parse(JSON.stringify(snapshot.resumeSetting));

  resumeStore.initializeCurrentId();
  resumeStore.saveToLocalStorage();
  message.success('已恢复到该历史版本');

  // 刷新列表
  loadHistoryList();
};

// ========== 删除版本 ==========
const confirmDelete = (version: HistoryVersion) => {
  Modal.confirm({
    title: '删除版本',
    content: `确定要删除 ${formatTime(version.timestamp)} 这个版本吗？此操作不可撤销。`,
    okText: '删除',
    okType: 'danger',
    cancelText: '取消',
    onOk: () => {
      const success = deleteHistory(version.id, currentTemplateId.value, currentUsername.value);
      if (success) {
        message.success('版本已删除');
        loadHistoryList();
      } else {
        message.error('删除失败');
      }
    },
  });
};

// ========== 时间格式化 ==========
const formatTime = (timestamp: number): string => {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

// ========== 模板渲染（复用 resumePreview 的逻辑） ==========
const templateModules = import.meta.glob('../../../template/**/index.vue');

// 异步加载模板组件
const loadedComponent = ref<any>(null);
const colorShades = ref(generateColorShades(resumeStore.resumeSetting.themeColor1));

// 加载模板
const loadTemplateForPreview = async () => {
  const settings = previewingVersion.value
    ? previewingVersion.value.snapshot.resumeSetting
    : resumeStore.resumeSetting;

  const templateId = settings.currentTemplate as string;
  colorShades.value = generateColorShades(settings.themeColor1);

  try {
    const { getTemplates } = await import('../../../utils/getTemplates');
    const templates = await getTemplates();
    const selectedTemplate = templates.find(t => t.id === templateId);
    if (selectedTemplate?.folderPath) {
      const importPath = `../../../template/${selectedTemplate.folderPath}/index.vue`;
      const importFunc = templateModules[importPath];
      if (importFunc) {
        loadedComponent.value = defineAsyncComponent(
          () => importFunc() as Promise<typeof import('*.vue')['default']>
        );
      }
    }
  } catch (e) {
    console.error('加载历史版本模板失败:', e);
  }
};

// 当预览版本变化时重新加载模板
watch(previewingVersion, (v) => {
  if (v) {
    nextTick(() => loadTemplateForPreview());
  }
});

// ========== 预览拖拽和缩放 ==========
const previewRef = ref<HTMLElement | null>(null);

const state = reactive({
  scale: 0.6,
  translateX: 0,
  translateY: 0,
  dragging: false,
  startX: 0,
  startY: 0,
  previewWidth: 0,
  previewHeight: 0,
  contentWidth: 0,
  contentHeight: 0,
});

const updateBounds = async () => {
  await nextTick();
  if (previewRef.value) {
    const container = previewRef.value;
    const content = container.querySelector('.resume-content') as HTMLElement;
    if (content) {
      state.previewWidth = container.clientWidth;
      state.previewHeight = container.clientHeight;
      state.contentWidth = content.offsetWidth;
      state.contentHeight = content.offsetHeight;
      limitTranslation();
    }
  }
};

const handleZoom = (event: WheelEvent) => {
  const zoomSpeed = 0.1;
  const oldScale = state.scale;

  if (event.deltaY < 0) {
    state.scale = Math.min(state.scale + zoomSpeed, 3);
  } else {
    state.scale = Math.max(state.scale - zoomSpeed, 0.2);
  }

  const rect = previewRef.value?.getBoundingClientRect();
  if (rect) {
    const offsetX = event.clientX - rect.left - rect.width / 2 - state.translateX;
    const offsetY = event.clientY - rect.top - rect.height / 2 - state.translateY;
    state.translateX -= (offsetX / oldScale) * (state.scale - oldScale);
    state.translateY -= (offsetY / oldScale) * (state.scale - oldScale);
  }

  updateBounds();
};

const limitTranslation = () => {
  const scaledContentWidth = state.contentWidth * state.scale;
  const scaledContentHeight = state.contentHeight * state.scale;
  const minVisibleX = scaledContentWidth * 0.1 / 2;
  const minVisibleY = scaledContentHeight * 0.1 / 2;
  const previewLeft = -state.previewWidth / 1.2 + minVisibleX;
  const previewRight = state.previewWidth / 1.2 - minVisibleX;
  const previewTop = -state.previewHeight / 1.2 + minVisibleY;
  const previewBottom = state.previewHeight / 1.2 - minVisibleY;

  state.translateX = Math.min(previewRight, Math.max(state.translateX, previewLeft));
  state.translateY = Math.min(previewBottom, Math.max(state.translateY, previewTop));
};

const startDragging = (event: MouseEvent) => {
  event.preventDefault();
  state.dragging = true;
  state.startX = event.pageX - state.translateX;
  state.startY = event.pageY - state.translateY;
  document.addEventListener('mousemove', onDragging);
  document.addEventListener('mouseup', stopDragging);
};

const onDragging = (event: MouseEvent) => {
  if (state.dragging) {
    state.translateX = event.pageX - state.startX;
    state.translateY = event.pageY - state.startY;
    limitTranslation();
  }
};

const stopDragging = () => {
  state.dragging = false;
  limitTranslation();
  document.removeEventListener('mousemove', onDragging);
  document.removeEventListener('mouseup', stopDragging);
};

const contentStyle = computed(() => ({
  transform: `translate(-50%, -50%) translate(${state.translateX}px, ${state.translateY}px) scale(${state.scale})`,
  transformOrigin: 'center center',
  cursor: state.dragging ? 'grabbing' : 'grab',
  willChange: 'transform',
  transition: state.dragging ? 'none' : 'transform 0.2s ease',
}));

// ========== 生命周期 ==========
onMounted(() => {
  window.addEventListener('resize', updateBounds);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateBounds);
  document.removeEventListener('mousemove', onDragging);
  document.removeEventListener('mouseup', stopDragging);
});
</script>

<style scoped>
.history-panel {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background-color: var(--bg-color);
  overflow: hidden;
}

/* ========== 头部工具栏 ========== */
.history-header {
  height: 50px;
  flex-shrink: 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 16px;
  background-color: var(--bg-card-color);
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.back-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  color: var(--primary-color);
}

.header-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-color);
}

.preview-tag {
  margin-left: 4px;
}

.version-count {
  font-size: 12px;
  color: #8c8c8c;
}

/* ========== 版本列表 ========== */
.history-list-wrapper {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  scrollbar-width: thin;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #8c8c8c;
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 16px;
  opacity: 0.3;
}

.empty-text {
  font-size: 16px;
  margin: 0 0 8px;
}

.empty-hint {
  font-size: 13px;
  margin: 0;
  opacity: 0.6;
}

.version-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.version-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  background-color: var(--bg-card-color);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s ease;
  border: 1px solid transparent;
}

.version-item:hover {
  border-color: var(--primary-color);
  box-shadow: 0 2px 12px rgba(103, 45, 234, 0.08);
  transform: translateY(-1px);
}

.version-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.version-icon {
  font-size: 18px;
  color: var(--primary-color);
  opacity: 0.7;
}

.version-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.version-time {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-color);
}

.version-label {
  font-size: 12px;
  color: #8c8c8c;
}

.version-actions {
  display: flex;
  align-items: center;
}

.delete-btn {
  opacity: 0;
  transition: opacity 0.2s;
}

.version-item:hover .delete-btn {
  opacity: 1;
}

/* ========== 预览区域 ========== */
.history-preview-wrapper {
  flex: 1;
  overflow: hidden;
  position: relative;
}

.preview-area {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background-color: var(--color-7);
  cursor: grab;
  user-select: none;
}

.preview-area:active {
  cursor: grabbing;
}

.resume-content {
  position: relative;
  z-index: 1;
  top: 50%;
  left: 50%;
  width: 794px;
  min-height: 1123px;
  background-color: white;
  color: black;
  box-shadow: 0 2px 16px rgba(0, 0, 0, 0.4);
}
</style>
