/**
 * 页面显示模式：
 * - `zh`：全中文模式
 * - `bilingual`：中英对照模式
 * - `en`：恢复原版英文（停止监听并还原已翻译节点）
 */
export type TranslationMode = 'zh' | 'bilingual' | 'en';

/** 处于激活状态的翻译模式 */
export type ActiveTranslationMode = Exclude<TranslationMode, 'en'>;

/** 站点适配器接口：隔离具体网站的 DOM 定位、保护边界与词典匹配逻辑 */
export interface TranslationAdapter {
  /** 判断目标元素（或其祖先）是否属于受保护的用户内容区域，命中后跳过并还原 */
  isProtected(element: Element): boolean;
  /** 翻译文本节点，返回 undefined 或与 source 相同表示不翻译 */
  text(node: Text, source: string, mode: ActiveTranslationMode): string | undefined;
  /** 翻译受支持的属性（如 placeholder、title），返回 undefined 或与 source 相同表示不翻译 */
  attribute(element: Element, name: string, source: string, mode: ActiveTranslationMode): string | undefined;
}

interface Edit {
  original: string;
  translated: string;
}

/** 增量 DOM 翻译引擎：支持时间片调度、受保护区域自动还原以及三态模式无缝切换 */
export class TranslationEngine {
  private observer: MutationObserver;
  private edits = new Map<Node, Map<string, Edit>>();
  private pending = new Set<Node>();
  private tasks: Generator<Node>[] = [];
  private timer: ReturnType<typeof setTimeout> | undefined;
  private mode: TranslationMode = 'en';
  private lastPathname: string;
  readonly stats = { visited: 0, writes: 0, batches: 0, workMs: 0, maxBatchMs: 0 };

  private readonly handlePopState = () => {
    if (this.mode === 'en') return;
    this.lastPathname = this.getPathname();
    if (this.document.body) {
      this.pending.add(this.document.body);
      this.schedule();
    }
  };

  constructor(private document: Document, private adapter: TranslationAdapter) {
    this.lastPathname = this.getPathname();
    this.observer = new document.defaultView!.MutationObserver(records => {
      const currentPathname = this.getPathname();
      if (currentPathname !== this.lastPathname) {
        this.lastPathname = currentPathname;
        if (this.document.body) this.pending.add(this.document.body);
      }
      for (const record of records) {
        if (record.type === 'childList') {
          // 容器元素可能从普通按钮演变为受保护内容，需重新评估父级。
          if (
            record.target.nodeType === 1 &&
            (record.target as Element).matches('button,[role="tab"],[role="menuitem"]')
          ) {
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

  /** 获取当前翻译模式 */
  getMode(): TranslationMode {
    return this.mode;
  }

  /** 切换翻译模式（'zh' / 'bilingual' / 'en'） */
  setMode(mode: TranslationMode) {
    if (mode === this.mode) return;
    const previousMode = this.mode;
    this.mode = mode;

    if (mode === 'en') {
      this.observer.disconnect();
      this.document.defaultView?.removeEventListener('popstate', this.handlePopState);
      clearTimeout(this.timer);
      this.timer = undefined;
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

    if (previousMode === 'en') {
      if (this.document.body) {
        this.observer.observe(this.document.body, {
          subtree: true,
          childList: true,
          characterData: true,
          attributes: true,
          attributeFilter: ['title', 'placeholder', 'role', 'href', 'aria-label', 'hidden', 'contenteditable', 'data-open'],
        });
      }
      this.document.defaultView?.addEventListener('popstate', this.handlePopState);
      this.lastPathname = this.getPathname();
    }

    // 在 zh 与 bilingual 之间互切时保留 edits 中的 original，重新从原文渲染避免二次套娃。
    this.tasks = [];
    if (this.document.body) {
      this.pending.add(this.document.body);
      this.schedule();
    }
  }

  /** 兼容旧版布尔开关接口 */
  setEnabled(enabled: boolean) {
    this.setMode(enabled ? 'zh' : 'en');
  }

  /** 销毁引擎实例并恢复所有已修改节点 */
  destroy() {
    this.setMode('en');
  }

  private getPathname() {
    return this.document.location?.pathname ?? '';
  }

  private schedule() {
    if (this.mode === 'en' || this.timer !== undefined || (!this.pending.size && !this.tasks.length)) return;
    this.timer = setTimeout(() => this.flush(), 0);
  }

  private *walk(node: Node): Generator<Node> {
    if (!node.isConnected) return;
    if (node.nodeType === 1) {
      const element = node as Element;
      if (this.adapter.isProtected(element)) {
        // 原先翻译过的子树可能被站点复用为受保护内容，需恢复原文。
        for (const edited of this.edits.keys()) {
          if (node.contains(edited)) this.restore(edited);
        }
        return;
      }
      yield node;
      // textarea 允许翻译自身 placeholder/title，但绝不深入其文本子节点。
      if (element.tagName === 'TEXTAREA') return;
    } else {
      yield node;
    }
    for (const child of [...node.childNodes]) yield* this.walk(child);
  }

  private flush() {
    this.timer = undefined;
    if (this.mode === 'en') return;
    const roots = [...this.pending].filter(node => {
      for (let parent = node.parentNode; parent; parent = parent.parentNode) {
        if (this.pending.has(parent)) return false;
      }
      return true;
    });
    this.pending.clear();
    this.tasks.push(...roots.map(root => this.walk(root)));
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

  private read(node: Node, key: string) {
    return key === '#text' ? node.nodeValue : (node as Element).getAttribute(key);
  }

  private write(node: Node, key: string, value: string) {
    if (key === '#text') node.nodeValue = value;
    else (node as Element).setAttribute(key, value);
    this.stats.writes++;
  }

  private restore(node: Node) {
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

  private process(node: Node) {
    this.stats.visited++;
    if (this.mode === 'en') return;
    if (node.nodeType !== 1 && node.nodeType !== 3) return;
    const element = node.nodeType === 1 ? (node as Element) : node.parentElement;
    if (!element || this.adapter.isProtected(element)) {
      this.restore(node);
      return;
    }
    // 即使外部突变绕过 walk 直接指向 textarea 内部文本，也坚决保护。
    if (node.nodeType === 3 && element.tagName === 'TEXTAREA') {
      this.restore(node);
      return;
    }

    for (const key of node.nodeType === 3 ? ['#text'] : ['title', 'placeholder']) {
      const current = this.read(node, key);
      let previous = this.edits.get(node)?.get(key);
      if (previous && current !== previous.translated) {
        this.edits.get(node)!.delete(key);
        previous = undefined;
      }
      if (current === null) continue;
      const source = previous?.original ?? current;
      const translation =
        key === '#text'
          ? this.adapter.text(node as Text, source, this.mode)
          : this.adapter.attribute(element, key, source, this.mode);
      if (translation === undefined || translation === source) {
        if (previous && current === previous.translated) {
          this.write(node, key, previous.original);
        }
        this.edits.get(node)?.delete(key);
      } else {
        if (!this.edits.has(node)) this.edits.set(node, new Map());
        this.edits.get(node)!.set(key, { original: source, translated: translation });
        if (current !== translation) this.write(node, key, translation);
      }
      if (this.edits.get(node)?.size === 0) this.edits.delete(node);
    }
  }
}
