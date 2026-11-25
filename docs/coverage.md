# 文案与定位清单（v0.2.0）

最近勘察日期：2026-11-25（基于登录态 `suno.com` 真实网页只读 DOM 核对）。仅记录固定 UI 文案与结构，不保存真实歌曲或账户信息。完整词典见 `src/dictionary.ts`。

| 区域 | 现场观察的英文 | 定位依据 | 保护边界 |
| --- | --- | --- | --- |
| 主导航与侧边栏 | Home / Explore / Create / Studio / Library / Earn credits / Labs / Notifications / More / Upgrade to Premier | `/discover`、`/explore`、`/create`、`/studio`、`/me`、`/earn-credits`、`/labs`、`/account*` 路由与 `nav`/`aside`/`header` 语义节点 | `a[href^="/@"]`、歌曲链接不匹配 |
| 创作类型与模式 | Songs / Speech / Sounds / Visuals；Simple / Advanced；Image / Video | `[role="tablist"][aria-label="What to create"]`、`[aria-label="Create form mode"]`、`[aria-label="Image or video"]` | 输入值与动态占位符文本保持原文 |
| 创作区与高级选项 | Audio / Voice / Inspo / Lyrics / Styles / More Options / Exclude styles / Vocal Gender / Duration / Max Mode / Weirdness / Style Influence / Variety / Personalize / Script / Tone / Sound / Clip length / Aspect ratio | 创作表单最小语义容器及 `/create` 页面控件 | 跳过 `[aria-label="Lyrics editor"]`、不深入 `textarea` 文本节点、不修改 `value` 与 `aria-label` |
| 资料库标签 | Songs / Playlists / Albums / Workspaces / Studio Projects / Hooks / Liked Hooks / History | `[role="tablist"]` 下的 `a[role="tab"]` | 不替换同名普通按钮与歌曲名 |
| 筛选、排序与视图 | Filters (N) / Sort by Newest / View: List / Liked / Disliked / Public / Private / Uploads / Full song / Cover / Downloads / Hide Disliked / Hide Stems | `button[role="combobox"]` 的 `aria-controls` 关联至 `[role="listbox"]` | 不硬编码动态 `base-ui-*` ID，不翻译未绑定触发器的列表 |
| 歌曲菜单与子菜单 | Remix / Edit / Publish / Share / Create visual / Download / Manage / Add to queue / Add to playlist / Song radio / Report / Move to trash 及展开子项 | 新版 `[role="menu"] [role="menuitem"]` 与兼容 `.context-menu-item > button[aria-label]` | 仅放行动作按钮，隔离所属歌卡的标题与 Prompt |
| 详情页与评论区 | Follow / Play / Like / N Comments / Lyrics / Styles / Made from / More by Author / Similar songs / Sort by / Reply / Creator / at MM:SS | `/song/...` 下的标题、按钮与白名单短标签 | 保护主歌名 `h1`、作者 `a[href^="/@"]`、风格 `a[href^="/style/"]`、歌词正文与评论正文 |
| 其他页面 | `/discover`、`/explore`、`/studio`、`/labs`、`/sign-in`、播放栏与 404 | 对应路由下的固定按钮、标题与输入框 `placeholder` | 歌曲卡片容器 `[data-testid="clip-row"]` 与含 `/song/` 链接的 `[role="group"]` |

`base-ui-*` ID 与打包哈希类名会随发布变化，脚本均避免将其作为硬编码定位依据；所有已失效的旧版 `.context-menu-item` 与嵌入式左侧面板假设均已更新并保留向后兼容。

## v0.2.1 增量适配（Tooltip 悬停气泡）
- **定位机制**：Suno 悬停提示均通过 `[data-base-ui-portal]` 下 `role="presentation"` 与 `[data-base-ui-focusable]:not([role])` 挂载（不使用原生 `title` 或 `role="tooltip"`）。
- **覆盖范围**：创作页 `Audio` / `Voice` / `Image` / `Inspo` / 工具栏图标 / `More Options` 参数说明、Speech & Sounds 参数提示、Visuals 提示与剩余积分（`Credits remaining: N`）、折叠侧边栏导航提示以及播放栏提示，支持全中文与中英对照切换。

## v0.2.2 全量二级菜单与弹窗覆盖
- **结构补齐**：支持 `role="menuitemcheckbox"`（`Manage` 子菜单开关）、`role="menuitemradio"`（`Theme` / `Language`）、无 `aria-label` 的 `.context-menu-item` 按钮组（`+ Audio`：`Upload`/`Browse`/`Record`）。
- **语义纠偏**：徽章 `New` 译为「新」（修复此前误译为「新建」），`Mashup` 译为「混搭」并增强中英对照括号防重逻辑。
- **全量词条**：补齐 `Edit` 全部子菜单（`Remove section` / `Reverse` / `Adjust speed` / `Find a collaborator` / `Fade in` / `Fade out` / `Open in Editor`）、`Create visual`（`Cover art` / `Video clip`）、`Manage`（`Downloads` -> 允许下载）、`Theme`（`Dark` / `Light` / `System`）、`Download` / `Share` / `Add to playlist` / `Move to workspace` / `My taste` / `Notifications Settings` 弹窗、Visuals `Model` 套餐选项与 `Style Guide` 全部 56 项技法词条、以及 `/studio` 顶/底二级菜单。
