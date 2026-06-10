import type { JobProfile } from '@/types/interviewJobs';

export const JOB_DATABASE: JobProfile[] = [
  {
    id: 'ai-engineer',
    title: '人工智能算法工程师',
    industry: '人工智能/互联网',
    level: '应届/初级',
    keywords: ['Python', '机器学习', '深度学习', 'PyTorch', 'TensorFlow', 'NLP', '计算机视觉', '算法', '数据处理'],
    responsibilities: ['负责模型训练、评估和推理服务优化', '参与 NLP、推荐、视觉等算法模块开发', '结合业务数据完成模型效果分析和迭代'],
    requirements: ['熟悉 Python 和常用机器学习框架', '理解常见模型评估指标和训练流程', '有项目实践、竞赛或论文复现经验优先']
  },
  {
    id: 'python-backend',
    title: 'Python 后端开发工程师',
    industry: '互联网/软件服务',
    level: '应届/初级',
    keywords: ['Python', 'FastAPI', 'Django', 'Flask', 'MySQL', 'Redis', 'Docker', 'Linux', 'API', '数据库'],
    responsibilities: ['设计和开发后端接口、业务服务和数据访问层', '参与数据库表结构设计和性能优化', '配合前端、测试完成产品功能交付'],
    requirements: ['熟悉 Python Web 框架和 RESTful API', '掌握 MySQL、Redis 等常用中间件', '理解基本的软件工程和接口联调流程']
  },
  {
    id: 'data-analyst',
    title: '数据分析师',
    industry: '互联网/金融/零售',
    level: '应届/初级',
    keywords: ['SQL', 'Python', 'Pandas', 'Excel', 'Tableau', 'PowerBI', '数据可视化', '统计分析', 'A/B测试'],
    responsibilities: ['基于业务数据完成指标分析和报表建设', '定位业务问题并输出数据洞察', '参与实验分析、用户画像和经营分析'],
    requirements: ['熟悉 SQL、Excel 和至少一种数据分析工具', '具备统计分析和可视化表达能力', '能将数据结论转化为业务建议']
  },
  {
    id: 'frontend-engineer',
    title: '前端开发工程师',
    industry: '互联网/软件服务',
    level: '应届/初级',
    keywords: ['HTML', 'CSS', 'JavaScript', 'TypeScript', 'Vue', 'React', '组件化', '前端工程化', 'Webpack', 'Vite'],
    responsibilities: ['负责 Web 页面和交互功能开发', '与后端联调接口并优化用户体验', '沉淀通用组件和前端工程化能力'],
    requirements: ['熟悉 HTML、CSS、JavaScript 基础', '掌握 Vue 或 React 至少一种框架', '理解组件化、状态管理和接口联调']
  },
  {
    id: 'product-assistant',
    title: '产品经理助理',
    industry: '互联网/企业服务',
    level: '实习/应届',
    keywords: ['需求分析', '原型设计', 'Axure', '墨刀', '用户调研', '竞品分析', 'PRD', '项目管理', '沟通'],
    responsibilities: ['协助完成用户调研、需求整理和产品原型', '跟进开发测试上线流程', '分析竞品和用户反馈，提出迭代建议'],
    requirements: ['具备清晰的需求分析和文档表达能力', '熟悉原型工具和基础项目管理流程', '有校园项目、实习或产品作品优先']
  },
  {
    id: 'software-testing',
    title: '软件测试工程师',
    industry: '软件服务/互联网',
    level: '应届/初级',
    keywords: ['测试用例', '自动化测试', 'Python', 'Selenium', '接口测试', 'Postman', '性能测试', '缺陷管理'],
    responsibilities: ['根据需求设计测试用例并执行测试', '完成接口、Web 或自动化测试脚本开发', '跟踪缺陷并推动问题闭环'],
    requirements: ['理解软件测试流程和常见测试方法', '熟悉 Postman、Selenium 或 Pytest 优先', '具备细致的问题定位和沟通能力']
  }
];
