import type { ActiveTranslationMode, TranslationAdapter } from './engine';
import {
  auth,
  creation,
  dialogs,
  discover,
  filters,
  library,
  lookup,
  lookupDynamic,
  menus,
  navigation,
  playbar,
  song,
  studio,
  tooltips,
  type Dictionary,
  type DynamicScope,
} from './dictionary';

const protectedSelector = [
  'script',
  'style',
  'noscript',
  'pre',
  'code',
  '[contenteditable]:not([contenteditable="false"])',
  '.clip-title-wrapper',
  'a[href^="/song/"]',
  'a[href^="/s/"]',
  'a[href^="/@"]',
  'a[href^="/playlist/"]',
  'a[href^="/workspace/"]',
  'a[href^="/style/"]',
  'a[href^="/album/"]',
  '[data-testid*="song-title"]',
  '[data-testid*="song-card"]',
  '[data-testid*="song-row"]',
].join(',');

const actionSelector = 'button,[role="button"],[role="tab"],[role="option"],[role="menuitem"],label,h1,h2,h3';

const canonicalRoutes = new Set([
  '/',
  '/discover',
  '/explore',
  '/create',
  '/create/visuals',
  '/me',
  '/me/trash',
  '/studio',
  '/earn-credits',
  '/labs',
]);

/** 资料库页面中非 tab 的安全按钮词典（避免把任意普通按钮中的 Styles/Songs 误翻） */
const libraryActionDict: Dictionary = {
  Filters: '筛选',
  'Create Playlist': '创建播放列表',
  'Create playlist': '创建播放列表',
  'New Playlist': '新建播放列表',
  'New playlist': '新建播放列表',
  'New Workspace': '新建工作区',
  'New workspace': '新建工作区',
  'Upload audio': '上传音频',
  'Upload Audio': '上传音频',
  Audio: '音频',
  Trash: '回收站',
  Newest: '最新优先',
  Oldest: '最早优先',
  'Most liked': '最多点赞',
  'Least liked': '最少点赞',
  Share: '分享',
  Play: '播放',
  Pause: '暂停',
  Like: '点赞',
  Dislike: '不喜欢',
};

interface MatchContext {
  dictionary: Dictionary;
  scope?: DynamicScope;
  fallback?: Dictionary[];
}

function isAction(element: Element) {
  return Boolean(element.closest(actionSelector));
}

function getPathname(element: Element) {
  return element.ownerDocument.location?.pathname ?? '';
}

function onPage(element: Element, path: string) {
  const pathname = getPathname(element);
  if (pathname === path) return true;
  if (path.endsWith('/')) return pathname.startsWith(path);
  return pathname.startsWith(`${path}/`);
}

function contextMenuAction(element: Element) {
  return element.closest('.context-menu-item > button[aria-label], [role="menuitem"]');
}

/** 判断元素是否位于歌曲卡片容器内，并仅放行非歌名的固定操作按钮 */
function isInProtectedSongCard(element: Element, checkDirectContainer = false): boolean {
  const clipRow = element.closest('[data-testid="clip-row"]');
  const groupCard = element.closest('[role="group"]');
  const card = clipRow ?? (groupCard && groupCard.querySelector('h4 a[href^="/song/"], a[href^="/song/"]') ? groupCard : null);
  if (!card) return false;

  // 避免将全局区域大容器（如 Library section）误判为单曲卡片。
  if (!clipRow && card.getAttribute('aria-label') === 'Library section') return false;

  // 允许 walk() 进入卡片容器以处理内部的固定按钮和菜单，但卡片本身的直接文本节点仍受保护。
  if (element === card) return checkDirectContainer;

  const button = element.closest('button');
  if (button && card.contains(button) && !button.closest('h4, a[href^="/song/"]')) {
    const ariaLabel = button.getAttribute('aria-label') ?? '';
    if (!ariaLabel.startsWith('Play ')) {
      return false;
    }
  }
  return true;
}

// 缓存单次同步批处理内的创作表单根节点查找结果，微任务结束后立即清除以适应 SPA 切换。
const createRoots = new WeakMap<Document, Element | null>();
function inCreateForm(element: Element) {
  const doc = element.ownerDocument;
  if (!createRoots.has(doc)) {
    let form: Element | null = null;
    const anchor = doc.querySelector(
      '[role="tablist"][aria-label="Create form mode"], [role="tablist"][aria-label="What to create"], [role="tablist"][aria-label="Image or video"]',
    );
    for (let root = anchor?.parentElement; root && root !== doc.body; root = root.parentElement) {
      if (
        root.querySelector(
          '[aria-label="Lyrics editor"], [data-testid="create-form-styles-wrapper"], [aria-label="Song Description"], [aria-label="Script"], [aria-label="Sound"], button[aria-label="Create song"], button[aria-label="Create speech"], input[placeholder="Describe your video in detail"]',
        )
      ) {
        form = root;
        break;
      }
    }
    createRoots.set(doc, form);
    queueMicrotask(() => createRoots.delete(doc));
  }
  return createRoots.get(doc)?.contains(element) ?? false;
}

function getBoundListboxTrigger(element: Element): Element | undefined {
  const popup = element.closest('[role="listbox"]');
  if (!popup?.id) return undefined;
  return [...element.ownerDocument.querySelectorAll('button[role="combobox"][aria-controls]')].find(
    button => button.getAttribute('aria-controls') === popup.id,
  );
}

function isNavigationRoute(href: string) {
  return canonicalRoutes.has(href) || href.startsWith('/account');
}

function isTooltip(element: Element) {
  return Boolean(
    element.closest('[role="tooltip"]') ||
      element.closest(
        '[data-base-ui-portal] [role="presentation"] [data-base-ui-focusable]:not([role]), [data-base-ui-portal] [data-side][data-base-ui-focusable]:not([role])',
      ),
  );
}

function selectContext(element: Element): MatchContext | undefined {
  // 1. 路由链接与资料库 Tab
  const link = element.closest('a[href]');
  if (link) {
    const href = link.getAttribute('href') ?? '';
    if (isNavigationRoute(href)) {
      if (link.matches('[role="tab"]')) return { dictionary: library, scope: 'library' };
      return { dictionary: navigation, scope: 'navigation' };
    }
    if (link.matches('[role="tab"]') && onPage(element, '/me')) {
      return { dictionary: library, scope: 'library' };
    }
  }
  if (element.closest('[role="tablist"] a[role="tab"]') && onPage(element, '/me')) {
    return { dictionary: library, scope: 'library' };
  }

  // 2. 绑定的下拉选项弹窗（Filters / Sort / View / Model）
  const trigger = getBoundListboxTrigger(element);
  if (trigger) {
    const triggerLabel = trigger.getAttribute('aria-label') ?? '';
    if (triggerLabel.startsWith('Filters')) return { dictionary: filters, scope: 'filters' };
    if (triggerLabel === 'Model') return { dictionary: creation, scope: 'creation' };
    return { dictionary: library, scope: 'library', fallback: [creation] };
  }
  // 孤立未绑定触发器的 listbox 不做翻译，防止误伤第三方或未知组件。
  if (element.closest('[role="listbox"]')) return undefined;

  // 3. 上下文菜单（三点菜单、子菜单、个人菜单、More 菜单）
  if (contextMenuAction(element) || element.closest('[role="menu"]')) {
    return { dictionary: menus, fallback: [creation, navigation] };
  }

  // 4. 弹窗（Dialog）
  if (element.closest('[role="dialog"]')) {
    return { dictionary: dialogs, scope: 'creation' };
  }

  // 4.5 鼠标悬停提示气泡（Base UI Portal Tooltip 与标准 role="tooltip"）
  if (isTooltip(element)) {
    return { dictionary: tooltips, scope: 'tooltip', fallback: [creation, navigation, playbar] };
  }

  // 5. 创作表单（支持 /create、/create/visuals 及嵌入式创作面板）
  if (
    element.closest(
      '[role="tablist"][aria-label="Create form mode"], [role="tablist"][aria-label="What to create"], [role="tablist"][aria-label="Image or video"]',
    ) ||
    inCreateForm(element)
  ) {
    return { dictionary: creation, scope: 'creation', fallback: [library] };
  }

  // 6. 侧边栏、顶部促销横幅与全局导航按钮
  if (
    element.closest(
      'nav, aside, header, [data-testid="profile-menu-button"], button[aria-label="Notifications"], button[aria-label="Collapse sidebar"], button[aria-label="Expand sidebar"], button[aria-label="Dismiss"]',
    )
  ) {
    return { dictionary: navigation, scope: 'navigation' };
  }

  // 7. /create 右侧列表区、引导卡与工具栏
  if (onPage(element, '/create')) {
    if (
      element.closest(
        '[role="group"][aria-label="Library section"], button, [role="button"], [role="combobox"], [role="tab"], input, textarea, h1, h2, h3, h4, label',
      ) ||
      element.closest('[class*="onboarding"], [data-testid*="onboarding"]')
    ) {
      return { dictionary: creation, scope: 'creation', fallback: [library, navigation] };
    }
    // 引导卡或提示文字中的精确词条兜底（歌卡已被 isProtected 隔离）
    return { dictionary: creation, scope: 'creation' };
  }

  // 8. 资料库（/me 及子页面）
  if (onPage(element, '/me')) {
    if (element.closest('button[role="combobox"]')) {
      return { dictionary: library, scope: 'library', fallback: [filters] };
    }
    if (element.closest('button, [role="button"], a[href="/me/trash"]')) {
      return { dictionary: libraryActionDict, scope: 'library', fallback: [menus] };
    }
    if (element.matches('input, textarea')) {
      return { dictionary: library, scope: 'library' };
    }
    return undefined;
  }

  // 9. Home / Explore / Labs
  if (onPage(element, '/discover') || onPage(element, '/explore') || onPage(element, '/labs')) {
    if (element.closest('h1, h2, h3, button, [role="button"], a[role="button"], input, textarea, p, span')) {
      return { dictionary: discover, fallback: [navigation] };
    }
    return undefined;
  }

  // 10. 歌曲详情页（/song/...）：严格避免误翻歌词与评论正文
  if (onPage(element, '/song/')) {
    if (element.closest('[data-testid*="lyrics"]') && !element.closest('button, [role="button"]')) {
      return undefined;
    }
    if (element.closest('h2, h3, button, [role="button"], [role="tab"], [role="option"], label, input, textarea')) {
      return { dictionary: song, scope: 'song', fallback: [menus] };
    }
    return { dictionary: songWhitelistDict, scope: 'song' };
  }

  // 11. 工作室（/studio）
  if (onPage(element, '/studio')) {
    return { dictionary: studio, fallback: [creation, navigation] };
  }

  // 12. 登录页（/sign-in）
  if (onPage(element, '/sign-in')) {
    return { dictionary: auth, fallback: [dialogs] };
  }

  // 13. 底部播放栏及 404 页面等兜底
  if (element.closest('footer, [aria-label*="Playbar" i], [data-testid*="playbar"]')) {
    return { dictionary: playbar };
  }

  return undefined;
}

/** 歌曲详情页非按钮区域的极简安全白名单，防止误翻歌词或评论正文中的常见词 */
const songWhitelistDict: Dictionary = {
  'Made from': '衍生自',
  'Sort by': '排序方式',
  Creator: '创作者',
  Comments: '评论',
  Cover: '翻唱',
};

function translateWithContext(
  ctx: MatchContext,
  source: string,
  mode: ActiveTranslationMode,
): string | undefined {
  const direct = lookup(ctx.dictionary, source, mode);
  if (direct) return direct;

  if (ctx.scope) {
    const dynamic = lookupDynamic(ctx.scope, source, mode);
    if (dynamic) return dynamic;
  }

  if (ctx.fallback) {
    for (const dict of ctx.fallback) {
      const hit = lookup(dict, source, mode);
      if (hit) return hit;
    }
  }
  return undefined;
}

export const sunoAdapter: TranslationAdapter = {
  isProtected(element) {
    if (element.closest('[data-suno-zh-ui]')) return true;
    // 右键/三点菜单可能挂载在歌卡内部，仅放行菜单项本身且不能在可编辑区内。
    if (contextMenuAction(element) && !element.closest('[contenteditable]:not([contenteditable="false"])')) {
      return false;
    }
    if (element.closest(protectedSelector)) return true;
    if (onPage(element, '/song/') && element.closest('h1')) return true;
    if (isInProtectedSongCard(element)) return true;
    return false;
  },

  text(node, source, mode) {
    const element = node.parentElement;
    if (!element || element.tagName === 'TEXTAREA' || isInProtectedSongCard(element, true)) return;

    const ctx = selectContext(element);
    if (ctx) {
      const translated = translateWithContext(ctx, source, mode);
      if (translated) return translated;
    }

    // 404 固定句式兜底
    const trimmed = source.trim().replace(/\s+/g, ' ');
    if (
      trimmed === 'This page doesn’t exist. So we made a song about it.' ||
      trimmed === "This page doesn't exist. So we made a song about it."
    ) {
      return lookup(discover, source, mode);
    }
    return undefined;
  },

  attribute(element, name, source, mode) {
    // 绝不修改 input/textarea 的 value 以及 aria-label 语义标识。
    if (name === 'placeholder' && (element.matches('input') || element.matches('textarea'))) {
      const ctx = selectContext(element);
      if (ctx) {
        const hit = translateWithContext(ctx, source, mode);
        if (hit) return hit;
      }
      // 跨页面通用搜索 placeholder 兜底
      return lookup(library, source, mode) ?? lookup(discover, source, mode);
    }

    if (name === 'title' && isAction(element)) {
      const ctx = selectContext(element);
      if (ctx) return translateWithContext(ctx, source, mode);
    }

    return undefined;
  },
};
