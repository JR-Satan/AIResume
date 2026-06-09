<template>
  <a-collapse class="honors-collapse">
    <a-collapse-panel key="1" header="荣誉奖项">
      <a-space direction="vertical" style="width: 100%">
        <!-- 荣誉列表 -->
        <div
          v-for="(honor, index) in honors"
          :key="honor.id"
          class="honor-item"
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
              aria-label="拖拽调整荣誉顺序"
              @dragstart="onDragStart(index, $event)"
              @dragend="onDragEnd"
            >
              <MenuOutlined />
            </button>
            <h4>荣誉 #{{ index + 1 }}</h4>
            <a-popconfirm title="确定要删除当前荣誉奖项？" ok-text="删除" cancel-text="取消" @confirm="removeHonor(honor.id)">
              <template #icon><question-circle-outlined style="color: red" /></template>
              <a-button type="link" danger>删除</a-button>
            </a-popconfirm>
          </div>

          <a-form layout="vertical">
            <a-row gutter="24">
              <a-col :span="12">
                <a-input v-model:value="honor.honorName" placeholder="请输入奖项名称" addonBefore="奖项" />
              </a-col>
              <a-col :span="12">
                <a-date-picker v-model:value="honor.date" placeholder="获奖时间" style="width: 100%" format="YYYY-MM-DD"
                  value-format="YYYY-MM-DD" />
              </a-col>
            </a-row>
            <AIEnhancePopover :description="`请帮我润色和优化以下内容，是我简历中的获奖描述，
                    使其更加简洁、专业和吸引面试官，
                    你返回的内容换行表示一个要点，不用md语法，不要隔行，
                    层次清晰分明：\n${honor.description}`" :extend="`下面这个是我简历中的获奖描述，我可以从哪些方面扩展优化？你的回复用文本就行，不需要md语法，给我一些思路：
                    \n${honor.description}`" :field-path="`honors[${index}].description`"
              :original-text="honor.description" @update="(content: string) => honor.description = content">
              <a-textarea v-model:value="honor.description" placeholder="请输入奖项描述"
                :auto-size="{ minRows: 2, maxRows: 5 }" style="margin-top: 16px" />
            </AIEnhancePopover>
          </a-form>
          <a-divider v-if="index !== honors.length - 1" />
        </div>

        <!-- 添加按钮 -->
        <a-button type="dashed" block @click="addHonor" style="margin-top: 16px">
          <plus-outlined /> 添加荣誉奖项
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
const honors = computed(() => resumeStore.honors);
const draggingIndex = ref<number | null>(null);
const dragOverIndex = ref<number | null>(null);
// 添加荣誉
const addHonor = () => {
  resumeStore.addHonor({
    honorName: '',
    date: '',
    description: ''
  });
};

// 删除荣誉 - 修正删除方法
const removeHonor = (id: number) => {
  resumeStore.deleteHonor(id)
  message.success('荣誉奖项删除成功！');
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
    moveItem(honors.value, fromIndex, toIndex);
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
.honors-collapse {
  margin: 20px auto 0;
  max-width: 800px;
  font-family: 'zql';
  background-color: var(--color-7);
}

.honor-item {
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

.honor-item.is-drag-over {
  outline: 2px dashed #1677ff;
}
</style>
