import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';

const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

await build({
  entryPoints: ['src/userscript.ts'],
  bundle: true,
  outfile: 'dist/suno-zh.user.js',
  format: 'iife',
  target: 'es2022',
  charset: 'utf8',
  legalComments: 'none',
  banner: {
    js: `// ==UserScript==
// @name         Suno 中文助手
// @namespace    https://github.com/Stellarznith/suno-zh
// @version      ${version}
// @description  Suno 最新版全界面中文汉化，支持全中文/中英对照/英文一键切换，本地词典不翻译用户内容。
// @author       Stellarznith (based on zenoskongfu/suno-zh)
// @license      MIT
// @match        https://suno.com/*
// @match        https://www.suno.com/*
// @run-at       document-idle
// @noframes
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @homepageURL  https://github.com/Stellarznith/suno-zh
// @supportURL   https://github.com/Stellarznith/suno-zh/issues
// ==/UserScript==`,
  },
});
