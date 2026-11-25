// ==UserScript==
// @name         Suno 中文助手
// @namespace    https://github.com/Stellarznith/suno-zh
// @version      0.2.2
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
// ==/UserScript==
"use strict";
(() => {
  // src/engine.ts
  var TranslationEngine = class {
    constructor(document2, adapter) {
      this.document = document2;
      this.adapter = adapter;
      this.lastPathname = this.getPathname();
      this.observer = new document2.defaultView.MutationObserver((records) => {
        const currentPathname = this.getPathname();
        if (currentPathname !== this.lastPathname) {
          this.lastPathname = currentPathname;
          if (this.document.body) this.pending.add(this.document.body);
        }
        for (const record of records) {
          if (record.type === "childList") {
            if (record.target.nodeType === 1 && record.target.matches(
              'button,[role="tab"],[role="menuitem"],[role="menuitemcheckbox"],[role="menuitemradio"]'
            )) {
              this.pending.add(record.target);
            }
            for (const node of record.addedNodes) this.pending.add(node);
          } else {
            this.pending.add(record.target);
          }
        }
        for (const node of this.edits.keys()) {
          if (!node.isConnected) this.restore(node);
        }
        this.schedule();
      });
    }
    document;
    adapter;
    observer;
    edits = /* @__PURE__ */ new Map();
    pending = /* @__PURE__ */ new Set();
    tasks = [];
    timer;
    mode = "en";
    lastPathname;
    stats = { visited: 0, writes: 0, batches: 0, workMs: 0, maxBatchMs: 0 };
    handlePopState = () => {
      if (this.mode === "en") return;
      this.lastPathname = this.getPathname();
      if (this.document.body) {
        this.pending.add(this.document.body);
        this.schedule();
      }
    };
    /** 获取当前翻译模式 */
    getMode() {
      return this.mode;
    }
    /** 切换翻译模式（'zh' / 'bilingual' / 'en'） */
    setMode(mode) {
      if (mode === this.mode) return;
      const previousMode = this.mode;
      this.mode = mode;
      if (mode === "en") {
        this.observer.disconnect();
        this.document.defaultView?.removeEventListener("popstate", this.handlePopState);
        clearTimeout(this.timer);
        this.timer = void 0;
        this.pending.clear();
        this.tasks = [];
        for (const [node, edits] of this.edits) {
          for (const [key, edit] of edits) {
            if (this.read(node, key) === edit.translated) {
              this.write(node, key, edit.original);
            }
          }
        }
        this.edits.clear();
        return;
      }
      if (previousMode === "en") {
        if (this.document.body) {
          this.observer.observe(this.document.body, {
            subtree: true,
            childList: true,
            characterData: true,
            attributes: true,
            attributeFilter: ["title", "placeholder", "role", "href", "aria-label", "hidden", "contenteditable", "data-open"]
          });
        }
        this.document.defaultView?.addEventListener("popstate", this.handlePopState);
        this.lastPathname = this.getPathname();
      }
      this.tasks = [];
      if (this.document.body) {
        this.pending.add(this.document.body);
        this.schedule();
      }
    }
    /** 兼容旧版布尔开关接口 */
    setEnabled(enabled) {
      this.setMode(enabled ? "zh" : "en");
    }
    /** 销毁引擎实例并恢复所有已修改节点 */
    destroy() {
      this.setMode("en");
    }
    getPathname() {
      return this.document.location?.pathname ?? "";
    }
    schedule() {
      if (this.mode === "en" || this.timer !== void 0 || !this.pending.size && !this.tasks.length) return;
      this.timer = setTimeout(() => this.flush(), 0);
    }
    *walk(node) {
      if (!node.isConnected) return;
      if (node.nodeType === 1) {
        const element = node;
        if (this.adapter.isProtected(element)) {
          for (const edited of this.edits.keys()) {
            if (node.contains(edited)) this.restore(edited);
          }
          return;
        }
        yield node;
        if (element.tagName === "TEXTAREA") return;
      } else {
        yield node;
      }
      for (const child of [...node.childNodes]) yield* this.walk(child);
    }
    flush() {
      this.timer = void 0;
      if (this.mode === "en") return;
      const roots = [...this.pending].filter((node) => {
        for (let parent = node.parentNode; parent; parent = parent.parentNode) {
          if (this.pending.has(parent)) return false;
        }
        return true;
      });
      this.pending.clear();
      this.tasks.push(...roots.map((root) => this.walk(root)));
      const start = performance.now();
      this.stats.batches++;
      while (this.tasks.length) {
        const next = this.tasks[0].next();
        if (next.done) this.tasks.shift();
        else if (next.value.isConnected) this.process(next.value);
        if (performance.now() - start >= 8) break;
      }
      const elapsed = performance.now() - start;
      this.stats.workMs += elapsed;
      this.stats.maxBatchMs = Math.max(this.stats.maxBatchMs, elapsed);
      this.schedule();
    }
    read(node, key) {
      return key === "#text" ? node.nodeValue : node.getAttribute(key);
    }
    write(node, key, value) {
      if (key === "#text") node.nodeValue = value;
      else node.setAttribute(key, value);
      this.stats.writes++;
    }
    restore(node) {
      const edits = this.edits.get(node);
      if (edits) {
        for (const [key, edit] of edits) {
          if (this.read(node, key) === edit.translated) {
            this.write(node, key, edit.original);
          }
        }
      }
      this.edits.delete(node);
    }
    process(node) {
      this.stats.visited++;
      if (this.mode === "en") return;
      if (node.nodeType !== 1 && node.nodeType !== 3) return;
      const element = node.nodeType === 1 ? node : node.parentElement;
      if (!element || this.adapter.isProtected(element)) {
        this.restore(node);
        return;
      }
      if (node.nodeType === 3 && element.tagName === "TEXTAREA") {
        this.restore(node);
        return;
      }
      for (const key of node.nodeType === 3 ? ["#text"] : ["title", "placeholder"]) {
        const current = this.read(node, key);
        let previous = this.edits.get(node)?.get(key);
        if (previous && current !== previous.translated) {
          this.edits.get(node).delete(key);
          previous = void 0;
        }
        if (current === null) continue;
        const source = previous?.original ?? current;
        const translation = key === "#text" ? this.adapter.text(node, source, this.mode) : this.adapter.attribute(element, key, source, this.mode);
        if (translation === void 0 || translation === source) {
          if (previous && current === previous.translated) {
            this.write(node, key, previous.original);
          }
          this.edits.get(node)?.delete(key);
        } else {
          if (!this.edits.has(node)) this.edits.set(node, /* @__PURE__ */ new Map());
          this.edits.get(node).set(key, { original: source, translated: translation });
          if (current !== translation) this.write(node, key, translation);
        }
        if (this.edits.get(node)?.size === 0) this.edits.delete(node);
      }
    }
  };

  // src/dictionary.ts
  function formatTranslation(source, translated, mode = "zh") {
    const trimmed = source.trim();
    if (!trimmed) return source;
    if (mode === "zh") return source.replace(trimmed, translated);
    const lowerTrimmed = trimmed.toLowerCase();
    const lowerTranslated = translated.trim().toLowerCase();
    if (lowerTranslated === lowerTrimmed || lowerTranslated.includes(`(${lowerTrimmed})`)) {
      return source.replace(trimmed, translated);
    }
    return source.replace(trimmed, `${translated} (${trimmed})`);
  }
  var navigation = {
    Home: "首页",
    Explore: "探索",
    Create: "创作",
    Studio: "工作室",
    Library: "资料库",
    "Earn credits": "赚取积分",
    "Earn Credits": "赚取积分",
    Labs: "实验室",
    Notifications: "通知",
    More: "更多",
    "Upgrade to Premier": "升级至 Premier",
    "Upgrade to Pro": "升级至 Pro",
    Upgrade: "升级",
    Trash: "回收站",
    "Black Friday Sale": "黑色星期五大促",
    "Get +30% off annual plans": "年付套餐立减 30%",
    "Redeem now": "立即领取",
    "Redeem Now": "立即领取",
    Dismiss: "关闭",
    "Collapse sidebar": "收起侧边栏",
    "Expand sidebar": "展开侧边栏"
  };
  var library = {
    Songs: "歌曲",
    Playlists: "播放列表",
    Albums: "专辑",
    Workspaces: "工作区",
    "Studio Projects": "工作室项目",
    Hooks: "Hooks 短片",
    "Liked Hooks": "喜欢的 Hooks",
    History: "历史记录",
    Voices: "声音",
    Lyrics: "歌词",
    Styles: "风格",
    Filters: "筛选",
    Search: "搜索",
    "Search songs": "搜索歌曲",
    "Search your songs": "搜索你的歌曲",
    "Search library": "搜索资料库",
    "Search your library": "搜索你的资料库",
    "Search clips": "搜索作品",
    Newest: "最新优先",
    Oldest: "最早优先",
    Recent: "最新",
    "Most liked": "最多点赞",
    "Most Liked": "最多点赞",
    "Least liked": "最少点赞",
    "Least Liked": "最少点赞",
    "Newest First": "最新优先",
    "Oldest First": "最早优先",
    "Newest first": "最新优先",
    "Oldest first": "最早优先",
    "Recently Created": "最近创建",
    "Recently created": "最近创建",
    "Recently Updated": "最近更新",
    List: "列表",
    Waveform: "波形",
    Grid: "网格",
    "Create Playlist": "创建播放列表",
    "Create playlist": "创建播放列表",
    "New Playlist": "新建播放列表",
    "New playlist": "新建播放列表",
    "New Workspace": "新建工作区",
    "New workspace": "新建工作区",
    "My Workspace": "我的工作区",
    "My Workspaces": "我的工作区",
    "All Songs": "全部歌曲",
    "All songs": "全部歌曲",
    "Upload audio": "上传音频",
    "Upload Audio": "上传音频",
    Audio: "音频",
    Trash: "回收站"
  };
  var creation = {
    // 顶层创作类型与模式切换
    Songs: "歌曲",
    Speech: "语音",
    Sounds: "音效",
    Visuals: "视觉",
    Simple: "简单",
    Advanced: "高级",
    Custom: "自定义",
    Image: "图片",
    Video: "视频",
    // 通用动作与顶部扩展入口
    Audio: "音频",
    Voice: "声音",
    Voices: "声音",
    Inspo: "灵感",
    Add: "添加",
    Clear: "清空",
    "Clear All": "全部清除",
    "Clear all": "全部清除",
    "Reset All": "全部重置",
    "Reset all": "全部重置",
    Create: "创作",
    "Create song": "创作歌曲",
    "Create speech": "创作语音",
    // 歌词与风格区块
    Lyrics: "歌词",
    Styles: "风格",
    "Saved lyrics": "已保存歌词",
    "Save lyrics": "保存歌词",
    "Clear lyrics": "清空歌词",
    "Help me write lyrics": "帮我写歌词",
    "Open full screen lyrics editor": "打开全屏歌词编辑器",
    "View saved style prompts": "查看已保存风格提示词",
    "Save prompt": "保存提示词",
    "Clear styles": "清空风格",
    "Personalize style prompt to match your taste": "个性化匹配你的风格偏好",
    "Refresh recommended styles": "刷新推荐风格",
    "Add Lyrics": "添加歌词",
    "Add lyrics": "添加歌词",
    "Add Styles": "添加风格",
    "Add styles": "添加风格",
    "Write Lyrics": "写歌词",
    "Write lyrics": "写歌词",
    "Auto Lyrics": "自动歌词",
    Instrumental: "纯音乐",
    // More Options / Advanced Options
    "More Options": "更多选项",
    "More options": "更多选项",
    "Advanced Options": "高级选项",
    "Advanced options": "高级选项",
    "Song Description": "歌曲描述",
    "Song description": "歌曲描述",
    "Song Title": "歌曲标题",
    "Song title": "歌曲标题",
    "Song Title (Optional)": "歌曲标题（可选）",
    Title: "标题",
    "Exclude styles": "排除风格",
    "Exclude Styles": "排除风格",
    "Vocal Gender": "人声性别",
    "Vocal gender": "人声性别",
    Male: "男声",
    Female: "女声",
    Duration: "时长",
    Auto: "自动",
    "Max Mode": "Max 模式",
    Off: "关闭",
    On: "开启",
    Weirdness: "实验程度",
    "Style Influence": "风格影响力",
    "Style influence": "风格影响力",
    "Audio Influence": "音频影响力",
    Variety: "多样性",
    Normal: "标准",
    Personalize: "个性化",
    "My taste": "我的品味",
    "My Taste": "我的品味",
    "Save to...": "保存到...",
    "Save to": "保存到",
    "Select Workspace": "选择工作区",
    "Upload Audio": "上传音频",
    "Upload audio": "上传音频",
    "Add Audio": "添加音频",
    "Add audio": "添加音频",
    "Add Persona": "添加角色",
    "Song Settings": "歌曲设置",
    // Speech 模式
    Script: "台词文本",
    Tone: "语气与演绎",
    "Write or paste your speech": "输入或粘贴要合成的台词文本",
    "Describe the delivery: tone, pacing, mood and setting": "描述演绎方式：语气、语速、情绪与场景",
    "Background music": "背景音乐",
    Beta: "Beta",
    // Sounds 模式
    Sound: "音效描述",
    "Describe the sound you want": "描述你想要的音效",
    "Create short samples — effects, loops, and one-shots. Ready to drop into anything.": "创作短音频采样——音效、循环与单次采样，随时可用于任意作品。",
    Type: "类型",
    "One-Shot": "单次采样",
    Loop: "循环片段",
    BPM: "BPM",
    Key: "调性",
    Any: "任意",
    Major: "大调",
    Minor: "小调",
    Dismiss: "关闭",
    // Visuals 模式（/create/visuals）
    Model: "模型",
    Fast: "极速",
    Standard: "标准",
    Max: "极致",
    Quality: "高质量",
    "1K • Quick drafts • 1 credit": "1K · 快速草稿 · 1 积分",
    "1K • Balanced quality • 25 credits": "1K · 均衡画质 · 25 积分",
    "2K • Highest quality • 50 credits": "2K · 最高画质 · 50 积分",
    "480p • Quick drafts • 15 credits/sec": "480p · 快速草稿 · 15 积分/秒",
    "720p • Balanced quality • 30 credits/sec": "720p · 均衡画质 · 30 积分/秒",
    "Quick drafts": "快速草稿",
    "Balanced quality": "均衡画质",
    "Highest quality": "最高画质",
    Low: "低",
    Medium: "中",
    High: "高",
    Default: "默认",
    None: "无",
    "+ Audio": "+ 音频",
    "+ Character": "+ 角色",
    "Start frame": "首帧",
    "End frame": "尾帧",
    References: "参考素材",
    Prompt: "提示词",
    "Describe your video in detail": "详细描述你的视频画面",
    "Describe your image in detail": "详细描述你的图像内容",
    "Type a prompt or add a frame, image or song to start.": "输入提示词，或添加画面帧、图片或歌曲即可开始。",
    "Style Guide": "风格指南",
    "Lip sync": "口型同步",
    "Clip length": "片段时长",
    "Aspect ratio": "宽高比",
    Learn: "了解详情",
    Upload: "上传",
    Browse: "浏览",
    "From Library": "从资料库选择",
    "Choose Character": "选择角色",
    "Create New": "新建",
    "What you create will appear here": "你创作的内容将会显示在这里",
    // 模型 / Voice / Inspo / Saved 弹窗文案
    "Create Custom Model": "创建自定义模型",
    "Create a model based on your uploads (100 Credits)": "基于你上传的音频创建模型（100 积分）",
    "All Models": "全部模型",
    Pro: "Pro",
    "Powerful. Versatile. Refined. Our best model yet.": "强大、全能、细腻，迄今最出色的模型。",
    "Best for experimental ideas.": "最适合探索实验性音乐创意。",
    "A free, more efficient version of premium v6 models.": "高级 v6 模型的免费高效版本。",
    "My Voices": "我的声音",
    Favorites: "收藏",
    "Create Voice": "创建声音",
    New: "新",
    "Record or upload your voice": "录制或上传你的声音",
    "No Voices": "暂无声音",
    "Voices let you create songs that have a similar style and voice.": "“声音”功能可让你创作出具有相似音色与风格的歌曲。",
    "Pick a playlist of your own songs to inspire your next creation. Only your music will be used to shape the sound.": "选择一个包含你个人作品的播放列表作为灵感来源，仅使用你的音乐来塑造声音风格。",
    "No playlists found": "未找到播放列表",
    "Search lyrics": "搜索歌词",
    "Search styles": "搜索风格",
    "Search or create...": "搜索或创建...",
    "Create your own lyricist": "打造你的专属作词人",
    "Add examples of your lyrics and you can create new lyrics with the same vibe.": "添加你的歌词示例，即可创作出相同氛围的新歌词。",
    "Got it": "知道了",
    // /create 右侧列表区与引导挑战
    "My Songs": "我的歌曲",
    "New Workspace": "新建工作区",
    "Search clips": "搜索作品",
    Newest: "最新优先",
    Oldest: "最早优先",
    Recent: "最新",
    "Most liked": "最多点赞",
    "Least liked": "最少点赞",
    List: "列表",
    Waveform: "波形",
    Grid: "网格",
    Filters: "筛选",
    Trash: "回收站",
    "Unlock Your Sound": "解锁你的声音潜能",
    "Time left": "剩余时间",
    "Pull it apart": "拆解分轨",
    Remaster: "母带重制",
    "Find your voice": "寻找你的声音",
    "Download in higher quality": "下载更高音质",
    "Share 5 of your songs": "分享 5 首你的歌曲",
    "Use the best model": "使用最佳模型",
    Complete: "完成",
    Completed: "已完成",
    Share: "分享"
  };
  var filters = {
    Filters: "筛选",
    Liked: "已喜欢",
    Disliked: "不喜欢",
    Public: "公开",
    Private: "私密",
    Uploads: "已上传",
    "Full song": "完整歌曲",
    "Full Song": "完整歌曲",
    "Full Songs": "完整歌曲",
    Cover: "翻唱",
    Covers: "翻唱",
    Voices: "声音",
    Downloads: "已下载",
    Images: "图片",
    Videos: "视频",
    Sequences: "连续片段",
    "Hide Disliked": "隐藏不喜欢的歌曲",
    "Hide Stems": "隐藏分轨",
    "Hide Sequence clips": "隐藏连续片段",
    "Hide disliked": "隐藏不喜欢的歌曲",
    "Hide stems": "隐藏分轨",
    "Clear Filters": "清除筛选",
    "Clear filters": "清除筛选",
    Reset: "重置",
    Apply: "应用",
    All: "全部"
  };
  var menus = {
    // 歌曲三点菜单及子菜单
    Remix: "混音二创",
    Edit: "编辑",
    "Remix / Edit": "混音 / 编辑",
    Publish: "发布",
    Share: "分享",
    "Create visual": "制作视觉视频",
    "Create Visual": "制作视觉视频",
    "Cover art": "封面艺术",
    "Video clip": "视频片段",
    Download: "下载",
    Manage: "管理",
    "Add to queue": "加入播放队列",
    "Add to Queue": "加入播放队列",
    "Add to playlist": "加入播放列表",
    "Add to Playlist": "加入播放列表",
    "Song radio": "歌曲电台",
    "Song Radio": "歌曲电台",
    Report: "举报",
    "Move to trash": "移至回收站",
    "Move to Trash": "移至回收站",
    Cover: "翻唱",
    "Create Cover": "创建翻唱",
    "Reuse prompt": "复用提示词",
    "Reuse Prompt": "复用提示词",
    Mashup: "混搭",
    "Sample this song": "采样此歌曲",
    "Use as inspiration": "用作创作灵感",
    Voice: "提取/用作声音",
    Extend: "续写",
    Crop: "裁剪",
    "Remove section": "删除片段",
    Reverse: "倒放",
    "Adjust speed": "调整速度",
    "Find a collaborator": "寻找合作者",
    "Fade in": "淡入",
    "Fade out": "淡出",
    Remaster: "母带重制",
    "Replace Section": "替换片段",
    "Replace section": "替换片段",
    "Get Stems": "获取分轨",
    "Get stems": "获取分轨",
    "Open in Studio": "在工作室中打开",
    "Open in Editor": "在编辑器中打开",
    "Song details": "歌曲详情",
    "Song Details": "歌曲详情",
    "Edit Song Details": "编辑歌曲信息",
    "Allow remixes": "允许混音二创",
    Downloads: "允许下载",
    "Allow comments": "允许评论",
    "Pin to profile": "置顶到个人主页",
    "Move to workspace": "移至工作区",
    "Move to Workspace": "移至工作区",
    Rename: "重命名",
    "Copy Link": "复制链接",
    "Copy link": "复制链接",
    "Make Public": "设为公开",
    "Make Private": "设为私密",
    Delete: "删除",
    Pro: "Pro",
    New: "新",
    // 个人账户菜单与 Theme 子菜单
    Subscription: "订阅方案",
    Account: "账户设置",
    Restrictions: "内容与限制",
    Language: "语言",
    Theme: "外观主题",
    Dark: "深色",
    Light: "浅色",
    System: "跟随系统",
    "My taste": "我的品味",
    "Sign out": "退出登录",
    Profile: "个人主页",
    Settings: "设置",
    // 侧边栏 More 菜单
    "What's new?": "更新日志",
    Help: "帮助中心",
    About: "关于 Suno",
    Blog: "官方博客",
    Careers: "招贤纳士",
    Feedback: "意见反馈",
    "Terms of service": "服务条款",
    "Privacy policy": "隐私政策",
    "Your privacy choices": "隐私偏好选择",
    // + Audio 与 Visuals 二级菜单
    Upload: "上传",
    Browse: "浏览",
    Record: "录音",
    "From Library": "从资料库选择",
    "Visuals Tutorial": "视觉创作教程",
    "Visuals Inspiration Guide": "视觉灵感指南",
    // Studio 顶部与底部二级菜单
    "New Project": "新建项目",
    "Open Project": "打开项目",
    "Duplicate Project": "复制项目",
    "Share Project": "分享项目",
    "Studio Settings": "工作室设置",
    "Full Song": "完整歌曲",
    "Selected Time Range": "所选时间范围",
    Multitrack: "多轨分轨",
    "Keyboard Shortcuts": "快捷键",
    "YouTube Tutorials": "YouTube 教程",
    "Learning Center": "学习中心",
    "What's This?": "这是什么？"
  };
  var dialogs = {
    ...creation,
    Cancel: "取消",
    Save: "保存",
    Close: "关闭",
    Done: "完成",
    Confirm: "确认",
    Continue: "继续",
    Apply: "应用",
    Reset: "重置",
    Delete: "删除",
    Dismiss: "关闭",
    Back: "返回",
    "Mark all as read": "全部标为已读",
    Settings: "设置",
    Edit: "编辑",
    Remove: "移除",
    Copy: "复制",
    Copied: "已复制",
    "Copied!": "已复制！",
    "Copy Link": "复制链接",
    "Copy link": "复制链接",
    "Create Playlist": "创建播放列表",
    "Create playlist": "创建播放列表",
    "New Playlist": "新建播放列表",
    "Add to Playlist": "加入播放列表",
    "Add to playlist": "加入播放列表",
    "Move to Workspace": "移至工作区",
    "Move to workspace": "移至工作区",
    "Create Workspace": "创建工作区",
    "Liked songs": "喜欢的歌曲",
    Share: "分享",
    "Share to...": "分享到...",
    Email: "电子邮件",
    Embed: "嵌入代码",
    Download: "下载",
    "MP4 video asset": "MP4 视频素材",
    "Stems & MIDI": "分轨与 MIDI",
    Manage: "管理",
    "Unlock & Download": "解锁并下载",
    Plan: "当前套餐",
    Downloads: "下载额度",
    Refreshes: "刷新时间",
    Notifications: "通知",
    Activity: "动态",
    "No notifications here yet": "暂时没有新通知",
    "Notification Settings": "通知设置",
    Interactions: "互动消息",
    Announcements: "官方公告",
    "New features, remix contests and more": "新功能发布、混音大赛及更多动态",
    "Likes and plays on your posts": "作品获得的点赞与播放",
    "When someone likes or plays your post": "当有人点赞或播放你的作品时",
    "New posts from people you follow": "关注创作者的新作品",
    "When someone you follow publishes a new post": "当你关注的人发布新作品时",
    "New followers": "新增粉丝",
    "When someone follows you": "当有人关注你时",
    "Comments on your posts": "作品收到的评论",
    "When someone comments on your post": "当有人评论你的作品时",
    Mentions: "提及",
    "When someone mentions you": "当有人提及你时",
    "My Taste": "我的音乐品味",
    "Capture your taste profile on Suno. The more you create, listen, like and dislike, the more Suno learns to speak your musical language.": "在 Suno 上记录你的音乐品味画像。你创作、收听、点赞与点踩得越多，Suno 就越懂你的音乐语言。",
    "Or write one now to shape your sound right away.": "或者现在就写一段描述，立刻塑造你的专属声音风格。",
    "My Styles": "我的风格",
    "When toggled on, using the magic wand in the styles field will apply your taste profile to generate style suggestions.": "开启后，在风格栏点击魔法棒将结合你的品味画像生成风格建议。",
    "We use cookies": "我们使用 Cookie",
    "We use cookies to run this site and, with your consent, to measure how it's used and to personalize it. You choose what's on and you can change your mind anytime.": "我们使用 Cookie 来保障网站运行，并在征得您同意后用于统计使用情况和提供个性化体验。您可以自主选择开启或关闭，并随时更改设置。",
    Customize: "自定义设置",
    "Reject All": "全部拒绝",
    "Accept All": "全部接受",
    // Studio 弹窗
    "Time Signature": "拍号",
    "Project key": "项目调性",
    "Transpose song": "歌曲移调",
    "Auto detect": "自动检测",
    Manual: "手动设置",
    "Add melodic or harmonic tracks to detect a key": "添加旋律或和声轨道以自动检测调性",
    // Visuals Style Guide 弹窗（导航、分类问题与 56 项技法词条）
    "Inspiration Guide": "灵感指南",
    Atmosphere: "氛围与光影",
    Camera: "镜头语言",
    Motion: "运镜与动态",
    "What is it made of?": "画面材质与媒介？",
    "What style does it have?": "整体艺术风格？",
    "What colors fill the picture?": "画面色彩基调？",
    "What’s the light like?": "光线效果如何？",
    "What's the light like?": "光线效果如何？",
    "How is the person lit?": "人物布光方式？",
    "What are the surroundings like?": "周围环境氛围？",
    "What should look unreal?": "超现实视觉元素？",
    "How close are we?": "镜头景别远近？",
    "How are people arranged?": "人物构图站位？",
    "How is the camera angled?": "摄影机机位角度？",
    "How is the picture arranged?": "画面构图层次？",
    "How wide or close is the view?": "镜头焦段视野？",
    "Any glows or unusual edges?": "特殊光学眩光效果？",
    "How does the camera move?": "摄影机如何运镜？",
    "How should time move?": "时间流逝效果？",
    "Clay animation": "黏土定格动画",
    "Cut-paper stop motion": "剪纸定格动画",
    "Wire marionettes": "提线木偶",
    "1990s cel animation": "90 年代赛璐璐动画",
    "Film noir": "黑色电影",
    "Neo-noir": "新黑色电影",
    "German expressionism": "德国表现主义",
    Vaporwave: "蒸汽波",
    "Teal and orange": "青橙色调",
    Monochrome: "单色黑白",
    Sepia: "复古棕褐色",
    Palette: "精选色板",
    "Color shift": "色彩偏移",
    Infrared: "红外摄影",
    "Night vision": "夜视仪效果",
    "Golden hour": "黄金时刻暖光",
    "Blue hour": "蓝调时刻",
    "Practical lighting": "实景光源",
    "Neon practicals": "霓虹实景光",
    Spotlight: "聚光灯",
    "Volumetric light": "丁达尔体积光",
    "Dappled light": "斑驳光影",
    "Moonlight gel": "月光滤镜光",
    "Beams in haze": "雾中光束",
    Silhouette: "剪影",
    Snow: "飘雪",
    Fog: "浓雾",
    "Atmospheric haze": "空气薄雾",
    Smoke: "烟雾",
    Steam: "蒸汽",
    "Raining objects": "天降异物",
    "A cloud of one's own": "专属云朵",
    "Sea of clouds": "云海",
    "Storm light": "风暴天光",
    "Echo print": "重影残像",
    "Ink in water": "水中墨韵",
    "Powder burst": "彩粉爆裂",
    "Giant prop": "巨型道具",
    "Extreme close-up": "大特写",
    "Long shot": "远景",
    "Over-the-shoulder coverage": "过肩镜头",
    "High angle": "俯拍角度",
    "Bird's-eye view": "鸟瞰视角",
    "Dutch angle": "荷兰倾斜角",
    "Point of view": "第一人称视角",
    "Layered depth": "多层次景深",
    "Foreground interest": "前景衬托",
    "Frame within frame": "画中画构图",
    "Dirty frame": "前景遮挡构图",
    "14mm ultra-wide": "14mm 超广角",
    Fisheye: "鱼眼镜头",
    "85mm portrait": "85mm 人像镜头",
    "Telephoto sun": "长焦落日",
    "Lens flare": "镜头眩光",
    "Dolly in": "推镜头",
    "Dolly out": "拉镜头",
    "Super dolly in": "极速推进",
    "Aerial push in": "航拍推进",
    "Aerial pullback": "航拍拉远",
    "360-degree orbit": "360 度环绕",
    "Camera roll": "镜头旋转翻滚",
    "Pedestal up": "垂直升镜",
    "Tilt down": "镜头下摇",
    "Crane up": "摇臂上升",
    "Crane down": "摇臂下降",
    "FPV drone": "FPV 穿越机视角",
    "Blooming time-lapse": "花开延时摄影",
    "Seasons pass": "四季更迭延时"
  };
  var discover = {
    "Our biggest sale of the year": "年度最大优惠活动",
    "For You": "为你推荐",
    "Staff Picks": "编辑精选",
    "Best of v6": "v6 精选佳作",
    "Best Of": "精选榜单",
    "New Albums": "最新专辑",
    "Jump Back In": "继续聆听",
    "New Songs": "最新歌曲",
    Create: "创作",
    "Try Visuals": "体验视觉创作",
    Search: "搜索",
    "Describe the song you want to make": "描述你想要创作的歌曲",
    "Search for songs, playlists, creators, or genres": "搜索歌曲、播放列表、创作者或流派",
    Labs: "实验室",
    "Genre Wheel": "流派转盘",
    "Listen and Rank": "试听与评分",
    Preview: "预览版",
    "This page doesn’t exist. So we made a song about it.": "这个页面不存在，于是我们为它写了一首歌。",
    "This page doesn't exist. So we made a song about it.": "这个页面不存在，于是我们为它写了一首歌。"
  };
  var song = {
    Follow: "关注",
    Following: "已关注",
    Play: "播放",
    Pause: "暂停",
    Like: "点赞",
    Share: "分享",
    Lyrics: "歌词",
    Styles: "风格",
    "Made from": "衍生自",
    Cover: "翻唱",
    "Similar songs": "相似歌曲",
    "Similar Songs": "相似歌曲",
    Comments: "评论",
    "Write a comment": "写下你的评论",
    "Sort by": "排序方式",
    Recent: "最新",
    Oldest: "最早",
    "Most liked": "最多点赞",
    Reply: "回复",
    Creator: "创作者",
    "... More": "展开全部",
    "Show less": "收起",
    "Copy styles to clipboard": "复制风格到剪贴板",
    Queue: "播放队列"
  };
  var studio = {
    "Untitled Project": "未命名项目",
    Preview: "预览",
    "Upgrade to edit": "升级以编辑",
    Undo: "撤销",
    Redo: "重做",
    "Back to Start": "回到开头",
    Record: "录音",
    Play: "播放",
    Pause: "暂停",
    Loop: "循环",
    "Follow Playhead": "跟随播放头",
    Export: "导出",
    Library: "资料库",
    "Audio Track": "音轨",
    "Add new track": "添加新音轨",
    Main: "主轨",
    Beta: "Beta",
    Video: "视频",
    "Collapse tracks": "收起音轨列表",
    "Collapse track controls": "收起音轨控制",
    "Change track color": "更改音轨颜色",
    "Collapse Track": "收起音轨",
    "Mute track": "静音此音轨",
    "Choose input for recording": "选择录音输入源",
    "Mute main": "静音主轨",
    "Add to prompt": "添加到提示词",
    "Open conversation": "打开对话",
    "Collapse prompt panel": "收起提示词面板",
    Dismiss: "关闭",
    "Turn off Learn": "关闭提示引导",
    "New Project": "新建项目",
    "Open Project": "打开项目",
    Rename: "重命名",
    "Duplicate Project": "复制项目",
    "Share Project": "分享项目",
    "Studio Settings": "工作室设置",
    "Full Song": "完整歌曲",
    "Selected Time Range": "所选时间范围",
    Multitrack: "多轨分轨",
    "Keyboard Shortcuts": "快捷键",
    "YouTube Tutorials": "YouTube 教程",
    "Learning Center": "学习中心",
    "What's This?": "这是什么？",
    "Time Signature": "拍号",
    "Project key": "项目调性",
    "Transpose song": "歌曲移调",
    "Auto detect": "自动检测",
    Manual: "手动设置",
    "Add melodic or harmonic tracks to detect a key": "添加旋律或和声轨道以自动检测调性",
    "What's This? Hover over any control to see how it works. Click Learn to turn What's This? off.": "这是什么？将鼠标悬停在任意控件上即可查看说明，点击“了解”按钮可关闭此提示。"
  };
  var auth = {
    "Welcome to Suno": "欢迎使用 Suno",
    "Continue with Google": "使用 Google 账号继续",
    "Continue with Apple": "使用 Apple 账号继续",
    "Continue with Discord": "使用 Discord 账号继续",
    "Continue with Facebook": "使用 Facebook 账号继续",
    "Continue with Microsoft": "使用 Microsoft 账号继续",
    or: "或",
    "Enter your phone number": "输入你的手机号码",
    Continue: "继续",
    "Alternative options": "其他登录方式"
  };
  var playbar = {
    Queue: "播放队列",
    Play: "播放",
    Pause: "暂停",
    Like: "点赞",
    Dislike: "不喜欢",
    Share: "分享"
  };
  var tooltips = {
    // Songs Simple / Advanced
    "Browse, upload or record audio.": "浏览、上传或录制音频。",
    "Record or upload your voice and use it to create anything.": "录制或上传你的声音，用于创作任意内容。",
    "Add an image to your creation.": "为你的作品添加一张图片。",
    "Use songs to inspire your creation": "用已有歌曲为你的创作提供灵感",
    "Enter styles or lyrics to create": "请输入风格或歌词以开始创作",
    "Change the gender of the generated vocals": "更改生成人声的性别",
    "Desired song length, 10 seconds to 6 minutes.": "期望的歌曲时长，范围 10 秒至 6 分钟。",
    "Uses more compute to maximize consistency throughout the song. Costs 2x credits per song.": "投入更多算力以最大化整首歌的一致性，每首歌消耗 2 倍积分。",
    "Turn it up for wild, unexpected results": "调高可获得更大胆、出人意料的效果",
    "Turn it up to match your style description": "调高可让生成结果更贴合你的风格描述",
    "Clips have slight style variation.": "生成片段之间保持轻微的风格变化。",
    // Speech 模式
    "Enter a description to create": "请输入描述以开始创作",
    // Sounds 模式
    "One-shot plays once, Loop repeats continuously": "单次采样仅播放一次，循环片段可无缝连续重复",
    "Beats per minute (tempo)": "每分钟节拍数（速度 / 节奏）",
    "Musical key of the sound": "音效的音乐调性",
    "Enter a sound description to create": "请输入音效描述以开始创作",
    // Visuals 模式
    "Add a reference": "添加参考素材",
    "Browse film techniques to add to your prompt": "浏览影视技法并添加到你的提示词中",
    "Nothing to clear yet.": "暂无可清空的内容。",
    "Describe your visual to continue.": "请描述你的视觉画面以继续。",
    "Add a song to set your video's audio": "添加一首歌曲作为视频配乐",
    "Keep a character's look throughout your video": "在整个视频中保持角色外观一致",
    "Add the image your video starts on": "添加视频起始画面（首帧）",
    "Add the image your video ends on": "添加视频结束画面（尾帧）",
    "Add images to guide the look, like a character, object or style": "添加参考图片以引导画面外观（如角色、物体或风格）",
    "Add audio to lip sync.": "添加音频以开启口型同步。",
    // 底部播放栏 Tooltip
    Shuffle: "随机播放",
    "Enable shuffle": "开启随机播放",
    "Disable shuffle": "关闭随机播放",
    Repeat: "循环播放",
    "Enable repeat": "开启列表循环",
    "Enable repeat 1": "开启单曲循环",
    "Disable repeat": "关闭循环播放",
    Mute: "静音",
    Unmute: "取消静音",
    "Show song details": "显示歌曲详情",
    "Hide song details": "隐藏歌曲详情",
    Previous: "上一首",
    Next: "下一首"
  };
  function lookup(dictionary, value, mode = "zh") {
    const trimmed = value.trim().replace(/\s+/g, " ");
    if (!trimmed) return;
    const translated = dictionary[trimmed];
    if (typeof translated !== "string" || !Object.hasOwn(dictionary, trimmed)) return;
    return formatTranslation(value, translated, mode);
  }
  var sortNameMap = {
    Newest: "最新优先",
    Oldest: "最早优先",
    Recent: "最新",
    "Most liked": "最多点赞",
    "Least liked": "最少点赞"
  };
  var viewNameMap = {
    List: "列表",
    Waveform: "波形",
    Grid: "网格"
  };
  function lookupDynamic(scope, value, mode = "zh") {
    const normalized = value.trim().replace(/\s+/g, " ");
    if (!normalized) return;
    if (scope === "filters" || scope === "library" || scope === "creation") {
      const filterMatch = normalized.match(/^Filters\s*\((\d+)\)$/);
      if (filterMatch) {
        return formatTranslation(value, `筛选 (${filterMatch[1]})`, mode);
      }
    }
    if (scope === "navigation") {
      const endsMatch = normalized.match(/^Ends in (\d+) days?$/);
      if (endsMatch) {
        return formatTranslation(value, `还剩 ${endsMatch[1]} 天结束`, mode);
      }
    }
    if (scope === "creation" || scope === "library" || scope === "dialog" || scope === "tooltip") {
      const wsMatch = normalized.match(/^No workspace\s*\((\d+) clips?\)$/);
      if (wsMatch) {
        return formatTranslation(value, `无工作区（${wsMatch[1]} 首作品）`, mode);
      }
      const sortMatch = normalized.match(/^Sort by (Newest|Oldest|Most liked|Least liked)$/);
      if (sortMatch) {
        return formatTranslation(value, `排序：${sortNameMap[sortMatch[1]]}`, mode);
      }
      const viewMatch = normalized.match(/^View:\s*(List|Waveform|Grid)$/);
      if (viewMatch) {
        return formatTranslation(value, `视图：${viewNameMap[viewMatch[1]]}`, mode);
      }
      const clipMatch = normalized.match(/^Create (\d+s) clip$/);
      if (clipMatch) {
        return formatTranslation(value, `创作 ${clipMatch[1]} 片段`, mode);
      }
      const creditsPerSecMatch = normalized.match(/^(\d+)\s+credits?\/sec$/i);
      if (creditsPerSecMatch) {
        return formatTranslation(value, `${creditsPerSecMatch[1]} 积分/秒`, mode);
      }
      const creditsMatch = normalized.match(/^(\d+)\s+credits?$/i);
      if (creditsMatch) {
        return formatTranslation(value, `${creditsMatch[1]} 积分`, mode);
      }
      const completedMatch = normalized.match(/^(\d+)\s+of\s+(\d+)\s+completed$/);
      if (completedMatch) {
        return formatTranslation(value, `已完成 ${completedMatch[1]} / ${completedMatch[2]}`, mode);
      }
      const ratioMatch = normalized.match(/^Aspect ratio\s+(\d+:\d+)$/);
      if (ratioMatch) {
        return formatTranslation(value, `宽高比 ${ratioMatch[1]}`, mode);
      }
      const clipLenHelpMatch = normalized.match(
        /^(\d+s)\s*·\s*Up to (\d+s) per clip\.\s*Use Extend in the editor to go longer\.$/
      );
      if (clipLenHelpMatch) {
        return formatTranslation(
          value,
          `${clipLenHelpMatch[1]} · 每段最长 ${clipLenHelpMatch[2]}，可在编辑器中使用“续写”延长。`,
          mode
        );
      }
    }
    if (scope === "song") {
      const commentsMatch = normalized.match(/^(\d+)\s+Comments?$/);
      if (commentsMatch) {
        return formatTranslation(value, `${commentsMatch[1]} 条评论`, mode);
      }
      const moreByMatch = normalized.match(/^More by (.+)$/);
      if (moreByMatch) {
        const translated = mode === "bilingual" ? `更多来自 / More by ${moreByMatch[1]}` : `更多来自 ${moreByMatch[1]}`;
        return value.replace(value.trim(), translated);
      }
      const atTimeMatch = normalized.match(/^at (\d+:\d+)$/);
      if (atTimeMatch) {
        return formatTranslation(value, `位于 ${atTimeMatch[1]}`, mode);
      }
    }
    if (scope === "tooltip") {
      const creditsRemainingMatch = normalized.match(/^Credits remaining:\s*([\d,]+)$/);
      if (creditsRemainingMatch) {
        return formatTranslation(value, `剩余积分：${creditsRemainingMatch[1]}`, mode);
      }
    }
    if (scope === "dialog" || scope === "tooltip") {
      const downloadTitleMatch = normalized.match(/^Download\s*(['"‘’])(.+)\1$/);
      if (downloadTitleMatch) {
        const quote = downloadTitleMatch[1];
        const title = downloadTitleMatch[2];
        const translated = mode === "bilingual" ? `下载 / Download ${quote}${title}${quote}` : `下载 ${quote}${title}${quote}`;
        return value.replace(value.trim(), translated);
      }
    }
    return void 0;
  }

  // src/adapter.ts
  var protectedSelector = [
    "script",
    "style",
    "noscript",
    "pre",
    "code",
    '[contenteditable]:not([contenteditable="false"])',
    ".clip-title-wrapper",
    'a[href^="/song/"]',
    'a[href^="/s/"]',
    'a[href^="/@"]',
    'a[href^="/playlist/"]',
    'a[href^="/workspace/"]',
    'a[href^="/style/"]',
    'a[href^="/album/"]',
    '[data-testid*="song-title"]',
    '[data-testid*="song-card"]',
    '[data-testid*="song-row"]'
  ].join(",");
  var actionSelector = 'button,[role="button"],[role="tab"],[role="option"],[role="menuitem"],[role="menuitemcheckbox"],[role="menuitemradio"],label,h1,h2,h3';
  var canonicalRoutes = /* @__PURE__ */ new Set([
    "/",
    "/discover",
    "/explore",
    "/create",
    "/create/visuals",
    "/me",
    "/me/trash",
    "/studio",
    "/earn-credits",
    "/labs"
  ]);
  var libraryActionDict = {
    Filters: "筛选",
    "Create Playlist": "创建播放列表",
    "Create playlist": "创建播放列表",
    "New Playlist": "新建播放列表",
    "New playlist": "新建播放列表",
    "New Workspace": "新建工作区",
    "New workspace": "新建工作区",
    "Upload audio": "上传音频",
    "Upload Audio": "上传音频",
    Audio: "音频",
    Trash: "回收站",
    Newest: "最新优先",
    Oldest: "最早优先",
    "Most liked": "最多点赞",
    "Least liked": "最少点赞",
    Share: "分享",
    Play: "播放",
    Pause: "暂停",
    Like: "点赞",
    Dislike: "不喜欢"
  };
  function isAction(element) {
    return Boolean(element.closest(actionSelector));
  }
  function getPathname(element) {
    return element.ownerDocument.location?.pathname ?? "";
  }
  function onPage(element, path) {
    const pathname = getPathname(element);
    if (pathname === path) return true;
    if (path.endsWith("/")) return pathname.startsWith(path);
    return pathname.startsWith(`${path}/`);
  }
  function contextMenuAction(element) {
    return element.closest(
      '.context-menu-item button, .context-menu-item, [role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]'
    );
  }
  function isInProtectedSongCard(element, checkDirectContainer = false) {
    const clipRow = element.closest('[data-testid="clip-row"]');
    const groupCard = element.closest('[role="group"]');
    const card = clipRow ?? (groupCard && groupCard.querySelector('h4 a[href^="/song/"], a[href^="/song/"]') ? groupCard : null);
    if (!card) return false;
    if (!clipRow && card.getAttribute("aria-label") === "Library section") return false;
    if (element === card) return checkDirectContainer;
    const button = element.closest("button");
    if (button && card.contains(button) && !button.closest('h4, a[href^="/song/"]')) {
      const ariaLabel = button.getAttribute("aria-label") ?? "";
      if (!ariaLabel.startsWith("Play ")) {
        return false;
      }
    }
    return true;
  }
  var createRoots = /* @__PURE__ */ new WeakMap();
  function inCreateForm(element) {
    const doc = element.ownerDocument;
    if (!createRoots.has(doc)) {
      let form = null;
      const anchor = doc.querySelector(
        '[role="tablist"][aria-label="Create form mode"], [role="tablist"][aria-label="What to create"], [role="tablist"][aria-label="Image or video"]'
      );
      for (let root = anchor?.parentElement; root && root !== doc.body; root = root.parentElement) {
        if (root.querySelector(
          '[aria-label="Lyrics editor"], [data-testid="create-form-styles-wrapper"], [aria-label="Song Description"], [aria-label="Script"], [aria-label="Sound"], button[aria-label="Create song"], button[aria-label="Create speech"], input[placeholder="Describe your video in detail"]'
        )) {
          form = root;
          break;
        }
      }
      createRoots.set(doc, form);
      queueMicrotask(() => createRoots.delete(doc));
    }
    return createRoots.get(doc)?.contains(element) ?? false;
  }
  function getBoundListboxTrigger(element) {
    const popup = element.closest('[role="listbox"]');
    if (!popup?.id) return void 0;
    return [...element.ownerDocument.querySelectorAll('button[role="combobox"][aria-controls]')].find(
      (button) => button.getAttribute("aria-controls") === popup.id
    );
  }
  function isNavigationRoute(href) {
    return canonicalRoutes.has(href) || href.startsWith("/account");
  }
  function isTooltip(element) {
    return Boolean(
      element.closest('[role="tooltip"]') || element.closest(
        '[data-base-ui-portal] [role="presentation"] [data-base-ui-focusable]:not([role]), [data-base-ui-portal] [data-side][data-base-ui-focusable]:not([role])'
      )
    );
  }
  function selectContext(element) {
    const link = element.closest("a[href]");
    if (link) {
      const href = link.getAttribute("href") ?? "";
      if (isNavigationRoute(href)) {
        if (link.matches('[role="tab"]')) return { dictionary: library, scope: "library" };
        return { dictionary: navigation, scope: "navigation" };
      }
      if (link.matches('[role="tab"]') && onPage(element, "/me")) {
        return { dictionary: library, scope: "library" };
      }
    }
    if (element.closest('[role="tablist"] a[role="tab"]') && onPage(element, "/me")) {
      return { dictionary: library, scope: "library" };
    }
    const trigger = getBoundListboxTrigger(element);
    if (trigger) {
      const triggerLabel = trigger.getAttribute("aria-label") ?? "";
      if (triggerLabel.startsWith("Filters")) return { dictionary: filters, scope: "filters" };
      if (triggerLabel.startsWith("Model")) return { dictionary: creation, scope: "creation" };
      return { dictionary: library, scope: "library", fallback: [creation, song] };
    }
    if (element.closest('[role="listbox"]')) return void 0;
    if (contextMenuAction(element) || element.closest('[role="menu"]')) {
      return { dictionary: menus, fallback: [studio, creation, navigation] };
    }
    if (element.closest('[role="dialog"]')) {
      return { dictionary: dialogs, scope: "dialog", fallback: [creation, menus, studio] };
    }
    if (isTooltip(element)) {
      return { dictionary: tooltips, scope: "tooltip", fallback: [dialogs, menus, creation, navigation, studio, playbar] };
    }
    if (element.closest(
      '[role="tablist"][aria-label="Create form mode"], [role="tablist"][aria-label="What to create"], [role="tablist"][aria-label="Image or video"]'
    ) || inCreateForm(element)) {
      return { dictionary: creation, scope: "creation", fallback: [library] };
    }
    if (element.closest(
      'nav, aside, header, [data-testid="profile-menu-button"], button[aria-label="Notifications"], button[aria-label="Collapse sidebar"], button[aria-label="Expand sidebar"], button[aria-label="Dismiss"]'
    )) {
      return { dictionary: navigation, scope: "navigation" };
    }
    if (onPage(element, "/create")) {
      if (element.closest(
        '[role="group"][aria-label="Library section"], button, [role="button"], [role="combobox"], [role="tab"], input, textarea, h1, h2, h3, h4, label'
      ) || element.closest('[class*="onboarding"], [data-testid*="onboarding"]')) {
        return { dictionary: creation, scope: "creation", fallback: [library, navigation] };
      }
      return { dictionary: creation, scope: "creation" };
    }
    if (onPage(element, "/me")) {
      if (element.closest('button[role="combobox"]')) {
        return { dictionary: library, scope: "library", fallback: [filters] };
      }
      if (element.closest('button, [role="button"], a[href="/me/trash"]')) {
        return { dictionary: libraryActionDict, scope: "library", fallback: [menus] };
      }
      if (element.matches("input, textarea")) {
        return { dictionary: library, scope: "library" };
      }
      return void 0;
    }
    if (onPage(element, "/discover") || onPage(element, "/explore") || onPage(element, "/labs")) {
      if (element.closest('h1, h2, h3, button, [role="button"], a[role="button"], input, textarea, p, span')) {
        return { dictionary: discover, fallback: [navigation] };
      }
      return void 0;
    }
    if (onPage(element, "/song/")) {
      if (element.closest('[data-testid*="lyrics"]') && !element.closest('button, [role="button"]')) {
        return void 0;
      }
      if (element.closest('h2, h3, button, [role="button"], [role="tab"], [role="option"], label, input, textarea')) {
        return { dictionary: song, scope: "song", fallback: [menus] };
      }
      return { dictionary: songWhitelistDict, scope: "song" };
    }
    if (onPage(element, "/studio")) {
      return { dictionary: studio, fallback: [creation, navigation] };
    }
    if (onPage(element, "/sign-in")) {
      return { dictionary: auth, fallback: [dialogs] };
    }
    if (element.closest('footer, [aria-label*="Playbar" i], [data-testid*="playbar"]')) {
      return { dictionary: playbar };
    }
    return void 0;
  }
  var songWhitelistDict = {
    "Made from": "衍生自",
    "Sort by": "排序方式",
    Creator: "创作者",
    Comments: "评论",
    Cover: "翻唱"
  };
  function translateWithContext(ctx, source, mode) {
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
    return void 0;
  }
  var sunoAdapter = {
    isProtected(element) {
      if (element.closest("[data-suno-zh-ui]")) return true;
      if (contextMenuAction(element) && !element.closest('[contenteditable]:not([contenteditable="false"])')) {
        return false;
      }
      if (element.closest(protectedSelector)) return true;
      if (onPage(element, "/song/") && element.closest("h1")) return true;
      if (isInProtectedSongCard(element)) return true;
      return false;
    },
    text(node, source, mode) {
      const element = node.parentElement;
      if (!element || element.tagName === "TEXTAREA" || isInProtectedSongCard(element, true)) return;
      const ctx = selectContext(element);
      if (ctx) {
        const translated = translateWithContext(ctx, source, mode);
        if (translated) return translated;
      }
      const trimmed = source.trim().replace(/\s+/g, " ");
      if (trimmed === "This page doesn’t exist. So we made a song about it." || trimmed === "This page doesn't exist. So we made a song about it.") {
        return lookup(discover, source, mode);
      }
      return void 0;
    },
    attribute(element, name, source, mode) {
      if (name === "placeholder" && (element.matches("input") || element.matches("textarea"))) {
        const ctx = selectContext(element);
        if (ctx) {
          const hit = translateWithContext(ctx, source, mode);
          if (hit) return hit;
        }
        return lookup(library, source, mode) ?? lookup(discover, source, mode);
      }
      if (name === "title" && isAction(element)) {
        const ctx = selectContext(element);
        if (ctx) return translateWithContext(ctx, source, mode);
      }
      return void 0;
    }
  };

  // src/switcher.ts
  var MODE_ITEMS = [
    { mode: "zh", label: "中", title: "全中文" },
    { mode: "bilingual", label: "中英", title: "中英对照" },
    { mode: "en", label: "EN", title: "恢复英文" }
  ];
  function createFloatingSwitcher(document2, options) {
    const root = document2.createElement("div");
    root.setAttribute("data-suno-zh-ui", "1");
    root.setAttribute("role", "region");
    root.setAttribute("aria-label", "Suno 中文助手显示模式切换");
    root.style.cssText = [
      "position:fixed",
      "right:16px",
      "bottom:84px",
      "z-index:2147483000",
      "display:flex",
      "align-items:center",
      "gap:4px",
      "padding:4px",
      "border-radius:9999px",
      "background:rgba(20,20,24,0.86)",
      "backdrop-filter:blur(10px)",
      "border:1px solid rgba(255,255,255,0.16)",
      "box-shadow:0 8px 24px rgba(0,0,0,0.42)",
      "font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif",
      "font-size:12px",
      "line-height:1",
      "user-select:none"
    ].join(";");
    const buttons = /* @__PURE__ */ new Map();
    let currentMode2 = options.initialMode;
    const updateStyles = () => {
      for (const [mode, button] of buttons) {
        const active = mode === currentMode2;
        button.setAttribute("aria-pressed", active ? "true" : "false");
        button.style.cssText = [
          "border:none",
          "cursor:pointer",
          "padding:6px 10px",
          "border-radius:9999px",
          "font-size:12px",
          "font-weight:600",
          "transition:background 0.15s ease,color 0.15s ease",
          active ? "background:#f4a574;color:#141418" : "background:transparent;color:rgba(255,255,255,0.78)"
        ].join(";");
      }
    };
    for (const item of MODE_ITEMS) {
      const button = document2.createElement("button");
      button.type = "button";
      button.textContent = item.label;
      button.title = item.title;
      button.setAttribute("data-suno-zh-mode", item.mode);
      button.addEventListener("click", () => {
        if (currentMode2 === item.mode) return;
        currentMode2 = item.mode;
        updateStyles();
        options.onModeChange(item.mode);
      });
      buttons.set(item.mode, button);
      root.append(button);
    }
    const closeButton = document2.createElement("button");
    closeButton.type = "button";
    closeButton.textContent = "×";
    closeButton.title = "隐藏快捷开关（可在油猴菜单重新开启）";
    closeButton.setAttribute("aria-label", "隐藏悬浮开关");
    closeButton.setAttribute("data-suno-zh-close", "1");
    closeButton.style.cssText = [
      "border:none",
      "cursor:pointer",
      "padding:6px 8px",
      "border-radius:9999px",
      "background:transparent",
      "color:rgba(255,255,255,0.58)",
      "font-size:14px",
      "line-height:1"
    ].join(";");
    closeButton.addEventListener("click", () => {
      setVisible(false);
      options.onHide();
    });
    root.append(closeButton);
    const setVisible = (visible) => {
      root.style.display = visible ? "flex" : "none";
    };
    updateStyles();
    setVisible(options.initialVisible);
    (document2.body ?? document2.documentElement).append(root);
    return {
      setMode(mode) {
        currentMode2 = mode;
        updateStyles();
      },
      setVisible,
      destroy() {
        root.remove();
      }
    };
  }

  // src/userscript.ts
  var MODE_STORAGE_KEY = "displayMode";
  var LEGACY_STORAGE_KEY = "chineseEnabled";
  var SWITCHER_STORAGE_KEY = "showSwitcher";
  function loadInitialMode() {
    const saved = GM_getValue(MODE_STORAGE_KEY, null);
    if (saved === "zh" || saved === "bilingual" || saved === "en") {
      return saved;
    }
    return GM_getValue(LEGACY_STORAGE_KEY, true) === false ? "en" : "zh";
  }
  var engine = new TranslationEngine(document, sunoAdapter);
  var currentMode = loadInitialMode();
  var showSwitcher = GM_getValue(SWITCHER_STORAGE_KEY, true) !== false;
  var menuIds = [];
  var switcher;
  function clearMenuCommands() {
    for (const id of menuIds) {
      GM_unregisterMenuCommand(id);
    }
    menuIds = [];
  }
  function setMode(nextMode) {
    currentMode = nextMode;
    GM_setValue(MODE_STORAGE_KEY, nextMode);
    GM_setValue(LEGACY_STORAGE_KEY, nextMode !== "en");
    apply();
  }
  function toggleSwitcher(visible) {
    showSwitcher = visible;
    GM_setValue(SWITCHER_STORAGE_KEY, visible);
    apply();
  }
  function mountSwitcher() {
    if (switcher) return;
    switcher = createFloatingSwitcher(document, {
      initialMode: currentMode,
      initialVisible: showSwitcher,
      onModeChange: (mode) => setMode(mode),
      onHide: () => toggleSwitcher(false)
    });
  }
  function apply() {
    engine.setMode(currentMode);
    mountSwitcher();
    switcher?.setMode(currentMode);
    switcher?.setVisible(showSwitcher);
    clearMenuCommands();
    menuIds.push(
      GM_registerMenuCommand(`${currentMode === "zh" ? "✓ " : ""}全中文 / Chinese`, () => setMode("zh")),
      GM_registerMenuCommand(
        `${currentMode === "bilingual" ? "✓ " : ""}中英对照 / Bilingual`,
        () => setMode("bilingual")
      ),
      GM_registerMenuCommand(`${currentMode === "en" ? "✓ " : ""}恢复英文 / English`, () => setMode("en")),
      GM_registerMenuCommand(
        `${showSwitcher ? "隐藏页内开关" : "显示页内开关"} / Toggle Floating Switcher`,
        () => toggleSwitcher(!showSwitcher)
      )
    );
  }
  apply();
  window.addEventListener("pagehide", () => {
    engine.destroy();
    switcher?.destroy();
    switcher = void 0;
  });
  window.addEventListener("pageshow", () => {
    apply();
  });
})();
