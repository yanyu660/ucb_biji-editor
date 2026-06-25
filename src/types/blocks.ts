// ============================================================
// Block 类型体系 v2
// Block = 段落容器，内含混合内容 + 嵌套子 Block（最多 3 层）
// ============================================================

/** 内容项类型 — 同一 Block 内可混合多种类型 */
export type ContentItemType =
  | 'text'
  | 'heading'
  | 'image'
  | 'video'
  | 'audio'
  | 'code'
  | 'quote'
  | 'list'
  | 'todo'
  | 'kbd'
  | 'divider'

/** 行内文本片段 — 纯文本类型拆分为多个样式片段 */
export interface InlineSegment {
  text: string
  bold?: boolean
  italic?: boolean
  color?: string  // hex 色值 "#ff0000"
  bgColor?: string  // 背景色 "#ffff00"
  fontSize?: string  // "18px" | "smaller" 等
}

/** SegmentRange — 指向 InlineSegment[] 中的某个位置（字符偏移） */
export interface SegmentRange {
  segIdx: number
  offset: number
}

/** SelectionRange — 选区在 InlineSegment[] 上的映射 */
export interface SelectionRange {
  start: SegmentRange
  end: SegmentRange
}

/** EditorState — 编辑器的完整可序列化状态 */
export interface EditorState {
  segments: InlineSegment[]
  selection: SelectionRange | null
  astDirty: boolean
}

/** 列表项 */
export interface ListItem {
  text: string
}

/** 待办项 */
export interface TodoItem {
  text: string
  checked: boolean
}

/**
 * 单个内容项 — Block 的最小组成单元
 * 一个 Block 可包含多个不同/相同类型的 ContentItem
 */
export interface ContentItem {
  id: string
  type: ContentItemType
  // ---- text / heading / quote ----
  text?: string
  level?: number       // heading 专用：1-6
  // ---- image / video ----
  src?: string         // media:// 或网络 URL
  alt?: string
  fileName?: string    // 源文件名（媒体专用）
  // ---- code ----
  language?: string    // 语言标识，如 'javascript', 'python'
  code?: string        // 代码内容
  // ---- list / todo ----
  items?: (ListItem | TodoItem)[]  // 列表 / 待办项
  ordered?: boolean    // true = 有序列表（list 专用）
  // ---- todo 专用字段（类型收窄时使用 TodoItem） ----
  // ---- kbd ----
  keys?: string        // 快捷键组合，如 "Ctrl+S"
  label?: string       // 快捷键说明
}

/** 单个 Block — 段落容器，可包含混合内容和嵌套子 Block */
export interface Block {
  id: string
  content: ContentItem[]
  children: Block[]
  /** 当前嵌套深度（0 = 顶层，1 = 二层，2 = 三层） */
  depth?: number
}

/** 工具：生成唯一 ID */
export function genId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

/** 创建空内容项 */
export function createContentItem(type: ContentItemType): ContentItem {
  const base: ContentItem = { id: genId(), type }
  switch (type) {
    case 'text':
      base.text = ''
      break
    case 'heading':
      base.text = ''
      base.level = 2
      break
    case 'quote':
      base.text = ''
      break
    case 'image':
      base.src = ''
      base.alt = ''
      break
    case 'video':
      base.src = ''
      base.alt = ''
      break
    case 'audio':
      base.src = ''
      base.alt = ''
      break
    case 'code':
      base.language = 'text'
      base.code = ''
      break
    case 'list':
      base.items = [{ text: '' }]
      base.ordered = false
      break
    case 'todo':
      base.items = [{ text: '', checked: false } as TodoItem]
      break
    case 'kbd':
      base.keys = ''
      base.label = ''
      break
    case 'divider':
      break
  }
  return base
}

/** 创建新 Block */
export function createBlock(depth = 0): Block {
  return {
    id: genId(),
    content: [createContentItem('text')],
    children: [],
    depth,
  }
}

/**
 * 解析 <Mark ...> 标签为 InlineSegment[]
 * 语法：<Mark bold italic color="#f00" size="20px" bg="#ff0">文字</Mark>
 * 布尔属性：bold, italic； 值属性：color, size, bg
 */
export function parseMarkTags(raw: string): InlineSegment[] {
  const result: InlineSegment[] = []
  // 匹配 <Mark ...>...</Mark>，支持嵌套属性
  const regex = /<Mark\b([^>]*)>(.*?)<\/Mark>/gs
  let lastIdx = 0

  for (const m of raw.matchAll(regex)) {
    // 标签前的纯文本
    if (m.index! > lastIdx) {
      result.push({ text: raw.slice(lastIdx, m.index!) })
    }

    const attrs = m[1]
    const content = m[2]

    const seg: InlineSegment = { text: content }
    if (/\bbold\b/i.test(attrs)) seg.bold = true
    if (/\b(i|italic)\b/i.test(attrs)) seg.italic = true

    // 解析 color="..."
    const colorM = attrs.match(/\bcolor\s*=\s*"([^"]*)"/i)
    if (colorM) seg.color = colorM[1]

    // 解析 bg="..."
    const bgM = attrs.match(/\bbg\s*=\s*"([^"]*)"/i)
    if (bgM) seg.bgColor = bgM[1]

    // 解析 size="..."
    const sizeM = attrs.match(/\bsize\s*=\s*"([^"]*)"/i)
    if (sizeM) seg.fontSize = sizeM[1]

    result.push(seg)
    lastIdx = m.index! + m[0].length
  }

  // 标签后的纯文本
  if (lastIdx < raw.length) {
    result.push({ text: raw.slice(lastIdx) })
  }

  // 如果没有任何 Mark 标签，返回原始文本的单个片段
  if (result.length === 0) {
    result.push({ text: raw })
  }

  return result
}

/**
 * 将 InlineSegment[] 转换回 <Mark> 标签串（parseMarkTags 的逆过程）
 * 属性固定顺序：bold → italic → color → bg → size，保证输出一致性
 */
export function segmentsToMarkString(segments: InlineSegment[]): string {
  return segments.map(seg => {
    const attrs: string[] = []
    if (seg.bold) attrs.push('bold')
    if (seg.italic) attrs.push('italic')
    if (seg.color) attrs.push(`color="${seg.color}"`)
    if (seg.bgColor) attrs.push(`bg="${seg.bgColor}"`)
    if (seg.fontSize) attrs.push(`size="${seg.fontSize}"`)
    if (attrs.length) return `<Mark ${attrs.join(' ')}>${seg.text}</Mark>`
    return seg.text
  }).join('')
}

/**
 * 合并相邻的同属性 segment（AST 规范化器）
 * 如 [{text:"ab",bold:true},{text:"cd",bold:true},{text:"ef"}]
 *  → [{text:"abcd",bold:true},{text:"ef"}]
 */
export function mergeAdjacentSegments(segments: InlineSegment[]): InlineSegment[] {
  if (segments.length <= 1) return segments
  const result: InlineSegment[] = [segments[0]]
  for (let i = 1; i < segments.length; i++) {
    const prev = result[result.length - 1]
    const cur = segments[i]
    // 属性相同可合并（比较 bold/italic/color/bgColor/fontSize）
    if (prev.bold === cur.bold && prev.italic === cur.italic &&
        prev.color === cur.color && prev.bgColor === cur.bgColor &&
        prev.fontSize === cur.fontSize) {
      prev.text += cur.text
    } else {
      result.push(cur)
    }
  }
  return result
}

/** 移除空文本的 segment */
function removeEmptySegments(segments: InlineSegment[]): InlineSegment[] {
  return segments.filter(s => s.text !== '')
}

/** AST 全量规范化：合并 + 去空 + 修正 */
export function normalizeSegments(segments: InlineSegment[]): InlineSegment[] {
  return mergeAdjacentSegments(removeEmptySegments(segments))
}

/**
 * 按字符偏移切分 segment
 * 如 [{text:"hello"}, {text:"world"}]
 * 在 offset=3 处切分 → [{text:"hel"}, {text:"lo"}, {text:"world"}]
 */
export function splitSegmentAtOffset(segments: InlineSegment[], segIdx: number, offset: number): InlineSegment[] {
  if (segIdx < 0 || segIdx >= segments.length) return segments
  const seg = segments[segIdx]
  if (offset <= 0 || offset >= seg.text.length) return segments
  const before: InlineSegment = { text: seg.text.slice(0, offset), bold: seg.bold, italic: seg.italic, color: seg.color, bgColor: seg.bgColor, fontSize: seg.fontSize }
  const after: InlineSegment = { text: seg.text.slice(offset), bold: seg.bold, italic: seg.italic, color: seg.color, bgColor: seg.bgColor, fontSize: seg.fontSize }
  const result = segments.slice(0, segIdx)
  result.push(before, after)
  result.push(...segments.slice(segIdx + 1))
  return result
}

/**
 * 按 SelectionRange 边界切分 segments
 * 确保选区起止点落在独立的 segment 上，方便修改
 */
export function splitSegment(segments: InlineSegment[], range: SelectionRange): InlineSegment[] {
  // 先切 end（从后往前切，避免下标偏移）
  let s = segments
  s = splitSegmentAtOffset(s, range.end.segIdx, range.end.offset)
  s = splitSegmentAtOffset(s, range.start.segIdx, range.start.offset)
  return s
}

/** 将 DOM Selection 映射到 InlineSegment[] 上的 SelectionRange */
export function selectionToSegmentRange(editor: HTMLElement, segments: InlineSegment[]): SelectionRange | null {
  const sel = window.getSelection()
  if (!sel || !sel.rangeCount || !editor.contains(sel.anchorNode)) return null
  const domRange = sel.getRangeAt(0)
  if (domRange.collapsed) return null

  // 计算全局字符偏移 → 映射到 segIdx + offset
  function offsetInEditor(node: Node, nodeOffset: number): number {
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT)
    let charPos = 0
    while (walker.nextNode()) {
      const tn = walker.currentNode as Text
      if (tn === node) return charPos + nodeOffset
      charPos += (tn.textContent || '').length
    }
    return charPos
  }

  const startGlobal = offsetInEditor(domRange.startContainer, domRange.startOffset)
  const endGlobal = offsetInEditor(domRange.endContainer, domRange.endOffset)

  // 全局偏移 → segIdx + offset
  function globalToSegment(globalOffset: number): SegmentRange {
    let pos = 0
    for (let i = 0; i < segments.length; i++) {
      const segLen = segments[i].text.length
      if (pos + segLen > globalOffset) return { segIdx: i, offset: globalOffset - pos }
      pos += segLen
    }
    if (segments.length === 0) return { segIdx: 0, offset: 0 }
    return { segIdx: segments.length - 1, offset: segments[segments.length - 1].text.length }
  }

  return { start: globalToSegment(startGlobal), end: globalToSegment(endGlobal) }
}

/**
 * 将光标映射为 SegmentRange（单点选区）
 */
export function selectionToCursorRange(editor: HTMLElement, segments: InlineSegment[]): SegmentRange | null {
  const sel = window.getSelection()
  if (!sel || !sel.rangeCount || !editor.contains(sel.anchorNode)) return null
  const domRange = sel.getRangeAt(0)
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT)
  let charPos = 0
  while (walker.nextNode()) {
    const tn = walker.currentNode as Text
    if (tn === domRange.startContainer) {
      const globalOffset = charPos + domRange.startOffset
      let pos = 0
      for (let i = 0; i < segments.length; i++) {
        const segLen = segments[i].text.length
        if (pos + segLen > globalOffset) return { segIdx: i, offset: globalOffset - pos }
        pos += segLen
      }
      return null
    }
    charPos += (tn.textContent || '').length
  }
  return null
}

/** 按 SegmentRange 恢复光标位置 */
export function restoreCursorFromSegmentRange(editor: HTMLElement, segments: InlineSegment[], pos: SegmentRange): void {
  if (!pos) return
  let globalOffset = 0
  for (let i = 0; i < Math.min(pos.segIdx, segments.length); i++) {
    globalOffset += segments[i].text.length
  }
  globalOffset += pos.offset

  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT)
  let charPos = 0
  while (walker.nextNode()) {
    const tn = walker.currentNode as Text
    const len = (tn.textContent || '').length
    if (charPos + len >= globalOffset) {
      const r = document.createRange()
      r.setStart(tn, Math.min(globalOffset - charPos, len))
      r.collapse(true)
      const sel = window.getSelection()
      if (sel) { sel.removeAllRanges(); sel.addRange(r) }
      return
    }
    charPos += len
  }
}

/**
 * 将 style Props 转换为 InlineSegment 属性的 setter
 */
export function setSegmentProperty(seg: InlineSegment, styleStr: string, toggle: boolean): void {
  if (/font-weight:\s*bold/i.test(styleStr)) seg.bold = toggle ? true : undefined
  if (/font-style:\s*italic/i.test(styleStr)) seg.italic = toggle ? true : undefined
  const colorM = styleStr.match(/(?<!\-)color:\s*(#[^;]+)/i)
  if (colorM) seg.color = toggle ? colorM[1] : undefined
  const bgM = styleStr.match(/background-color:\s*(#[^;]+)/i)
  if (bgM) seg.bgColor = toggle ? bgM[1] : undefined
  const sizeM = styleStr.match(/font-size:\s*(\d+px)/i)
  if (sizeM) seg.fontSize = toggle ? sizeM[1] : undefined
  // 清除布尔属性（无值属性也要处理）
  if (!toggle) {
    if (/font-weight/i.test(styleStr)) seg.bold = undefined
    if (/font-style/i.test(styleStr)) seg.italic = undefined
  }
}

/**
 * 迁移旧版 block（{ type, data }）到新版（{ content, children }）
 * 用于加载旧 .ucb 文件时自动升级数据结构
 */
export function migrateBlock(raw: any): Block {
  // 已是新版结构，直接返回
  if (raw && Array.isArray(raw.content)) {
    return {
      id: raw.id || genId(),
      content: raw.content,
      children: (raw.children || []).map(migrateBlock),
      depth: raw.depth ?? 0,
    }
  }

  // 旧版结构 { id, type, data }
  const id = raw.id || genId()
  const oldType: string = raw.type || 'paragraph'
  const data: any = raw.data || {}

  const content: ContentItem[] = []

  switch (oldType) {
    case 'heading':
      content.push({ id: genId(), type: 'heading', text: data.text || '', level: data.level || 2 })
      break
    case 'paragraph':
      content.push({ id: genId(), type: 'text', text: data.text || '' })
      break
    case 'quote':
      content.push({ id: genId(), type: 'quote', text: data.text || '' })
      break
    case 'code':
      content.push({ id: genId(), type: 'code', language: data.language || 'text', code: data.code || '' })
      break
    case 'image':
      content.push({ id: genId(), type: 'image', src: data.src || '', alt: data.alt || '', fileName: data.fileName || '' })
      break
    case 'video':
      content.push({ id: genId(), type: 'video', src: data.src || '', alt: data.alt || '', fileName: data.fileName || '' })
      break
    case 'bullet-list':
      content.push({ id: genId(), type: 'list', items: (data.items || []).map((t: any) => typeof t === 'string' ? { text: t } : t), ordered: false })
      break
    case 'ordered-list':
      content.push({ id: genId(), type: 'list', items: (data.items || []).map((t: any) => typeof t === 'string' ? { text: t } : t), ordered: true })
      break
    case 'todo-list':
      content.push({ id: genId(), type: 'todo', items: (data.items || []).map((t: any) => typeof t === 'string' ? { text: t, checked: false } : t) })
      break
    case 'shortcut-list': {
      const title = data.title || ''
      if (title) content.push({ id: genId(), type: 'heading', text: title, level: 3 })
      for (const sc of data.items || []) {
        if (typeof sc === 'string') break
        content.push({ id: genId(), type: 'kbd', keys: sc.keys || '', label: sc.description || sc.label || '' })
      }
      break
    }
    case 'divider':
      content.push({ id: genId(), type: 'divider' })
      break
    default:
      // 未知类型，当作纯文本
      if (data.text) content.push({ id: genId(), type: 'text', text: data.text })
      break
  }

  return { id, content, children: [], depth: 0 }
}

/** 递归提取所有媒体路径（保存打包用） */
export function extractMediaPaths(blocks: Block[]): string[] {
  const paths: string[] = []
  function walk(bs: Block[]): void {
    for (const b of bs) {
      for (const item of b.content) {
        if ((item.type === 'image' || item.type === 'video' || item.type === 'audio') && item.src?.startsWith('media://')) {
          paths.push(item.src.slice('media://'.length))
        }
      }
      walk(b.children)
    }
  }
  walk(blocks)
  return [...new Set(paths)]
}
