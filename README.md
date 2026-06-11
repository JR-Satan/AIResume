# AIResume 智能求职模拟平台

版本号：V1.0

AIResume 是一个基于 Vue 3、TypeScript、Vite 和 Ant Design Vue 的智能求职模拟平台，围绕简历制作、智能导入、简历优化、模板管理、历史版本、岗位推荐和模拟面试等流程，提供从简历录入到求职训练的一体化体验。

## 项目功能

- 简历新建与在线编辑：支持个人信息、教育经历、项目经历、工作经历、专业技能、荣誉奖项和个人简介等内容维护。
- 智能简历导入：支持图片和 PDF 简历 OCR 识别，并将非结构化文本解析填充到系统字段。
- 用户与登录管理：支持本地账号注册、强制登录、登录态保存和局域网扫码登录。
- 历史版本管理：支持按用户和模板隔离保存简历历史版本，查看、预览、恢复和删除历史记录。
- 模板市场与模板切换：支持多套简历模板分类展示、切换和实时预览。
- 高保真导出：支持导出 PDF，并可选择不同 DPI 清晰度。
- AI 简历优化：支持基于大模型的简历润色、结构建议、质量评分和岗位匹配建议。
- 岗位推荐与模拟面试：支持根据简历特征推荐岗位，并进行文本或语音模拟面试。

## 小组分工

- 3-1 简历新建编辑组：负责结构化简历录入表单、在线编辑器、简历模块动态增删和拖拽排序。
- 3-2 自动识别导入组：负责图片/PDF 简历 OCR 识别、文本解析和字段填充。
- 3-3 用户模板管理组：负责用户账号体系、多版本简历存档、多风格模板分类展示和高保真下载管理。
- 3-4 大模型润色组：负责 LLM 简历润色、STAR 原则优化、简历质量评价和修改建议。
- 3-5 模拟面试及职位推送组：负责简历特征匹配、岗位推荐、文本面试和语音面试。

## 技术栈

- 前端框架：Vue 3
- 开发语言：TypeScript
- 构建工具：Vite
- 状态管理：Pinia
- UI 组件：Ant Design Vue
- PDF 导出：html2pdf.js
- OCR/PDF 解析：tesseract.js、pdfjs-dist

## 本地运行

```powershell
npm install
npm run dev
```

如需局域网扫码登录，请确保电脑和手机在同一网络下。当前 Vite 配置已启用 `host: true`，开发服务会尽量使用可被手机访问的局域网地址生成扫码链接。

## 构建

```powershell
npm run build
```

构建完成后产物位于 `dist` 目录。

## 目录说明

- `src/views/resume`：简历制作页面、编辑表单、预览和历史版本面板。
- `src/views/template`：模板市场页面。
- `src/views/auth`：登录、注册和扫码登录入口。
- `src/services/authService.ts`：本地用户认证服务。
- `src/services/archiveService.ts`：简历历史版本存档服务。
- `src/services/ocr`：OCR 与 PDF 文字提取服务。
- `src/services/parser`：简历文本解析服务。
- `src/services/interviewJobs`：岗位推荐和面试相关服务。
- `src/template`：多套简历模板组件。
- `public/templates.json`：模板市场配置数据。
- `public/users.json`：初始账号数据。
