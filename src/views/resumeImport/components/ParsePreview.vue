<template>
  <div class="parse-preview">
    <div class="preview-left">
      <a-alert
        v-if="warningCount > 0"
        type="warning"
        show-icon
        :message="`发现 ${warningCount} 处待核对字段，已在下方表单中标出`"
        style="margin-bottom: 8px"
      />
      <div v-if="warningCount > 0" class="highlight-legend">
        <span class="legend-item legend-missing">红色：缺失或未识别</span>
        <span class="legend-item legend-low">黄色：识别不确定</span>
      </div>

      <a-collapse v-model:activeKey="activeKeys" :accordion="false">
        <a-collapse-panel key="personalInfo" header="个人信息">
          <a-row :gutter="[16, 12]">
            <a-col v-for="field in personalFields" :key="field.key" :span="12">
              <div :class="fieldClass(`personalInfo.${field.key}`)">
                <label>
                  {{ field.label }}
                  <span v-if="fieldReason(`personalInfo.${field.key}`)" class="field-hint">
                    {{ fieldReason(`personalInfo.${field.key}`) }}
                  </span>
                </label>
                <a-input
                  v-model:value="model.personalInfo[field.key]"
                  :placeholder="`请输入${field.label}`"
                />
              </div>
            </a-col>
          </a-row>
        </a-collapse-panel>

        <a-collapse-panel key="education" header="教育经历">
          <div v-if="model.education.length === 0" :class="fieldClass('education')">
            <a-empty description="未识别到教育经历，可手动添加" />
          </div>
          <div v-for="(item, index) in model.education" :key="previewId(item) ?? index" class="array-item">
            <a-row :gutter="[16, 12]">
              <a-col :span="12">
                <div :class="fieldClass(`education[${index}].school`, previewId(item))">
                  <label>学校</label>
                  <a-input v-model:value="item.school" />
                </div>
              </a-col>
              <a-col :span="12">
                <div :class="fieldClass(`education[${index}].degree`, previewId(item))">
                  <label>学历</label>
                  <a-input v-model:value="item.degree" />
                </div>
              </a-col>
              <a-col :span="12">
                <div :class="fieldClass(`education[${index}].major`, previewId(item))">
                  <label>专业</label>
                  <a-input v-model:value="item.major" />
                </div>
              </a-col>
              <a-col :span="6">
                <div :class="fieldClass(`education[${index}].startDate`, previewId(item))">
                  <label>开始时间</label>
                  <a-input v-model:value="item.startDate" placeholder="YYYY-MM" />
                </div>
              </a-col>
              <a-col :span="6">
                <div :class="fieldClass(`education[${index}].endDate`, previewId(item))">
                  <label>结束时间</label>
                  <a-input v-model:value="item.endDate" placeholder="YYYY-MM" />
                </div>
              </a-col>
            </a-row>
            <a-button type="link" danger @click="removeItem('education', index)">删除</a-button>
          </div>
          <a-button type="dashed" block @click="addEducation">+ 添加教育经历</a-button>
        </a-collapse-panel>

        <a-collapse-panel key="workExperience" header="工作/实习经历">
          <div v-if="model.workExperience.length === 0" :class="fieldClass('workExperience')">
            <a-empty description="未识别到工作经历" />
          </div>
          <div v-for="(item, index) in model.workExperience" :key="previewId(item) ?? index" class="array-item">
            <a-row :gutter="[16, 12]">
              <a-col :span="12">
                <div :class="fieldClass(`workExperience[${index}].company`, previewId(item))">
                  <label>公司</label>
                  <a-input v-model:value="item.company" />
                </div>
              </a-col>
              <a-col :span="12">
                <div :class="fieldClass(`workExperience[${index}].position`, previewId(item))">
                  <label>职位</label>
                  <a-input v-model:value="item.position" />
                </div>
              </a-col>
              <a-col :span="6">
                <div :class="fieldClass(`workExperience[${index}].startDate`, previewId(item))">
                  <label>开始时间</label>
                  <a-input v-model:value="item.startDate" />
                </div>
              </a-col>
              <a-col :span="6">
                <div :class="fieldClass(`workExperience[${index}].endDate`, previewId(item))">
                  <label>结束时间</label>
                  <a-input v-model:value="item.endDate" />
                </div>
              </a-col>
              <a-col :span="24">
                <div :class="fieldClass(`workExperience[${index}].description`, previewId(item))">
                  <label>工作描述</label>
                  <a-textarea v-model:value="item.description" :rows="3" />
                </div>
              </a-col>
            </a-row>
            <a-button type="link" danger @click="removeItem('workExperience', index)">删除</a-button>
          </div>
          <a-button type="dashed" block @click="addWork">+ 添加工作经历</a-button>
        </a-collapse-panel>

        <a-collapse-panel key="projects" header="项目经历">
          <div v-if="model.projects.length === 0" :class="fieldClass('projects')">
            <a-empty description="未识别到项目经历" />
          </div>
          <div v-for="(item, index) in model.projects" :key="previewId(item) ?? index" class="array-item">
            <a-row :gutter="[16, 12]">
              <a-col :span="12">
                <div :class="fieldClass(`projects[${index}].projectName`, previewId(item))">
                  <label>项目名称</label>
                  <a-input v-model:value="item.projectName" />
                </div>
              </a-col>
              <a-col :span="12">
                <div :class="fieldClass(`projects[${index}].role`, previewId(item))">
                  <label>角色</label>
                  <a-input v-model:value="item.role" />
                </div>
              </a-col>
              <a-col :span="24">
                <div :class="fieldClass(`projects[${index}].briefIntroduction`, previewId(item))">
                  <label>项目简介</label>
                  <a-input v-model:value="item.briefIntroduction" />
                </div>
              </a-col>
              <a-col :span="24">
                <div :class="fieldClass(`projects[${index}].description`, previewId(item))">
                  <label>项目描述</label>
                  <a-textarea v-model:value="item.description" :rows="3" />
                </div>
              </a-col>
            </a-row>
            <a-button type="link" danger @click="removeItem('projects', index)">删除</a-button>
          </div>
          <a-button type="dashed" block @click="addProject">+ 添加项目</a-button>
        </a-collapse-panel>

        <a-collapse-panel key="skills" header="专业技能">
          <div v-if="model.skills.length === 0" :class="fieldClass('skills')">
            <a-empty description="未识别到技能" />
          </div>
          <div v-for="(item, index) in model.skills" :key="previewId(item) ?? index" class="array-item">
            <div :class="fieldClass(`skills[${index}].skillName`, previewId(item))">
              <a-input v-model:value="item.skillName" placeholder="技能描述" />
            </div>
            <a-button type="link" danger @click="removeItem('skills', index)">删除</a-button>
          </div>
          <a-button type="dashed" block @click="addSkill">+ 添加技能</a-button>
        </a-collapse-panel>

        <a-collapse-panel key="honors" header="荣誉奖项">
          <div v-if="model.honors.length === 0" :class="fieldClass('honors')">
            <a-empty description="未识别到荣誉奖项" />
          </div>
          <div v-for="(item, index) in model.honors" :key="previewId(item) ?? index" class="array-item">
            <a-row :gutter="[16, 12]">
              <a-col :span="12">
                <div :class="fieldClass(`honors[${index}].honorName`, previewId(item))">
                  <label>奖项名称</label>
                  <a-input v-model:value="item.honorName" />
                </div>
              </a-col>
              <a-col :span="12">
                <div :class="fieldClass(`honors[${index}].date`, previewId(item))">
                  <label>获奖时间</label>
                  <a-input v-model:value="item.date" />
                </div>
              </a-col>
              <a-col :span="24">
                <div :class="fieldClass(`honors[${index}].description`, previewId(item))">
                  <label>描述</label>
                  <a-input v-model:value="item.description" />
                </div>
              </a-col>
            </a-row>
            <a-button type="link" danger @click="removeItem('honors', index)">删除</a-button>
          </div>
          <a-button type="dashed" block @click="addHonor">+ 添加荣誉</a-button>
        </a-collapse-panel>

        <a-collapse-panel key="summary" header="自我评价">
          <div :class="fieldClass('summary')">
            <label v-if="fieldReason('summary')" class="field-hint block-hint">
              {{ fieldReason('summary') }}
            </label>
            <a-textarea v-model:value="model.summary" :rows="4" placeholder="自我评价" />
          </div>
        </a-collapse-panel>
      </a-collapse>
    </div>

    <div class="preview-right">
      <div class="raw-text-panel">
        <h4>原始识别文本</h4>
        <pre class="raw-text">{{ rawText || '暂无文本' }}</pre>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { FieldMeta, ParsedResumePayload } from '../../../types/resumeImport';
import type { PersonalInfo } from '../../../types/resume';
import {
  assignPreviewIds,
  matchFieldMeta,
  type ItemWithPreviewId,
} from '../../../utils/fieldPath';
import { buildFieldMeta } from '../../../services/parser/schemaValidator';

const model = defineModel<ParsedResumePayload>({ required: true });

const props = defineProps<{
  rawText?: string;
  fieldMeta?: FieldMeta[];
}>();

const localFieldMeta = ref<FieldMeta[]>([]);

watch(
  () => [model.value, props.fieldMeta] as const,
  () => {
    assignPreviewIds(model.value.education as ItemWithPreviewId[]);
    assignPreviewIds(model.value.workExperience as ItemWithPreviewId[]);
    assignPreviewIds(model.value.projects as ItemWithPreviewId[]);
    assignPreviewIds(model.value.skills as ItemWithPreviewId[]);
    assignPreviewIds(model.value.honors as ItemWithPreviewId[]);
    localFieldMeta.value = buildFieldMeta(model.value, props.fieldMeta ?? []);
  },
  { immediate: true, deep: true }
);

const activeKeys = ref(['personalInfo', 'education', 'workExperience', 'projects', 'skills', 'summary']);

const personalFields: { key: keyof PersonalInfo; label: string }[] = [
  { key: 'name', label: '姓名' },
  { key: 'phone', label: '联系电话' },
  { key: 'email', label: '电子邮箱' },
  { key: 'university', label: '所在大学' },
  { key: 'major', label: '专业' },
  { key: 'gender', label: '性别' },
  { key: 'age', label: '年龄' },
  { key: 'applicationPosition', label: '求职意向' },
  { key: 'politicalStatus', label: '政治面貌' },
];

const metaList = computed(() => localFieldMeta.value);

const warningCount = computed(() =>
  metaList.value.filter(m => m.confidence === 'low' || m.confidence === 'missing').length
);

function getFieldMeta(fieldPath: string, itemId?: number | string) {
  return matchFieldMeta(metaList.value, fieldPath, itemId);
}

function fieldClass(fieldPath: string, itemId?: number | string): string {
  const meta = getFieldMeta(fieldPath, itemId);
  if (!meta) return 'field-wrap';
  if (meta.confidence === 'missing') return 'field-wrap field-missing';
  if (meta.confidence === 'low') return 'field-wrap field-low';
  if (meta.confidence === 'medium') return 'field-wrap field-medium';
  return 'field-wrap';
}

function fieldReason(fieldPath: string, itemId?: number | string): string {
  const meta = getFieldMeta(fieldPath, itemId);
  if (!meta || meta.confidence === 'high') return '';
  return meta.reason ?? (meta.confidence === 'missing' ? '未识别' : '请核对');
}

function previewId(item: unknown): number | string | undefined {
  return (item as ItemWithPreviewId)._previewId;
}

function removeItem(
  key: 'education' | 'workExperience' | 'projects' | 'skills' | 'honors',
  index: number
) {
  model.value[key].splice(index, 1);
}

function addEducation() {
  model.value.education.push({ school: '', degree: '', major: '', startDate: '', endDate: '' });
  assignPreviewIds(model.value.education as ItemWithPreviewId[]);
}

function addWork() {
  model.value.workExperience.push({
    company: '', position: '', startDate: '', endDate: '', description: '',
  });
  assignPreviewIds(model.value.workExperience as ItemWithPreviewId[]);
}

function addProject() {
  model.value.projects.push({
    projectName: '', role: '', startDate: '', endDate: '', briefIntroduction: '', description: '',
  });
  assignPreviewIds(model.value.projects as ItemWithPreviewId[]);
}

function addSkill() {
  model.value.skills.push({ skillName: '' });
  assignPreviewIds(model.value.skills as ItemWithPreviewId[]);
}

function addHonor() {
  model.value.honors.push({ honorName: '', date: '', description: '' });
  assignPreviewIds(model.value.honors as ItemWithPreviewId[]);
}

defineExpose({
  getFieldMeta: () => localFieldMeta.value,
});
</script>

<style scoped>
.parse-preview {
  display: flex;
  gap: 16px;
  height: calc(100vh - 180px);
  min-height: 480px;
}

.preview-left {
  flex: 1.2;
  overflow-y: auto;
  padding-right: 8px;
}

.preview-right {
  flex: 0.8;
  min-width: 280px;
}

.raw-text-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--color-7, #fafafa);
  border-radius: 8px;
  padding: 12px;
  border: 1px solid #eee;
}

.raw-text-panel h4 {
  margin: 0 0 8px;
  font-size: 14px;
}

.raw-text {
  flex: 1;
  overflow: auto;
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  color: #666;
}

.array-item {
  padding: 12px;
  margin-bottom: 12px;
  border: 1px dashed #d9d9d9;
  border-radius: 8px;
}

.highlight-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 12px;
  font-size: 12px;
  color: #666;
}

.legend-item {
  padding: 2px 8px;
  border-radius: 4px;
  border: 1px solid transparent;
}

.legend-missing {
  border-color: #ff4d4f;
  background: #fff2f0;
  color: #cf1322;
}

.legend-low {
  border-color: #faad14;
  background: #fffbe6;
  color: #d48806;
}

.field-wrap {
  padding: 8px;
  margin-bottom: 4px;
  border-radius: 6px;
  border: 1px solid transparent;
  transition: background 0.2s, border-color 0.2s;
}

.field-wrap label {
  display: block;
  margin-bottom: 4px;
  font-size: 13px;
  color: #666;
}

.field-hint {
  margin-left: 6px;
  font-size: 12px;
  color: #cf1322;
  font-weight: normal;
}

.block-hint {
  display: block;
  margin: 0 0 6px;
  margin-left: 0;
}

.field-wrap.field-missing {
  border-color: #ff4d4f;
  background: #fff2f0;
}

.field-wrap.field-low {
  border-color: #faad14;
  background: #fffbe6;
}

.field-wrap.field-medium {
  border-color: #ffd666;
  background: #fffef0;
}

.field-missing :deep(.ant-input),
.field-missing :deep(.ant-input-affix-wrapper),
.field-missing :deep(.ant-input-outlined),
.field-missing :deep(.ant-input-textarea),
.field-missing :deep(textarea.ant-input) {
  border-color: #ff4d4f !important;
  background: #fff2f0 !important;
}

.field-low :deep(.ant-input),
.field-low :deep(.ant-input-affix-wrapper),
.field-low :deep(.ant-input-outlined),
.field-low :deep(.ant-input-textarea),
.field-low :deep(textarea.ant-input) {
  border-color: #faad14 !important;
  background: #fffbe6 !important;
}

.field-medium :deep(.ant-input),
.field-medium :deep(.ant-input-affix-wrapper),
.field-medium :deep(.ant-input-outlined),
.field-medium :deep(.ant-input-textarea),
.field-medium :deep(textarea.ant-input) {
  border-color: #ffd666 !important;
  background: #fffef0 !important;
}
</style>
