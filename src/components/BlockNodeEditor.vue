<script setup lang="ts">
import { reactive, inject, ref, computed } from 'vue'
import { createContentItem, createBlock, parseMarkTags, segmentsToMarkString, normalizeSegments, splitSegment, selectionToSegmentRange, selectionToCursorRange, restoreCursorFromSegmentRange, setSegmentProperty } from '@/types/blocks'
import type { Block, ContentItem, ContentItemType, InlineSegment, SegmentRange, SelectionRange } from '@/types/blocks'
import { platform } from '@/platform'

defineOptions({ name: 'BlockNodeEditor' })

const props = defineProps<{
  block: Block
  parentList: Block[]
  index: number
  depth: number
}>()

const emit = defineEmits<{ notify: [] }>()

const injected = inject('editorTheme', ref('dark'))
const theme = computed(() => typeof injected === 'string' ? injected : injected.value)
const collapsed = reactive<Record<string, boolean>>({})

function notify() { emit('notify') }

const contentTypes: { value: ContentItemType; label: string }[] = [
  { value: 'text', label: '文本' },
  { value: 'heading', label: '标题' },
  { value: 'quote', label: '引用' },
  { value: 'code', label: '代码' },
  { value: 'image', label: '图片' },
  { value: 'video', label: '视频' },
  { value: 'audio', label: '音频' },
  { value: 'list', label: '列表' },
  { value: 'todo', label: '待办' },
  { value: 'kbd', label: '快捷键' },
  { value: 'divider', label: '分割线' },
]

function addChildBlock() {
  if (props.depth >= 2) return
  props.block.children.push(createBlock(props.depth + 1))
  notify()
}

function removeSelf() {
  const idx = props.parentList.findIndex(b => b.id === props.block.id)
  if (idx !== -1) props.parentList.splice(idx, 1)
  notify()
}

function addContentItem() {
  props.block.content.push(createContentItem('text'))
  notify()
}

function removeContentItem(index: number) {
  if (props.block.content.length <= 1) return
  props.block.content.splice(index, 1)
  notify()
}

function onTypeChange(item: ContentItem, newType: ContentItemType) {
  const fresh = createContentItem(newType)
  fresh.id = item.id
  const idx = props.block.content.indexOf(item)
  if (idx !== -1) props.block.content[idx] = fresh
  notify()
}

function addListItem(item: ContentItem) {
  if (!item.items) item.items = []
  if (item.type === 'todo') {
    item.items.push({ text: '', checked: false } as any)
  } else {
    item.items.push({ text: '' })
  }
  notify()
}

function removeListItem(item: ContentItem, i: number) {
  if (item.items && item.items.length > 1) {
    item.items.splice(i, 1)
    notify()
  }
}

function toggleCollapse(id: string) {
  collapsed[id] = !collapsed[id]
}

async function selectMediaFile(item: ContentItem) {
  const result = await platform.selectMedia(item.type)
  if (result) {
    item.src = result.mediaUrl
    item.fileName = result.fileName
    notify()
  }
}

// ---- 富文本编辑器（contenteditable） ----

/**
 * 将颜色值归一化为 hex 格式（如 rgb(255,255,0) → #ffff00）
 */
function normalizeColor(value: string): string {
  const rgb = value.match(/^rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i)
  if (rgb) {
    const [r, g, b] = [parseInt(rgb[1]), parseInt(rgb[2]), parseInt(rgb[3])]
    return '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('')
  }
  return value
}

/**
 * InlineSegment[] → DOM 节点
 * 同时写入 data-* 属性和 style，方便 domToSegments 读取
 */
function segmentsToDOM(segments: InlineSegment[]): Node[] {
  const nodes: Node[] = []
  for (const seg of segments) {
    const lines = seg.text.split('\n')
    for (let i = 0; i < lines.length; i++) {
      if (i > 0) nodes.push(document.createElement('br'))
      const text = lines[i]
      if (text === '') continue
      const hasStyle = seg.bold || seg.italic || seg.color || seg.bgColor || seg.fontSize
      if (hasStyle) {
        const span = document.createElement('span')
        span.textContent = text
        if (seg.bold) { span.style.fontWeight = 'bold'; span.dataset.bold = '1' }
        if (seg.italic) { span.style.fontStyle = 'italic'; span.dataset.italic = '1' }
        if (seg.color) { span.style.color = seg.color; span.dataset.color = seg.color }
        if (seg.bgColor) { span.style.backgroundColor = seg.bgColor; span.dataset.bg = seg.bgColor }
        if (seg.fontSize) { span.style.fontSize = seg.fontSize; span.dataset.size = seg.fontSize }
        nodes.push(span)
      } else {
        nodes.push(document.createTextNode(text))
      }
    }
  }
  return nodes
}

/**
 * DOM → InlineSegment[]
 * 优先读取 data-* 属性，兼容旧数据回退到 style
 */
function domToSegments(root: HTMLElement): InlineSegment[] {
  const segments: InlineSegment[] = []
  for (const node of root.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || ''
      if (text) segments.push({ text })
      continue
    }
    if (node.nodeName === 'BR') {
      if (segments.length > 0) segments[segments.length - 1].text += '\n'
      else segments.push({ text: '\n' })
      continue
    }
    if (node.nodeName === 'DIV' || node.nodeName === 'P') {
      // 块级容器：内部节点作为独立段，末尾加换行
      const inner = domToSegments(node as HTMLElement)
      segments.push(...inner)
      if (node.nextSibling && segments.length > 0) segments[segments.length - 1].text += '\n'
      continue
    }
    if (node.nodeName === 'SPAN') {
      const el = node as HTMLElement
      const seg: InlineSegment = { text: el.textContent || '' }
      if (el.dataset.bold === '1') seg.bold = true
      else if (/bold|700/.test(el.style.fontWeight)) seg.bold = true
      if (el.dataset.italic === '1') seg.italic = true
      else if (el.style.fontStyle === 'italic') seg.italic = true
      if (el.dataset.color) seg.color = el.dataset.color
      else if (el.style.color) seg.color = normalizeColor(el.style.color)
      if (el.dataset.bg) seg.bgColor = el.dataset.bg
      else if (el.style.backgroundColor) seg.bgColor = normalizeColor(el.style.backgroundColor)
      if (el.dataset.size) seg.fontSize = el.dataset.size
      else if (el.style.fontSize) seg.fontSize = el.style.fontSize
      segments.push(seg)
      continue
    }
    // 其他标签（如 <b>, <i>, <strong>, <em>）— 降级为纯文本
    if (node.textContent) segments.push({ text: node.textContent })
  }
  return segments
}

// ---- AST 与 DOM 同步标记 ----
const astDirtyFlags = new Map<string, boolean>()

/** 确保操作前 AST 与 DOM 同步（输入后 DOM 已变，需要回读） */
function ensureAstSync(item: ContentItem, editor: HTMLElement): InlineSegment[] {
  if (astDirtyFlags.get(item.id)) {
    const segments = domToSegments(editor)
    astDirtyFlags.delete(item.id)
    return segments
  }
  return parseMarkTags((item.text as string) || '')
}

/** 从工具栏按钮事件中找到对应的 contenteditable 编辑器元素 */
function findEditor(e: Event): HTMLElement | null {
  const btn = e.target as HTMLElement
  const item = btn.closest('.se-content-item')
  return item?.querySelector('.se-rich-editor') as HTMLElement | null
}

/**
 * 在 contenteditable 选区上应用样式（AST 操作路径）
 * 流程：保存光标 → 同步 AST → splitSegment → 修改属性 → normalize → 重渲染 → 恢复光标
 */
function applyStyleOnSelection(
  item: ContentItem,
  editor: HTMLElement,
  getStyleProps: () => string[],
  getToggleProp: () => string,
) {
  pushUndo(item, editor)

  // 1. 保存光标（SegmentRange 版本）
  const segments0 = ensureAstSync(item, editor)
  const cursorPos = selectionToCursorRange(editor, segments0)

  // 2. 计算选区在 AST 上的范围
  const range = selectionToSegmentRange(editor, segments0)
  if (!range) return

  const styleStr = getStyleProps().join(';')

  // 3. 用 DOM Selection 检测是添加还是移除样式
  const domSel = window.getSelection()
  let shouldRemove = false
  if (domSel && domSel.rangeCount) {
    const domRange = domSel.getRangeAt(0)
    const fragments = domRange.cloneContents()
    const tempDiv = document.createElement('div')
    tempDiv.appendChild(fragments)
    const walker = document.createTreeWalker(tempDiv, NodeFilter.SHOW_ELEMENT, {
      acceptNode(node) {
        const el = node as HTMLElement
        return el.style && el.style.getPropertyValue(getToggleProp())
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_SKIP
      },
    })
    shouldRemove = !!walker.firstChild()
  }

  // 4. 基于 AST 操作
  let segments = splitSegment(segments0, range)

  // 用全局字符偏移确定哪些 segment 在选区内
  const startGlobal = range.start.segIdx < segments0.length
    ? segments0.slice(0, range.start.segIdx).reduce((s, seg) => s + seg.text.length, 0) + range.start.offset
    : 0
  const endGlobal = range.end.segIdx < segments0.length
    ? segments0.slice(0, range.end.segIdx).reduce((s, seg) => s + seg.text.length, 0) + range.end.offset
    : 0

  let pos = 0
  for (let i = 0; i < segments.length; i++) {
    const segLen = segments[i].text.length
    // segment 的文本范围 [pos, pos + segLen) 与 [startGlobal, endGlobal) 相交？
    if (pos < endGlobal && pos + segLen > startGlobal) {
      setSegmentProperty(segments[i], styleStr, !shouldRemove)
    }
    pos += segLen
  }

  segments = normalizeSegments(segments)

  // 5. 重渲染 DOM
  editor.replaceChildren(...segmentsToDOM(segments))

  // 6. 恢复光标
  if (cursorPos) {
    restoreCursorFromSegmentRange(editor, segments, cursorPos)
  }

  // 7. 后台同步到 Mark
  item.text = segmentsToMarkString(segments)
  notify()
}

function insertBold(item: ContentItem, e: Event) {
  const editor = findEditor(e)
  if (!editor) return
  applyStyleOnSelection(item, editor,
    () => ['font-weight:bold'],
    () => 'font-weight',
  )
}

function insertItalic(item: ContentItem, e: Event) {
  const editor = findEditor(e)
  if (!editor) return
  applyStyleOnSelection(item, editor,
    () => ['font-style:italic'],
    () => 'font-style',
  )
}

function insertColor(item: ContentItem, e: Event, color: string) {
  // 恢复之前保存的选区（颜色选择器会夺走焦点导致选区丢失）
  restoreSavedSelection()
  const editor = findEditor(e)
  if (!editor) return
  applyStyleOnSelection(item, editor,
    () => [`color:${color}`],
    () => 'color',
  )
}

function insertBg(item: ContentItem, e: Event, color: string) {
  // 恢复之前保存的选区（颜色选择器会夺走焦点导致选区丢失）
  restoreSavedSelection()
  const editor = findEditor(e)
  if (!editor) return
  applyStyleOnSelection(item, editor,
    () => [`background-color:${color}`],
    () => 'background-color',
  )
}

function insertSize(item: ContentItem, e: Event, size: string) {
  restoreSavedSelection()
  const editor = findEditor(e)
  if (!editor) return
  applyStyleOnSelection(item, editor,
    () => [`font-size:${size}`],
    () => 'font-size',
  )
}

// ---- 选区保存/恢复（用于颜色选择器等会夺走焦点的控件）----
let savedRange: Range | null = null

function saveSelection() {
  const sel = window.getSelection()
  if (sel && sel.rangeCount) {
    savedRange = sel.getRangeAt(0)
  }
}

function restoreSavedSelection(): boolean {
  if (!savedRange) return false
  const sel = window.getSelection()
  if (!sel) return false
  sel.removeAllRanges()
  sel.addRange(savedRange)
  savedRange = null
  return true
}

// ---- Undo 栈（按 item.id 索引，存 segments 快照 + SegmentRange 光标）----
interface UndoEntry {
  segments: InlineSegment[]
  cursor: SegmentRange | null
}
const undoStacks = new Map<string, UndoEntry[]>()

function pushUndo(item: ContentItem, editor?: HTMLElement | null) {
  const stack = undoStacks.get(item.id) || []
  // 从 Mark 解析当前 segments 快照
  const segments = parseMarkTags((item.text as string) || '')
  // 保存光标
  let cursor: SegmentRange | null = null
  if (editor) {
    cursor = selectionToCursorRange(editor, segments)
  }
  stack.push({ segments: JSON.parse(JSON.stringify(segments)), cursor })
  if (stack.length > 50) stack.shift()
  undoStacks.set(item.id, stack)
}

function undoRichEdit(item: ContentItem, e: Event) {
  const stack = undoStacks.get(item.id)
  if (!stack || stack.length === 0) return
  const entry = stack.pop()!
  const editor = findEditor(e)
  if (editor) {
    // 直接恢复 segments 快照 → DOM，无需解析 Mark
    editor.replaceChildren(...segmentsToDOM(entry.segments))
    // 恢复光标
    if (entry.cursor) {
      restoreCursorFromSegmentRange(editor, entry.segments, entry.cursor)
    }
  }
  item.text = segmentsToMarkString(entry.segments)
  notify()
}

function clearRichFormatting(item: ContentItem, e: Event) {
  pushUndo(item, findEditor(e))
  const segments = parseMarkTags((item.text as string) || '').map(s => ({
    text: s.text, bold: undefined, italic: undefined,
    color: undefined, bgColor: undefined, fontSize: undefined
  })) as InlineSegment[]
  item.text = segmentsToMarkString(segments)
  const editor = findEditor(e)
  if (editor) {
    editor.replaceChildren(...segmentsToDOM(segments))
    const sel = window.getSelection()
    if (sel) {
      const r = document.createRange()
      r.selectNodeContents(editor)
      r.collapse(false)
      sel.removeAllRanges(); sel.addRange(r)
    }
  }
  notify()
}

/** contenteditable 输入事件：仅标记 AST 脏，不经过序列化 */
function onRichInput(item: ContentItem, e: Event) {
  const editor = e.target as HTMLElement
  if (!(editor as any)._ready) return
  astDirtyFlags.set(item.id, true)
}

/** contenteditable 失焦时通过 AST 链路同步保存 */
function onRichBlur(item: ContentItem, e: FocusEvent) {
  const editor = e.target as HTMLElement
  const segments = domToSegments(editor)
  item.text = segmentsToMarkString(segments)
  astDirtyFlags.delete(item.id)
  notify()
}

/**
 * 初始化 contenteditable：Mark → AST → DOM
 * - _ready 防止 @input 级联
 * - _itemId 检测不同 content item 复用（打开不同源文件）
 */
function onRichMount(item: ContentItem, el: any) {
  if (!el) return

  if (!(el as any)._ready) {
    ;(el as any)._ready = true
    ;(el as any)._itemId = item.id
    const segments = parseMarkTags((item.text as string) || '')
    el.replaceChildren(...segmentsToDOM(segments))
  } else if ((el as any)._itemId !== item.id) {
    ;(el as any)._itemId = item.id
    const segments = parseMarkTags((item.text as string) || '')
    el.replaceChildren(...segmentsToDOM(segments))
  }
}
</script>

<template>
  <div class="se-block-node" :class="theme" :data-block-id="block.id">
    <div class="se-block-header" :class="'se-depth-' + depth">
      <span class="se-block-arrow" @click="toggleCollapse(block.id)">
        {{ collapsed[block.id] ? '▸' : '▾' }}
      </span>
      <span class="se-block-label">Block {{ index + 1 }}</span>
      <span class="se-block-depth-badge">L{{ depth + 1 }}</span>
      <span class="se-block-id">{{ block.id }}</span>
      <button v-if="depth < 2" class="se-btn-small se-btn-add" @click="addChildBlock()" title="添加子 Block">+ 子</button>
      <button class="se-btn-small se-btn-remove" @click="removeSelf()" title="删除此 Block">×</button>
    </div>

    <div v-show="!collapsed[block.id]" class="se-block-body">
      <div class="se-content-items">
        <div v-for="(item, ci) in block.content" :key="item.id" class="se-content-item">
          <div class="se-ci-header">
            <select :value="item.type" class="se-ci-type-select" @change="onTypeChange(item, ($event.target as HTMLSelectElement).value as any)">
              <option v-for="ct in contentTypes" :key="ct.value" :value="ct.value">{{ ct.label }}</option>
            </select>
            <span class="se-ci-id">{{ item.id }}</span>
            <button v-if="block.content.length > 1" class="se-btn-small se-btn-remove" @click="removeContentItem(ci)">×</button>
          </div>

          <div class="se-ci-fields">
            <!-- === 文本（默认富文本模式） === -->
            <template v-if="item.type === 'text'">
              <div class="se-mark-toolbar">
                <button class="se-btn-small" @click="insertBold(item, $event)" title="粗体">B</button>
                <button class="se-btn-small" @click="insertItalic(item, $event)" title="斜体" style="font-style:italic">I</button>
                <span class="se-mark-sep">|</span>
                <input type="color" class="se-mark-color" value="#e74c3c" :ref="() => {}"
                  @mousedown="saveSelection()"
                  @change="insertColor(item, $event, ($event.target as HTMLInputElement).value)" title="文字颜色" />
                <input type="color" class="se-mark-color" value="#ffff00" :ref="() => {}"
                  @mousedown="saveSelection()"
                  @change="insertBg(item, $event, ($event.target as HTMLInputElement).value)" title="背景颜色" />
                <select class="se-mark-size" @mousedown="saveSelection()" @change="insertSize(item, $event, ($event.target as HTMLSelectElement).value)">
                  <option value="">字号</option>
                  <option value="12px">12px</option><option value="14px">14px</option><option value="16px">16px</option>
                  <option value="18px">18px</option><option value="24px">24px</option><option value="32px">32px</option>
                </select>
                <span class="se-mark-sep">|</span>
                <button class="se-btn-small" @click="undoRichEdit(item, $event)" title="撤销">↩</button>
                <button class="se-btn-small" @click="clearRichFormatting(item, $event)" title="清除格式">清除</button>
              </div>

              <div
                :ref="(el: any) => onRichMount(item, el)"
                class="se-rich-editor"
                contenteditable="true"
                @input="onRichInput(item, $event)"
                @blur="onRichBlur(item, $event)"
                data-placeholder="输入文字... 选中文字后点击工具栏按钮添加样式" />
            </template>
            <template v-else-if="item.type === 'heading'">
              <select class="se-select" :value="item.level" @change="item.level = Number(($event.target as HTMLSelectElement).value); notify()">
                <option v-for="l in 6" :key="l" :value="l">H{{ l }}</option>
              </select>
              <textarea class="se-input se-textarea" :value="(item.text as string)" placeholder="标题文字..."
                @input="item.text = ($event.target as HTMLTextAreaElement).value; notify()" />
            </template>
            <textarea v-else-if="item.type === 'quote'" class="se-input se-textarea" :value="(item.text as string)" placeholder="引用内容..."
              @input="item.text = ($event.target as HTMLTextAreaElement).value; notify()" />
            <template v-else-if="item.type === 'code'">
              <input class="se-input" :value="item.language" placeholder="语言 (如 typescript)"
                @input="item.language = ($event.target as HTMLInputElement).value; notify()" />
              <textarea class="se-input se-textarea se-code-area" :value="item.code" placeholder="代码..."
                @input="item.code = ($event.target as HTMLTextAreaElement).value; notify()" />
            </template>
            <template v-else-if="item.type === 'image' || item.type === 'video' || item.type === 'audio'">
              <div class="se-media-row">
                <input class="se-input se-media-path" :value="item.src" :placeholder="item.type === 'audio' ? 'media:// 路径或 URL (音频)' : 'media:// 路径或 URL'"
                  @input="item.src = ($event.target as HTMLInputElement).value; notify()" />
                <button class="se-btn-small se-btn-file" @click="selectMediaFile(item)">📁</button>
              </div>
              <input class="se-input" :value="item.alt" placeholder="描述文字"
                @input="item.alt = ($event.target as HTMLInputElement).value; notify()" />
              <input class="se-input" :value="item.fileName" placeholder="文件名"
                @input="item.fileName = ($event.target as HTMLInputElement).value; notify()" />
            </template>
            <template v-else-if="item.type === 'list'">
              <label class="se-check">
                <input type="checkbox" :checked="item.ordered" @change="item.ordered = ($event.target as HTMLInputElement).checked; notify()" />
                有序列表
              </label>
              <div v-for="(li, lii) in (item.items as any[])" :key="lii" class="se-list-item">
                <span class="se-list-num">{{ lii + 1 }}.</span>
                <input class="se-input" :value="li.text" placeholder="列表项..."
                  @input="li.text = ($event.target as HTMLInputElement).value; notify()" />
                <button v-if="(item.items as any[]).length > 1" class="se-btn-small se-btn-remove" @click="removeListItem(item, lii)">×</button>
              </div>
              <button class="se-btn-small" @click="addListItem(item)">+ 添加项</button>
            </template>
            <template v-else-if="item.type === 'todo'">
              <div v-for="(ti, tii) in (item.items as any[])" :key="tii" class="se-list-item">
                <span class="se-list-num">{{ tii + 1 }}.</span>
                <input class="se-input" :value="ti.text" placeholder="待办项..."
                  @input="ti.text = ($event.target as HTMLInputElement).value; notify()" />
                <label class="se-check">
                  <input type="checkbox" :checked="ti.checked" @change="ti.checked = ($event.target as HTMLInputElement).checked; notify()" />
                  已完成
                </label>
                <button v-if="(item.items as any[]).length > 1" class="se-btn-small se-btn-remove" @click="removeListItem(item, tii)">×</button>
              </div>
              <button class="se-btn-small" @click="addListItem(item)">+ 添加项</button>
            </template>
            <template v-else-if="item.type === 'kbd'">
              <input class="se-input" :value="item.keys" placeholder="快捷键 (如 Ctrl+S)"
                @input="item.keys = ($event.target as HTMLInputElement).value; notify()" />
              <input class="se-input" :value="item.label" placeholder="快捷键说明"
                @input="item.label = ($event.target as HTMLInputElement).value; notify()" />
            </template>
            <span v-else-if="item.type === 'divider'" class="se-divider-placeholder">—— 分割线 ——</span>
          </div>
        </div>
        <button class="se-add-item-btn" @click="addContentItem()">+ 添加内容项</button>
      </div>

      <div v-if="block.children.length" class="se-children">
        <div v-for="(child, cbi) in block.children" :key="child.id">
          <BlockNodeEditor :block="child" :parent-list="block.children" :index="cbi" :depth="depth + 1" @notify="notify()" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ---- 暗色（默认）---- */
.se-block-node {
  --se-bg: #1e1e1e;
  --se-text: #d4d4d4;
  --se-input-bg: #2d2d2d;
  --se-input-border: #444;
  --se-input-focus: #569cd6;
  --se-block-header-bg: #2a2a2a;
  --se-block-body-bg: #222;
  --se-block-border: #333;
  --se-depth0: #569cd6;
  --se-depth1: #6a9955;
  --se-depth2: #ce9178;
  --se-btn-bg: #3a3a3a;
  --se-btn-border: #555;
  --se-btn-text: #ccc;
  --se-btn-hover-bg: #4a4a4a;
  --se-ci-bg: #1a1a1a;
  --se-ci-border: #2a2a2a;
  --se-ci-accent: #444;
  --se-select-bg: #333;
  --se-select-text: #4ec9b0;
  --se-select-border: #555;
  --se-dashed-hover: #6a9955;
  --se-badge-bg: #3a3a3a;
  --se-badge-text: #aaa;
  --se-list-num: #666;
  --se-check-text: #888;

  margin-bottom: 4px;
  border: 1px solid var(--se-block-border);
  border-radius: 4px;
  overflow: hidden;
}
.se-block-node.light {
  --se-bg: #f5f5f5;
  --se-text: #333;
  --se-input-bg: #fff;
  --se-input-border: #ccc;
  --se-input-focus: #1976d2;
  --se-block-header-bg: #e0e0e0;
  --se-block-body-bg: #fafafa;
  --se-block-border: #d0d0d0;
  --se-depth0: #1976d2;
  --se-depth1: #388e3c;
  --se-depth2: #e64a19;
  --se-btn-bg: #e0e0e0;
  --se-btn-border: #bbb;
  --se-btn-text: #333;
  --se-btn-hover-bg: #d0d0d0;
  --se-ci-bg: #fff;
  --se-ci-border: #e0e0e0;
  --se-ci-accent: #ccc;
  --se-select-bg: #fff;
  --se-select-text: #1976d2;
  --se-select-border: #ccc;
  --se-dashed-hover: #388e3c;
  --se-badge-bg: #e0e0e0;
  --se-badge-text: #666;
  --se-list-num: #999;
  --se-check-text: #666;
}

.se-block-header {
  display: flex; align-items: center; gap: 6px;
  padding: 4px 8px;
  background: var(--se-block-header-bg);
  border-bottom: 1px solid var(--se-block-border);
  cursor: default;
}
.se-block-header.se-depth-0 { border-left: 3px solid var(--se-depth0); }
.se-block-header.se-depth-1 { border-left: 3px solid var(--se-depth1); }
.se-block-header.se-depth-2 { border-left: 3px solid var(--se-depth2); }

.se-block-arrow { cursor: pointer; user-select: none; width: 14px; text-align: center; }
.se-block-label { font-weight: 600; color: var(--se-depth0); }
.se-block-depth-badge { background: var(--se-badge-bg); color: var(--se-badge-text); font-size: 10px; padding: 1px 6px; border-radius: 8px; }
.se-block-id { flex: 1; font-size: 10px; color: var(--se-list-num); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.se-block-body { padding: 6px 8px; background: var(--se-block-body-bg); }

.se-btn-small {
  background: var(--se-btn-bg); border: 1px solid var(--se-btn-border);
  color: var(--se-btn-text); font-size: 11px; padding: 1px 6px;
  border-radius: 3px; cursor: pointer; font-family: inherit;
}
.se-btn-small:hover { background: var(--se-btn-hover-bg); }
.se-btn-add { color: var(--se-depth1); border-color: var(--se-depth1); }
.se-btn-remove { color: #f44747; border-color: #6a3a3a; }

.se-content-item {
  border: 1px solid var(--se-ci-border); border-left: 3px solid var(--se-ci-accent);
  margin-bottom: 6px; border-radius: 3px; padding: 6px; background: var(--se-ci-bg);
}
.se-ci-header { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
.se-ci-type-select {
  background: var(--se-select-bg); color: var(--se-select-text);
  border: 1px solid var(--se-select-border); padding: 2px 6px;
  border-radius: 3px; font-size: 12px; font-family: inherit;
}
.se-ci-id { flex: 1; font-size: 10px; color: var(--se-list-num); }
.se-ci-fields { display: flex; flex-direction: column; gap: 4px; }

.se-media-row { display: flex; gap: 4px; }
.se-media-path { flex: 1; }
.se-btn-file { flex-shrink: 0; padding: 2px 8px; }

.se-input {
  width: 100%; background: var(--se-input-bg); border: 1px solid var(--se-input-border);
  color: var(--se-text); padding: 4px 8px; border-radius: 3px;
  font-size: 13px; font-family: inherit; box-sizing: border-box;
}
.se-input:focus { outline: none; border-color: var(--se-input-focus); }
.se-textarea { resize: vertical; min-height: 40px; }
.se-code-area { min-height: 80px; font-family: 'Consolas', 'Monaco', monospace; }
.se-select {
  background: var(--se-input-bg); border: 1px solid var(--se-input-border);
  color: var(--se-text); padding: 4px 8px; border-radius: 3px; font-family: inherit;
}
.se-list-item { display: flex; align-items: center; gap: 6px; }
.se-list-num { color: var(--se-list-num); font-size: 11px; width: 20px; }
.se-check { display: flex; align-items: center; gap: 4px; font-size: 11px; color: var(--se-check-text); white-space: nowrap; }
.se-divider-placeholder { color: var(--se-list-num); font-size: 12px; }

.se-add-item-btn {
  display: block; width: 100%; background: transparent;
  border: 1px dashed var(--se-btn-border); color: var(--se-badge-text);
  padding: 3px; border-radius: 3px; cursor: pointer; margin-top: 4px;
  font-family: inherit; font-size: 12px;
}
.se-add-item-btn:hover { border-color: var(--se-dashed-hover); color: var(--se-dashed-hover); }

.se-children { margin-top: 4px; padding-left: 16px; border-left: 2px solid var(--se-ci-accent); }

/* ---- 富文本编辑器（contenteditable） ---- */
.se-rich-editor {
  min-height: 80px; padding: 8px 12px;
  background: var(--se-input-bg); border: 1px solid var(--se-input-border);
  border-radius: 3px; font-size: 14px; line-height: 1.7;
  color: var(--se-text); outline: none;
  white-space: pre-wrap; word-wrap: break-word;
  overflow-y: auto;
  cursor: text;
}
.se-rich-editor:focus { border-color: var(--se-input-focus); }
.se-rich-editor:empty::before {
  content: attr(data-placeholder);
  color: var(--se-list-num);
  pointer-events: none;
}

/* ---- Mark 标签编辑 ---- */
.se-mark-toolbar {
  display: flex; align-items: center; gap: 4px;
  padding: 4px 6px; margin-bottom: 4px;
  background: var(--se-block-header-bg);
  border: 1px solid var(--se-block-border);
  border-radius: 4px;
  flex-wrap: wrap;
}
.se-mark-sep { color: var(--se-badge-text); font-size: 11px; }
.se-mark-color {
  width: 22px; height: 22px; padding: 0; border: 1px solid var(--se-btn-border);
  border-radius: 3px; cursor: pointer; background: none;
}
.se-mark-size {
  width: 52px; background: var(--se-input-bg); border: 1px solid var(--se-input-border);
  color: var(--se-text); padding: 2px 2px; border-radius: 3px; font-size: 11px; font-family: inherit;
}
</style>
