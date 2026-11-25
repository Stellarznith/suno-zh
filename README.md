# Suno 中文助手

Suno 最新版全界面油猴汉化脚本（v0.2.0）。本项目 Fork 自 [zenoskongfu/suno-zh](https://github.com/zenoskongfu/suno-zh)，已基于 2026-11 最新版 Suno 网页结构全面重构适配。支持**全中文**、**中英对照**与**恢复英文**三态一键切换；翻译完全通过本地词典完成，不调用外部翻译 API，也不上传任何页面或个人数据。

**当前为 v0.2.0 版本**（基于 2026-11-25 真实登录态 Suno 网页勘察全面重构适配）。不是 Suno 官方产品。

## 安装与使用

1. 在桌面 Chrome / Edge 中安装 [Tampermonkey](https://www.tampermonkey.net/)（或 Violentmonkey / ScriptCat）。
2. **开启脚本执行权限**：右键 Chrome 工具栏的油猴图标 → 管理扩展程序 → 打开“允许用户脚本”。旧版浏览器设置见 [官方说明](https://www.tampermonkey.net/faq.php?q=Q209)。
3. 点击 [安装 Suno 中文助手 v0.2.0](https://raw.githubusercontent.com/Stellarznith/suno-zh/main/dist/suno-zh.user.js)，在油猴安装页确认安装（或从 Greasy Fork 安装，也可以在 Tampermonkey 管理面板新建脚本粘贴 `dist/suno-zh.user.js` 完整内容）。
4. 刷新 [Suno](https://suno.com/create)。脚本仅匹配 `suno.com` 和 `www.suno.com`。
5. **三态显示切换（全中文 / 中英对照 / 恢复英文）**：
   - **页内悬浮快捷胶囊**：页面右下角默认提供 `中` / `中英` / `EN` 悬浮按钮，点击即刻无刷新切换；点击 `×` 可隐藏悬浮胶囊。
   - **油猴扩展菜单**：点击浏览器右上角油猴图标，可随时在「全中文 / Chinese」「中英对照 / Bilingual」「恢复英文 / English」之间切换，或重新开启/隐藏页内悬浮开关。你的选择会自动持久化保存。

页面上未收录的文字会保留英文原样。歌词编辑框、风格输入框、歌曲标题、作者名称及评论正文均受到严格保护，绝不作为翻译对象。

## 覆盖范围（v0.2.0）

- **全局导航与侧边栏**：Home、Explore、Create、Studio、Library、Earn credits、Labs、Notifications、More、Upgrade to Premier、顶部促销横幅、个人菜单（Subscription / Account / Restrictions / Language / Theme / My taste / Sign out）与 More 菜单。
- **创作页（`/create` 与 `/create/visuals`）**：
  - 顶层四大创作类型：`Songs`、`Speech`、`Sounds`、`Visuals`。
  - `Songs`（Simple / Advanced、Audio / Voice / Inspo、Model 选择弹窗、Lyrics/Styles 工具栏、More Options 全部选项与滑块、保存与工作区选择）。
  - `Speech`（Script / Tone / Background music / Variety）、`Sounds`（Type / BPM / Key）、`Visuals`（Image / Video、Model、Frame/References、Lip sync、Clip length、Aspect ratio）。
  - 右侧列表栏、排序/视图/筛选器以及引导挑战卡片。
- **资料库（`/me` 及子页）**：Songs、Playlists、Albums、Workspaces、Studio Projects、Hooks、Liked Hooks、History、排序与筛选弹窗、新版 ARIA 三点菜单及子菜单（Remix / Edit / Create visual / Manage 等）。
- **其他页面**：Home（`/discover`）、Explore（`/explore`）、歌曲详情页（`/song/...` 固定标题与评论区控件）、Studio（`/studio`）、Labs（`/labs`）、登录页（`/sign-in`）、底部播放栏与 404 页面。

## 开发与验证

需要 Node.js 22+：

```sh
npm ci
npm run check
```

`check` 包含 TypeScript 类型检查（`tsc --noEmit`）、Vitest DOM 单元测试（`vitest run`）和 esbuild 打包构建（输出 `dist/suno-zh.user.js`）。

- `src/dictionary.ts`：按页面区域分组的静态词典、动态文案模板与中英对照格式化器。
- `src/adapter.ts`：新版 Suno 语义定位、SPA 路由识别与用户内容保护边界。
- `src/engine.ts`：增量遍历、时间片调度、三态切换与原生 SPA 路由监听引擎。
- `src/switcher.ts`：右下角可隐藏的三态快捷切换悬浮胶囊。
- `src/userscript.ts`：油猴持久化配置、菜单注册与生命周期管理。

## 本地可视化预览

运行 `npm run build` 和 `npm run preview`，然后打开 `http://127.0.0.1:4319/create`（页面内提供 `/create`、`/create/visuals`、`/me`、`/discover`、`/song/synthetic`、`/studio` 模拟路由跳转，使用本地 `localStorage` 模拟油猴菜单）。
