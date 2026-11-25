// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest';
import { TranslationEngine, type TranslationAdapter } from '../src/engine';
import { formatTranslation } from '../src/dictionary';

const dictionary: Record<string, string> = {
  Create: '创作',
  Library: '资料库',
  Beta: 'Beta',
  'Describe style': '描述风格',
};

const adapter: TranslationAdapter = {
  isProtected: el => Boolean(el.closest('[contenteditable="true"],[data-user]')),
  text: (node, source, mode) => {
    const el = node.parentElement;
    if (!el || el.tagName === 'TEXTAREA') return;
    const hit = el.closest('[data-ui]') ? dictionary[source] : undefined;
    return hit ? formatTranslation(source, hit, mode) : undefined;
  },
  attribute: (el, _key, source, mode) => {
    const hit = el.matches('[data-ui]') ? dictionary[source] : undefined;
    return hit ? formatTranslation(source, hit, mode) : undefined;
  },
};

let engine: TranslationEngine;
const settle = () => new Promise(resolve => setTimeout(resolve, 60));

afterEach(() => {
  engine?.destroy();
  document.body.innerHTML = '';
});

function start(html: string) {
  document.body.innerHTML = html;
  engine = new TranslationEngine(document, adapter);
  engine.setEnabled(true);
}

test('translates only UI and restores text and attributes without replacing elements', async () => {
  start('<button data-ui title="Create">Create</button><p data-user>Create</p><textarea data-ui placeholder="Describe style">Create</textarea>');
  const button = document.querySelector('button')!;
  const textarea = document.querySelector('textarea')!;
  let clicks = 0;
  button.onclick = () => clicks++;
  await settle();
  expect(button.textContent).toBe('创作');
  expect(button.title).toBe('创作');
  expect(textarea.placeholder).toBe('描述风格');
  expect(textarea.value).toBe('Create');
  button.click();
  expect(clicks).toBe(1);
  expect(document.querySelector('p')!.textContent).toBe('Create');

  engine.setEnabled(false);
  expect(button.textContent).toBe('Create');
  expect(button.title).toBe('Create');
  expect(textarea.placeholder).toBe('Describe style');
  expect(textarea.value).toBe('Create');
});

test('switches seamlessly between zh, bilingual and en without double translation', async () => {
  start('<button data-ui title="Create">Create</button><span data-ui>Beta</span>');
  await settle();
  const button = document.querySelector('button')!;
  const badge = document.querySelector('span')!;
  expect(button.textContent).toBe('创作');
  expect(badge.textContent).toBe('Beta');

  engine.setMode('bilingual');
  await settle();
  expect(button.textContent).toBe('创作 (Create)');
  expect(button.title).toBe('创作 (Create)');
  // 原文与译文相同时不应出现重复括号 Beta (Beta)
  expect(badge.textContent).toBe('Beta');

  engine.setMode('zh');
  await settle();
  expect(button.textContent).toBe('创作');
  expect(button.title).toBe('创作');

  engine.setMode('bilingual');
  await settle();
  expect(button.textContent).toBe('创作 (Create)');

  engine.setMode('en');
  expect(button.textContent).toBe('Create');
  expect(button.title).toBe('Create');
});

test('supports dynamic menus, node reuse, external updates and conditional restore', async () => {
  start('<button data-ui>Create</button>');
  await settle();
  const button = document.querySelector('button')!;
  button.firstChild!.nodeValue = 'Library';
  await settle();
  expect(button.textContent).toBe('资料库');

  document.body.insertAdjacentHTML('beforeend', '<div role="menu"><button data-ui>Create</button></div>');
  await settle();
  expect(document.querySelector('[role=menu]')!.textContent).toBe('创作');

  button.firstChild!.nodeValue = 'User text';
  engine.setEnabled(false);
  expect(button.textContent).toBe('User text');
});

test('stabilizes after its own mutations and repeated toggles', async () => {
  start('<button data-ui>Create</button>');
  await settle();
  for (let i = 0; i < 4; i++) {
    engine.setEnabled(false);
    engine.setEnabled(true);
  }
  await settle();
  const stats = { ...engine.stats };
  await settle();
  expect(engine.stats).toEqual(stats);
  document.querySelector('button')!.firstChild!.nodeValue = 'Library';
  await settle();
  expect(engine.stats.writes - stats.writes).toBe(1);
});

test('restores a subtree moved into an editable region', async () => {
  start('<button data-ui>Create</button><div contenteditable="true"></div>');
  await settle();
  document.querySelector('div')!.append(document.querySelector('button')!);
  await settle();
  expect(document.querySelector('button')!.textContent).toBe('Create');
});

test('small updates do not rescan a large song list', async () => {
  start('<button data-ui>Create</button>' + '<p data-user>Create</p>'.repeat(5000));
  await new Promise(resolve => setTimeout(resolve, 500));
  const before = engine.stats.visited;
  const beforeMs = engine.stats.workMs;
  document.querySelector('button')!.firstChild!.nodeValue = 'Library';
  await settle();
  const delta = engine.stats.visited - before;
  expect(delta).toBeLessThan(10);
  expect([...document.querySelectorAll('p')].every(el => el.textContent === 'Create')).toBe(true);
  console.info(
    `5000 protected songs; small update visited ${delta} nodes; translation work ${(engine.stats.workMs - beforeMs).toFixed(2)} ms`,
  );
});

test('detached nodes restore safely before reuse and can be translated again', async () => {
  start('<button data-ui>Create</button>');
  await settle();
  const button = document.querySelector('button')!;
  button.remove();
  await settle();
  expect(button.textContent).toBe('Create');
  document.body.append(button);
  await settle();
  expect(button.textContent).toBe('创作');
  engine.setEnabled(false);
  expect(button.textContent).toBe('Create');
});

test('attribute changes preserve new website content and newly protected areas restore', async () => {
  start('<section><button data-ui title="Create">Create</button></section>');
  await settle();
  const button = document.querySelector('button')!;
  button.title = 'Library';
  await settle();
  expect(button.title).toBe('资料库');
  document.querySelector('section')!.setAttribute('contenteditable', 'true');
  await settle();
  expect(button.textContent).toBe('Create');
  expect(button.title).toBe('Library');
});

test('rescanning happens on popstate SPA route change', async () => {
  history.replaceState({}, '', '/discover');
  const routeAdapter: TranslationAdapter = {
    isProtected: () => false,
    text: (node, source) => (node.parentElement?.ownerDocument.location.pathname === '/me' && source === 'Create' ? '创作' : undefined),
    attribute: () => undefined,
  };
  document.body.innerHTML = '<button>Create</button>';
  engine = new TranslationEngine(document, routeAdapter);
  engine.setMode('zh');
  await settle();
  expect(document.querySelector('button')!.textContent).toBe('Create');

  history.pushState({}, '', '/me');
  window.dispatchEvent(new PopStateEvent('popstate'));
  await settle();
  expect(document.querySelector('button')!.textContent).toBe('创作');
});
