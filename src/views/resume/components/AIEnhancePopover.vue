<!--
  3-4 大模型润色组字段级润色入口。
  该组件挂载在经历、项目、荣誉和个人总结等字段旁，负责单字段 STAR 润色、建议展示和确认写回。
-->
<script setup lang="ts">
import { computed, defineComponent, h, ref } from "vue";
import { message } from "ant-design-vue";
import { useRouter } from "vue-router";
import { sendToQwenAIDialogue } from "../../../api/qwenAPI";
import { polishExperienceStar } from "../../../services/aiPolishService";
import { useResumeStore } from "../../../store";
import { ensureApiConfigured } from "../../../utils/aiConfigGuard";
import type { AIDialogue, DialogueHistory } from "../../../types/aiDialogue";
import type { ResumeContentSnapshot, TextGradOptimizationTrace } from "../../../types/resume";

const resumeStore = useResumeStore();
const router = useRouter();
const personalInfo = computed(() => resumeStore.personalInfo);
const props = defineProps({
  description: String,
  extend: String,
  fieldPath: String,
  originalText: String
});

const emit = defineEmits<{
  update: [content: string]
}>();

const AIReply = ref("");
const loading = ref(false);
const AIextent = ref(false);
const triggerOpen = ref(false);
const fieldReviewOpen = ref(false);
const requestFailed = ref(false);
const suggestions = ref<string[]>([]);
const optimizationTrace = ref<TextGradOptimizationTrace | null>(null);
const activeFieldPath = ref("");
const activeOriginalText = ref("");
const reviewSnapshot = ref<ResumeContentSnapshot | null>(null);
const canApply = computed(() => !!AIReply.value && AIReply.value.trim().length > 0 && !requestFailed.value);

const showTitle = computed(() => {
  if (!props.description || props.description.length < 5) {
    return "补充更多内容后可使用 AI 优化";
  }
  return "字段智能润色";
});

const buildPrompt = (text: string) => {
  return `我现在求职的 ${personalInfo.value.applicationPosition || "目标"} 岗位。\n${text}`;
};

const getOriginalText = (prompt: string) => props.originalText || prompt;

const compactText = (text: string, maxLength = 86) => {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  if (!normalized) return "等待模型返回";
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
};

const traceBubbles = computed(() => {
  if (!optimizationTrace.value) {
    return [
      { title: "Input", text: "读取字段原文与简历上下文" },
      { title: "AI", text: AIextent.value ? "生成扩展方向" : "等待 TextGrad 反馈" },
      { title: "Output", text: "用户确认后再写回" }
    ];
  }
  return [
    { title: "Forward", text: compactText(optimizationTrace.value.draft) },
    { title: "Gradient", text: compactText(optimizationTrace.value.textualGradient) },
    { title: "Optimizer", text: compactText(optimizationTrace.value.optimized) }
  ];
});

type ResumePreviewItem = {
  title?: string;
  meta?: string;
  body: string[];
};

type ResumePreviewSection = {
  title: string;
  items: ResumePreviewItem[];
};

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

const parseFieldPath = (fieldPath: string): Array<string | number> => {
  const parts: Array<string | number> = [];
  const pattern = /([^[.\]]+)|\[(\d+)\]/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(fieldPath)) !== null) {
    parts.push(match[2] === undefined ? match[1] : Number(match[2]));
  }
  return parts;
};

const setValueByFieldPath = (root: Record<string, unknown>, fieldPath: string, value: string) => {
  const parts = parseFieldPath(fieldPath);
  let target: unknown = root;
  for (let index = 0; index < parts.length - 1; index += 1) {
    if (!target || typeof target !== "object") return;
    target = (target as Record<string, unknown>)[parts[index] as keyof typeof target];
  }
  if (!target || typeof target !== "object") return;
  (target as Record<string, unknown>)[parts[parts.length - 1] as keyof typeof target] = value;
};

const optimizedSnapshot = computed<ResumeContentSnapshot | null>(() => {
  if (!reviewSnapshot.value) return null;
  const snapshot = clone(reviewSnapshot.value);
  if (activeFieldPath.value && AIReply.value.trim()) {
    setValueByFieldPath(snapshot as unknown as Record<string, unknown>, activeFieldPath.value, AIReply.value.trim());
  }
  return snapshot;
});

const toLines = (value?: string | null) =>
  String(value || "")
    .split(/\n+/)
    .map(item => item.trim())
    .filter(Boolean);

const buildResumeSections = (snapshot: ResumeContentSnapshot | null): ResumePreviewSection[] => {
  if (!snapshot) return [];
  const info = snapshot.personalInfo;
  const sections: ResumePreviewSection[] = [
    {
      title: "个人信息",
      items: [{
        title: `${info.name || "未填写姓名"} · ${info.applicationPosition || "目标岗位未填写"}`,
        meta: [info.university, info.major, info.phone, info.email].filter(Boolean).join(" / "),
        body: [info.politicalStatus, info.age ? `${info.age} 岁` : ""].filter(Boolean)
      }]
    },
    {
      title: "教育经历",
      items: snapshot.education.map(item => ({
        title: [item.school, item.degree, item.major].filter(Boolean).join(" · "),
        meta: [item.startDate, item.endDate].filter(Boolean).join(" - "),
        body: []
      }))
    },
    {
      title: "项目经历",
      items: snapshot.projects.map(item => ({
        title: [item.projectName, item.role].filter(Boolean).join(" · "),
        meta: [item.startDate, item.endDate].filter(Boolean).join(" - "),
        body: [...toLines(item.briefIntroduction), ...toLines(item.description)]
      }))
    },
    {
      title: "工作经历",
      items: snapshot.workExperience.map(item => ({
        title: [item.company, item.position].filter(Boolean).join(" · "),
        meta: [item.startDate, item.endDate].filter(Boolean).join(" - "),
        body: toLines(item.description)
      }))
    },
    {
      title: "专业技能",
      items: snapshot.skills.map(item => ({ body: [item.skillName] }))
    },
    {
      title: "荣誉奖项",
      items: snapshot.honors.map(item => ({
        title: item.honorName,
        meta: item.date,
        body: toLines(item.description)
      }))
    },
    {
      title: "个人总结",
      items: [{ body: toLines(snapshot.summary) }]
    }
  ];
  return sections.filter(section => section.items.length > 0);
};

const originalResumeSections = computed(() => buildResumeSections(reviewSnapshot.value));
const optimizedResumeSections = computed(() => buildResumeSections(optimizedSnapshot.value));

const ResumeSnapshotView = defineComponent({
  name: "FieldResumeSnapshotView",
  props: {
    sections: {
      type: Array as () => ResumePreviewSection[],
      required: true
    }
  },
  setup(props) {
    return () => h("div", { class: "snapshot-view" }, props.sections.map(section =>
      h("section", { class: "snapshot-section", key: section.title }, [
        h("h3", section.title),
        ...section.items.map((item, index) =>
          h("article", { class: "snapshot-item", key: `${section.title}-${index}` }, [
            item.title ? h("div", { class: "snapshot-item-title" }, item.title) : null,
            item.meta ? h("div", { class: "snapshot-item-meta" }, item.meta) : null,
            item.body.length ? h("ul", item.body.map((line, lineIndex) => h("li", { key: lineIndex }, line))) : null
          ])
        )
      ])
    ));
  }
});

const fieldTitle = computed(() => {
  if (activeFieldPath.value.includes("workExperience")) return "工作经历润色";
  if (activeFieldPath.value.includes("projects") && activeFieldPath.value.includes("briefIntroduction")) return "项目简介润色";
  if (activeFieldPath.value.includes("projects")) return "项目经历润色";
  if (activeFieldPath.value.includes("honors")) return "荣誉描述润色";
  if (activeFieldPath.value === "summary") return "个人总结润色";
  return AIextent.value ? "扩展方向建议" : "字段润色建议";
});

const diffHint = computed(() => {
  const oldLength = activeOriginalText.value.trim().length;
  const newLength = AIReply.value.trim().length;
  if (loading.value) return "等待模型返回候选结果";
  if (!AIReply.value.trim()) return "暂无候选结果";
  if (newLength > oldLength) return `表达扩展 +${newLength - oldLength} 字`;
  if (newLength < oldLength) return `表达压缩 ${oldLength - newLength} 字`;
  return "表达结构调整";
});

const handleAiEnhance = async (prompt: string, isExtend: boolean) => {
  // 3-4 组字段级 STAR 润色入口：只把当前字段和简历上下文交给模型，确认后才写回。
  if (!prompt || prompt.length < 5) return;
  if (!ensureApiConfigured(router)) return;
  AIextent.value = isExtend;
  loading.value = true;
  requestFailed.value = false;
  AIReply.value = "";
  suggestions.value = [];
  optimizationTrace.value = null;
  activeFieldPath.value = props.fieldPath || "";
  activeOriginalText.value = getOriginalText(prompt);
  reviewSnapshot.value = resumeStore.getResumeSnapshot();
  fieldReviewOpen.value = true;
  triggerOpen.value = false;
  try {
    if (!isExtend && props.fieldPath) {
      const result = await polishExperienceStar({
        snapshot: resumeStore.getResumeSnapshot(),
        fieldPath: props.fieldPath,
        originalText: activeOriginalText.value,
        targetPosition: personalInfo.value.applicationPosition
      });
      AIReply.value = result.polishedText;
      suggestions.value = result.suggestions;
      optimizationTrace.value = result.optimizationTrace || null;
      loading.value = false;
      return;
    }

    const aiMessage: AIDialogue = {
      role: "user",
      content: buildPrompt(prompt)
    };
    const messages: DialogueHistory = [aiMessage];
    await sendToQwenAIDialogue(
      messages,
      (text, isComplete) => {
        AIReply.value = text;
        if (isComplete) {
          loading.value = false;
        }
      }
    );
  } catch (error) {
    console.error("AI 处理失败:", error);
    AIReply.value = "AI 处理失败，请稍后再试。";
    requestFailed.value = true;
    loading.value = false;
  }
};

const handleApply = () => {
  const content = AIReply.value.trim();
  if (!content) return;

  if (activeFieldPath.value) {
    const result = resumeStore.applyPolishOperations([{
      fieldPath: activeFieldPath.value,
      oldValue: activeOriginalText.value,
      newValue: content
    }]);
    if (result.applied.length > 0) {
      emit("update", content);
      message.success("AI 润色结果已应用");
      fieldReviewOpen.value = false;
      reviewSnapshot.value = resumeStore.getResumeSnapshot();
    }
    if (result.skipped.length > 0) {
      message.warning(`未应用：${result.skipped[0].reason}`);
    }
    return;
  }
  emit("update", content);
  fieldReviewOpen.value = false;
};
</script>

<template>
  <a-popover v-model:open="triggerOpen" :title="showTitle" trigger="click" placement="right" arrowPointAtCenter="true">
    <template #content v-if="description && description.length > 4">
      <div class="field-ai-popover">
        <div class="ai-controls">
          <a-button class="primary-action" @click="handleAiEnhance(description, false)" :loading="loading && !AIextent"
            :disabled="loading && AIextent">
            智能润色
          </a-button>
          <a-button class="ghost-action" @click="extend && handleAiEnhance(extend, true)" :loading="loading && AIextent"
            :disabled="loading && !AIextent">扩展方向</a-button>
        </div>
        <p class="popover-tip">润色结果会在全屏审阅层展示，可先查看完整简历对比，再决定是否写回。</p>
      </div>
    </template>
    <slot />
  </a-popover>

  <teleport to="body">
    <div v-if="fieldReviewOpen" class="field-review-overlay">
      <div class="field-review-shell">
        <header class="field-review-header">
          <div>
            <p class="eyebrow">TextGrad Field Review</p>
            <h2>{{ fieldTitle }}</h2>
            <span>左侧为原完整简历，右侧为候选结果写入后的完整简历，中间展示本次修改流。</span>
          </div>
          <div class="field-review-actions">
            <a-button v-if="!AIextent" :disabled="!canApply || loading" @click="handleApply">应用结果</a-button>
            <a-button @click="fieldReviewOpen = false">关闭</a-button>
          </div>
        </header>

        <a-spin :spinning="loading">
          <main class="field-review-grid">
            <section class="resume-paper">
              <div class="paper-header">
                <span>润色前</span>
                <strong>原完整简历</strong>
              </div>
              <div class="resume-document">
                <ResumeSnapshotView :sections="originalResumeSections" />
              </div>
            </section>

            <aside class="field-change-column">
              <div class="change-column-title">
                <span>修改流</span>
                <b>1</b>
              </div>

              <div class="field-change-popover">
                <i>1</i>
                <strong>{{ fieldTitle }}</strong>
                <small>{{ activeFieldPath ? fieldTitle : "扩展方向" }}</small>
                <em>{{ diffHint }}</em>
              </div>

              <div class="flow-stack">
                <div v-for="(item, index) in traceBubbles" :key="`${item.title}-${index}`" class="flow-bubble">
                  <b>{{ item.title }}</b>
                  <small>{{ item.text }}</small>
                </div>
              </div>

              <section class="candidate-editor">
                <span>候选结果</span>
                <a-textarea v-model:value="AIReply" :auto-size="{ minRows: 8, maxRows: 14 }" :disabled="loading" />
              </section>

              <div v-if="suggestions.length" class="suggestion-row">
                <span v-for="item in suggestions" :key="item">{{ item }}</span>
              </div>
            </aside>

            <section class="resume-paper is-after">
              <div class="paper-header">
                <span>润色后</span>
                <strong>修改后完整简历</strong>
              </div>
              <div class="resume-document">
                <ResumeSnapshotView :sections="optimizedResumeSections" />
              </div>
            </section>
          </main>
        </a-spin>
      </div>
    </div>
  </teleport>
</template>

<style scoped>
.field-ai-popover {
  position: relative;
  isolation: isolate;
  width: 280px;
  padding-top: 4px;
  color: #172033;
}

.field-ai-popover::after {
  content: "3-4 组";
  position: absolute;
  right: 0;
  top: 0;
  z-index: 0;
  color: rgba(37, 99, 235, 0.18);
  font-size: 12px;
  font-weight: 900;
  pointer-events: none;
}

.field-ai-popover > * {
  position: relative;
  z-index: 1;
}

.ai-controls {
  display: flex;
  gap: 10px;
  margin-bottom: 14px;
}

.popover-tip {
  margin: 0;
  color: #64748b;
  font-size: 12px;
  line-height: 1.6;
}

.primary-action,
.ghost-action {
  border-radius: 999px;
  font-weight: 700;
}

.primary-action {
  border: none;
  background: #172033;
  color: #fff;
}

.ghost-action {
  border: 1px solid rgba(23, 32, 51, 0.14);
  color: #172033;
}

.mini-workbench {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 168px minmax(0, 1fr);
  gap: 12px;
}

.mini-panel {
  min-height: 190px;
  padding: 12px;
  border: 1px solid rgba(100, 116, 139, 0.16);
  border-radius: 16px;
  background: #f8fafc;
}

.mini-panel.is-after {
  border-color: rgba(22, 163, 74, 0.26);
  background: #f7fdf9;
}

.mini-panel span {
  display: block;
  margin-bottom: 8px;
  color: #64748b;
  font-size: 12px;
  font-weight: 700;
}

.mini-panel p {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  color: #172033;
  font-size: 12px;
  line-height: 1.7;
}

.mini-flow {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 10px;
}

.mini-flow::before {
  content: "";
  position: absolute;
  left: 18px;
  top: 14px;
  bottom: 14px;
  width: 2px;
  background: linear-gradient(#2563eb, #7c3aed, #16a34a);
  border-radius: 999px;
}

.flow-bubble {
  position: relative;
  z-index: 1;
  min-height: 58px;
  padding: 9px 9px 9px 40px;
  border: 1px solid rgba(37, 99, 235, 0.14);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 10px 20px rgba(15, 23, 42, 0.08);
}

.flow-bubble::before {
  content: "";
  position: absolute;
  left: 10px;
  top: 18px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #172033;
}

.flow-bubble b,
.flow-bubble small {
  display: block;
}

.flow-bubble b {
  color: #111827;
  font-size: 12px;
}

.flow-bubble small {
  margin-top: 3px;
  color: #64748b;
  font-size: 11px;
  line-height: 1.35;
}

.suggestion-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 12px;
}

.suggestion-row span {
  padding: 8px 10px;
  border-radius: 12px;
  background: #fff7ed;
  color: #9a3412;
  font-size: 12px;
}

.apply-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 12px;
}

.field-review-overlay {
  position: fixed;
  inset: 0;
  z-index: 3200;
  padding: 22px;
  background: rgba(10, 18, 32, 0.58);
  backdrop-filter: blur(18px);
}

.field-review-shell {
  position: relative;
  isolation: isolate;
  width: 100%;
  height: 100%;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 16px;
  padding: 20px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.56);
  border-radius: 24px;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.98), rgba(245, 248, 252, 0.96)),
    radial-gradient(circle at 48% 0%, rgba(37, 99, 235, 0.14), transparent 32%);
  box-shadow: 0 24px 80px rgba(15, 23, 42, 0.28);
}

.field-review-shell::after {
  content: "3-4 大模型润色组";
  position: absolute;
  right: 32px;
  bottom: 28px;
  z-index: 0;
  color: rgba(15, 23, 42, 0.055);
  font-size: 42px;
  font-weight: 900;
  letter-spacing: 0;
  pointer-events: none;
  transform: rotate(-10deg);
  white-space: nowrap;
}

.field-review-shell > * {
  position: relative;
  z-index: 1;
}

.field-review-shell :deep(.ant-spin-nested-loading),
.field-review-shell :deep(.ant-spin-container) {
  height: 100%;
}

.field-review-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
}

.eyebrow {
  margin: 0 0 4px;
  color: #4f6f9f;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0;
}

.field-review-header h2 {
  margin: 0;
  color: #0f172a;
  font-size: 28px;
  font-weight: 900;
  letter-spacing: 0;
}

.field-review-header span {
  display: block;
  margin-top: 5px;
  color: #64748b;
  font-size: 13px;
}

.field-review-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 10px;
}

.field-review-actions :deep(.ant-btn) {
  height: 36px;
  border-radius: 999px;
  font-weight: 700;
}

.field-review-grid {
  height: 100%;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 330px minmax(0, 1fr);
  gap: 16px;
}

.resume-paper,
.field-change-column {
  min-height: 0;
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.84);
  box-shadow: 0 16px 40px rgba(15, 23, 42, 0.08);
}

.resume-paper {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  overflow: hidden;
}

.resume-paper.is-after {
  border-color: rgba(22, 163, 74, 0.28);
  background: rgba(248, 255, 251, 0.9);
}

.paper-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.16);
}

.paper-header span {
  color: #64748b;
  font-size: 12px;
  font-weight: 700;
}

.paper-header strong {
  color: #0f172a;
  font-size: 16px;
}

.resume-document {
  min-height: 0;
  overflow-y: auto;
  padding: 20px 24px;
  scrollbar-width: thin;
}

:deep(.snapshot-view) {
  color: #172033;
}

:deep(.snapshot-section) {
  margin-bottom: 18px;
}

:deep(.snapshot-section h3) {
  margin: 0 0 10px;
  padding-left: 10px;
  border-left: 4px solid #2563eb;
  color: #0f172a;
  font-size: 16px;
  font-weight: 900;
}

:deep(.snapshot-item) {
  margin-bottom: 12px;
  padding: 12px 14px;
  border-radius: 14px;
  background: rgba(248, 250, 252, 0.86);
}

:deep(.snapshot-item-title) {
  color: #111827;
  font-size: 14px;
  font-weight: 800;
}

:deep(.snapshot-item-meta) {
  margin-top: 3px;
  color: #64748b;
  font-size: 12px;
}

:deep(.snapshot-item ul) {
  margin: 8px 0 0;
  padding-left: 18px;
}

:deep(.snapshot-item li) {
  margin-bottom: 4px;
  color: #334155;
  font-size: 12px;
  line-height: 1.7;
}

.field-change-column {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px;
  overflow-y: auto;
  scrollbar-width: thin;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.88), rgba(247, 249, 252, 0.9)),
    linear-gradient(90deg, transparent 50%, rgba(37, 99, 235, 0.08) 50%, transparent calc(50% + 2px));
}

.change-column-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.change-column-title span {
  color: #0f172a;
  font-size: 15px;
  font-weight: 900;
}

.change-column-title b {
  min-width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: #172033;
  color: #fff;
  font-size: 12px;
}

.field-change-popover {
  position: relative;
  padding: 13px 12px 12px 46px;
  border: 1px solid rgba(37, 99, 235, 0.18);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 14px 30px rgba(37, 99, 235, 0.12);
}

.field-change-popover i {
  position: absolute;
  left: 12px;
  top: 14px;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: #2563eb;
  color: #fff;
  font-size: 12px;
  font-style: normal;
  font-weight: 900;
}

.field-change-popover strong,
.field-change-popover small,
.field-change-popover em {
  display: block;
}

.field-change-popover strong {
  color: #111827;
  font-size: 14px;
}

.field-change-popover small {
  margin-top: 4px;
  color: #64748b;
  font-size: 11px;
  word-break: break-all;
}

.field-change-popover em {
  margin-top: 7px;
  color: #16a34a;
  font-size: 12px;
  font-style: normal;
  font-weight: 800;
}

.flow-stack {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.flow-stack::before {
  content: "";
  position: absolute;
  left: 18px;
  top: 14px;
  bottom: 14px;
  width: 2px;
  background: linear-gradient(#2563eb, #7c3aed, #16a34a);
  border-radius: 999px;
}

.candidate-editor {
  padding: 12px;
  border: 1px solid rgba(22, 163, 74, 0.22);
  border-radius: 16px;
  background: rgba(247, 253, 249, 0.9);
}

.candidate-editor span {
  display: block;
  margin-bottom: 8px;
  color: #166534;
  font-size: 12px;
  font-weight: 800;
}

:deep(.ant-input) {
  border-radius: 12px;
  font-size: 12px;
  line-height: 1.7;
}

@media (max-width: 1100px) {
  .field-ai-popover {
    width: 520px;
  }

  .mini-workbench {
    grid-template-columns: 1fr;
  }
}
</style>
