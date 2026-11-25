# 验证记录与限制（v0.2.0）

日期：2026-11-25。状态：**已完成最新版 Suno 登录态只读 DOM 勘察、代码适配、本地全量自动化测试与脚本构建**。

## 已执行

1. **真实 Suno 只读 DOM 与文案勘察**（登录态 `https://suno.com`）：
   - 核对并确认旧版选择器的存活与失效情况：
     - `.context-menu-item` 已在最新版失效，全面迁移为标准 ARIA `[role="menu"] [role="menuitem"]`；
     - `/me`、`/discover`、`/explore`、`/song/...` 不再嵌入左侧创作面板，创作表单收敛于 `/create` 与 `/create/visuals`；
     - `/me` 等页面中的歌卡从 `[data-testid="clip-row"]` 变为 `[role="group"]` 包裹 `h4 a[href^="/song/"]`；
     - `/me/voices` 已返回 404，新增 `Albums`、`Studio Projects`、`Hooks`、`Liked Hooks`、`History` 标签；
     - `/create` 顶层新增 `What to create`（`Songs` / `Speech` / `Sounds` / `Visuals`）及各自参数区与弹窗。
   - 全程未点击生成歌曲、未上传文件、未修改账户或发布/删除任何作品。

2. **架构与功能升级**：
   - `TranslationEngine` 支持 `'zh' | 'bilingual' | 'en'` 三态切换，支持 `zh <-> bilingual` 直接基于 `original` 重算而不套娃，支持 SPA `popstate`/pathname 变化重扫，并在 `walk` 与 `process` 中跳过 `textarea` 文本节点同时允许翻译 `textarea` 的 `placeholder`。
   - `sunoAdapter` 全面覆盖新版导航、`/create`、`/create/visuals`、`/me`、`/discover`、`/explore`、`/song/...`、`/studio`、`/labs`、`/sign-in` 与弹窗/菜单，并强化歌卡、歌名 `h1`、作者、歌词正文、风格标签与评论正文的保护。
   - 新增页内右下角暗黑玻璃风悬浮开关（`src/switcher.ts`），与油猴四项菜单双向同步并持久化。

3. **自动化检查**：
   - `npm run check`（`tsc --noEmit` + `vitest run` + `node scripts/build.mjs`）全量验证通过。

## 限制说明

- 本仓库的 `aria-label` 与表单 `value` 仍保持原文不改动，以免影响 Suno 自身的 Base UI 交互定位及无障碍状态。
- 真实浏览器端安装 Tampermonkey 后的最终目视检查可按需在 `https://suno.com/create` 页面安装 `dist/suno-zh.user.js` 进行实测体验；若遇异常可随时通过右下角 `EN` 按钮或油猴菜单一键恢复英文。

## v0.2.1 Tooltip 专项验证（2026-11-25）
- 通过真实登录态 Suno 页面逐个悬停实测，确认 Tooltip 均使用 Base UI Portal 渲染而非原生 `title` 属性。
- 在 `src/engine.ts` 监听 `data-open`，在 `src/adapter.ts` 与 `src/dictionary.ts` 新增 Base UI Portal Tooltip 选择器与 30+ 条悬停提示文案及动态剩余积分模板。
- 新增 `tests/adapter.test.ts` Tooltip 三态测试并重新运行 `npm run check` 全部通过。
