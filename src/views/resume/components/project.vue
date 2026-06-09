<template>
  <a-collapse class="project-collapse" accordion>
    <a-collapse-panel key="1" header="项目经历">
      <a-space direction="vertical" style="width: 100%">
        <!-- 项目经历列表 -->
        <div
          v-for="(project, index) in projects"
          :key="project.id"
          class="project-item"
          :class="{ 'is-drag-over': dragOverIndex === index }"
          @dragenter.prevent="onDragEnter(index)"
          @dragover.prevent="onDragOver(index, $event)"
          @dragleave="onDragLeave(index)"
          @drop="onDrop(index, $event)"
        >
          <div class="item-header">
            <button
              class="item-drag-handle"
              type="button"
              draggable="true"
              aria-label="拖拽调整项目经历顺序"
              @dragstart="onDragStart(index, $event)"
              @dragend="onDragEnd"
            >
              <MenuOutlined />
            </button>
            <h4>项目经历 #{{ index + 1 }}</h4>
            <a-popconfirm title="确定要删除当前项目经历？" ok-text="删除" cancel-text="取消" @confirm="removeProject(project.id)">
              <template #icon><question-circle-outlined style="color: red" /></template>
              <a-button type="link" danger>删除</a-button>
            </a-popconfirm>
          </div>

          <a-form layout="vertical">
            <a-row gutter="24">
              <a-col :span="12">
                <a-input v-model:value="project.projectName" placeholder="请输入项目名称" addon-before="项目名称" />
              </a-col>
              <a-col :span="12">
                <a-input v-model:value="project.role" placeholder="请输入您的角色" addon-before="角色" />
              </a-col>
            </a-row>

            <a-row gutter="24" style="margin-top: 16px">
              <a-col :span="12">
                <a-date-picker v-model:value="project.startDate" placeholder="开始时间" style="width: 100%"
                  format="YYYY-MM-DD" value-format="YYYY-MM-DD" />
              </a-col>
              <a-col :span="12">
                <a-date-picker v-model:value="project.endDate" placeholder="结束时间" style="width: 100%"
                  format="YYYY-MM-DD" value-format="YYYY-MM-DD" />
              </a-col>
            </a-row>
            <!-- 项目简介 -->
            <AIEnhancePopover :description="`请帮我润色和优化以下内容，是我简历中的项目简介
                    使其更加简洁、专业和吸引面试官，不用md语法，
                    层次清晰分明：${project.briefIntroduction}`" :extend="`下面这个是我简历中的过往项目简介，我可以从哪些方面扩展优化？给我一些思路：
                    \n${project.briefIntroduction}`"
              :field-path="`projects[${index}].briefIntroduction`" :original-text="project.briefIntroduction"
              @update="(content: string) => project.briefIntroduction = content">
              <a-textarea v-model:value="project.briefIntroduction" placeholder="请输入项目简介" addon-before="项目简介" rows="4"
                style="margin-top: 16px" />
            </AIEnhancePopover>

            <AIEnhancePopover :description="`请帮我润色和优化以下内容，是我简历中的项目要点，
                    使其更加简洁、专业和吸引面试官，
                    你返回的内容换行表示一个要点，不用md语法，不要隔行，
                    层次清晰分明：\n${project.description}`" :extend="`下面这个是我简历中的项目要点，我可以从哪些方面扩展优化？你的回复用文本就行，不需要md语法，给我一些思路：
                    \n${project.description}`" :field-path="`projects[${index}].description`"
              :original-text="project.description" @update="(content: string) => project.description = content">
              <a-textarea v-model:value="project.description" placeholder="请输入项目描述" addon-before="描述" rows="4"
                style="margin-top: 16px" />
            </AIEnhancePopover>
          </a-form>
          <a-divider v-if="index !== projects.length - 1" />
        </div>

        <!-- 添加按钮 -->
        <a-button type="dashed" block @click="addProject" style="margin-top: 16px">
          <PlusOutlined /> 添加项目经历
        </a-button>
      </a-space>
    </a-collapse-panel>
  </a-collapse>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { PlusOutlined, MenuOutlined } from '@ant-design/icons-vue';
import { useResumeStore } from '../../../store';
import { QuestionCircleOutlined } from '@ant-design/icons-vue';
import { message } from 'ant-design-vue';
import AIEnhancePopover from './AIEnhancePopover.vue';
import { moveItem } from '../../../utils/reorder';
const resumeStore = useResumeStore();
const projects = computed(() => resumeStore.projects);
const draggingIndex = ref<number | null>(null);
const dragOverIndex = ref<number | null>(null);

// 添加项目经历
const addProject = () => {
  resumeStore.addProject({
    projectName: '',
    role: '',
    startDate: '',
    endDate: '',
    description: '',
    briefIntroduction: '',
  });
};

// 删除项目经历
const removeProject = (id: number) => {
  resumeStore.deleteProject(id);
  message.success('项目经历删除成功！');
};

const onDragStart = (index: number, event: DragEvent) => {
  draggingIndex.value = index;
  dragOverIndex.value = null;
  event.dataTransfer?.setData('text/plain', String(index));
  event.dataTransfer && (event.dataTransfer.effectAllowed = 'move');
};

const onDragEnd = () => {
  draggingIndex.value = null;
  dragOverIndex.value = null;
};

const onDragEnter = (index: number) => {
  if (draggingIndex.value === null || draggingIndex.value === index) return;
  dragOverIndex.value = index;
};

const onDragLeave = (index: number) => {
  if (dragOverIndex.value === index) {
    dragOverIndex.value = null;
  }
};

const onDragOver = (index: number, event: DragEvent) => {
  if (draggingIndex.value === null) return;
  event.dataTransfer && (event.dataTransfer.dropEffect = 'move');
  if (dragOverIndex.value !== index && draggingIndex.value !== index) {
    dragOverIndex.value = index;
  }
};

const onDrop = (index: number, event: DragEvent) => {
  event.preventDefault();
  if (draggingIndex.value === null) return;
  const currentTarget = event.currentTarget as HTMLElement | null;
  let toIndex = index;
  if (currentTarget) {
    const rect = currentTarget.getBoundingClientRect();
    const offset = event.clientY - rect.top;
    if (offset > rect.height / 2) {
      toIndex = index + 1;
    }
  }
  const fromIndex = draggingIndex.value;
  if (fromIndex < toIndex) {
    toIndex -= 1;
  }
  if (fromIndex !== toIndex) {
    moveItem(projects.value, fromIndex, toIndex);
    resumeStore.saveToLocalStorage();
  }
  draggingIndex.value = null;
  dragOverIndex.value = null;
};

// 监听变化并保存到 localStorage
watch(
  () => resumeStore.$state,
  () => {
    resumeStore.saveToLocalStorage();
  },
  { deep: true }
);
</script>

<style scoped>
.project-collapse {
  margin: 20px auto 0;
  max-width: 800px;
  font-family: 'zql';
  background-color: var(--color-7);
}

.project-item {
  width: 100%;
  position: relative;
  border-radius: 8px;
}

.item-header {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.item-header h4 {
  margin: 0;
}

.item-header > :last-child {
  justify-self: end;
}

.item-drag-handle {
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: grab;
  border: none;
  background: transparent;
  color: #8c8c8c;
  padding: 0;
}

.item-drag-handle:active {
  cursor: grabbing;
}

.project-item.is-drag-over {
  outline: 2px dashed #1677ff;
}
</style>
