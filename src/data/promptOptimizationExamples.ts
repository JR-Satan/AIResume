import type { PromptOptimizationExample } from '../types/promptOptimization';
import type { ResumeContentSnapshot } from '../types/resume';

const createSnapshot = (overrides: Partial<ResumeContentSnapshot> = {}): ResumeContentSnapshot => ({
  personalInfo: {
    name: '张三',
    gender: '男',
    phone: '13800000000',
    email: 'student@example.com',
    university: '某某大学',
    politicalStatus: '共青团员',
    website: '',
    avatar: '',
    major: '软件工程',
    applicationPosition: '前端开发工程师',
    age: '21'
  },
  education: [
    {
      id: 1,
      school: '某某大学',
      degree: '本科',
      major: '软件工程',
      startDate: '2022-09',
      endDate: '2026-06'
    }
  ],
  workExperience: [],
  skills: [
    { id: 2, skillName: 'Vue、TypeScript、JavaScript、HTML、CSS' },
    { id: 3, skillName: 'Git、Vite、Pinia、Ant Design Vue' }
  ],
  projects: [],
  honors: [],
  summary: '',
  sectionOrder: ['personalInfo', 'education', 'projects', 'workExperience', 'skills', 'honors', 'summary'],
  ...overrides
});

export const promptOptimizationExamples: PromptOptimizationExample[] = [
  {
    id: 'single-project-star-frontend',
    title: '项目经历 STAR 润色：前端开发项目',
    task: 'single-star-polish',
    input: {
      fieldPath: 'projects[0].description',
      originalText: '负责前端页面开发，完成接口联调，优化页面效果。',
      targetPosition: '前端开发工程师',
      snapshot: createSnapshot({
        projects: [
          {
            id: 10,
            projectName: '智能求职模拟平台',
            role: '前端开发',
            startDate: '2026-03',
            endDate: '2026-06',
            briefIntroduction: '一个帮助学生制作简历和模拟面试的平台。',
            description: '负责前端页面开发，完成接口联调，优化页面效果。'
          }
        ]
      })
    },
    evaluationFocus: [
      '是否体现项目背景、个人任务、具体行动和结果',
      '是否突出 Vue、组件化、状态管理等前端岗位相关能力',
      '是否避免凭空编造访问量、性能提升百分比等数字'
    ],
    forbidden: [
      '不得编造真实用户量、获奖信息或上线效果',
      '不得改写 fieldPath 之外的字段'
    ]
  },
  {
    id: 'single-work-star-intern',
    title: '工作经历 STAR 润色：实习经历',
    task: 'single-star-polish',
    input: {
      fieldPath: 'workExperience[0].description',
      originalText: '参与公司后台管理系统开发，写了一些页面和接口。',
      targetPosition: '前端开发工程师',
      snapshot: createSnapshot({
        workExperience: [
          {
            id: 11,
            company: '某科技公司',
            position: '前端实习生',
            startDate: '2025-07',
            endDate: '2025-09',
            description: '参与公司后台管理系统开发，写了一些页面和接口。'
          }
        ]
      })
    },
    evaluationFocus: [
      '是否把笼统描述改为职责、行动和协作过程',
      '是否提示用户补充模块名称、接口数量或交付结果',
      '是否保持实习经历真实可信'
    ],
    forbidden: [
      '不得虚构公司业务规模',
      '不得直接生成未经提供的量化成果'
    ]
  },
  {
    id: 'batch-resume-polish',
    title: '全文批量润色：多字段最小修改集',
    task: 'batch-polish-resume',
    input: {
      snapshot: createSnapshot({
        projects: [
          {
            id: 12,
            projectName: '校园二手交易平台',
            role: '前端负责人',
            startDate: '2025-03',
            endDate: '2025-06',
            briefIntroduction: '做了一个二手交易系统。',
            description: '负责页面开发，做了发布商品、搜索商品、个人中心。'
          }
        ],
        honors: [
          {
            id: 13,
            honorName: '校级程序设计竞赛二等奖',
            date: '2025-05',
            description: '参加比赛并获奖。'
          }
        ],
        summary: '本人学习能力强，能吃苦，熟悉前端。'
      })
    },
    evaluationFocus: [
      '是否只返回允许润色字段的 operations',
      '是否保留 oldValue 并生成可回写 newValue',
      '是否避免修改姓名、学校、技能名称和模板配置'
    ],
    forbidden: [
      '不得返回 personalInfo、education、skills 等写回字段',
      '不得为了修改而修改所有字段'
    ]
  },
  {
    id: 'evaluate-resume-job-match',
    title: '简历评价：岗位匹配度不足',
    task: 'evaluate-resume',
    input: {
      snapshot: createSnapshot({
        personalInfo: {
          ...createSnapshot().personalInfo,
          applicationPosition: 'Java后端开发工程师'
        },
        projects: [
          {
            id: 14,
            projectName: '个人博客页面',
            role: '开发者',
            startDate: '2025-01',
            endDate: '2025-02',
            briefIntroduction: '一个静态博客页面。',
            description: '用 HTML 和 CSS 写了页面。'
          }
        ],
        summary: '熟悉前端页面开发，对后端也感兴趣。'
      })
    },
    evaluationFocus: [
      '是否能指出岗位匹配度不足',
      '是否给出可落地建议而非泛泛鼓励',
      '是否能定位到项目描述或个人总结字段'
    ],
    forbidden: [
      '不得把前端经历强行评价为高后端匹配',
      '不得给出无法执行的笼统建议'
    ]
  },
  {
    id: 'single-summary-polish',
    title: '个人总结润色：避免空泛表达',
    task: 'single-star-polish',
    input: {
      fieldPath: 'summary',
      originalText: '本人性格开朗，学习能力强，有责任心，希望找一份好工作。',
      targetPosition: '前端开发工程师',
      snapshot: createSnapshot({
        summary: '本人性格开朗，学习能力强，有责任心，希望找一份好工作。'
      })
    },
    evaluationFocus: [
      '是否减少空泛性格描述',
      '是否结合前端岗位能力表达',
      '是否提示用户补充项目、技术栈或成果'
    ],
    forbidden: [
      '不得编造不存在的项目经验',
      '不得输出过长或不适合简历总结的段落'
    ]
  }
];
