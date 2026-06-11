<!--
  编写者：侯锦瑞、王杰
  模块职责：提供简历实时预览、模板外观设置和高保真 PDF 导出能力。
  关键设计：预览页只根据 resumeSetting 动态加载模板组件，简历内容仍来自统一 Store，避免模板切换造成数据分叉。
  导出策略：PDF 导出前使用临时 DOM 按当前模板重新渲染，并按用户选择的 DPI 换算 html2canvas scale，保证导出清晰度可控。
-->
<template>

  <div class="setting">
    <!-- 弹框模板设置 -->
    <a-button type="primary" @click="resumeSettingClick" style="margin-right: 10px;">简历设置</a-button>
    <a-modal v-model:open="open" title="简历基本设置">
      <template #footer>
        <a-button key="submit" type="primary" @click="resumeSettingClickOK">确定</a-button>
      </template>
      <!-- 选择模板 -->
      <a-form-item label="简历模板选择" name="简历模板选择">
        <a-select v-model:value="currentTemplate" @change="handleTemplateChange" style="width: 150px;">
          <a-select-option v-for="item in templates" :key="item.id" :value="item.id">
            {{ item.name }}
          </a-select-option>
        </a-select>
      </a-form-item>
      <!-- 设置简历主色调-->
      <a-form-item label="简历主色调" name="简历主色调">
        <input id="themeColor1" class="changeColor" type="color" v-model="resumeSetting.themeColor1"
          @change="(e) => themeColor1 = ((e.target as HTMLInputElement).value)" />
      </a-form-item>
      <!-- 设置简历副色调 -->
      <a-form-item label="简历副色调" name="简历副色调">
        <input id="themeColor2" class="changeColor" type="color" v-model="resumeSetting.themeColor2"
          @change="(e) => themeColor2 = (e.target as HTMLInputElement).value" />
      </a-form-item>
      <!-- 设置字体大小 -->
      <a-form-item label="字体大小" name="字体大小">
        <a-slider v-model:value="fontSize" :min="12" :max="24" />
      </a-form-item>
      <!-- 设置段落间距 -->
      <a-form-item label="段落间距" name="段落间距">
        <a-slider v-model:value="paragraphSpacing" :min="0" :max="30" />
      </a-form-item>
      <!-- 设置区块间距 -->
      <a-form-item label="区块间距" name="区块间距">
        <a-slider v-model:value="sectionSpacing" :min="0" :max="30" />
      </a-form-item>
      <!-- 设置左右页边距 -->
      <a-form-item label="左右页边距" name="左右页边距">
        <a-slider v-model:value="padding_left_right" :min="0" :max="65" />
      </a-form-item>
      <!-- 设置上下页边距 -->
      <a-form-item label="上下页边距" name="上下页边距">
        <a-slider v-model:value="padding_top_bottom" :min="0" :max="35" />
      </a-form-item>
    </a-modal>

    <!-- DPI选择弹窗 -->
    <a-modal v-model:open="dpiModalOpen" title="导出PDF - 选择DPI" @ok="confirmExport">
      <template #footer>
        <a-button key="cancel" @click="dpiModalOpen = false">取消</a-button>
        <a-button key="submit" type="primary" @click="confirmExport">导出</a-button>
      </template>
      <a-form-item label="导出清晰度">
        <a-select v-model:value="selectedDpi" style="width: 200px;">
          <a-select-option v-for="dpi in dpiOptions" :key="dpi" :value="dpi">
            {{ dpi }} DPI
          </a-select-option>
        </a-select>
      </a-form-item>
      <div style="color: #888; font-size: 12px; margin-top: 8px;">
        数值越高文件越大、越清晰
      </div>
    </a-modal>

    <a-button type="primary" @click="exportToPDF" id="export-button">导出PDF</a-button>
  </div>
  <div class="preview" ref="resumePreview" @mousedown="startDragging" @wheel.prevent="handleZoom">
    <div class="resume-content" :style="contentStyle">
      <!-- 动态渲染当前选中的模板组件 -->
      <component :is="currentComponent" :colorShades="colorShades" />
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount, nextTick, watch, defineAsyncComponent, type ComponentOptions } from "vue";
import { getTemplates } from "../../../utils/getTemplates";
import type { Template } from "../../../types/template";
import { useResumeStore } from "../../../store";
import { generateColorShades } from "../../../utils/colorUtils";
import html2pdf from "html2pdf.js";
import { createApp } from 'vue';
import { storeToRefs } from 'pinia'
import { message } from "ant-design-vue";

// 设置项通过 computed 双向映射到 Store，保证弹窗修改后可立即预览并持久化。
const resumeStore = useResumeStore();
const { resumeSetting } = storeToRefs(resumeStore);
const themeColor1 = computed({
  get: () => resumeSetting.value.themeColor1,
  set: (val) => resumeStore.updateResumeSetting({ themeColor1: val })
})
const themeColor2 = computed({
  get: () => resumeSetting.value.themeColor2,
  set: (val) => resumeStore.updateResumeSetting({ themeColor2: val })
});
const fontSize = computed({
  get: () => resumeSetting.value.fontSize,
  set: (val) => resumeStore.updateResumeSetting({ fontSize: val })
})

const sectionSpacing = computed({
  get: () => resumeSetting.value.sectionSpacing,
  set: (val) => resumeStore.updateResumeSetting({ sectionSpacing: val })
})

const paragraphSpacing = computed({
  get: () => resumeSetting.value.paragraphSpacing,
  set: (val) => resumeStore.updateResumeSetting({ paragraphSpacing: val })
})
// currentTemplate 是模板市场、预览页和历史快照共同使用的模板标识。
const currentTemplate = computed({
  get: () => resumeSetting.value.currentTemplate,
  set: (val) => resumeStore.updateResumeSetting({ currentTemplate: val })
})
const padding_left_right = computed({
  get: () => resumeSetting.value.padding_left_right,
  set: (val) => resumeStore.updateResumeSetting({ padding_left_right: val })
})
const padding_top_bottom = computed({
  get: () => resumeSetting.value.padding_top_bottom,
  set: (val) => resumeStore.updateResumeSetting({ padding_top_bottom: val })
})
// 模板只接收色阶对象，不直接依赖原始主题色，便于不同模板复用同一套配色计算。
const colorShades = ref(generateColorShades(resumeSetting.value.themeColor1));

// 使用 glob 建立模板目录到组件的映射，新增模板时只要维护 templates.json 和模板目录即可。
const templateModules = import.meta.glob('../../../template/**/index.vue');
const templates = ref<Template[]>([]);
const currentComponent = ref();

onMounted(async () => {
  try {
    templates.value = await getTemplates();
    if (currentTemplate.value) {
      loadCurrentTemplate();
    } else {
      // 没有历史选择时默认使用第一套模板，保证预览区首次进入可渲染。
      currentTemplate.value = templates.value[0].id;
      loadCurrentTemplate();
    }
  } catch (error) {
    console.error('获取模板列表失败:', error);
  }
});

// 监听模板 ID 变化，保持设置弹窗、模板市场和预览区域同步。
watch(currentTemplate, (newId) => {
  handleTemplateChange(newId);
});

const handleTemplateChange = (id: String | null) => {
  if (!id) return;
  const selectedTemplate = templates.value.find(t => t.id === id);
  if (selectedTemplate) {
    currentTemplate.value = selectedTemplate.id;
    loadCurrentTemplate();
  }
};

/**
 * 加载当前模板组件。
 * 回退策略：配置中 folderPath 或组件文件缺失时回退到第一套模板，避免页面因单个模板配置错误而白屏。
 */
const loadCurrentTemplate = () => {
  const selectedTemplate = templates.value.find(t => t.id === currentTemplate.value);
  if (selectedTemplate?.folderPath) {
    const folderName = selectedTemplate.folderPath;
    if (!folderName) {
      console.error('模板路径错误:', selectedTemplate.folderPath);
      currentTemplate.value = templates.value[0].id;
      loadCurrentTemplate();
      return;
    }
    const importPath = `../../../template/${folderName}/index.vue`;
    const importFunc = templateModules[importPath];
    if (importFunc) {
      currentComponent.value = defineAsyncComponent(() => importFunc() as Promise<typeof import('*.vue')['default']>);
    } else {
      currentTemplate.value = templates.value[0].id;
      loadCurrentTemplate();
      console.error(`未找到路径为 ${importPath} 的组件`);
    }
  }
};

let open = ref(false);
const resumeSettingClick = () => {
  open.value = true;
}

const resumeSettingClickOK = () => {
  open.value = false;
  message.success('设置成功');
}

// DPI 只影响导出清晰度，不改变页面预览缩放比例。
const dpiOptions = [72, 100, 150, 300, 400, 600];
const dpiModalOpen = ref(false);
const selectedDpi = ref(150);

// 先让用户选择 DPI，再进入实际导出流程。
const exportToPDF = () => {
  dpiModalOpen.value = true;
};

/**
 * 按当前模板和 DPI 导出 PDF。
 * 设计意图：导出使用临时离屏容器重新渲染模板，避免把预览区拖拽/缩放 transform 带入 PDF。
 * 清理要求：进入 html2pdf 流程后在 finally 中移除临时容器，防止多次导出后 DOM 堆积。
 */
const confirmExport = async () => {
  dpiModalOpen.value = false;
  const scale = selectedDpi.value / 96;
  await nextTick();
  const tempContainer = document.createElement("div");
  tempContainer.style.position = "absolute";
  tempContainer.style.top = "-9999px";
  document.body.appendChild(tempContainer);

  const content = document.createElement("div");
  content.classList.add("resume-content");

  const selectedTemplate = templates.value.find(t => t.id === currentTemplate.value);
  if (selectedTemplate?.folderPath) {
    const importPath = `../../../template/${selectedTemplate.folderPath}/index.vue`;
    const importFunc = templateModules[importPath];

    if (importFunc) {
      const { default: Component } = await importFunc() as { default: ComponentOptions };
      const app = createApp(Component, {
        colorShades: colorShades.value,
      });
      app.mount(content);
      tempContainer.appendChild(content);
      await nextTick();
      const options = {
        filename: "resume.pdf",
        margin: 0,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: { scale: scale, useCORS: true },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      };
      html2pdf().from(content).set(options).save().finally(() => {
        document.body.removeChild(tempContainer);
      });
    } else {
      console.error(`未找到路径为 ${importPath} 的组件`);
    }

  }
};

// 预览区拖拽/缩放仅影响屏幕查看体验，不参与 PDF 导出。
onMounted(() => {
  updateBounds();
  window.addEventListener("resize", updateBounds);
});
const resumePreview = ref<HTMLElement | null>(null);

// 拖拽缩放状态集中维护，便于统一限制边界和生成 transform 样式。
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

// DOM 尺寸变化后重新计算边界，防止窗口缩放后内容被拖到不可见区域。
const updateBounds = async () => {
  await nextTick();
  if (resumePreview.value) {
    const container = resumePreview.value;
    const content = container.querySelector(".resume-content") as HTMLElement;
    if (content) {
      state.previewWidth = container.clientWidth;
      state.previewHeight = container.clientHeight;
      state.contentWidth = content.offsetWidth;
      state.contentHeight = content.offsetHeight;

      limitTranslation();
    }
  }
};

// 以鼠标位置为缩放中心，减少用户放大后需要重新拖动定位的操作。
const handleZoom = (event: WheelEvent) => {
  const zoomSpeed = 0.1;
  const oldScale = state.scale;

  if (event.deltaY < 0) {
    state.scale = Math.min(state.scale + zoomSpeed, 3);
  } else {
    state.scale = Math.max(state.scale - zoomSpeed, 0.2);
  }

  const rect = resumePreview.value?.getBoundingClientRect();
  if (rect) {
    const offsetX = event.clientX - rect.left - rect.width / 2 - state.translateX;
    const offsetY = event.clientY - rect.top - rect.height / 2 - state.translateY;
    state.translateX -= (offsetX / oldScale) * (state.scale - oldScale);
    state.translateY -= (offsetY / oldScale) * (state.scale - oldScale);
  }

  updateBounds();
};

// 限制拖动范围，确保至少 10% 的内容留在预览区域内，避免用户把页面拖丢。
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

  // 绑定到 document，避免鼠标移出预览区域后拖拽状态丢失。
  document.addEventListener("mousemove", onDragging);
  document.addEventListener("mouseup", stopDragging);
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
  document.removeEventListener("mousemove", onDragging);
  document.removeEventListener("mouseup", stopDragging);
};

// 将拖拽缩放状态集中转换为样式，模板组件本身不需要感知预览交互。
const contentStyle = computed(() => ({
  transform: `translate(-50%, -50%) translate(${state.translateX}px, ${state.translateY}px) scale(${state.scale})`,
  transformOrigin: "center center",
  cursor: state.dragging ? "grabbing" : "grab",
  willChange: "transform",
  transition: state.dragging ? "none" : "transform 0.2s ease",
}));



// 组件销毁前移除窗口尺寸监听，避免离开页面后仍触发预览边界重算。
onBeforeUnmount(() => {
  window.removeEventListener("resize", updateBounds);
});
</script>

<style scoped>
/* 导入外部css */
@import '../styles/styles.css';
</style>
