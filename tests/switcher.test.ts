// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest';
import { createFloatingSwitcher } from '../src/switcher';
import { TranslationEngine, type TranslationMode } from '../src/engine';
import { sunoAdapter } from '../src/adapter';

let engine: TranslationEngine | undefined;

afterEach(() => {
  engine?.destroy();
  engine = undefined;
  document.body.innerHTML = '';
});

test('floating switcher triggers mode callbacks, protects itself from engine, and hides cleanly', async () => {
  history.replaceState({}, '', '/create');
  const modes: TranslationMode[] = [];
  let hiddenCount = 0;

  const switcher = createFloatingSwitcher(document, {
    initialMode: 'zh',
    initialVisible: true,
    onModeChange: mode => modes.push(mode),
    onHide: () => {
      hiddenCount++;
    },
  });

  const root = document.querySelector('[data-suno-zh-ui="1"]') as HTMLElement;
  expect(root).not.toBeNull();
  expect(root.style.display).toBe('flex');

  engine = new TranslationEngine(document, sunoAdapter);
  engine.setMode('zh');
  await new Promise(resolve => setTimeout(resolve, 60));

  const zhBtn = root.querySelector('[data-suno-zh-mode="zh"]') as HTMLButtonElement;
  const biBtn = root.querySelector('[data-suno-zh-mode="bilingual"]') as HTMLButtonElement;
  const enBtn = root.querySelector('[data-suno-zh-mode="en"]') as HTMLButtonElement;
  const closeBtn = root.querySelector('[data-suno-zh-close="1"]') as HTMLButtonElement;

  expect(zhBtn.getAttribute('aria-pressed')).toBe('true');
  expect(biBtn.textContent).toBe('中英');
  expect(enBtn.textContent).toBe('EN');

  biBtn.click();
  enBtn.click();
  expect(modes).toEqual(['bilingual', 'en']);
  expect(enBtn.getAttribute('aria-pressed')).toBe('true');

  closeBtn.click();
  expect(hiddenCount).toBe(1);
  expect(root.style.display).toBe('none');

  switcher.setVisible(true);
  expect(root.style.display).toBe('flex');

  switcher.destroy();
  expect(document.querySelector('[data-suno-zh-ui="1"]')).toBeNull();
});
