# 本地登录/注册与用户信息管理

本功能为 AIResume 增加了**本地登录 / 注册**与**基础用户信息管理**，无需第三方登录，也无需后端服务器。

## 背景

AIResume 是纯前端项目（Vue 3 + Vite + TypeScript + Ant Design Vue + Pinia 持久化）。
本功能在不引入后端的前提下，提供账号体系，并为「登录后匹配多版本简历存档等个人信息」预留了可平滑替换为后端的接口层。

## 功能点

- **注册**：用户名 + 密码（可选昵称），注册成功后自动登录
- **登录 / 退出**：用户名密码校验，登录态持久化（刷新后保持）
- **强制登录**：除登录 / 注册页外，所有页面必须登录后才能访问
- **用户信息管理**：修改昵称、头像，修改密码
- **顶部导航入口**：未登录显示「登录/注册」，已登录显示昵称并可进入个人中心

## 技术实现

- **存储**：用户数据存于浏览器 `localStorage`
  - `ai_resume_users`：用户表
  - `ai_resume_session`：当前登录用户 id（由 service 维护）
  - 登录态另由 Pinia 持久化插件存储
- **初始账号 JSON**：`public/users.json`
  - 页面启动时会把该文件中的账号合并进 `ai_resume_users`
  - 运行时注册、改密仍保存到浏览器本地 JSON 用户表，纯前端无法直接写回静态 `public/users.json`
  - 默认账号：`admin` / `admin123456`
- **密码安全**：密码不以明文存储，使用项目已有依赖 `crypto-js`，以「随机盐 + SHA256」方式哈希后保存
- **状态管理**：`src/store/useUserStore.ts`，沿用项目现有 setup-store + `persist: true` 风格

## 目录结构

```
src/
├── services/
│   ├── authService.ts      # 认证数据访问层（注册/登录/资料/改密）
│   └── archiveService.ts   # 简历存档接口（按用户隔离 key，预留实现）
├── store/
│   └── useUserStore.ts     # 用户状态 store
├── types/
│   └── user.d.ts           # 用户相关类型
└── views/
    ├── auth/index.vue      # 登录 / 注册页
    └── profile/index.vue   # 个人中心页
```

## 面向未来：对接后端的扩展点

所有用户与存档的数据访问都收敛在 `src/services/` 一层：

- 现在：内部用 `localStorage` 实现
- 将来：只需把 `authService.ts` / `archiveService.ts` 各方法内部替换为 `fetch` 后端请求，
  **上层 store 与页面无需改动**

`archiveService.ts` 已约定按用户隔离的存储 key（`ai_resume_archive_<userId>`，未登录用 `guest`），
并预留了 `listArchives / saveArchive / loadArchive / deleteArchive` 接口签名。
未来实现「每个用户独立的多版本简历存档」时，在此填充实现即可。

## 安全声明

本功能为**纯前端本地方案**，仅适用于个人/演示场景：

- 数据只保存在当前浏览器，**更换设备或清除缓存会丢失**
- 密码虽经哈希，但前端无法提供企业级账号安全
- 如需多端同步与真实安全保障，请按上文扩展点对接后端
