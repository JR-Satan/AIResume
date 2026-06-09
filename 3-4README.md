# 3-4 大模型润色组说明

## 1. 小组职责

3-4 大模型润色组负责在结构化简历数据基础上调用大模型，完成以下功能：

- 单条经历 STAR 原则润色
- 全文简历批量润色
- 简历四维评价：完整度、专业度、可读性、岗位匹配度
- 修改建议生成
- 用户确认后的字段级回写

3-4 不负责 OCR、简历字段录入、模板管理、版本存档、职位推荐和模拟面试。这些能力分别由 3-2、3-1、3-3、3-5 负责。

## 2. TextGrad 论文参考

参考文件：`D:\软件工程课设\text-grad.pdf`

论文核心思想是把生成式 AI 系统看成由多个文本变量组成的计算图，用大模型生成自然语言形式的反馈作为“文本梯度”，再用这些反馈更新变量。对应到本项目：

- 变量：简历字段内容，例如 `projects[0].description`
- Forward：先生成候选润色结果
- Backward：根据评价目标生成文本梯度，指出候选结果的问题
- Optimizer：结合原始字段、候选结果和文本梯度，生成最终可回写结果
- Loss / Objective：STAR 质量、事实真实性、专业表达、岗位匹配度、字段可回写性

本项目采用一轮 TextGrad 式测试时优化：

```text
原始简历字段
  -> Forward 生成候选润色
  -> Backward 生成文本梯度
  -> Optimizer 更新为最终结果
  -> 用户确认应用
```

这样比一次性 prompt 的优势是：候选结果会被再次审查，尤其能减少编造量化数据、字段路径不一致、格式不适合回写等问题。

## 3. 已实现文件

核心类型：

- `src/types/resume.d.ts`
- 新增 `ResumeContentSnapshot`
- 新增 `PolishOperation`
- 新增 `ResumeEvaluation`
- 新增 `BatchPolishResult`
- 新增 `TextGradOptimizationTrace`

核心 Store：

- `src/store/useResumeStore.ts`
- `getResumeSnapshot()`：返回不含展示配置和运行状态的简历快照
- `getFieldValue(fieldPath)`：读取字段值
- `applyPolishOperations(operations)`：按 `fieldPath + oldValue + newValue` 安全回写

核心服务：

- `src/services/aiPolishService.ts`
- `polishExperienceStar()`：单条经历 TextGrad STAR 润色
- `batchPolishResume()`：全文批量 TextGrad 润色
- `evaluateResume()`：简历四维评价和建议生成

核心界面：

- `src/views/resume/components/AIEnhancePopover.vue`
- `src/views/resume/components/ResumeAIPanel.vue`

配置：

- `.env`
- `.env.production`
- `.env.local.example`
- `vite.config.ts`
- `src/store/useSettingsStore.ts`
- `src/views/setting/index.vue`

## 4. 数据口径

3-4 统一使用 `ResumeContentSnapshot`，来源为：

```ts
const snapshot = resumeStore.getResumeSnapshot();
```

快照包含：

- `personalInfo`
- `education`
- `workExperience`
- `skills`
- `projects`
- `honors`
- `summary`
- `sectionOrder`

快照不包含：

- `resumeSetting`
- `currentId`
- `isFirstVisit`

## 5. 字段路径规范

所有 AI 回写必须使用 `fieldPath` 定位字段。

示例：

```ts
workExperience[0].description
projects[0].briefIntroduction
projects[0].description
honors[0].description
summary
```

回写操作结构：

```ts
{
  fieldPath: "projects[0].description",
  oldValue: "原始内容",
  newValue: "润色后的内容"
}
```

回写前会校验 `oldValue` 是否仍然等于当前字段值。如果用户在 AI 返回前已经编辑过该字段，系统会跳过回写，避免覆盖用户修改。

## 6. DeepSeek 配置

本地开发默认使用 DeepSeek：

```text
VITE_API_URL=/deepseek-api/chat/completions
model=deepseek-v4-pro
```

Vite 本地代理会把 `/deepseek-api` 转发到：

```text
https://api.deepseek.com
```

使用方式：

1. 启动项目。
2. 进入“网站配置”页面。
3. 填写 DeepSeek API Key。
4. 保持模型名为 `deepseek-v4-pro`。
5. 保持 API URL 为 `/deepseek-api/chat/completions`。

也可以复制 `.env.local.example` 为 `.env.local`，加入：

```text
DEEPSEEK_API_KEY=你的 DeepSeek Key
```

注意：不要把真实 API Key 提交到仓库。

## 7. 功能流程

### 7.1 单条经历 STAR 润色

用户在工作经历、项目经历、荣誉描述或个人总结中点击 AI 润色。

流程：

```text
组件传入 fieldPath + originalText
  -> 读取 resumeStore.getResumeSnapshot()
  -> polishExperienceStar()
  -> Forward 生成候选结果
  -> Backward 生成文本梯度
  -> Optimizer 生成最终结果
  -> 用户点击应用
  -> applyPolishOperations()
```

输出：

```ts
{
  fieldPath: string;
  originalText: string;
  polishedText: string;
  suggestions: string[];
  optimizationTrace: TextGradOptimizationTrace;
}
```

### 7.2 全文批量润色

入口在简历编辑页顶部的“3-4 大模型润色”面板。

处理范围：

- `workExperience.description`
- `projects.briefIntroduction`
- `projects.description`
- `honors.description`
- `summary`

不处理：

- 个人信息
- 教育经历
- 技能名称
- 模板配置
- 字号、间距、主题色等展示设置

### 7.3 四维评价

点击“简历评价”后输出：

```ts
{
  scores: {
    completeness: number;
    professionalism: number;
    readability: number;
    jobMatch: number;
    total: number;
  };
  comments: string[];
  suggestions: Array<{
    fieldPath?: string;
    problem: string;
    advice: string;
  }>;
}
```

## 8. 与其他小组对接

### 与 3-1 简历编辑组

- 3-1 提供当前简历数据所在 Store。
- 3-4 调用 `getResumeSnapshot()` 获取只读快照。
- 3-4 返回 `PolishOperation[]`。
- 3-1 或 Store 执行字段回写。

### 与 3-2 自动识别导入组

- 3-4 不直接处理 OCR 或 PDF。
- 3-2 导入确认后，3-4 可以重新读取快照进行评价。
- 3-4 不应自动弹窗或自动润色 OCR 结果。

### 与 3-3 用户模板管理组

- 用户应用 AI 润色结果后，3-3 可保存新版本。
- 建议版本元数据：

```ts
{
  source: "ai-polish",
  qualityScore: {
    completeness: number;
    professionalism: number;
    readability: number;
    jobMatch: number;
  },
  polishSummary: string
}
```

### 与 3-5 模拟面试及职位推送组

- 3-5 可读取 3-4 评价结果中的岗位匹配度和建议。
- 3-4 不负责职位推荐和面试问答。

## 9. 验收建议

建议准备以下演示场景：

1. 填充示例简历。
2. 对单条项目经历执行 AI 润色。
3. 展开“TextGrad 反馈”，展示文本梯度。
4. 点击“应用”，观察右侧预览同步更新。
5. 修改原字段后再应用旧 AI 结果，证明 oldValue 校验能防止覆盖。
6. 点击“全文润色”，展示多条 `fieldPath` 操作。
7. 点击“简历评价”，展示四维评分和字段级建议。

## 10. 当前限制

- TextGrad 当前实现为一轮优化，没有做多轮迭代和早停。
- 前端直接保存 API Key 到浏览器本地存储，适合课程设计演示，不适合正式生产。
- 生产部署时需要后端代理 DeepSeek，避免浏览器暴露 Key。
- AI 输出依赖模型稳定性，如果模型没有返回合法 JSON，服务会降级使用候选结果。
- 版本存档仍需 3-3 组接入。

## 11. 运行命令

安装依赖：

```bash
npm ci
```

本地开发：

```bash
npm run dev
```

构建验证：

```bash
npm run build
```
