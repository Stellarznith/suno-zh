import type { TranslationMode } from './engine';

export interface FloatingSwitcherOptions {
  initialMode: TranslationMode;
  initialVisible: boolean;
  onModeChange: (mode: TranslationMode) => void;
  onHide: () => void;
}

export interface FloatingSwitcher {
  setMode(mode: TranslationMode): void;
  setVisible(visible: boolean): void;
  destroy(): void;
}

interface ModeItem {
  mode: TranslationMode;
  label: string;
  title: string;
}

const MODE_ITEMS: ModeItem[] = [
  { mode: 'zh', label: '中', title: '全中文' },
  { mode: 'bilingual', label: '中英', title: '中英对照' },
  { mode: 'en', label: 'EN', title: '恢复英文' },
];

/**
 * 在页面右下角创建暗黑半透明玻璃风悬浮切换胶囊，
 * 根节点带有 `data-suno-zh-ui="1"` 以确保翻译引擎跳过自身 UI。
 */
export function createFloatingSwitcher(
  document: Document,
  options: FloatingSwitcherOptions,
): FloatingSwitcher {
  const root = document.createElement('div');
  root.setAttribute('data-suno-zh-ui', '1');
  root.setAttribute('role', 'region');
  root.setAttribute('aria-label', 'Suno 中文助手显示模式切换');
  root.style.cssText = [
    'position:fixed',
    'right:16px',
    'bottom:84px',
    'z-index:2147483000',
    'display:flex',
    'align-items:center',
    'gap:4px',
    'padding:4px',
    'border-radius:9999px',
    'background:rgba(20,20,24,0.86)',
    'backdrop-filter:blur(10px)',
    'border:1px solid rgba(255,255,255,0.16)',
    'box-shadow:0 8px 24px rgba(0,0,0,0.42)',
    'font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif',
    'font-size:12px',
    'line-height:1',
    'user-select:none',
  ].join(';');

  const buttons = new Map<TranslationMode, HTMLButtonElement>();
  let currentMode: TranslationMode = options.initialMode;

  const updateStyles = () => {
    for (const [mode, button] of buttons) {
      const active = mode === currentMode;
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
      button.style.cssText = [
        'border:none',
        'cursor:pointer',
        'padding:6px 10px',
        'border-radius:9999px',
        'font-size:12px',
        'font-weight:600',
        'transition:background 0.15s ease,color 0.15s ease',
        active
          ? 'background:#f4a574;color:#141418'
          : 'background:transparent;color:rgba(255,255,255,0.78)',
      ].join(';');
    }
  };

  for (const item of MODE_ITEMS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = item.label;
    button.title = item.title;
    button.setAttribute('data-suno-zh-mode', item.mode);
    button.addEventListener('click', () => {
      if (currentMode === item.mode) return;
      currentMode = item.mode;
      updateStyles();
      options.onModeChange(item.mode);
    });
    buttons.set(item.mode, button);
    root.append(button);
  }

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.textContent = '×';
  closeButton.title = '隐藏快捷开关（可在油猴菜单重新开启）';
  closeButton.setAttribute('aria-label', '隐藏悬浮开关');
  closeButton.setAttribute('data-suno-zh-close', '1');
  closeButton.style.cssText = [
    'border:none',
    'cursor:pointer',
    'padding:6px 8px',
    'border-radius:9999px',
    'background:transparent',
    'color:rgba(255,255,255,0.58)',
    'font-size:14px',
    'line-height:1',
  ].join(';');
  closeButton.addEventListener('click', () => {
    setVisible(false);
    options.onHide();
  });
  root.append(closeButton);

  const setVisible = (visible: boolean) => {
    root.style.display = visible ? 'flex' : 'none';
  };

  updateStyles();
  setVisible(options.initialVisible);
  (document.body ?? document.documentElement).append(root);

  return {
    setMode(mode: TranslationMode) {
      currentMode = mode;
      updateStyles();
    },
    setVisible,
    destroy() {
      root.remove();
    },
  };
}
