// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest';
import { TranslationEngine, type TranslationMode } from '../src/engine';
import { sunoAdapter } from '../src/adapter';
import {
  auth,
  creation,
  dialogs,
  discover,
  filters,
  formatTranslation,
  library,
  menus,
  navigation,
  playbar,
  song,
  studio,
  tooltips,
  type Dictionary,
} from '../src/dictionary';

let engine: TranslationEngine | undefined;
const settle = async () => {
  for (let i = 0; i < 20; i++) {
    const before = engine ? `${engine.stats.batches}:${engine.stats.writes}` : '';
    await new Promise(resolve => setTimeout(resolve, 40));
    const after = engine ? `${engine.stats.batches}:${engine.stats.writes}` : '';
    if (i > 0 && before === after) return;
  }
};

function start(html: string, path = '/create', mode: TranslationMode = 'zh') {
  engine?.destroy();
  history.replaceState({}, '', path);
  document.body.innerHTML = html;
  engine = new TranslationEngine(document, sunoAdapter);
  engine.setMode(mode);
}

afterEach(() => {
  engine?.destroy();
  engine = undefined;
  document.body.innerHTML = '';
});

test('all dictionary entries are well-formed and bilingual mode never duplicates English suffixes', () => {
  const allDictionaries: [string, Dictionary][] = [
    ['navigation', navigation],
    ['library', library],
    ['creation', creation],
    ['filters', filters],
    ['menus', menus],
    ['dialogs', dialogs],
    ['discover', discover],
    ['song', song],
    ['studio', studio],
    ['auth', auth],
    ['playbar', playbar],
    ['tooltips', tooltips],
  ];

  for (const [name, dict] of allDictionaries) {
    for (const [key, value] of Object.entries(dict)) {
      expect(key.length, `${name}: empty key`).toBeGreaterThan(0);
      expect(value.length, `${name}[${key}]: empty value`).toBeGreaterThan(0);
      expect(key, `${name}: untrimmed key`).toBe(key.trim());
      expect(value, `${name}[${key}]: untrimmed value`).toBe(value.trim());

      const bi = formatTranslation(key, value, 'bilingual');
      if (value.toLowerCase() !== key.toLowerCase()) {
        // 确保双语输出不会出现相同英文括号重复出现两次的情况
        const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const matches = bi.match(new RegExp(`\\(${escaped}\\)`, 'gi')) ?? [];
        expect(matches.length, `${name}[${key}] duplicated in bilingual: ${bi}`).toBeLessThanOrEqual(1);
      } else {
        expect(bi).toBe(key);
      }
    }
  }
});

test('100% of audited Suno submenus, dialogs, Style Guide, Studio menus, and tooltips localize cleanly', async () => {
  const menuItems = [
    // 顶层 & Remix
    'Remix', 'Edit', 'Publish', 'Share', 'Create visual', 'Download', 'Manage',
    'Add to queue', 'Add to playlist', 'Song radio', 'Report', 'Move to trash',
    'Cover', 'Reuse prompt', 'Mashup', 'Sample this song', 'Use as inspiration', 'Voice',
    // Edit 全部 13 项
    'Extend', 'Crop', 'Remove section', 'Reverse', 'Adjust speed', 'Find a collaborator',
    'Fade in', 'Fade out', 'Replace section', 'Get stems', 'Remaster', 'Open in Studio', 'Open in Editor',
    // Create visual & Manage & Theme & Studio
    'Cover art', 'Video clip', 'Song details', 'Allow remixes', 'Downloads', 'Allow comments',
    'Pin to profile', 'Move to workspace', 'Dark', 'Light', 'System',
    'New Project', 'Open Project', 'Duplicate Project', 'Share Project', 'Studio Settings',
    'Full Song', 'Selected Time Range', 'Multitrack', 'Keyboard Shortcuts', 'YouTube Tutorials', 'Learning Center', "What's This?",
    'Pro', 'New',
  ];

  const dialogItems = [
    // Download / Share / Playlist / Workspace / My Taste / Notifications
    'M4A', 'MP3', 'WAV', 'MP4 video asset', 'Stems & MIDI', 'Unlock & Download', 'Plan', 'Refreshes',
    'Share to...', 'Copy link', 'Email', 'Embed', 'Liked songs', 'Create playlist', 'Create Workspace',
    'My Taste', 'My Styles', 'Notification Settings', 'Interactions', 'Announcements',
    'Likes and plays on your posts', 'New posts from people you follow', 'New followers', 'Comments on your posts', 'Mentions',
    'Back', 'Mark all as read', 'Copied!',
    // Sounds Key & Studio
    'Major', 'Minor', 'Time Signature', 'Project key', 'Transpose song', 'Auto detect', 'Manual',
    // Style Guide 4 导航 + 15 问题 + 56 技法词条
    'Inspiration Guide', 'Styles', 'Atmosphere', 'Camera', 'Motion',
    'What is it made of?', 'What style does it have?', 'What colors fill the picture?', 'What’s the light like?',
    'How is the person lit?', 'What are the surroundings like?', 'What should look unreal?', 'How close are we?',
    'How are people arranged?', 'How is the camera angled?', 'How is the picture arranged?',
    'How wide or close is the view?', 'Any glows or unusual edges?', 'How does the camera move?', 'How should time move?',
    'Clay animation', 'Cut-paper stop motion', 'Wire marionettes', '1990s cel animation',
    'Film noir', 'Neo-noir', 'German expressionism', 'Vaporwave',
    'Teal and orange', 'Monochrome', 'Sepia', 'Palette', 'Color shift', 'Infrared', 'Night vision',
    'Golden hour', 'Blue hour', 'Practical lighting', 'Neon practicals', 'Spotlight', 'Volumetric light',
    'Dappled light', 'Moonlight gel', 'Beams in haze', 'Silhouette', 'Snow', 'Fog', 'Atmospheric haze',
    'Smoke', 'Steam', 'Raining objects', "A cloud of one's own", 'Sea of clouds', 'Storm light',
    'Echo print', 'Ink in water', 'Powder burst', 'Giant prop', 'Extreme close-up', 'Long shot',
    'Over-the-shoulder coverage', 'High angle', "Bird's-eye view", 'Dutch angle', 'Point of view',
    'Layered depth', 'Foreground interest', 'Frame within frame', 'Dirty frame', '14mm ultra-wide',
    'Fisheye', '85mm portrait', 'Telephoto sun', 'Lens flare', 'Dolly in', 'Dolly out', 'Super dolly in',
    'Aerial push in', 'Aerial pullback', '360-degree orbit', 'Camera roll', 'Pedestal up', 'Tilt down',
    'Crane up', 'Crane down', 'FPV drone', 'Blooming time-lapse', 'Seasons pass',
  ];

  const unchangedAllowed = new Set(['Pro', 'M4A', 'MP3', 'WAV']);

  const html =
    '<div role="menu">' +
    menuItems.map(item => `<button role="menuitem"><span>${item}</span></button>`).join('') +
    '</div>' +
    '<div role="dialog">' +
    dialogItems.map(item => `<button>${item}</button>`).join('') +
    '</div>' +
    '<div data-base-ui-portal=""><div role="presentation" data-open=""><div data-base-ui-focusable="" data-open="">15 credits/sec</div></div></div>' +
    '<button role="combobox" aria-label="Sort by" aria-controls="comment-sort">Recent</button>' +
    '<div role="listbox" id="comment-sort"><div role="option">Recent</div><div role="option">Oldest</div></div>';

  start(html, '/song/audit-1');
  await settle();

  const menuSpans = [...document.querySelectorAll('[role="menu"] span')];
  menuSpans.forEach((span, idx) => {
    const raw = menuItems[idx];
    if (unchangedAllowed.has(raw)) {
      expect(span.textContent).toBe(raw);
    } else {
      expect(span.textContent, `未翻译菜单项: ${raw}`).not.toBe(raw);
    }
  });

  const dialogButtons = [...document.querySelectorAll('[role="dialog"] button')];
  dialogButtons.forEach((btn, idx) => {
    const raw = dialogItems[idx];
    if (unchangedAllowed.has(raw)) {
      expect(btn.textContent).toBe(raw);
    } else {
      expect(btn.textContent, `未翻译弹窗项: ${raw}`).not.toBe(raw);
    }
  });

  expect(document.querySelector('[data-base-ui-focusable]')!.textContent).toBe('15 积分/秒');
  expect(document.querySelector('#comment-sort')!.textContent).toBe('最新最早优先');

  // 切换至中英对照与恢复英文验证完整还原
  engine!.setMode('bilingual');
  await settle();
  expect(document.querySelector('[data-base-ui-focusable]')!.textContent).toBe('15 积分/秒 (15 credits/sec)');
  expect(document.querySelector('#comment-sort [role="option"]')!.textContent).toBe('最新 (Recent)');

  engine!.setMode('en');
  expect(menuSpans.map(s => s.textContent)).toEqual(menuItems);
  expect(dialogButtons.map(b => b.textContent)).toEqual(dialogItems);
});

test('user content and DOM identifiers stay strictly untouched across zh and bilingual modes', async () => {
  const html =
    '<article>' +
    '<h1 aria-label="Song title">Remix</h1>' +
    '<a href="/@creator">Manage</a>' +
    '<a href="/style/vaporwave">Vaporwave</a>' +
    '<div data-testid="lyrics-body"><p>Fade in and Reverse the Golden hour</p></div>' +
    '<div role="textbox" aria-label="Lyrics editor" contenteditable="true">Download Share</div>' +
    '<textarea aria-label="Styles" placeholder="Add styles">Film noir</textarea>' +
    '<input aria-label="Search" placeholder="Search" value="Extend">' +
    '</article>';

  for (const mode of ['zh', 'bilingual'] as const) {
    start(html, '/song/protected-1', mode);
    await settle();
    expect(document.querySelector('h1')!.textContent).toBe('Remix');
    expect(document.querySelector('h1')!.getAttribute('aria-label')).toBe('Song title');
    expect(document.querySelector('a[href="/@creator"]')!.textContent).toBe('Manage');
    expect(document.querySelector('a[href="/style/vaporwave"]')!.textContent).toBe('Vaporwave');
    expect(document.querySelector('[data-testid="lyrics-body"] p')!.textContent).toBe(
      'Fade in and Reverse the Golden hour',
    );
    expect(document.querySelector('[contenteditable]')!.textContent).toBe('Download Share');
    expect(document.querySelector('textarea')!.value).toBe('Film noir');
    expect(document.querySelector('input')!.value).toBe('Extend');
    expect(document.querySelector('input')!.getAttribute('aria-label')).toBe('Search');
  }
});
