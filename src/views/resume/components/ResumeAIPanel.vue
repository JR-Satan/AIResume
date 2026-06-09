<template>
  <section class="ai-polish-panel">
    <div class="hero-row">
      <div>
        <p class="eyebrow">3-4 大模型润色组</p>
        <h3>简历智能优化工作台</h3>
        <p class="subtitle">先诊断质量与岗位结构，再按字段白名单生成可审阅、可写回的润色结果。</p>
        <div class="target-position-control">
          <span>目标岗位方向</span>
          <a-input
            v-model:value="targetPositionInput"
            allow-clear
            size="small"
            placeholder="如 Java 后端 / 数据分析 / 产品经理"
          />
        </div>
      </div>
      <div class="hero-actions">
        <div class="mode-control" aria-label="全文润色模式">
          <button
            v-for="option in polishModeOptions"
            :key="option.value"
            type="button"
            class="mode-option"
            :class="{ active: polishMode === option.value }"
            @click="polishMode = option.value"
          >
            {{ option.label }}
          </button>
        </div>
        <a-button class="ghost-action" :loading="evaluating" :disabled="batchPolishing || structureAnalyzing" @click="handleEvaluate">
          质量评分
        </a-button>
        <a-button class="ghost-action" :loading="structureAnalyzing" :disabled="evaluating || batchPolishing" @click="handleStructureAnalyze">
          岗位结构建议
        </a-button>
        <a-button class="primary-action" :loading="batchPolishing" :disabled="evaluating || structureAnalyzing" @click="handleBatchPolish">
          全文润色
        </a-button>
      </div>
    </div>

    <a-spin :spinning="evaluating || batchPolishing || structureAnalyzing">
      <div class="status-strip">
        <div class="status-pill">
          <span class="status-dot is-green"></span>
          字段白名单回写
        </div>
        <div class="status-pill">
          <span class="status-dot is-purple"></span>
          TextGrad 过程可视化
        </div>
        <div class="status-pill">
          <span class="status-dot is-blue"></span>
          原文/结果对比
        </div>
        <div class="status-pill">
          <span class="status-dot is-orange"></span>
          岗位结构建议
        </div>
      </div>

      <div class="defense-flow">
        <div
          v-for="(step, index) in defenseFlowSteps"
          :key="step.title"
          class="defense-flow-step"
          :class="{ active: step.active }"
        >
          <i>{{ index + 1 }}</i>
          <span>{{ step.title }}</span>
        </div>
      </div>

      <div v-if="evaluation" class="compare-workbench">
        <div class="workbench-header">
          <div>
            <p class="eyebrow">质量评分</p>
            <h4>当前简历质量区间 {{ evaluationScoreBand.range }}（{{ evaluationScoreBand.label }}）</h4>
          </div>
          <a-button size="small" @click="evaluationOpen = true">全屏查看</a-button>
        </div>
        <p class="review-hint">质量评分已生成，点击全屏查看完整评分、总体意见和字段级建议。</p>
      </div>

      <div v-if="structureResult" class="compare-workbench">
        <div class="workbench-header">
          <div>
            <p class="eyebrow">岗位结构建议</p>
            <h4>面向 {{ structureResult.targetPosition }} 的结构评分 {{ structureResult.structureScore }} 分</h4>
          </div>
          <a-button size="small" @click="structureOpen = true">全屏查看</a-button>
        </div>
        <p class="review-hint">{{ structureResult.overallJudgement }}</p>
      </div>

      <div v-if="batchResult?.optimizationTrace" class="textgrad-card">
        <div class="section-title">
          <span>TextGrad 优化流</span>
          <em>{{ batchResult.optimizationTrace.iterations }} 轮反馈</em>
        </div>
        <div class="flow-line">
          <div v-for="(stage, index) in traceStages" :key="stage.title" class="flow-stage">
            <div class="flow-index">{{ index + 1 }}</div>
            <h4>{{ stage.title }}</h4>
            <p>{{ stage.description }}</p>
            <span>{{ stage.content }}</span>
          </div>
        </div>
      </div>

      <div v-if="batchResult" class="compare-workbench">
        <div class="workbench-header">
          <div>
            <p class="eyebrow">批量润色结果</p>
            <h4>{{ batchResult.summary || `生成 ${batchResult.operations.length} 处可应用修改` }}</h4>
          </div>
          <a-space>
            <a-button size="small" :disabled="!batchResult.operations.length" @click="reviewOpen = true">
              全屏审阅
            </a-button>
          </a-space>
        </div>
        <p class="review-hint">
          润色完成后将进入全屏审阅：左侧是原完整简历，右侧是修改后的完整简历，中间展示每一处修改。
          {{ batchResult.usedStructureAdvice ? '本次润色已参考岗位结构建议。' : '可先生成岗位结构建议，让全文润色更有整体方向。' }}
        </p>
        <div v-if="batchResult.safety" class="safety-strip">
          <span>模式：{{ batchResult.mode === 'fast' ? '快速润色' : '深度润色' }}</span>
          <span>允许字段 {{ batchResult.safety.allowedFieldCount }} 个</span>
          <span>通过 {{ batchResult.safety.acceptedOperationCount }} 条</span>
          <span>拦截 {{ batchResult.safety.blockedOperationCount }} 条</span>
        </div>
      </div>

      <div v-if="visibleSuggestions.length" class="suggestion-card">
        <div class="section-title">
          <span>修改建议</span>
          <em>{{ visibleSuggestions.length }} 条</em>
        </div>
        <div class="suggestion-grid">
          <div v-for="item in visibleSuggestions" :key="`${item.fieldPath || 'global'}-${item.problem}`" class="suggestion-item">
            <code>{{ fieldLabel(item.fieldPath) }}</code>
            <b>{{ item.problem }}</b>
            <p>{{ item.advice }}</p>
          </div>
        </div>
      </div>
    </a-spin>

    <teleport to="body">
      <div v-if="reviewOpen && batchResult" class="review-overlay">
        <div class="review-shell">
          <header class="review-header">
            <div>
              <p class="eyebrow">TextGrad Review</p>
              <h2>全文润色审阅</h2>
              <span>
                左侧保留原完整简历，右侧展示应用全部修改后的完整简历。
                {{ batchResult.mode === 'fast' ? '快速模式用于快速生成候选修改。' : '深度模式保留 TextGrad 反馈优化过程。' }}
              </span>
            </div>
            <div class="review-actions">
              <a-button :disabled="!selectedOperation" @click="handleApplySelected">应用当前修改</a-button>
              <a-button type="primary" :disabled="!batchResult.operations.length" @click="handleApplyBatch">应用全部修改</a-button>
              <a-button @click="reviewOpen = false">关闭</a-button>
            </div>
          </header>

          <div v-if="selectedOperation" class="current-change-strip">
            <span>当前第 {{ selectedOperationIndex + 1 }} / {{ batchResult.operations.length }} 处</span>
            <b>{{ fieldLabel(selectedOperation.fieldPath) }}</b>
            <em>{{ batchResult.usedStructureAdvice ? '已参考岗位结构建议' : '字段级安全润色' }}</em>
          </div>

          <div v-if="batchResult.safety" class="review-safety-grid">
            <div>
              <span>白名单字段</span>
              <b>{{ batchResult.safety.allowedFieldCount }}</b>
            </div>
            <div>
              <span>AI 返回修改</span>
              <b>{{ batchResult.safety.returnedOperationCount }}</b>
            </div>
            <div>
              <span>允许写回</span>
              <b>{{ batchResult.safety.acceptedOperationCount }}</b>
            </div>
            <div>
              <span>安全拦截</span>
              <b>{{ batchResult.safety.blockedOperationCount }}</b>
            </div>
          </div>

          <div v-if="traceStages.length" class="review-flow">
            <div v-for="stage in traceStages" :key="stage.title" class="review-flow-node">
              <b>{{ stage.title }}</b>
              <span>{{ stage.description }}</span>
            </div>
          </div>

          <main class="review-grid">
            <section class="resume-paper">
              <div class="paper-header">
                <span>润色前</span>
                <strong>原完整简历</strong>
              </div>
              <div class="resume-document">
                <ResumeSnapshotView :sections="originalResumeSections" :highlight-paths="selectedOperationHighlightPaths" />
              </div>
            </section>

            <aside class="change-column">
              <div class="change-column-title">
                <span>修改流</span>
                <b>{{ batchResult.operations.length }}</b>
              </div>
              <article
                v-for="(operation, index) in batchResult.operations"
                :key="`${operation.fieldPath}-${index}`"
                class="review-change-popover"
                :class="{ active: selectedOperationIndex === index, expanded: expandedOperationIndex === index }"
                role="button"
                tabindex="0"
                @click="handleSelectOperation(index)"
                @keydown.enter.prevent="handleSelectOperation(index)"
              >
                <i>{{ index + 1 }}</i>
                <strong>{{ operationTitle(operation.fieldPath) }}</strong>
                <small>{{ fieldLabel(operation.fieldPath) }}</small>
                <em>{{ diffHint(operation.oldValue, operation.newValue) }}</em>
                <span class="open-hint">{{ expandedOperationIndex === index ? '收起详情' : '点击查看详情' }}</span>
                <div v-if="expandedOperationIndex === index" class="operation-detail" @click.stop>
                  <div>
                    <b>原文</b>
                    <p>{{ operation.oldValue }}</p>
                  </div>
                  <div class="is-after">
                    <b>修改后</b>
                    <p>{{ operation.newValue }}</p>
                  </div>
                </div>
              </article>
              <a-empty v-if="!batchResult.operations.length" description="暂无待应用修改" />
            </aside>

            <section class="resume-paper is-after">
              <div class="paper-header">
                <span>润色后</span>
                <strong>修改后完整简历</strong>
              </div>
              <div class="resume-document">
                <ResumeSnapshotView :sections="optimizedResumeSections" :highlight-paths="selectedOperationHighlightPaths" />
              </div>
            </section>
          </main>
        </div>
      </div>
    </teleport>

    <teleport to="body">
      <div v-if="evaluationOpen" class="evaluation-overlay">
        <div class="evaluation-shell">
          <header class="review-header">
            <div>
              <p class="eyebrow">Quality Scoring</p>
              <h2>质量评分报告</h2>
              <span>全屏展示评分、总体意见和字段级建议，不再挤在左侧面板中。</span>
            </div>
            <div class="review-actions">
              <a-button :disabled="!evaluation" @click="copyEvaluationReport">复制汇报文本</a-button>
              <a-button @click="evaluationOpen = false">关闭</a-button>
            </div>
          </header>

          <a-spin :spinning="evaluating">
            <main v-if="evaluation" class="evaluation-grid">
              <section class="evaluation-score-panel">
                <div class="total-score">
                  <span>综合质量区间</span>
                  <strong>{{ evaluationScoreBand.range }}</strong>
                  <small>{{ evaluationScoreBand.label }} · 参考值 {{ evaluation.scores.total }}</small>
                </div>
                <div class="score-grid is-evaluation">
                  <div v-for="item in scoreCards" :key="item.key" class="score-item">
                    <span>{{ item.label }}</span>
                    <b>{{ item.band.range }}</b>
                    <small>{{ item.band.label }} · {{ item.value }}</small>
                    <div class="score-bar">
                      <i :style="{ width: `${item.value}%` }"></i>
                    </div>
                  </div>
                </div>
              </section>

              <section class="evaluation-section">
                <div class="section-title">
                  <span>总体意见</span>
                </div>
                <div class="comment-row is-evaluation">
                  <span v-for="item in evaluation.comments" :key="item">{{ item }}</span>
                </div>
              </section>

              <section class="evaluation-section">
                <div class="section-title">
                  <span>修改建议</span>
                  <em>{{ evaluation.suggestions.length }} 条</em>
                </div>
                <div class="suggestion-grid is-evaluation">
                  <div v-for="item in evaluation.suggestions" :key="`${item.fieldPath || 'global'}-${item.problem}`" class="suggestion-item">
                    <code>{{ fieldLabel(item.fieldPath) }}</code>
                    <b>{{ item.problem }}</b>
                    <p>{{ item.advice }}</p>
                  </div>
                </div>
              </section>
            </main>

            <div v-else class="evaluation-loading">
              <strong>正在生成质量评分报告</strong>
              <span>模型会从完整度、专业度、可读性和岗位匹配度四个维度快速评分。</span>
            </div>
          </a-spin>
        </div>
      </div>
    </teleport>

    <teleport to="body">
      <div v-if="structureOpen" class="evaluation-overlay structure-overlay">
        <div class="evaluation-shell structure-shell">
          <header class="review-header">
            <div>
              <p class="eyebrow">Position Strategy</p>
              <h2>岗位结构建议</h2>
              <span>分析模块顺序、经历取舍和内容增减建议，不直接改写简历文本。</span>
            </div>
            <div class="review-actions">
              <a-button :disabled="!structureResult" @click="copyStructureReport">复制汇报文本</a-button>
              <a-button @click="structureOpen = false">关闭</a-button>
            </div>
          </header>

          <a-spin :spinning="structureAnalyzing">
            <main v-if="structureResult" class="structure-grid">
              <section class="structure-score-panel">
                <div class="total-score is-structure">
                  <span>结构评分</span>
                  <strong>{{ structureResult.structureScore }}</strong>
                </div>
                <div class="structure-target">
                  <span>目标岗位</span>
                  <b>{{ structureResult.targetPosition }}</b>
                </div>
                <p>{{ structureResult.overallJudgement }}</p>
              </section>

              <section class="structure-section">
                <div class="structure-filter">
                  <span>优先级筛选</span>
                  <div class="mode-control is-compact">
                    <button
                      v-for="option in priorityFilterOptions"
                      :key="option.value"
                      type="button"
                      class="mode-option"
                      :class="{ active: structurePriorityFilter === option.value }"
                      @click="structurePriorityFilter = option.value"
                    >
                      {{ option.label }}
                    </button>
                  </div>
                </div>
                <div v-for="group in filteredStructureAdviceGroups" :key="group.title" class="structure-advice-group">
                  <div class="section-title">
                    <span>{{ group.title }}</span>
                    <em>{{ group.items.length }} 条</em>
                  </div>
                  <div class="structure-advice-list">
                    <article v-for="item in group.items" :key="`${group.title}-${item.title}`" class="structure-advice" :class="`priority-${item.priority}`">
                      <span>{{ priorityLabel(item.priority) }}</span>
                      <b>{{ item.title }}</b>
                      <small>{{ sectionLabel(item.relatedSection) }}</small>
                      <p>{{ item.problem }}</p>
                      <strong>{{ item.advice }}</strong>
                    </article>
                    <a-empty v-if="!group.items.length" description="暂无该类建议" />
                  </div>
                </div>
              </section>

              <section class="structure-section risk-section">
                <div class="section-title">
                  <span>风险提醒</span>
                  <em>{{ structureResult.riskWarnings.length }} 条</em>
                </div>
                <div class="risk-list">
                  <span v-for="item in structureResult.riskWarnings" :key="item">{{ item }}</span>
                  <a-empty v-if="!structureResult.riskWarnings.length" description="暂无明显风险" />
                </div>
              </section>
            </main>

            <div v-else class="evaluation-loading">
              <strong>正在生成岗位结构建议</strong>
              <span>模型会围绕目标岗位分析模块顺序、经历取舍和内容补充方向。</span>
            </div>
          </a-spin>
        </div>
      </div>
    </teleport>
  </section>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, ref, watch } from 'vue';
import { message } from 'ant-design-vue';
import { useResumeStore } from '../../../store';
import { analyzeResumeStructure, batchPolishResume, evaluateResume } from '../../../services/aiPolishService';
import { getActivePromptSet } from '../../../services/promptSets';
import type {
  BatchPolishResult,
  BatchPolishMode,
  PolishOperation,
  ResumeContentSnapshot,
  ResumeEvaluation,
  ResumeStructureAnalysis,
  ResumeStructureAdvice,
  ResumeSuggestion
} from '../../../types/resume';

const resumeStore = useResumeStore();
const evaluating = ref(false);
const batchPolishing = ref(false);
const structureAnalyzing = ref(false);
const polishMode = ref<BatchPolishMode>('fast');
const structurePriorityFilter = ref<'all' | ResumeStructureAdvice['priority']>('all');
const targetPositionInput = ref(resumeStore.personalInfo.applicationPosition || '');
const evaluation = ref<ResumeEvaluation | null>(null);
const structureResult = ref<ResumeStructureAnalysis | null>(null);
const batchResult = ref<BatchPolishResult | null>(null);
const selectedOperationIndex = ref(0);
const expandedOperationIndex = ref<number | null>(null);
const reviewOpen = ref(false);
const evaluationOpen = ref(false);
const structureOpen = ref(false);
const originalSnapshot = ref<ResumeContentSnapshot | null>(null);
const evaluationCacheKey = ref('');
const structureCacheKey = ref('');
const batchCacheKey = ref('');
const evaluationCache = new Map<string, ResumeEvaluation>();

const polishModeOptions: Array<{ label: string; value: BatchPolishMode }> = [
  { label: '快速润色', value: 'fast' },
  { label: '深度润色', value: 'deep' }
];

const priorityFilterOptions: Array<{ label: string; value: 'all' | ResumeStructureAdvice['priority'] }> = [
  { label: '全部', value: 'all' },
  { label: '高', value: 'high' },
  { label: '中', value: 'medium' },
  { label: '低', value: 'low' }
];

const visibleSuggestions = computed<ResumeSuggestion[]>(() => [
  ...(batchResult.value?.suggestions || [])
]);

type ScoreBand = {
  range: string;
  label: string;
  description: string;
};

const getScoreBand = (score: number): ScoreBand => {
  if (score >= 90) {
    return { range: '90-100', label: '突出', description: '信息完整，岗位匹配和 STAR 表达都比较充分' };
  }
  if (score >= 85) {
    return { range: '85-89', label: '优秀', description: '整体质量较好，仅有少量可优化点' };
  }
  if (score >= 80) {
    return { range: '80-84', label: '良好', description: '基础较好，但经历结果或岗位关键词还可加强' };
  }
  if (score >= 70) {
    return { range: '70-79', label: '可提升', description: '可以支撑投递，但结构、结果或表达存在明显短板' };
  }
  if (score >= 60) {
    return { range: '60-69', label: '基础不足', description: '内容缺口较多，需要优先补全关键经历和结果' };
  }
  return { range: '0-59', label: '风险较高', description: '当前信息不足以稳定支撑目标岗位' };
};

const evaluationScoreBand = computed(() => getScoreBand(evaluation.value?.scores.total || 0));

const scoreCards = computed(() => {
  const scores = evaluation.value?.scores;
  if (!scores) return [];
  return [
    { key: 'completeness', label: '完整度', value: scores.completeness, band: getScoreBand(scores.completeness) },
    { key: 'professionalism', label: '专业度', value: scores.professionalism, band: getScoreBand(scores.professionalism) },
    { key: 'readability', label: '可读性', value: scores.readability, band: getScoreBand(scores.readability) },
    { key: 'jobMatch', label: '岗位匹配', value: scores.jobMatch, band: getScoreBand(scores.jobMatch) }
  ];
});

const defenseFlowSteps = computed(() => [
  { title: '读取简历', active: true },
  { title: '质量评分', active: Boolean(evaluation.value) },
  { title: '岗位结构建议', active: Boolean(structureResult.value) },
  { title: polishMode.value === 'deep' ? 'TextGrad 润色' : '快速润色', active: Boolean(batchResult.value) },
  { title: '安全校验', active: Boolean(batchResult.value?.safety) },
  { title: '确认写回', active: false }
]);

const selectedOperation = computed(() => {
  const operations = batchResult.value?.operations || [];
  return operations[selectedOperationIndex.value] || null;
});

const selectedOperationHighlightPaths = computed(() => {
  const fieldPath = selectedOperation.value?.fieldPath;
  return fieldPath ? [fieldPath] : [];
});

const structureAdviceGroups = computed<Array<{ title: string; items: ResumeStructureAdvice[] }>>(() => {
  if (!structureResult.value) return [];
  return [
    { title: '模块顺序建议', items: structureResult.value.sectionOrderSuggestions },
    { title: '经历取舍建议', items: structureResult.value.experienceSelectionSuggestions },
    { title: '内容补充建议', items: structureResult.value.missingContentSuggestions }
  ];
});

const filteredStructureAdviceGroups = computed(() => {
  if (structurePriorityFilter.value === 'all') return structureAdviceGroups.value;
  return structureAdviceGroups.value.map(group => ({
    ...group,
    items: group.items.filter(item => item.priority === structurePriorityFilter.value)
  }));
});

type ResumePreviewLine = {
  text: string;
  fieldPath?: string;
};

type ResumePreviewItem = {
  title?: string;
  meta?: string;
  body: ResumePreviewLine[];
  fieldPath?: string;
  fieldPaths?: string[];
};

type ResumePreviewSection = {
  title: string;
  items: ResumePreviewItem[];
};

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

const getEffectiveTargetPosition = (snapshot: ResumeContentSnapshot) =>
  targetPositionInput.value.trim() || snapshot.personalInfo.applicationPosition || '';

const createSnapshotCacheKey = (snapshot: ResumeContentSnapshot) =>
  {
    const promptSet = getActivePromptSet();
    return JSON.stringify({
      snapshot,
      targetPosition: getEffectiveTargetPosition(snapshot),
      promptSetId: promptSet.id,
      promptSetVersion: promptSet.version
    });
  };

const createBatchCacheKey = (
  snapshotKey: string,
  mode: BatchPolishMode,
  structureAdvice: ResumeStructureAnalysis | null
) => `${mode}::${snapshotKey}::${structureAdvice ? JSON.stringify(structureAdvice) : 'no-structure'}`;

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
    if (!target || typeof target !== 'object') return;
    target = (target as Record<string, unknown>)[parts[index] as keyof typeof target];
  }
  if (!target || typeof target !== 'object') return;
  (target as Record<string, unknown>)[parts[parts.length - 1] as keyof typeof target] = value;
};

const optimizedSnapshot = computed<ResumeContentSnapshot | null>(() => {
  if (!originalSnapshot.value) return null;
  const snapshot = clone(originalSnapshot.value);
  (batchResult.value?.operations || []).forEach(operation => {
    setValueByFieldPath(snapshot as unknown as Record<string, unknown>, operation.fieldPath, operation.newValue);
  });
  return snapshot;
});

const toLines = (value?: string | null, fieldPath?: string): ResumePreviewLine[] =>
  String(value || '')
    .split(/\n+/)
    .map(item => item.trim())
    .filter(Boolean)
    .map(text => ({ text, fieldPath }));

const compactLines = (items: Array<ResumePreviewLine | null | undefined>): ResumePreviewLine[] =>
  items.filter((item): item is ResumePreviewLine => Boolean(item?.text));

const buildResumeSections = (snapshot: ResumeContentSnapshot | null): ResumePreviewSection[] => {
  if (!snapshot) return [];
  const sections: ResumePreviewSection[] = [];
  const info = snapshot.personalInfo;
  sections.push({
    title: '个人信息',
    items: [{
      title: `${info.name || '未填写姓名'} · ${info.applicationPosition || '目标岗位未填写'}`,
      meta: [info.university, info.major, info.phone, info.email].filter(Boolean).join(' / '),
      body: compactLines([
        info.politicalStatus ? { text: info.politicalStatus, fieldPath: 'personalInfo.politicalStatus' } : null,
        info.age ? { text: `${info.age} 岁`, fieldPath: 'personalInfo.age' } : null
      ]),
      fieldPaths: [
        'personalInfo.name',
        'personalInfo.applicationPosition',
        'personalInfo.university',
        'personalInfo.major',
        'personalInfo.phone',
        'personalInfo.email',
        'personalInfo.politicalStatus',
        'personalInfo.age'
      ]
    }]
  });
  sections.push({
    title: '教育经历',
    items: snapshot.education.map((item, index) => ({
      title: [item.school, item.degree, item.major].filter(Boolean).join(' · '),
      meta: [item.startDate, item.endDate].filter(Boolean).join(' - '),
      body: [],
      fieldPaths: [
        `education[${index}].school`,
        `education[${index}].degree`,
        `education[${index}].major`,
        `education[${index}].startDate`,
        `education[${index}].endDate`
      ]
    }))
  });
  sections.push({
    title: '项目经历',
    items: snapshot.projects.map((item, index) => ({
      title: [item.projectName, item.role].filter(Boolean).join(' · '),
      meta: [item.startDate, item.endDate].filter(Boolean).join(' - '),
      body: [
        ...toLines(item.briefIntroduction, `projects[${index}].briefIntroduction`),
        ...toLines(item.description, `projects[${index}].description`)
      ],
      fieldPaths: [
        `projects[${index}].projectName`,
        `projects[${index}].role`,
        `projects[${index}].startDate`,
        `projects[${index}].endDate`,
        `projects[${index}].briefIntroduction`,
        `projects[${index}].description`
      ]
    }))
  });
  sections.push({
    title: '工作经历',
    items: snapshot.workExperience.map((item, index) => ({
      title: [item.company, item.position].filter(Boolean).join(' · '),
      meta: [item.startDate, item.endDate].filter(Boolean).join(' - '),
      body: toLines(item.description, `workExperience[${index}].description`),
      fieldPaths: [
        `workExperience[${index}].company`,
        `workExperience[${index}].position`,
        `workExperience[${index}].startDate`,
        `workExperience[${index}].endDate`,
        `workExperience[${index}].description`
      ]
    }))
  });
  sections.push({
    title: '专业技能',
    items: snapshot.skills.map((item, index) => ({
      body: toLines(item.skillName, `skills[${index}].skillName`),
      fieldPath: `skills[${index}].skillName`
    }))
  });
  sections.push({
    title: '荣誉奖项',
    items: snapshot.honors.map((item, index) => ({
      title: item.honorName,
      meta: item.date,
      body: toLines(item.description, `honors[${index}].description`),
      fieldPaths: [
        `honors[${index}].honorName`,
        `honors[${index}].date`,
        `honors[${index}].description`
      ]
    }))
  });
  sections.push({
    title: '个人总结',
    items: [{
      body: toLines(snapshot.summary, 'summary'),
      fieldPath: 'summary'
    }]
  });
  return sections.filter(section => section.items.length > 0);
};

const originalResumeSections = computed(() => buildResumeSections(originalSnapshot.value));
const optimizedResumeSections = computed(() => buildResumeSections(optimizedSnapshot.value));

const ResumeSnapshotView = defineComponent({
  name: 'ResumeSnapshotView',
  props: {
    sections: {
      type: Array as () => ResumePreviewSection[],
      required: true
    },
    highlightPaths: {
      type: Array as () => string[],
      default: () => []
    }
  },
  setup(props) {
    const hasHighlightedPath = (paths?: string[]) =>
      Boolean(paths?.some(path => props.highlightPaths.includes(path)));
    const isItemHighlighted = (item: ResumePreviewItem) =>
      Boolean((item.fieldPath && props.highlightPaths.includes(item.fieldPath)) || hasHighlightedPath(item.fieldPaths));
    const isLineHighlighted = (line: ResumePreviewLine) =>
      Boolean(line.fieldPath && props.highlightPaths.includes(line.fieldPath));

    return () => h('div', { class: 'snapshot-view' }, props.sections.map(section =>
      h('section', { class: 'snapshot-section', key: section.title }, [
        h('h3', section.title),
        ...section.items.map((item, index) =>
          h('article', {
            class: ['snapshot-item', isItemHighlighted(item) ? 'is-highlighted' : ''],
            key: `${section.title}-${index}`
          }, [
            item.title ? h('div', { class: 'snapshot-item-title' }, item.title) : null,
            item.meta ? h('div', { class: 'snapshot-item-meta' }, item.meta) : null,
            item.body.length
              ? h('ul', item.body.map((line, lineIndex) =>
                h('li', {
                  class: isLineHighlighted(line) ? 'snapshot-line-highlighted' : '',
                  key: lineIndex
                }, line.text)
              ))
              : null
          ])
        )
      ])
    ));
  }
});

const traceStages = computed(() => {
  const trace = batchResult.value?.optimizationTrace;
  if (!trace) return [];
  return [
    {
      title: 'Forward',
      description: '生成候选修改集',
      content: compactText(trace.draft)
    },
    {
      title: 'Textual Gradient',
      description: '批评候选结果并指出修改方向',
      content: compactText(trace.textualGradient)
    },
    {
      title: 'Optimizer',
      description: '按反馈收敛为最终润色操作',
      content: compactText(trace.optimized)
    }
  ];
});

watch(batchResult, () => {
  selectedOperationIndex.value = 0;
  expandedOperationIndex.value = null;
});

watch(
  () => resumeStore.personalInfo.applicationPosition,
  (value) => {
    if (!targetPositionInput.value.trim()) {
      targetPositionInput.value = value || '';
    }
  }
);

const compactText = (text: string, maxLength = 92) => {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return '等待模型返回';
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
};

const fieldLabel = (fieldPath?: string) => {
  if (!fieldPath) return '整体简历';
  const matchWithIndex = fieldPath.match(/^([a-zA-Z]+)\[(\d+)\]\.([a-zA-Z]+)$/);
  if (matchWithIndex) {
    const [, section, rawIndex, field] = matchWithIndex;
    const index = Number(rawIndex) + 1;
    const sectionMap: Record<string, string> = {
      workExperience: '工作经历',
      projects: '项目经历',
      honors: '荣誉奖项',
      education: '教育经历',
      skills: '专业技能'
    };
    const fieldMap: Record<string, string> = {
      description: '内容描述',
      briefIntroduction: '项目简介',
      skillName: '技能名称',
      honorName: '奖项名称',
      startDate: '开始时间',
      endDate: '结束时间',
      company: '公司',
      position: '职位',
      projectName: '项目名称',
      role: '担任角色',
      school: '学校',
      degree: '学历',
      major: '专业'
    };
    return `第 ${index} 条${sectionMap[section] || section} · ${fieldMap[field] || field}`;
  }
  if (fieldPath.startsWith('personalInfo.')) {
    const field = fieldPath.replace('personalInfo.', '');
    const personalMap: Record<string, string> = {
      name: '姓名',
      gender: '性别',
      phone: '联系电话',
      email: '电子邮箱',
      university: '所在大学',
      politicalStatus: '政治面貌',
      major: '专业',
      applicationPosition: '应聘岗位',
      age: '年龄'
    };
    return `个人信息 · ${personalMap[field] || field}`;
  }
  if (fieldPath === 'summary') return '个人总结';
  return fieldPath;
};

const operationTitle = (fieldPath: string) => {
  if (fieldPath.includes('workExperience')) return '工作经历';
  if (fieldPath.includes('projects') && fieldPath.includes('briefIntroduction')) return '项目简介';
  if (fieldPath.includes('projects')) return '项目经历';
  if (fieldPath.includes('honors')) return '荣誉描述';
  if (fieldPath === 'summary') return '个人总结';
  return fieldPath;
};

const priorityLabel = (priority: ResumeStructureAdvice['priority']) => {
  const labels: Record<ResumeStructureAdvice['priority'], string> = {
    high: '高优先级',
    medium: '中优先级',
    low: '低优先级'
  };
  return labels[priority];
};

const sectionLabel = (section?: ResumeStructureAdvice['relatedSection']) => {
  const labels: Record<string, string> = {
    overall: '整体简历',
    personalInfo: '个人信息',
    education: '教育经历',
    projects: '项目经历',
    workExperience: '工作经历',
    skills: '专业技能',
    honors: '荣誉奖项',
    summary: '个人总结'
  };
  return labels[section || 'overall'] || '整体简历';
};

const handleSelectOperation = (index: number) => {
  selectedOperationIndex.value = index;
  expandedOperationIndex.value = expandedOperationIndex.value === index ? null : index;
};

const diffHint = (oldValue: string, newValue: string) => {
  const oldLength = oldValue.trim().length;
  const newLength = newValue.trim().length;
  if (newLength > oldLength) return `表达扩展 +${newLength - oldLength} 字`;
  if (newLength < oldLength) return `表达压缩 ${oldLength - newLength} 字`;
  return '表达结构调整';
};

const writeClipboard = async (text: string) => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
};

const buildEvaluationReportText = () => {
  if (!evaluation.value) return '';
  const scores = evaluation.value.scores;
  const scoreBand = evaluationScoreBand.value;
  const comments = evaluation.value.comments.map(item => `- ${item}`).join('\n') || '- 暂无总体意见';
  const suggestions = evaluation.value.suggestions
    .map(item => `- ${fieldLabel(item.fieldPath)}：${item.problem}；建议：${item.advice}`)
    .join('\n') || '- 暂无字段级建议';
  return [
    '3-4 大模型润色组：质量评分报告',
    `综合质量区间：${scoreBand.range}（${scoreBand.label}，模型参考值 ${scores.total}）`,
    `完整度：${scores.completeness}，专业度：${scores.professionalism}，可读性：${scores.readability}，岗位匹配：${scores.jobMatch}`,
    '总体意见：',
    comments,
    '修改建议：',
    suggestions
  ].join('\n');
};

const buildStructureReportText = () => {
  if (!structureResult.value) return '';
  const formatGroup = (title: string, items: ResumeStructureAdvice[]) => [
    `${title}：`,
    ...(items.length
      ? items.map(item => `- [${priorityLabel(item.priority)}] ${sectionLabel(item.relatedSection)}：${item.title}；${item.advice}`)
      : ['- 暂无'])
  ].join('\n');
  return [
    '3-4 大模型润色组：岗位结构建议',
    `目标岗位：${structureResult.value.targetPosition}`,
    `结构评分：${structureResult.value.structureScore} 分`,
    `整体判断：${structureResult.value.overallJudgement}`,
    formatGroup('模块顺序建议', structureResult.value.sectionOrderSuggestions),
    formatGroup('经历取舍建议', structureResult.value.experienceSelectionSuggestions),
    formatGroup('内容补充建议', structureResult.value.missingContentSuggestions),
    '风险提醒：',
    ...(structureResult.value.riskWarnings.length
      ? structureResult.value.riskWarnings.map(item => `- ${item}`)
      : ['- 暂无明显风险'])
  ].join('\n');
};

const copyEvaluationReport = async () => {
  try {
    await writeClipboard(buildEvaluationReportText());
    message.success('质量评分汇报文本已复制');
  } catch (error) {
    console.error('复制质量评分失败:', error);
    message.error('复制失败，请手动选择文本');
  }
};

const copyStructureReport = async () => {
  try {
    await writeClipboard(buildStructureReportText());
    message.success('岗位结构建议汇报文本已复制');
  } catch (error) {
    console.error('复制岗位结构建议失败:', error);
    message.error('复制失败，请手动选择文本');
  }
};

const handleEvaluate = async () => {
  const snapshot = resumeStore.getResumeSnapshot();
  const snapshotKey = createSnapshotCacheKey(snapshot);
  const cachedEvaluation = evaluationCache.get(snapshotKey);
  if (cachedEvaluation?.scores.total) {
    evaluation.value = cachedEvaluation;
    evaluationCacheKey.value = snapshotKey;
    evaluationOpen.value = true;
    message.info('已复用当前简历的质量评分缓存');
    return;
  }
  if (evaluation.value?.scores.total === 0) {
    evaluation.value = null;
    evaluationCacheKey.value = '';
  }
  evaluating.value = true;
  evaluationOpen.value = true;
  try {
    evaluation.value = await evaluateResume(snapshot, undefined, {
      targetPosition: getEffectiveTargetPosition(snapshot)
    });
    evaluationCacheKey.value = snapshotKey;
    evaluationCache.set(snapshotKey, evaluation.value);
    message.success('质量评分已生成');
  } catch (error) {
    console.error('质量评分失败:', error);
    evaluationOpen.value = false;
    message.error('质量评分失败，请检查 API Key、API URL 和模型名称');
  } finally {
    evaluating.value = false;
  }
};

const handleStructureAnalyze = async () => {
  const snapshot = resumeStore.getResumeSnapshot();
  const snapshotKey = createSnapshotCacheKey(snapshot);
  if (structureResult.value && structureCacheKey.value === snapshotKey) {
    structureOpen.value = true;
    message.info('已复用当前简历的岗位结构建议');
    return;
  }
  structureAnalyzing.value = true;
  structureOpen.value = true;
  try {
    structureResult.value = await analyzeResumeStructure(snapshot, undefined, {
      targetPosition: getEffectiveTargetPosition(snapshot)
    });
    structureCacheKey.value = snapshotKey;
    message.success('岗位结构建议已生成');
  } catch (error) {
    console.error('岗位结构建议失败:', error);
    structureOpen.value = false;
    message.error('岗位结构建议失败，请检查 API Key、API URL 和模型名称');
  } finally {
    structureAnalyzing.value = false;
  }
};

const handleBatchPolish = async () => {
  const snapshot = resumeStore.getResumeSnapshot();
  const snapshotKey = createSnapshotCacheKey(snapshot);
  const activeStructureAdvice = structureCacheKey.value === snapshotKey ? structureResult.value : null;
  const nextBatchCacheKey = createBatchCacheKey(snapshotKey, polishMode.value, activeStructureAdvice);
  if (batchResult.value && batchCacheKey.value === nextBatchCacheKey) {
    originalSnapshot.value = snapshot;
    if (batchResult.value.operations.length > 0) reviewOpen.value = true;
    message.info('已复用当前简历的全文润色结果');
    return;
  }
  batchPolishing.value = true;
  try {
    originalSnapshot.value = snapshot;
    batchResult.value = await batchPolishResume(snapshot, undefined, {
      mode: polishMode.value,
      targetPosition: getEffectiveTargetPosition(snapshot),
      structureAdvice: activeStructureAdvice
    });
    batchCacheKey.value = nextBatchCacheKey;
    if (batchResult.value.operations.length === 0) {
      message.warning('AI 未返回可应用的润色操作');
    } else {
      message.success(`已生成 ${batchResult.value.operations.length} 处修改，可先对比再应用`);
      reviewOpen.value = true;
    }
  } catch (error) {
    console.error('全文润色失败:', error);
    message.error('全文润色失败，请检查 API Key、API URL 和模型名称');
  } finally {
    batchPolishing.value = false;
  }
};

const applyOperations = (operations: PolishOperation[]) => {
  const result = resumeStore.applyPolishOperations(operations);
  if (result.applied.length > 0) {
    message.success(`已应用 ${result.applied.length} 条润色结果`);
  }
  if (result.skipped.length > 0) {
    message.warning(`跳过 ${result.skipped.length} 条：${result.skipped[0].reason}`);
  }
  return result;
};

const handleApplySelected = () => {
  if (!selectedOperation.value || !batchResult.value) return;
  const result = applyOperations([selectedOperation.value]);
  if (result.applied.length === 0) return;

  const nextOperations = batchResult.value.operations.filter((_, index) => index !== selectedOperationIndex.value);
  const nextSafety = batchResult.value.safety
    ? {
      ...batchResult.value.safety,
      acceptedOperationCount: nextOperations.length,
      appliedFieldPaths: nextOperations.map(item => item.fieldPath)
    }
    : undefined;
  originalSnapshot.value = resumeStore.getResumeSnapshot();
  batchResult.value = {
    ...batchResult.value,
    operations: nextOperations,
    safety: nextSafety
  };
  batchCacheKey.value = '';
  selectedOperationIndex.value = Math.min(selectedOperationIndex.value, Math.max(0, nextOperations.length - 1));
  if (nextOperations.length === 0) {
    reviewOpen.value = false;
    batchResult.value = null;
  }
};

const handleApplyBatch = () => {
  if (!batchResult.value) return;
  const result = applyOperations(batchResult.value.operations);
  if (result.applied.length > 0) {
    reviewOpen.value = false;
    batchResult.value = null;
    batchCacheKey.value = '';
    originalSnapshot.value = resumeStore.getResumeSnapshot();
  }
};
</script>

<style scoped>
.ai-polish-panel {
  position: relative;
  isolation: isolate;
  margin: 12px;
  padding: 18px;
  max-height: min(58vh, 680px);
  overflow-y: auto;
  flex-shrink: 0;
  border: 1px solid rgba(18, 32, 57, 0.08);
  border-radius: 18px;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.96), rgba(246, 249, 252, 0.92)),
    radial-gradient(circle at 8% 0%, rgba(58, 110, 255, 0.12), transparent 28%);
  box-shadow: 0 18px 50px rgba(15, 23, 42, 0.08);
  color: #172033;
  scrollbar-width: thin;
}

.ai-polish-panel::after {
  content: "3-4 大模型润色组";
  position: absolute;
  top: 18px;
  right: 22px;
  z-index: 0;
  padding: 8px 14px;
  border: 1px solid rgba(79, 111, 159, 0.16);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.58);
  color: rgba(37, 99, 235, 0.22);
  font-size: 13px;
  font-weight: 900;
  letter-spacing: 0;
  pointer-events: none;
  transform: rotate(-4deg);
}

.ai-polish-panel > * {
  position: relative;
  z-index: 1;
}

.hero-row,
.workbench-header,
.section-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.eyebrow {
  margin: 0 0 4px;
  color: #4f6f9f;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0;
}

.hero-row h3,
.workbench-header h4 {
  margin: 0;
  color: #111827;
  font-size: 20px;
  font-weight: 800;
}

.subtitle {
  margin: 6px 0 0;
  color: #64748b;
  font-size: 13px;
}

.target-position-control {
  width: min(460px, 100%);
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  margin-top: 12px;
  padding: 8px 10px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.68);
}

.target-position-control span {
  color: #334155;
  font-size: 12px;
  font-weight: 900;
  white-space: nowrap;
}

.target-position-control :deep(.ant-input-affix-wrapper) {
  border: none;
  background: transparent;
  box-shadow: none;
}

.hero-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 10px;
  flex-shrink: 0;
}

.mode-control {
  display: inline-flex;
  align-items: center;
  height: 36px;
  padding: 3px;
  border: 1px solid rgba(23, 32, 51, 0.12);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.74);
}

.mode-control.is-compact {
  height: 32px;
}

.mode-option {
  height: 28px;
  padding: 0 12px;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: #64748b;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
  transition: background 0.18s ease, color 0.18s ease, box-shadow 0.18s ease;
}

.mode-option.active {
  background: #172033;
  color: #fff;
  box-shadow: 0 8px 18px rgba(15, 23, 42, 0.16);
}

.primary-action,
.ghost-action {
  height: 36px;
  border-radius: 999px;
  font-weight: 700;
}

.primary-action {
  border: none;
  background: #172033;
  color: #fff;
  box-shadow: 0 10px 22px rgba(23, 32, 51, 0.18);
}

.ghost-action {
  border: 1px solid rgba(23, 32, 51, 0.14);
  background: rgba(255, 255, 255, 0.72);
  color: #172033;
}

.status-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 14px;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 6px 10px;
  border: 1px solid rgba(100, 116, 139, 0.16);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.68);
  color: #475569;
  font-size: 12px;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.is-green { background: #16a34a; }
.is-purple { background: #7c3aed; }
.is-blue { background: #2563eb; }
.is-orange { background: #f97316; }

.defense-flow {
  position: relative;
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 8px;
  margin-top: 14px;
  padding: 12px;
  border: 1px solid rgba(148, 163, 184, 0.16);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.64);
}

.defense-flow-step {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 8px 10px;
  border-radius: 999px;
  background: #f8fafc;
  color: #64748b;
  font-size: 12px;
  font-weight: 800;
}

.defense-flow-step::after {
  content: "";
  position: absolute;
  right: -8px;
  top: 50%;
  width: 8px;
  height: 2px;
  background: rgba(148, 163, 184, 0.34);
}

.defense-flow-step:last-child::after {
  display: none;
}

.defense-flow-step i {
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border-radius: 50%;
  background: #e2e8f0;
  color: #475569;
  font-size: 11px;
  font-style: normal;
}

.defense-flow-step span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.defense-flow-step.active {
  background: rgba(37, 99, 235, 0.08);
  color: #0f172a;
}

.defense-flow-step.active i {
  background: #2563eb;
  color: #fff;
}

.evaluation-card,
.textgrad-card,
.compare-workbench,
.suggestion-card {
  margin-top: 14px;
  padding: 14px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.72);
}

.section-title span {
  color: #111827;
  font-size: 15px;
  font-weight: 800;
}

.section-title strong {
  color: #111827;
  font-size: 28px;
  line-height: 1;
}

.section-title em {
  color: #64748b;
  font-size: 12px;
  font-style: normal;
}

.score-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  margin-top: 12px;
}

.score-item {
  padding: 10px;
  border-radius: 12px;
  background: #f8fafc;
}

.score-item span {
  color: #64748b;
  font-size: 12px;
}

.score-item b {
  display: block;
  margin-top: 4px;
  color: #0f172a;
  font-size: 20px;
}

.score-item small {
  display: block;
  margin-top: 2px;
  color: #64748b;
  font-size: 11px;
  line-height: 1.35;
}

.score-bar {
  height: 5px;
  margin-top: 8px;
  overflow: hidden;
  border-radius: 999px;
  background: #e2e8f0;
}

.score-bar i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #2563eb, #7c3aed);
}

.comment-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 10px;
  color: #475569;
  font-size: 12px;
}

.flow-line {
  position: relative;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin-top: 12px;
}

.flow-stage {
  position: relative;
  min-height: 118px;
  padding: 12px 12px 12px 42px;
  border: 1px solid rgba(124, 58, 237, 0.16);
  border-radius: 14px;
  background: linear-gradient(180deg, #ffffff, #f8f5ff);
}

.flow-index {
  position: absolute;
  left: 12px;
  top: 13px;
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: #7c3aed;
  color: #fff;
  font-size: 12px;
  font-weight: 800;
}

.flow-stage h4 {
  margin: 0;
  color: #111827;
  font-size: 14px;
}

.flow-stage p {
  margin: 4px 0 8px;
  color: #64748b;
  font-size: 12px;
}

.flow-stage span {
  display: -webkit-box;
  overflow: hidden;
  color: #334155;
  font-size: 12px;
  line-height: 1.5;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
}

.compare-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 210px minmax(0, 1fr);
  gap: 12px;
  margin-top: 12px;
}

.text-panel {
  min-height: 210px;
  padding: 12px;
  border-radius: 14px;
  background: #f8fafc;
}

.text-panel.is-before {
  border: 1px solid rgba(100, 116, 139, 0.16);
}

.text-panel.is-after {
  border: 1px solid rgba(22, 163, 74, 0.22);
  background: #f7fdf9;
}

.mini-title {
  margin-bottom: 8px;
  color: #64748b;
  font-size: 12px;
  font-weight: 700;
}

pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  color: #172033;
  font-family: inherit;
  font-size: 12px;
  line-height: 1.7;
}

.change-stream {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 4px 0;
}

.change-stream::before {
  content: "";
  position: absolute;
  left: 22px;
  top: 16px;
  bottom: 16px;
  width: 2px;
  border-radius: 999px;
  background: linear-gradient(#2563eb, #16a34a);
}

.change-popover {
  position: relative;
  z-index: 1;
  width: 100%;
  min-height: 66px;
  padding: 10px 10px 10px 48px;
  border: 1px solid rgba(37, 99, 235, 0.14);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.86);
  text-align: left;
  cursor: pointer;
  transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
}

.change-popover:hover,
.change-popover.active {
  transform: translateY(-1px);
  border-color: rgba(37, 99, 235, 0.38);
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.1);
}

.change-popover span {
  position: absolute;
  left: 10px;
  top: 14px;
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: #172033;
  color: #fff;
  font-size: 12px;
  font-weight: 800;
}

.change-popover strong,
.change-popover small {
  display: block;
}

.change-popover strong {
  color: #172033;
  font-size: 13px;
}

.change-popover small {
  margin-top: 4px;
  color: #64748b;
  font-size: 11px;
}

.suggestion-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 12px;
}

.suggestion-item {
  padding: 12px;
  border-radius: 12px;
  background: #f8fafc;
}

.suggestion-item code {
  display: inline-block;
  margin-bottom: 6px;
  color: #2563eb;
  font-family: Consolas, monospace;
  font-size: 11px;
}

.suggestion-item b {
  display: block;
  color: #111827;
  font-size: 13px;
}

.suggestion-item p {
  margin: 4px 0 0;
  color: #64748b;
  font-size: 12px;
  line-height: 1.5;
}

.review-hint {
  margin: 10px 0 0;
  color: #64748b;
  font-size: 12px;
  line-height: 1.6;
}

.safety-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}

.safety-strip span {
  padding: 5px 9px;
  border: 1px solid rgba(22, 163, 74, 0.14);
  border-radius: 999px;
  background: rgba(240, 253, 244, 0.78);
  color: #166534;
  font-size: 12px;
  font-weight: 800;
}

.review-overlay {
  position: fixed;
  inset: 0;
  z-index: 3000;
  padding: 22px;
  background: rgba(10, 18, 32, 0.58);
  backdrop-filter: blur(18px);
}

.review-shell {
  position: relative;
  isolation: isolate;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 20px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.56);
  border-radius: 24px;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.98), rgba(245, 248, 252, 0.96)),
    radial-gradient(circle at 50% 0%, rgba(37, 99, 235, 0.14), transparent 32%);
  box-shadow: 0 24px 80px rgba(15, 23, 42, 0.28);
}

.review-shell::after,
.evaluation-shell::after {
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

.review-shell > *,
.evaluation-shell > * {
  position: relative;
  z-index: 1;
}

.review-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
}

.review-header h2 {
  margin: 0;
  color: #0f172a;
  font-size: 28px;
  font-weight: 900;
  letter-spacing: 0;
}

.review-header span {
  display: block;
  margin-top: 5px;
  color: #64748b;
  font-size: 13px;
}

.review-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 10px;
}

.review-actions :deep(.ant-btn) {
  height: 36px;
  border-radius: 999px;
  font-weight: 700;
}

.current-change-strip,
.review-safety-grid {
  display: grid;
  gap: 10px;
}

.current-change-strip {
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  padding: 10px 14px;
  border: 1px solid rgba(245, 158, 11, 0.2);
  border-radius: 16px;
  background: rgba(255, 251, 235, 0.82);
}

.current-change-strip span,
.current-change-strip em {
  color: #92400e;
  font-size: 12px;
  font-style: normal;
  font-weight: 800;
}

.current-change-strip b {
  overflow: hidden;
  color: #0f172a;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.review-safety-grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.review-safety-grid div {
  padding: 10px 12px;
  border: 1px solid rgba(148, 163, 184, 0.16);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.76);
}

.review-safety-grid span {
  display: block;
  color: #64748b;
  font-size: 11px;
  font-weight: 700;
}

.review-safety-grid b {
  display: block;
  margin-top: 2px;
  color: #0f172a;
  font-size: 20px;
}

.review-flow {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.review-flow-node {
  position: relative;
  padding: 12px 14px 12px 18px;
  overflow: hidden;
  border: 1px solid rgba(124, 58, 237, 0.14);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.76);
}

.review-flow-node::before {
  content: "";
  position: absolute;
  left: 0;
  top: 0;
  width: 4px;
  height: 100%;
  background: linear-gradient(#2563eb, #7c3aed);
}

.review-flow-node b {
  display: block;
  color: #111827;
  font-size: 13px;
}

.review-flow-node span {
  display: block;
  margin-top: 4px;
  color: #64748b;
  font-size: 12px;
}

.review-grid {
  flex: 1 1 auto;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 310px minmax(0, 1fr);
  gap: 16px;
}

.resume-paper,
.change-column {
  min-height: 0;
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.82);
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
  border: 1px solid transparent;
  border-radius: 14px;
  background: rgba(248, 250, 252, 0.86);
  transition: background 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
}

:deep(.snapshot-item.is-highlighted) {
  border-color: rgba(245, 158, 11, 0.58);
  background: rgba(255, 251, 235, 0.96);
  box-shadow: 0 12px 28px rgba(245, 158, 11, 0.16);
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

:deep(.snapshot-line-highlighted) {
  margin-left: -4px;
  padding: 3px 6px;
  border-left: 3px solid #f59e0b;
  border-radius: 8px;
  background: rgba(254, 243, 199, 0.95);
  color: #0f172a;
  font-weight: 700;
}

.change-column {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  overflow-y: auto;
  scrollbar-width: thin;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.86), rgba(247, 249, 252, 0.88)),
    linear-gradient(90deg, transparent 50%, rgba(37, 99, 235, 0.08) 50%, transparent calc(50% + 2px));
}

.change-column-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
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

.review-change-popover {
  position: relative;
  display: block;
  width: 100%;
  padding: 13px 12px 12px 46px;
  border: 1px solid rgba(37, 99, 235, 0.16);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.94);
  text-align: left;
  cursor: pointer;
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);
  transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
}

.review-change-popover:hover,
.review-change-popover.active,
.review-change-popover:focus-visible {
  transform: translateY(-2px);
  outline: none;
  border-color: rgba(37, 99, 235, 0.44);
  box-shadow: 0 16px 32px rgba(37, 99, 235, 0.15);
}

.review-change-popover.expanded {
  border-color: rgba(22, 163, 74, 0.35);
  background: rgba(250, 255, 252, 0.98);
}

.review-change-popover i {
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

.review-change-popover strong,
.review-change-popover small,
.review-change-popover em {
  display: block;
}

.review-change-popover strong {
  color: #111827;
  font-size: 14px;
}

.review-change-popover small {
  margin-top: 4px;
  color: #64748b;
  font-size: 11px;
  word-break: break-all;
}

.review-change-popover em {
  margin-top: 7px;
  color: #16a34a;
  font-size: 12px;
  font-style: normal;
  font-weight: 800;
}

.open-hint {
  display: inline-flex;
  margin-top: 8px;
  padding: 4px 8px;
  border-radius: 999px;
  background: rgba(37, 99, 235, 0.08);
  color: #2563eb;
  font-size: 11px;
  font-weight: 800;
}

.operation-detail {
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid rgba(148, 163, 184, 0.18);
}

.operation-detail div {
  padding: 10px;
  border-radius: 12px;
  background: rgba(248, 250, 252, 0.92);
}

.operation-detail div.is-after {
  background: rgba(240, 253, 244, 0.9);
}

.operation-detail b {
  display: block;
  margin-bottom: 5px;
  color: #0f172a;
  font-size: 12px;
}

.operation-detail p {
  max-height: 180px;
  margin: 0;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-word;
  color: #334155;
  font-size: 12px;
  line-height: 1.65;
  scrollbar-width: thin;
}

.evaluation-overlay {
  position: fixed;
  inset: 0;
  z-index: 3100;
  padding: 22px;
  background: rgba(10, 18, 32, 0.58);
  backdrop-filter: blur(18px);
}

.evaluation-shell {
  position: relative;
  isolation: isolate;
  width: 100%;
  height: 100%;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 14px;
  padding: 20px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.56);
  border-radius: 24px;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.98), rgba(245, 248, 252, 0.96)),
    radial-gradient(circle at 48% 0%, rgba(22, 163, 74, 0.14), transparent 32%);
  box-shadow: 0 24px 80px rgba(15, 23, 42, 0.28);
}

.evaluation-shell :deep(.ant-spin-nested-loading),
.evaluation-shell :deep(.ant-spin-container) {
  height: 100%;
}

.evaluation-grid {
  height: 100%;
  min-height: 0;
  display: grid;
  grid-template-columns: 360px minmax(0, 1fr);
  grid-template-rows: auto minmax(0, 1fr);
  gap: 16px;
}

.evaluation-score-panel,
.evaluation-section,
.evaluation-loading {
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.84);
  box-shadow: 0 16px 40px rgba(15, 23, 42, 0.08);
}

.evaluation-score-panel {
  grid-row: span 2;
  padding: 18px;
}

.total-score {
  min-height: 150px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  border-radius: 18px;
  background: linear-gradient(135deg, #172033, #2563eb);
  color: #fff;
  text-align: center;
}

.total-score span {
  font-size: 14px;
  font-weight: 800;
  opacity: 0.82;
}

.total-score strong {
  margin-top: 8px;
  font-size: 54px;
  line-height: 1;
}

.total-score small {
  margin-top: 10px;
  font-size: 13px;
  font-weight: 700;
  opacity: 0.82;
}

.score-grid.is-evaluation {
  grid-template-columns: 1fr;
}

.evaluation-section {
  min-height: 0;
  overflow-y: auto;
  padding: 18px;
  scrollbar-width: thin;
}

.comment-row.is-evaluation {
  margin-top: 14px;
}

.comment-row.is-evaluation span {
  padding: 12px 14px;
  border-radius: 14px;
  background: rgba(248, 250, 252, 0.92);
  color: #334155;
  font-size: 13px;
  line-height: 1.7;
}

.suggestion-grid.is-evaluation {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.evaluation-loading {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: #334155;
}

.evaluation-loading strong {
  color: #0f172a;
  font-size: 22px;
}

.evaluation-loading span {
  color: #64748b;
  font-size: 13px;
}

.structure-shell {
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.98), rgba(245, 248, 252, 0.96)),
    radial-gradient(circle at 48% 0%, rgba(249, 115, 22, 0.14), transparent 32%);
}

.structure-grid {
  height: 100%;
  min-height: 0;
  display: grid;
  grid-template-columns: 330px minmax(0, 1.2fr) minmax(280px, 0.8fr);
  gap: 16px;
}

.structure-score-panel,
.structure-section {
  min-height: 0;
  overflow-y: auto;
  padding: 18px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.84);
  box-shadow: 0 16px 40px rgba(15, 23, 42, 0.08);
  scrollbar-width: thin;
}

.total-score.is-structure {
  background: linear-gradient(135deg, #172033, #f97316);
}

.structure-target {
  margin-top: 14px;
  padding: 14px;
  border-radius: 16px;
  background: #f8fafc;
}

.structure-target span,
.structure-advice small {
  display: block;
  color: #64748b;
  font-size: 12px;
  font-weight: 700;
}

.structure-target b {
  display: block;
  margin-top: 4px;
  color: #0f172a;
  font-size: 18px;
}

.structure-score-panel p {
  margin: 14px 0 0;
  color: #334155;
  font-size: 13px;
  line-height: 1.8;
}

.structure-filter {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
  padding: 10px 12px;
  border: 1px solid rgba(148, 163, 184, 0.16);
  border-radius: 16px;
  background: rgba(248, 250, 252, 0.9);
}

.structure-filter > span {
  color: #0f172a;
  font-size: 13px;
  font-weight: 900;
}

.structure-advice-group + .structure-advice-group {
  margin-top: 18px;
}

.structure-advice-list {
  display: grid;
  gap: 10px;
  margin-top: 12px;
}

.structure-advice {
  position: relative;
  padding: 14px 14px 14px 18px;
  overflow: hidden;
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 16px;
  background: #f8fafc;
}

.structure-advice::before {
  content: "";
  position: absolute;
  left: 0;
  top: 0;
  width: 4px;
  height: 100%;
  background: #64748b;
}

.structure-advice.priority-high::before {
  background: #ef4444;
}

.structure-advice.priority-medium::before {
  background: #f97316;
}

.structure-advice.priority-low::before {
  background: #2563eb;
}

.structure-advice > span {
  display: inline-flex;
  margin-bottom: 8px;
  padding: 4px 8px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.06);
  color: #475569;
  font-size: 11px;
  font-weight: 800;
}

.structure-advice b {
  display: block;
  color: #0f172a;
  font-size: 14px;
}

.structure-advice p,
.structure-advice strong {
  display: block;
  margin: 7px 0 0;
  color: #475569;
  font-size: 12px;
  line-height: 1.7;
}

.structure-advice strong {
  color: #0f172a;
  font-weight: 800;
}

.risk-list {
  display: grid;
  gap: 10px;
  margin-top: 12px;
}

.risk-list span {
  padding: 12px 14px;
  border: 1px solid rgba(239, 68, 68, 0.12);
  border-radius: 14px;
  background: rgba(254, 242, 242, 0.82);
  color: #7f1d1d;
  font-size: 13px;
  line-height: 1.7;
}

@media (max-width: 1300px) {
  .score-grid,
  .flow-line,
  .suggestion-grid,
  .defense-flow {
    grid-template-columns: 1fr;
  }

  .defense-flow-step::after {
    display: none;
  }

  .compare-grid {
    grid-template-columns: 1fr;
  }

  .review-grid {
    grid-template-columns: 1fr;
  }

  .evaluation-grid {
    grid-template-columns: 1fr;
  }

  .structure-grid {
    grid-template-columns: 1fr;
  }

  .review-shell {
    overflow-y: auto;
  }

  .evaluation-shell {
    overflow-y: auto;
  }

  .review-flow {
    grid-template-columns: 1fr;
  }

  .review-safety-grid,
  .current-change-strip {
    grid-template-columns: 1fr;
  }

  .structure-filter {
    align-items: flex-start;
    flex-direction: column;
  }

  .resume-paper {
    min-height: 520px;
  }
}
</style>
