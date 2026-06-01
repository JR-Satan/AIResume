# AIResume

[![GitHub Stars](https://img.shields.io/github/stars/weidong-repo/AIResume)](https://github.com/weidong-repo/AIResume/stargazers)
[![GitHub Forks](https://img.shields.io/github/forks/weidong-repo/AIResume)](https://github.com/weidong-repo/AIResume/network/members)
[![GitHub Issues](https://img.shields.io/github/issues/weidong-repo/AIResume)](https://github.com/weidong-repo/AIResume/issues)
[![GitHub Solved Issues](https://img.shields.io/github/issues-closed/weidong-repo/AIResume)](https://github.com/weidong-repo/AIResume/issues?q=is%3Aissue+is%3Aclosed)
[![GitHub Last Commit](https://img.shields.io/github/last-commit/weidong-repo/AIResume)](https://github.com/weidong-repo/AIResume/commits/main)

## 📌 项目介绍

**AIResume** 是一个开源的简历制作平台，帮助用户轻松创建专业简历，融合 AI 技术，辅助用户润色简历。我们欢迎对前端技术感兴趣的朋友参与 **`模板开发`**！

- **技术栈**：Vue 3 + Vite + TypeScript + Ant Design Vue
- **项目预览**：[AIResume 预览地址](https://resume.404.pub/) （部署于 Cloudflare Pages）

## 🎨 项目预览

编辑简历

![image-20250222224820478](https://img.fish9.cn/blog-img/2023/image-20250222224820478.png)

简历市场

![image-20250222224844722](https://img.fish9.cn/blog-img/2023/image-20250222224844722.png)

AI模拟拷打：

![img](https://img.fish9.cn/blog-img/2023/image-20250226124049111.png)

AI润色

![image-20250222224945177](https://img.fish9.cn/blog-img/2023/image-20250222224945177.png)

简历高度自定义配置”

![image-20250310231433143](https://img.fish9.cn/blog-img/2023/image-20250310231433143.png)

## 🚀 快速开始

### 1️⃣ 运行环境要求

- **Node.js**：18+

### 2️⃣ 克隆并安装依赖

```bash
git clone https://github.com/weidong-repo/AIResume.git
cd AIResume
npm install
```

### 3️⃣ 运行项目

```bash
npm run dev
```

## 🔥想自己部署同样的项目？

点击此处链接，[发行版本](https://github.com/weidong-repo/AIResume/releases)
找到最新版本的release.zip
然后把release.zip解压部署到您网站根目录上，访问域名即可

## 🔥欢迎有前端能力的朋友开发简历模板加入项目

简历模板开发方式：
1. 复制一份`/template/dev`目录，然后按照里面的数据挂载到前端即可。
2. 然后完善您模板目录下的`config.json`和`preview.jpg`（注意，config.json中的id务必是唯一值）
3. 最后，请在`/public/templates.json`文件中加上您开发的模板信息（直接复制`config.json`的即可！）



## 🌍 使用 Cloudflare Worker 进行 API 反向代理

本项目可使用 **Cloudflare Worker** 进行反向代理，以解决跨域问题。例如，针对 **阿里云百炼 API**：

1. 将 `workers.js` 上传至 Cloudflare Worker
2. 配置密钥 `API_URL` 指向大模型 API 地址（本项目接口适配 OpenAI 兼容 API，如阿里云、DeepSeek 等）

示例（阿里云 API 地址）：

```bash
https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions
```

✅ 兼容 OpenAI API 的大模型均可无缝切换！

**只需更改 `API_URL` 和 API Key，即可快速替换大模型！**

------

## 🛠️ 其它反向代理方式

如果不想使用 Cloudflare Worker，也可以使用其他工具进行反代。**核心要求：只需解决跨域问题，即可流畅调用大模型 API！**

------

## 🎯 已完成功能

主要功能：

- ✅ 简历编辑，数据前端持久化
- ✅ 简历导出为 PDF
- ✅ 简历多模板，支持热插拔切换
- ✅ 多套简历模板，支持前端开发者共创
- ✅ 简历撰写的时候，AI可以进行润色
- ✅ AI简历深挖 利用ai 基于单个项目或者经历的长对话对简历进行深度优化
- ✅ AI模拟面试 针对单一项目或者经历对用户进行面试拷打
- ✅ 本地登录/注册与基础用户信息管理（纯前端本地存储，详见 [docs/LOGIN_FEATURE.md](docs/LOGIN_FEATURE.md)）

细节功能：

- ✅ 模板主题色切换

- ✅ 简历高度自定义，如段落间距、区块间距、字体大小、页边距等

- ✅ 网站整体明/暗色切换

- ✅ 右侧实时预览，自动同步用户编辑内容

- ✅ 预览界面可拖动缩放简历

- ✅ 导出 / 导入简历数据

- ✅ 清空数据

- ✅ 预填充示例数据

- ✅ 一键填充虚假数据（快速查看简历效果）

- ✅ 模板市场展示

- ✅ 模板信息展示作者的昵称以及网站

------

## 📝 待实现功能

- [ ] **AI 面试官**（大模型读取简历，进行实时对话 / 语音通话）
- [ ] **可视化简历设计**（支持非前端开发者用户拖拽设计简历）
- [ ] **简历布局调整**（左侧拖拽调整右侧内容块顺序）
- [ ] **数据隐藏功能**（支持隐藏部分信息，但数据仍保留）

🔥 **欢迎 Star & Fork 本项目，一起完善 AIResume！**

# Stars历史记录

[![Star History Chart](https://api.star-history.com/svg?repos=weidong-repo/AIResume&type=Date)](https://www.star-history.com/#weidong-repo/AIResume&Date)
