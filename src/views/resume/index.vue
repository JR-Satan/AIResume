<!-- 父组件代码 -->
<template>
  <div class="resume">

    <!-- 左侧简历内容编辑组件 -->
    <div class="left">
      <div class="btn-group">
        <!-- 预览填充 -->
        <a-popconfirm title="填充会覆盖当前数据，确定吗？" ok-text="确定" cancel-text="取消" @confirm="handleAutoFill"
          :disabled="historyOpen">
          <template #icon><question-circle-outlined style="color: red" /></template>
          <a-button type="primary" ghost :disabled="historyOpen">
            <eye-outlined />
            预览填充
          </a-button>
        </a-popconfirm>

        <!-- 保存版本 -->
        <a-button :disabled="historyOpen" @click="openSaveHistoryModal">
          <save-outlined />
          保存
        </a-button>

        <!-- 清空数据 -->
        <a-popconfirm title="确定要清空当前简历数据吗？" ok-text="清空" cancel-text="取消" @confirm="resumeStore.clearData"
          :disabled="historyOpen">
          <template #icon><warning-outlined style="color: red" /></template>
          <a-button danger :disabled="historyOpen">
            <delete-outlined />
            清空数据
          </a-button>
        </a-popconfirm>

        <!-- 导出数据 -->
        <a-button type="default" @click="resumeStore.exportData" :disabled="historyOpen">
          <download-outlined />
          导出JSON
        </a-button>

        <!-- 导入按钮 -->
        <a-upload v-model:fileList="fileList" :beforeUpload="handleFileUpload" :showUploadList="false"
          accept="application/json" :disabled="historyOpen">
          <a-button type="dashed" :disabled="historyOpen">
            <upload-outlined />
            导入JSON
          </a-button>
        </a-upload>

        <!-- 历史版本 -->
        <a-button :type="historyOpen ? 'primary' : 'default'" @click="toggleHistory">
          <history-outlined />
          历史版本
        </a-button>
      </div>

      <resumeEdit />
    </div>
    <!-- 右侧简历展示组件 / 历史版本面板 -->
    <div class="right">
      <history-panel v-if="historyOpen" :open="historyOpen" />
      <resumePreview v-else />
    </div>

    <a-modal
      v-model:open="saveHistoryModalOpen"
      title="保存历史版本"
      ok-text="保存"
      cancel-text="取消"
      :confirm-loading="savingHistory"
      @ok="handleSaveHistory"
      @cancel="resetSaveHistoryForm"
    >
      <a-form layout="vertical">
        <a-form-item label="提交信息说明">
          <a-textarea
            v-model:value="historyTitle"
            placeholder="请输入本次保存的说明，例如：优化项目经历描述"
            :maxlength="80"
            :rows="3"
            show-count
          />
        </a-form-item>
      </a-form>
      <p class="save-tip">不填写时，历史版本会默认使用保存时间作为标题。</p>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import resumeEdit from './components/resumeEdit.vue';
import resumePreview from './components/resumePreview.vue';
import historyPanel from './components/historyPanel.vue';
import { useResumeStore } from "../../store/useResumeStore";
import { UploadOutlined, HistoryOutlined, SaveOutlined } from '@ant-design/icons-vue';
import { message } from "ant-design-vue";
import type { UploadProps } from "ant-design-vue";
import { ref, onUnmounted } from 'vue';
const resumeStore = useResumeStore();
const fileList = ref<UploadProps["fileList"]>([]);
const saveHistoryModalOpen = ref(false);
const savingHistory = ref(false);
const historyTitle = ref('');

// ========== 历史版本面板状态 ==========
const historyOpen = ref(false);

const toggleHistory = () => {
  const willClose = historyOpen.value;
  historyOpen.value = !willClose;
  // 关闭面板时，确保退出历史预览模式
  if (willClose && resumeStore.isHistoryMode) {
    resumeStore.exitHistoryPreview();
  }
};

const handleAutoFill = () => {
  resumeStore.autoFillData();
};

const openSaveHistoryModal = () => {
  historyTitle.value = '';
  saveHistoryModalOpen.value = true;
};

const resetSaveHistoryForm = () => {
  savingHistory.value = false;
  historyTitle.value = '';
};

// 手动保存历史版本
const handleSaveHistory = () => {
  savingHistory.value = true;
  const savedVersion = resumeStore.saveHistorySnapshot(undefined, historyTitle.value);
  savingHistory.value = false;
  if (savedVersion) {
    message.success('已保存为历史版本');
    saveHistoryModalOpen.value = false;
    resetSaveHistoryForm();
  } else {
    message.warning('当前状态无法保存历史版本');
  }
};

// 组件卸载时，确保退出历史预览模式（防止数据残留）
onUnmounted(() => {
  if (resumeStore.isHistoryMode) {
    resumeStore.exitHistoryPreview();
  }
});

// ========== 文件导入 ==========
const handleFileUpload = (file: File) => {
  if (file.type !== "application/json") {
    message.error("请上传 JSON 文件！");
    return false;
  }
  resumeStore.importData(file);
  // 清空 fileList，避免重复上传不触发事件
  fileList.value = [];
  return false;
};
</script>

<style scoped>
.resume {
  display: flex;
  justify-content: space-between;
  height: calc(100vh - 60px);
  overflow: hidden;
}

.left {
  width: 38%;
  height: 100%;
  background-color: var(--bg-color);
  transition: all 0.3s;
  min-width: 520px;
  display: flex;
  flex-direction: column;
  /* 改为纵向布局 */
}

.right {
  width: 62%;
  height: 100%;
  position: relative;
  overflow-y: auto;
}

.btn-group {
  height: 50px;
  display: flex;
  justify-content: center;
  gap: 20px;
  align-items: center;
  background-color: var(--bg-color);
  flex-shrink: 0;
  /* 防止按钮组被压缩 */
}

/* 让编辑区域占满剩余空间并添加滚动 */
:deep(.resume-edit) {
  flex: 1;
  overflow-y: auto;
}

.save-tip {
  margin: -8px 0 0;
  color: #8c8c8c;
  font-size: 12px;
}

</style>
