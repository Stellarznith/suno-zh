// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest';
import { TranslationEngine, type TranslationMode } from '../src/engine';
import { sunoAdapter } from '../src/adapter';

let engine: TranslationEngine;
const settle = () => new Promise(resolve => setTimeout(resolve, 80));

function start(html: string, path = '/me', mode: TranslationMode = 'zh') {
  engine?.destroy();
  history.replaceState({}, '', path);
  document.body.innerHTML = html;
  engine = new TranslationEngine(document, sunoAdapter);
  engine.setMode(mode);
}

afterEach(() => {
  engine?.destroy();
  document.body.innerHTML = '';
});

test('navigation and library tabs use routes, not arbitrary text', async () => {
  start(
    '<a href="/create">Create</a><div role="tablist"><a role="tab" href="/me">Songs</a></div><a href="/song/example">Create</a><p>Create</p>',
  );
  await settle();
  expect(document.body.textContent).toBe('创作歌曲CreateCreate');
});

test('new sidebar navigation items translate accurately', async () => {
  start(
    '<nav><a href="/discover">Home</a><a href="/explore">Explore</a><a href="/create">Create</a><a href="/studio">Studio</a><a href="/me" data-testid="navbar-library-tab">Library</a><a href="/earn-credits">Earn credits</a><a href="/labs">Labs</a><button aria-label="Notifications">Notifications</button><button>More</button><a href="/account?source=sideNav&plan_key=premier">Upgrade to Premier</a></nav>',
    '/create',
  );
  await settle();
  const nav = document.querySelector('nav')!;
  expect([...nav.querySelectorAll('a, button')].map(el => el.textContent)).toEqual([
    '首页',
    '探索',
    '创作',
    '工作室',
    '资料库',
    '赚取积分',
    '实验室',
    '通知',
    '更多',
    '升级至 Premier',
  ]);
});

test('creation form excludes lyrics and styles and leaves results untouched', async () => {
  start(
    '<section><span role="tablist" aria-label="Create form mode"><button role="tab" aria-label="Advanced">Advanced</button></span><div role="textbox" aria-label="Lyrics editor" contenteditable="true">Create</div><div data-testid="create-form-styles-wrapper"><textarea placeholder="Add styles">Styles</textarea></div><span>Weirdness</span><button>Create</button></section><article><a href="/song/test">Weirdness</a></article>',
    '/create',
  );
  await settle();
  expect(document.querySelector('button')!.textContent).toBe('高级');
  expect(document.querySelector('[contenteditable]')!.textContent).toBe('Create');
  const textarea = document.querySelector('textarea')!;
  expect(textarea.value).toBe('Styles');
  expect(textarea.placeholder).toBe('添加风格');
  expect(document.querySelector('section > span:last-of-type')!.textContent).toBe('实验程度');
  expect(document.querySelector('article')!.textContent).toBe('Weirdness');
});

test('supports all What to create modes including Speech, Sounds, and Visuals', async () => {
  start(
    '<section><div role="tablist" aria-label="What to create"><button role="tab">Songs</button><button role="tab">Speech</button><button role="tab">Sounds</button><button role="tab">Visuals</button></div><textarea aria-label="Script" placeholder="Write or paste your speech"></textarea><button aria-label="Create speech">Create</button></section>',
    '/create',
  );
  await settle();
  expect([...document.querySelectorAll('[role="tab"]')].map(el => el.textContent)).toEqual([
    '歌曲',
    '语音',
    '音效',
    '视觉',
  ]);
  expect(document.querySelector('textarea')!.placeholder).toBe('输入或粘贴要合成的台词文本');
  expect(document.querySelector('button[aria-label="Create speech"]')!.textContent).toBe('创作');

  start(
    '<section><div role="tablist" aria-label="Image or video"><button role="tab">Image</button><button role="tab">Video</button></div><button role="combobox" aria-label="Model">Fast</button><textarea placeholder="Describe your video in detail"></textarea><label>Lip sync</label><span>Aspect ratio 9:16</span><button>Create 10s clip</button><span>150 credits</span></section>',
    '/create/visuals',
  );
  await settle();
  expect([...document.querySelectorAll('[role="tab"]')].map(el => el.textContent)).toEqual(['图片', '视频']);
  expect(document.querySelector('button[role="combobox"]')!.textContent).toBe('极速');
  expect(document.querySelector('textarea')!.placeholder).toBe('详细描述你的视频画面');
  expect(document.querySelector('label')!.textContent).toBe('口型同步');
  expect([...document.querySelectorAll('span')].map(el => el.textContent)).toEqual(['宽高比 9:16', '150 积分']);
  expect(document.querySelectorAll('button')[3].textContent).toBe('创作 10s 片段');
});

test('filter and sort popups translate only when bound to combobox triggers', async () => {
  start(
    '<button role="combobox" aria-label="Filters (2)" aria-controls="filters-123">Filters (2)</button><div role="listbox" id="filters-123"><div role="option">Public</div><div role="option">Hide Stems</div></div><div role="listbox"><div role="option">Public</div></div><button role="combobox" aria-label="New" aria-controls="sort-1">Newest</button><div role="listbox" id="sort-1"><div role="option">Most liked</div></div>',
  );
  await settle();
  expect(document.querySelector('button[aria-controls="filters-123"]')!.textContent).toBe('筛选 (2)');
  expect(document.querySelector('#filters-123')!.textContent).toBe('公开隐藏分轨');
  expect(document.querySelectorAll('[role=listbox]')[1].textContent).toBe('Public');
  expect(document.querySelector('button[aria-controls="sort-1"]')!.textContent).toBe('最新优先');
  expect(document.querySelector('#sort-1')!.textContent).toBe('最多点赞');
});

test('both new ARIA menu items and legacy context-menu-item translate while protecting song cards', async () => {
  start(
    '<div role="group" aria-label="Share"><h4><a href="/song/a">Download</a></h4><p>Share</p><button aria-label="Share clip">Share</button><button aria-label="Play Download">Download</button></div><div role="menu"><button role="menuitem">Remix</button><button role="menuitem">Create visual</button><button role="menuitem">Move to trash</button></div><div class="context-menu-item"><button aria-label="Download"><span>Download</span></button></div>',
    '/me',
  );
  await settle();
  expect(document.querySelector('h4 a')!.textContent).toBe('Download');
  expect(document.querySelector('p')!.textContent).toBe('Share');
  expect(document.querySelector('button[aria-label="Share clip"]')!.textContent).toBe('分享');
  expect(document.querySelector('button[aria-label="Play Download"]')!.textContent).toBe('Download');
  expect([...document.querySelectorAll('[role="menuitem"]')].map(el => el.textContent)).toEqual([
    '混音二创',
    '制作视觉视频',
    '移至回收站',
  ]);
  expect(document.querySelector('.context-menu-item button')!.textContent).toBe('下载');
});

test('a user item rendered as a button is not mistaken for library UI', async () => {
  start('<button>Styles</button><div class="clip-title-wrapper"><button>Filters</button></div>');
  await settle();
  expect(document.body.textContent).toBe('StylesFilters');
});

test('input value is untouched; only known library placeholder is translated', async () => {
  start('<input placeholder="Search songs" value="Create"><button title="Filters">Filters</button>');
  await settle();
  expect(document.querySelector('input')!.value).toBe('Create');
  expect(document.querySelector('input')!.placeholder).toBe('搜索歌曲');
  engine.setEnabled(false);
  expect(document.querySelector('input')!.placeholder).toBe('Search songs');
});

test('repurposing a navigation link as a song title restores the original text', async () => {
  start('<a href="/create">Create</a>');
  await settle();
  const link = document.querySelector('a')!;
  link.href = '/song/example';
  await settle();
  expect(link.textContent).toBe('Create');
});

test('new library subpage tabs are localized', async () => {
  start(
    '<div role="tablist"><a role="tab" href="/me">Songs</a><a role="tab" href="/me/playlists">Playlists</a><a role="tab" href="/me/albums">Albums</a><a role="tab" href="/me/workspaces">Workspaces</a><a role="tab" href="/me/studio-projects">Studio Projects</a><a role="tab" href="/me/hooks">Hooks</a><a role="tab" href="/me/history">History</a></div>',
    '/me/albums',
  );
  await settle();
  expect([...document.querySelectorAll('[role="tab"]')].map(el => el.textContent)).toEqual([
    '歌曲',
    '播放列表',
    '专辑',
    '工作区',
    '工作室项目',
    'Hooks 短片',
    '历史记录',
  ]);
});

test('song detail page translates UI labels without touching song title, author, styles or lyrics text', async () => {
  start(
    '<article><h1>Follow</h1><a href="/@alice">Alice</a><button>Follow</button><span>12 Comments</span><h2>Lyrics</h2><div data-testid="lyrics-body"><p>Follow me and Share your Play</p><button>... More</button></div><h2>Styles</h2><a href="/style/rock">rock</a><h2>More by Alice</h2><h2>Similar songs</h2><span>Sort by</span><span>at 01:23</span><p>I love this Lyrics</p><input placeholder="Write a comment" value="Nice"></article>',
    '/song/example-123',
  );
  await settle();
  expect(document.querySelector('h1')!.textContent).toBe('Follow');
  expect(document.querySelector('a[href="/@alice"]')!.textContent).toBe('Alice');
  expect(document.querySelector('article > button')!.textContent).toBe('关注');
  expect(document.querySelector('[data-testid="lyrics-body"] p')!.textContent).toBe('Follow me and Share your Play');
  expect(document.querySelector('[data-testid="lyrics-body"] button')!.textContent).toBe('展开全部');
  expect(document.querySelector('a[href="/style/rock"]')!.textContent).toBe('rock');
  expect([...document.querySelectorAll('h2')].map(h => h.textContent)).toEqual([
    '歌词',
    '风格',
    '更多来自 Alice',
    '相似歌曲',
  ]);
  const spans = [...document.querySelectorAll('span')].map(s => s.textContent);
  expect(spans).toEqual(['12 条评论', '排序方式', '位于 01:23']);
  expect(document.querySelector('article > p')!.textContent).toBe('I love this Lyrics');
  expect(document.querySelector('input')!.placeholder).toBe('写下你的评论');
  expect(document.querySelector('input')!.value).toBe('Nice');
});

test('discover, studio and sign-in pages translate static UI cleanly', async () => {
  start('<h2>For You</h2><h2>Staff Picks</h2><input placeholder="Describe the song you want to make"><button>Try Visuals</button>', '/discover');
  await settle();
  expect([...document.querySelectorAll('h2')].map(h => h.textContent)).toEqual(['为你推荐', '编辑精选']);
  expect(document.querySelector('input')!.placeholder).toBe('描述你想要创作的歌曲');
  expect(document.querySelector('button')!.textContent).toBe('体验视觉创作');

  start('<h2>Untitled Project</h2><button>Upgrade to edit</button><button>Export</button>', '/studio');
  await settle();
  expect(document.querySelector('h2')!.textContent).toBe('未命名项目');
  expect([...document.querySelectorAll('button')].map(b => b.textContent)).toEqual(['升级以编辑', '导出']);

  start('<h1>Welcome to Suno</h1><button>Continue with Google</button><input placeholder="Enter your phone number">', '/sign-in');
  await settle();
  expect(document.querySelector('h1')!.textContent).toBe('欢迎使用 Suno');
  expect(document.querySelector('button')!.textContent).toBe('使用 Google 账号继续');
  expect(document.querySelector('input')!.placeholder).toBe('输入你的手机号码');
});

test('bilingual mode outputs Chinese with English original and switches cleanly', async () => {
  start(
    '<nav><a href="/create">Create</a></nav><section><span role="tablist" aria-label="Create form mode"><button role="tab">Simple</button></span><button>Create</button><h2>More by Alice</h2></section><button role="combobox" aria-label="Filters (2)" aria-controls="f1">Filters (2)</button>',
    '/create',
    'bilingual',
  );
  await settle();
  expect(document.querySelector('nav a')!.textContent).toBe('创作 (Create)');
  expect(document.querySelector('[role="tab"]')!.textContent).toBe('简单 (Simple)');
  expect(document.querySelector('button[aria-controls="f1"]')!.textContent).toBe('筛选 (2) (Filters (2))');

  engine.setMode('zh');
  await settle();
  expect(document.querySelector('nav a')!.textContent).toBe('创作');
  expect(document.querySelector('[role="tab"]')!.textContent).toBe('简单');

  engine.setMode('en');
  expect(document.querySelector('nav a')!.textContent).toBe('Create');
  expect(document.querySelector('[role="tab"]')!.textContent).toBe('Simple');
});

test.each(['/song/synthetic', '/me'])(
  'embedded composer translates on %s without touching song content',
  async path => {
    start(
      '<section><span role="tablist" aria-label="Create form mode"><button role="tab" aria-label="Advanced">Advanced</button></span><button>Audio</button><button>Voice</button><button>Inspo</button><h2>Lyrics</h2><div role="textbox" aria-label="Lyrics editor" contenteditable="true">Audio Voice Inspo</div><div data-testid="create-form-styles-wrapper"><textarea>Styles</textarea></div><h2>Styles</h2><button>Create</button></section><article><h1>Audio</h1><p>Voice Inspo Lyrics</p><a href="/song/other">Create</a></article>',
      path,
    );
    await settle();
    const section = document.querySelector('section')!;
    expect([...section.querySelectorAll('button')].map(button => button.textContent)).toEqual([
      '高级',
      '音频',
      '声音',
      '灵感',
      '创作',
    ]);
    expect([...section.querySelectorAll('h2')].map(heading => heading.textContent)).toEqual(['歌词', '风格']);
    expect(document.querySelector('[contenteditable]')!.textContent).toBe('Audio Voice Inspo');
    expect(document.querySelector('textarea')!.value).toBe('Styles');
    expect(document.querySelector('article')!.textContent).toBe('AudioVoice Inspo LyricsCreate');
    engine.setEnabled(false);
    expect([...section.querySelectorAll('button')].map(button => button.textContent)).toEqual([
      'Advanced',
      'Audio',
      'Voice',
      'Inspo',
      'Create',
    ]);
  },
);

test('mode tabs translate before the editor mounts without granting scope to unrelated content', async () => {
  start(
    '<section><span role="tablist" aria-label="Create form mode"><button role="tab" aria-label="Simple">Simple</button></span></section><article><h1>Lyrics</h1><p>Lyrics</p><textarea>Styles</textarea></article>',
    '/song/synthetic',
  );
  await settle();
  expect(document.querySelector('button')!.textContent).toBe('简单');
  expect(document.querySelector('article h1')!.textContent).toBe('Lyrics');
  expect(document.querySelector('article p')!.textContent).toBe('Lyrics');
  expect(document.querySelector<HTMLTextAreaElement>('article textarea')!.value).toBe('Styles');
});

test('Base UI portal hover tooltips translate in zh and bilingual modes and restore cleanly', async () => {
  start(
    '<div data-base-ui-portal="" id="_r_1"><div data-open="" data-side="bottom" role="presentation"><div data-open="" data-side="bottom" tabindex="-1" data-base-ui-focusable="">Record or upload your voice and use it to create anything.</div></div></div>' +
      '<div data-base-ui-portal="" id="_r_2"><div data-open="" data-side="top" role="presentation"><div data-open="" data-side="top" tabindex="-1" data-base-ui-focusable="">Uses more compute to maximize consistency throughout the song. Costs 2x credits per song.</div></div></div>' +
      '<div data-base-ui-portal="" id="_r_3"><div data-open="" data-side="right" role="presentation"><div data-open="" data-side="right" tabindex="-1" data-base-ui-focusable="">Credits remaining: 2,500</div></div></div>' +
      '<div data-base-ui-portal="" id="_r_4"><div data-open="" data-side="right" role="presentation"><div data-open="" data-side="right" tabindex="-1" data-base-ui-focusable="">Explore</div></div></div>' +
      '<div data-base-ui-portal="" id="_r_5"><div data-open="" data-side="top" role="presentation"><div data-open="" data-side="top" tabindex="-1" data-base-ui-focusable="">Enable repeat 1</div></div></div>' +
      '<div data-base-ui-portal="" id="_r_6"><div data-open="" data-side="top" role="presentation"><div data-open="" data-side="top" tabindex="-1" data-base-ui-focusable="">Unknown Song Title</div></div></div>',
    '/create',
  );
  await settle();
  const tips = [...document.querySelectorAll('[data-base-ui-focusable]')].map(el => el.textContent);
  expect(tips).toEqual([
    '录制或上传你的声音，用于创作任意内容。',
    '投入更多算力以最大化整首歌的一致性，每首歌消耗 2 倍积分。',
    '剩余积分：2,500',
    '探索',
    '开启单曲循环',
    'Unknown Song Title',
  ]);

  engine.setMode('bilingual');
  await settle();
  expect(document.querySelector('#_r_1 [data-base-ui-focusable]')!.textContent).toBe(
    '录制或上传你的声音，用于创作任意内容。 (Record or upload your voice and use it to create anything.)',
  );
  expect(document.querySelector('#_r_3 [data-base-ui-focusable]')!.textContent).toBe(
    '剩余积分：2,500 (Credits remaining: 2,500)',
  );

  engine.setMode('en');
  expect(document.querySelector('#_r_1 [data-base-ui-focusable]')!.textContent).toBe(
    'Record or upload your voice and use it to create anything.',
  );
  expect(document.querySelector('#_r_5 [data-base-ui-focusable]')!.textContent).toBe('Enable repeat 1');
});

test('all submenu items, badges, menuitemcheckbox, menuitemradio, and legacy + Audio menu translate cleanly', async () => {
  start(
    '<div role="menu">' +
      '<button role="menuitem"><span>Mashup</span></button>' +
      '<button role="menuitem"><span>Remove section</span></button>' +
      '<button role="menuitem"><span>Reverse</span></button>' +
      '<button role="menuitem"><span>Adjust speed</span></button>' +
      '<button role="menuitem"><span>Find a collaborator</span></button>' +
      '<button role="menuitem"><span>Fade in</span><span>Pro</span></button>' +
      '<button role="menuitem"><span>Fade out</span><span>Pro</span></button>' +
      '<button role="menuitem"><span>Open in Studio</span><span>New</span></button>' +
      '<button role="menuitem"><span>Open in Editor</span><span>Pro</span></button>' +
      '<button role="menuitem"><span>Cover art</span></button>' +
      '<button role="menuitem"><span>Video clip</span></button>' +
      '<button role="menuitemcheckbox"><span>Downloads</span></button>' +
      '<button role="menuitemcheckbox"><span>Allow remixes</span></button>' +
      '<button role="menuitemradio"><span>Dark</span></button>' +
      '<button role="menuitemradio"><span>System</span></button>' +
      '</div>' +
      '<div class="context-menu-item"><button>Upload</button><button>Browse</button><button>Record</button></div>',
    '/create',
  );
  await settle();
  const menuItems = [...document.querySelectorAll('[role="menu"] > button')].map(b => b.textContent);
  expect(menuItems).toEqual([
    '混搭',
    '删除片段',
    '倒放',
    '调整速度',
    '寻找合作者',
    '淡入Pro',
    '淡出Pro',
    '在工作室中打开新',
    '在编辑器中打开Pro',
    '封面艺术',
    '视频片段',
    '允许下载',
    '允许混音二创',
    '深色',
    '跟随系统',
  ]);
  expect([...document.querySelectorAll('.context-menu-item button')].map(b => b.textContent)).toEqual([
    '上传',
    '浏览',
    '录音',
  ]);

  engine.setMode('bilingual');
  await settle();
  expect(document.querySelector('[role="menu"] > button')!.textContent).toBe('混搭 (Mashup)');
  expect(document.querySelectorAll('[role="menu"] > button')[7].textContent).toBe(
    '在工作室中打开 (Open in Studio)新 (New)',
  );
});

test('secondary dialogs (Download, Share, My Taste, Notifications Settings, Style Guide) and Visuals models translate while preserving song title', async () => {
  start(
    '<div role="dialog">' +
      "<h2>Download'My Song'</h2>" +
      '<button>MP4 video asset</button><button>Unlock & Download</button>' +
      '<h3>Share to...</h3><button>Email</button><button>Embed</button>' +
      '<h2>My Taste</h2><textarea>keep user taste input</textarea><button>Save</button>' +
      '<h2>Notification Settings</h2><span>Interactions</span><span>Likes and plays on your posts</span>' +
      '<h2>Style Guide</h2><a href="/guide">Inspiration Guide</a><nav><button>Atmosphere</button><button>Camera</button></nav>' +
      '<h3>What’s the light like?</h3><button>Golden hour</button><button>Dutch angle</button><button>FPV drone</button>' +
      '</div>' +
      '<button role="combobox" aria-label="Model" aria-controls="vis-models">Standard</button>' +
      '<div role="listbox" id="vis-models"><div role="option"><span>Standard</span><span>1K • Balanced quality • 25 credits</span></div></div>',
    '/create/visuals',
  );
  await settle();
  const dialog = document.querySelector('[role="dialog"]')!;
  expect(dialog.querySelector('h2')!.textContent).toBe("下载 'My Song'");
  expect(dialog.querySelector('textarea')!.value).toBe('keep user taste input');
  expect([...dialog.querySelectorAll('h2, h3')].map(h => h.textContent)).toEqual([
    "下载 'My Song'",
    '分享到...',
    '我的音乐品味',
    '通知设置',
    '风格指南',
    '光线效果如何？',
  ]);
  expect([...dialog.querySelectorAll('button')].map(b => b.textContent)).toEqual([
    'MP4 视频素材',
    '解锁并下载',
    '电子邮件',
    '嵌入代码',
    '保存',
    '氛围与光影',
    '镜头语言',
    '黄金时刻暖光',
    '荷兰倾斜角',
    'FPV 穿越机视角',
  ]);
  expect(dialog.querySelector('a')!.textContent).toBe('灵感指南');
  expect([...dialog.querySelectorAll('span')].map(s => s.textContent)).toEqual([
    '互动消息',
    '作品获得的点赞与播放',
  ]);
  expect(document.querySelector('#vis-models')!.textContent).toBe('标准1K · 均衡画质 · 25 积分');
});
