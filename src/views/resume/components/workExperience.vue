<template>
  <a-collapse class="work-experience-collapse">
    <a-collapse-panel key="1" header="工作经历">
      <a-space direction="vertical" style="width: 100%">
        <!-- 工作经历列表 -->
        <div
          v-for="(work, index) in workExperience"
          :key="work.id"
          class="experience-item"
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
              aria-label="拖拽调整工作经历顺序"
              @dragstart="onDragStart(index, $event)"
              @dragend="onDragEnd"
            >
              <MenuOutlined />
            </button>
            <h4>工作经历 #{{ index + 1 }}</h4>
            <a-popconfirm title="确定要删除当前技能？" ok-text="删除" cancel-text="取消" @confirm="removeWork(work.id)">
              <template #icon><question-circle-outlined style="color: red" /></template>
              <a-button type="link" danger> 删除</a-button>
            </a-popconfirm>
          </div>

          <a-form layout="vertical">
            <a-row gutter="24">
              <a-col :span="12">
                <a-input v-model:value="work.company" placeholder="请输入公司名称" addonBefore="公司" />
              </a-col>
              <a-col :span="12">
                <a-input v-model:value="work.position" placeholder="请输入职位" addonBefore="职位" />
              </a-col>
            </a-row>

            <a-row gutter="24" style="margin-top: 16px">
              <a-col :span="12">
                <a-date-picker v-model:value="work.startDate" placeholder="开始时间" style="width: 100%" format="YYYY-MM-DD"
                  value-format="YYYY-MM-DD" />
              </a-col>
              <a-col :span="12">
                <a-date-picker v-model:value="work.endDate" placeholder="结束时间" style="width: 100%" format="YYYY-MM-DD"
                  value-format="YYYY-MM-DD" />
              </a-col>
            </a-row>

            <AIEnhancePopover :description="`请帮我润色和优化以下内容，是我简历中的过往工作描述，
                    使其更加简洁、专业和吸引面试官，
                    你返回的内容换行表示一个要点，不用md语法，不要隔行，
                    层次清晰分明：\n${work.description}`" :extend="`下面这个是我简历中的过往工作描述，我可以从哪些方面扩展优化？你的回复用文本就行，不需要md语法，给我一些思路：
                    \n${work.description}`" :field-path="`workExperience[${index}].description`"
              :original-text="work.description" @update="(content: string) => work.description = content">
              <a-textarea v-model:value="work.description" placeholder="请输入工作描述" :auto-size="{ minRows: 2, maxRows: 5 }"
                style="margin-top: 16px" />
            </AIEnhancePopover>


          </a-form>
          <a-divider v-if="index !== workExperience.length - 1" />
        </div>

        <!-- 添加按钮 -->
        <a-button type="dashed" block @click="addWork" style="margin-top: 16px">
          <plus-outlined /> 添加工作经历
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
import AIEnhancePopover from './AIEnhancePopover.vue';
import { message } from 'ant-design-vue';
import { moveItem } from '../../../utils/reorder';
const resumeStore = useResumeStore();
const workExperience = computed(() => resumeStore.workExperience);
const draggingIndex = ref<number | null>(null);
const dragOverIndex = ref<number | null>(null);

// 添加工作经历
const addWork = () => {
  resumeStore.addWorkExperience({
    company: '',
    position: '',
    startDate: '',
    endDate: '',
    description: ''
  });
};

// 删除工作经历
const removeWork = (id: number) => {
  resumeStore.deleteWorkExperience(id)
  message.success('工作经历删除成功！');
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
    moveItem(workExperience.value, fromIndex, toIndex);
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
.work-experience-collapse {
  margin: 20px auto 0;
  max-width: 800px;
  font-family: 'zql';
  background-color: var(--color-7);
}

.experience-item {
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

.experience-item.is-drag-over {
  outline: 2px dashed #1677ff;
}
</style>
