<script setup lang="ts">
import { ref, reactive, onMounted, onBeforeUnmount, provide } from 'vue'
import SourceEditor from './SourceEditor.vue'
import BlockPreview from './BlockPreview.vue'
import SettingsPanel from './SettingsPanel.vue'
import type { NoteContent } from '@/types/note'
import type { Block } from '@/types/blocks'
import { createBlock, migrateBlock } from '@/types/blocks'
import { createSampleNote } from '@/utils/sampleNote'
import { platform } from '@/platform'

// ---- 主题 ----
const editorTheme = ref('light')
const previewTheme = ref('light')
const showSettings = ref(false)
const debugMode = ref(false)
const showEditor = ref(true)

provide('editorTheme', editorTheme)
provide('previewTheme', previewTheme)

// ---- 状态 ----
const sampleNote = createSampleNote()
const noteContent = reactive<NoteContent>({
  id: sampleNote.id,
  title: sampleNote.title,
  blocks: sampleNote.blocks,
  createdAt: sampleNote.createdAt,
  updatedAt: sampleNote.updatedAt,
})

const sourcePath = ref<string | null>(null)
const noteSlug = ref<string | undefined>(undefined)
const packageName = ref<string>('示例知识库')
const isModified = ref(false)
const isSaving = ref(false)
const activeBlockId = ref<string | null>(null)

provide('activeBlockId', activeBlockId)

const fileKey = ref(0)

// ---- 工具函数 ----
function now(): string {
  return new Date().toISOString()
}

function genId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

// ---- 初始化新笔记 ----
function initNewNote() {
  noteContent.id = genId()
  noteContent.title = '未命名笔记'
  noteContent.blocks = [createBlock(0)]
  noteContent.createdAt = now()
  noteContent.updatedAt = noteContent.createdAt
  sourcePath.value = null
  noteSlug.value = undefined
  packageName.value = '未命名知识库'
  isModified.value = false
  fileKey.value++
}

// ---- 打开包 ----
async function handleOpen() {
  try {
    const result = await platform.openNote()
    if (!result) return

    if ('error' in result && result.error) {
      window.alert('打开失败：' + result.error)
      console.error('打开失败:', result.error)
      return
    }

    const { noteContent: nc, noteSlug: slug, filePath, manifest } = result as {
      noteContent: NoteContent | null
      noteSlug?: string
      filePath: string
      manifest?: any
    }

    console.log('[handleOpen] manifest:', JSON.parse(JSON.stringify(manifest)))
    console.log('[handleOpen] raw blocks count:', nc?.blocks?.length)

    sourcePath.value = filePath
    packageName.value = manifest?.name || '未命名知识库'
    noteSlug.value = slug

    if (nc) {
      noteContent.id = nc.id
      noteContent.title = nc.title

      // 迁移每个 block 到新版格式
      const rawBlocks = nc.blocks || [createBlock(0)]
      const migrated: Block[] = []
      for (let i = 0; i < rawBlocks.length; i++) {
        try {
          const raw: any = rawBlocks[i]
          console.log(`[handleOpen] block[${i}] preview:`,
            raw && typeof raw === 'object'
              ? { id: raw.id, hasContent: Array.isArray(raw.content), hasData: !!raw.data, oldType: raw.type }
              : raw)
          const mb = migrateBlock(raw)
          migrated.push(mb)
        } catch (err: any) {
          console.error(`[handleOpen] block[${i}] 迁移失败:`, err, rawBlocks[i])
          // 用默认 block 兜底
          migrated.push(createBlock(0))
        }
      }

      noteContent.blocks = migrated
      noteContent.createdAt = nc.createdAt
      noteContent.updatedAt = nc.updatedAt
    } else {
      initNewNote()
    }

    isModified.value = false
    fileKey.value++
  } catch (err: any) {
    window.alert('打开文件时发生异常：' + (err?.message || err))
    console.error('[handleOpen] 异常:', err)
  }
}

// ---- 保存 ----
async function handleSave(): Promise<boolean> {
  if (isSaving.value) return false

  isSaving.value = true
  try {
    noteContent.updatedAt = now()
    const plainContent: NoteContent = JSON.parse(JSON.stringify(noteContent))

    const result = await platform.saveNote(plainContent, noteSlug.value)

    if (result.success) {
      sourcePath.value = result.filePath || null
      noteSlug.value = result.slug
      isModified.value = false
      return true
    } else if (result.error) {
      window.alert(`保存失败：${result.error}`)
    }
    return false
  } catch (err: any) {
    window.alert(`保存时发生异常：${err?.message || err}`)
    return false
  } finally {
    isSaving.value = false
  }
}

async function handleSaveAs() {
  if (isSaving.value) return

  isSaving.value = true
  try {
    noteContent.updatedAt = now()
    const plainContent: NoteContent = JSON.parse(JSON.stringify(noteContent))

    const result = await platform.saveNoteAs(plainContent)

    if (result.success) {
      sourcePath.value = result.filePath || null
      noteSlug.value = result.slug
      isModified.value = false
    } else if (result.error) {
      window.alert(`另存为失败：${result.error}`)
    }
  } catch (err: any) {
    window.alert(`另存为时发生异常：${err?.message || err}`)
  } finally {
    isSaving.value = false
  }
}

// ---- 快捷键 ----
function handleKeydown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault()
    handleSave()
  }
}

// ---- DevTools 初始化 ----
async function onToggleDebug(enabled: boolean) {
  debugMode.value = enabled
  try {
    await platform.toggleDevTools(enabled)
  } catch {
    debugMode.value = !enabled
  }
}

// ---- 初始化 ----
onMounted(async () => {
  document.addEventListener('keydown', handleKeydown)
  // 启动时查询 DevTools 实际状态
  try {
    const isOpen = await platform.getDevToolsState()
    if (isOpen !== undefined) {
      debugMode.value = !!isOpen
    }
  } catch {
    // 忽略，保持默认 false
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div class="app-layout">
    <!-- 工具栏 -->
    <header class="toolbar">
      <div class="toolbar-left">
        <div class="package-name">{{ packageName }}</div>
      </div>
      <div class="toolbar-right">
        <span v-if="isModified" class="badge badge-unsaved">未保存</span>
        <span v-if="sourcePath && !isModified" class="badge badge-source" :title="sourcePath">已保存</span>
        <button class="btn" @click="initNewNote()">新建</button>
        <button class="btn" @click="handleOpen">打开</button>
        <button class="btn btn-primary" :disabled="isSaving" @click="handleSave">
          {{ isSaving ? '保存中...' : '保存' }}
        </button>
        <button class="btn" :disabled="isSaving" @click="handleSaveAs">另存为</button>
        <button class="btn btn-toggle" @click="showEditor = !showEditor" :title="showEditor ? '隐藏编辑区' : '显示编辑区'">
          {{ showEditor ? '◁' : '▷' }}
        </button>
        <button class="btn btn-settings" @click="showSettings = true">设置</button>
      </div>
    </header>

    <!-- 左右分栏 -->
    <div class="editor-split">
      <div v-if="showEditor" class="editor-left" :class="'theme-' + editorTheme">
        <div class="panel-label light-label">源数据</div>
        <SourceEditor
          :key="fileKey"
          :blocks="noteContent.blocks"
          :title="noteContent.title"
          @update:blocks="(bs: Block[]) => { noteContent.blocks = bs; isModified = true }"
          @update:title="(t: string) => { noteContent.title = t; isModified = true }"
        />
      </div>
      <div class="editor-right" :class="[!showEditor ? 'editor-full' : '', 'theme-' + previewTheme]">
        <div class="panel-label light-label">渲染预览</div>
        <BlockPreview
          :title="noteContent.title"
          :blocks="noteContent.blocks"
        />
      </div>
    </div>

    <!-- 设置面板 -->
    <SettingsPanel
      v-if="showSettings"
      :editor-theme="editorTheme"
      :preview-theme="previewTheme"
      :debug-mode="debugMode"
      @update:editor-theme="editorTheme = $event"
      @update:preview-theme="previewTheme = $event"
      @update:debug-mode="onToggleDebug($event)"
      @close="showSettings = false"
    />
  </div>
</template>

<style scoped>
.app-layout {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #1e1e1e;
}

/* 工具栏 */
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 16px;
  border-bottom: 1px solid #333;
  background: #252525;
  gap: 12px;
  flex-shrink: 0;
}

.toolbar-left { flex: 1; min-width: 0; }
.toolbar-left .package-name {
  font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: 0.5px;
}
.toolbar-right { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }

.btn {
  padding: 5px 14px;
  border: 1px solid #555;
  border-radius: 4px;
  background: #3a3a3a;
  cursor: pointer;
  font-size: 12px;
  color: #ddd;
  transition: background 0.15s;
}
.btn:hover { background: #4a4a4a; }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-primary { background: #1976d2; color: #fff; border-color: #1976d2; }
.btn-primary:hover { background: #1565c0; }
.btn-settings { background: #444; border-color: #666; }
.btn-settings:hover { background: #555; }
.btn-toggle { background: #444; border-color: #666; min-width: 32px; }
.btn-toggle:hover { background: #555; }

.badge { font-size: 11px; padding: 2px 8px; border-radius: 10px; }
.badge-unsaved { background: #5d4037; color: #ffab91; }
.badge-source { background: #2e4d2e; color: #a5d6a7; }

/* 左右分栏 */
.editor-split { flex: 1; display: flex; min-height: 0; }
.editor-left, .editor-right {
  flex: 1; display: flex; flex-direction: column; min-width: 0; overflow: hidden;
}
.editor-right { border-left: 2px solid #444; }
.editor-right.editor-full { flex: 1; border-left: none; }

.panel-label {
  font-size: 11px; padding: 4px 12px;
  text-transform: uppercase; letter-spacing: 1px; flex-shrink: 0;
}

/* 左侧面板标签随主题 */
.editor-left .panel-label {
  background: #252525; color: #888; border-bottom: 1px solid #333;
}
.editor-left.theme-light .panel-label {
  background: #f5f5f5; color: #666; border-bottom: 1px solid #ddd;
}

/* 右侧面板标签随主题 */
.editor-right .panel-label {
  background: #fff; color: #999; border-bottom: 1px solid #e8e8e8;
}
.editor-right.theme-dark .panel-label {
  background: #252525; color: #888; border-bottom: 1px solid #333;
}
</style>
