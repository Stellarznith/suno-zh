import { TranslationEngine, type TranslationMode } from './engine';
import { sunoAdapter } from './adapter';
import { createFloatingSwitcher, type FloatingSwitcher } from './switcher';

declare function GM_getValue<T>(key: string, fallback: T): T;
declare function GM_setValue<T>(key: string, value: T): void;
declare function GM_registerMenuCommand(label: string, callback: () => void): number;
declare function GM_unregisterMenuCommand(id: number): void;

const MODE_STORAGE_KEY = 'displayMode';
const LEGACY_STORAGE_KEY = 'chineseEnabled';
const SWITCHER_STORAGE_KEY = 'showSwitcher';

function loadInitialMode(): TranslationMode {
  const saved = GM_getValue<string | null>(MODE_STORAGE_KEY, null);
  if (saved === 'zh' || saved === 'bilingual' || saved === 'en') {
    return saved;
  }
  return GM_getValue<boolean>(LEGACY_STORAGE_KEY, true) === false ? 'en' : 'zh';
}

const engine = new TranslationEngine(document, sunoAdapter);
let currentMode: TranslationMode = loadInitialMode();
let showSwitcher = GM_getValue<boolean>(SWITCHER_STORAGE_KEY, true) !== false;
let menuIds: number[] = [];
let switcher: FloatingSwitcher | undefined;

function clearMenuCommands() {
  for (const id of menuIds) {
    GM_unregisterMenuCommand(id);
  }
  menuIds = [];
}

function setMode(nextMode: TranslationMode) {
  currentMode = nextMode;
  GM_setValue(MODE_STORAGE_KEY, nextMode);
  GM_setValue(LEGACY_STORAGE_KEY, nextMode !== 'en');
  apply();
}

function toggleSwitcher(visible: boolean) {
  showSwitcher = visible;
  GM_setValue(SWITCHER_STORAGE_KEY, visible);
  apply();
}

function mountSwitcher() {
  if (switcher) return;
  switcher = createFloatingSwitcher(document, {
    initialMode: currentMode,
    initialVisible: showSwitcher,
    onModeChange: mode => setMode(mode),
    onHide: () => toggleSwitcher(false),
  });
}

function apply() {
  engine.setMode(currentMode);
  mountSwitcher();
  switcher?.setMode(currentMode);
  switcher?.setVisible(showSwitcher);

  clearMenuCommands();
  menuIds.push(
    GM_registerMenuCommand(`${currentMode === 'zh' ? '✓ ' : ''}全中文 / Chinese`, () => setMode('zh')),
    GM_registerMenuCommand(`${currentMode === 'bilingual' ? '✓ ' : ''}中英对照 / Bilingual`, () =>
      setMode('bilingual'),
    ),
    GM_registerMenuCommand(`${currentMode === 'en' ? '✓ ' : ''}恢复英文 / English`, () => setMode('en')),
    GM_registerMenuCommand(
      `${showSwitcher ? '隐藏页内开关' : '显示页内开关'} / Toggle Floating Switcher`,
      () => toggleSwitcher(!showSwitcher),
    ),
  );
}

apply();

window.addEventListener('pagehide', () => {
  engine.destroy();
  switcher?.destroy();
  switcher = undefined;
});

window.addEventListener('pageshow', () => {
  apply();
});
