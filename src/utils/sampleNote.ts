import type { NoteContent } from '@/types/ucb'
import type { Block, ContentItem } from '@/types/blocks'

function now(): string {
  return new Date().toISOString()
}

/**
 * 创建启动时的示例笔记
 * 展示新 Block 体系：混合内容 + 三层嵌套
 */
export function createSampleNote(): NoteContent {
  const ts = now()

  // ---- 顶层 Block 1：标题 + 介绍文本（同一 Block 内混合多种内容） ----
  const b1: Block = {
    id: 'b1-intro',
    content: [
      { id: 'c1-heading', type: 'heading', text: '欢迎使用笔记编辑器', level: 1 } as ContentItem,
      { id: 'c1-text', type: 'text', text: '这是一个基于 Block 架构的笔记编辑器。每个 Block 是一个独立的段落容器，可以在其中混合文字、图片、代码等多种内容。Block 之间还可以嵌套，最多支持三层结构。' } as ContentItem,
      { id: 'c1-kbd', type: 'kbd', keys: 'Ctrl+S', label: '保存笔记' } as ContentItem,
      { id: 'c1-text2', type: 'text', text: '按下上面的快捷键可以快速保存。右侧面板会实时渲染预览效果。' } as ContentItem,
    ],
    children: [],
    depth: 0,
  }

  // ---- 顶层 Block 2：混合代码示例 ----
  const b2: Block = {
    id: 'b2-code-demo',
    content: [
      { id: 'c2-heading', type: 'heading', text: '代码示例', level: 2 } as ContentItem,
      { id: 'c2-text', type: 'text', text: '下面是一段 TypeScript 代码，它和文字混在同一个 Block 中：' } as ContentItem,
      { id: 'c2-code', type: 'code', language: 'typescript', code: 'function greet(name: string) {\n  return `Hello, ${name}!`;\n}\n\nconsole.log(greet("World"));' } as ContentItem,
      { id: 'c2-text2', type: 'text', text: '代码块之后还可以继续写文字，Block 内的内容顺序即渲染顺序。' } as ContentItem,
    ],
    children: [],
    depth: 0,
  }

  // ---- 顶层 Block 3：嵌套演示（第 1 层） ----
  const b3: Block = {
    id: 'b3-nesting',
    content: [
      { id: 'c3-heading', type: 'heading', text: '嵌套 Block 演示', level: 2 } as ContentItem,
      { id: 'c3-text', type: 'text', text: '这是一个顶层 Block，它包含一个子 Block。点击左侧可展开/折叠。' } as ContentItem,
    ],
    depth: 0,
    children: [
      // ---- 第 2 层子 Block ----
      {
        id: 'b3-child1',
        content: [
          { id: 'c3c1-heading', type: 'heading', text: '第二层子 Block', level: 3 } as ContentItem,
          { id: 'c3c1-text', type: 'text', text: '这是嵌套在顶层 Block 中的子 Block。子 Block 内部也可以有自己的子 Block。' } as ContentItem,
          { id: 'c3c1-list', type: 'list', items: [{ text: '列表项 A' }, { text: '列表项 B' }, { text: '列表项 C' }], ordered: false } as ContentItem,
        ],
        depth: 1,
        children: [
          // ---- 第 3 层子 Block（最深） ----
          {
            id: 'b3-grandchild',
            content: [
              { id: 'c3g1-heading', type: 'heading', text: '第三层（最深）', level: 4 } as ContentItem,
              { id: 'c3g1-text', type: 'text', text: '这是第三层嵌套，已达到最大嵌套深度。在此之下的 Block 不能再嵌套子 Block。' } as ContentItem,
              { id: 'c3g1-quote', type: 'quote', text: '知识不在于拥有，而在于分享与创造。' } as ContentItem,
            ],
            depth: 2,
            children: [],
          },
        ],
      },
      // ---- 第 2 层另一个子 Block ----
      {
        id: 'b3-child2',
        content: [
          { id: 'c3c2-heading', type: 'heading', text: '另一个第二层 Block', level: 3 } as ContentItem,
          { id: 'c3c2-text', type: 'text', text: '同一个父 Block 下可以有多个子 Block，按顺序排列。' } as ContentItem,
          { id: 'c3c2-todo', type: 'todo', items: [{ text: '已完成的任务', checked: true }, { text: '进行中的任务', checked: false }] } as ContentItem,
        ],
        depth: 1,
        children: [],
      },
    ],
  }

  // ---- 顶层 Block 4：分割线 + 列表 ----
  const b4: Block = {
    id: 'b4-list',
    content: [
      { id: 'c4-divider', type: 'divider' } as ContentItem,
      { id: 'c4-heading', type: 'heading', text: '使用提示', level: 2 } as ContentItem,
      { id: 'c4-list', type: 'list', items: [{ text: '打开 .ucb 文件后，左侧显示源数据，右侧显示实时预览' }, { text: '点击左侧字段可直接编辑，支持纯文本、代码、列表等多种内容' }, { text: '使用「添加内容项」按钮在 Block 内插入新的内容' }, { text: '使用「添加子 Block」按钮创建嵌套 Block' }], ordered: false } as ContentItem,
    ],
    children: [],
    depth: 0,
  }

  return {
    id: 'sample-note',
    title: '欢迎使用笔记编辑器',
    blocks: [b1, b2, b3, b4],
    createdAt: ts,
    updatedAt: ts,
  }
}
