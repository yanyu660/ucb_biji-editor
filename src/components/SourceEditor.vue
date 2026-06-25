<script setup lang="ts">
import { reactive, watch, inject, ref, computed, type Ref } from 'vue'
import type { Block } from '@/types/blocks'
import { createBlock } from '@/types/blocks'
import BlockNodeEditor from './BlockNodeEditor.vue'

const props = defineProps<{
  blocks: Block[]
  title: string
}>()

const emit = defineEmits<{
  'update:blocks': [blocks: Block[]]
  'update:title': [title: string]
}>()

const injected = inject('editorTheme', ref('dark'))
const theme = computed(() => typeof injected === 'string' ? injected : injected.value)
const activeBlockId = inject<Ref<string | null>>('activeBlockId')

const state = reactive({
  title: props.title,
  blocks: JSON.parse(JSON.stringify(props.blocks)) as Block[],
})

watch(() => props.blocks, (val) => {
  try {
    state.blocks = JSON.parse(JSON.stringify(val))
  } catch (err: any) {
    console.error('[SourceEditor] blocks watch error:', err)
  }
}, { deep: true })

watch(() => props.title, (val) => {
  state.title = val
})

function notify() {
  emit('update:blocks', JSON.parse(JSON.stringify(state.blocks)))
}

function notifyTitle() {
  emit('update:title', state.title)
}

function addBlock() {
  state.blocks.push(createBlock(0))
  notify()
}

function onBlockFocus(e: FocusEvent) {
  const target = e.target as HTMLElement
  const blockNode = target.closest('[data-block-id]') as HTMLElement | null
  if (blockNode && activeBlockId) {
    activeBlockId.value = blockNode.dataset.blockId!
  }
}
</script>

<template>
  <div class="source-editor" :class="theme">
    <div class="se-title-row">
      <input
        :value="state.title"
        class="se-title-input"
        placeholder="笔记标题"
        @input="state.title = ($event.target as HTMLInputElement).value; notifyTitle()"
      />
    </div>

    <div class="se-blocks" @focusin="onBlockFocus">
      <div v-for="(block, bi) in state.blocks" :key="block.id">
        <BlockNodeEditor
          :block="block"
          :parent-list="state.blocks"
          :index="bi"
          :depth="0"
          @notify="notify"
        />
      </div>
    </div>

    <button class="se-add-block-btn" @click="addBlock">+ 添加顶层 Block</button>
  </div>
</template>

<style scoped>
/* ---- 暗色（默认）---- */
.source-editor {
  --se-bg: #1e1e1e;
  --se-surface: #252525;
  --se-border: #333;
  --se-text: #d4d4d4;
  --se-text-dim: #888;
  --se-text-id: #666;
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
  --se-dashed-border: #555;
  --se-dashed-hover: #569cd6;
  --se-dashed-item-hover: #6a9955;

  height: 100%;
  overflow-y: auto;
  padding: 12px;
  background: var(--se-bg);
  color: var(--se-text);
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 13px;
}

/* ---- 亮色 ---- */
.source-editor.light {
  --se-bg: #f5f5f5;
  --se-surface: #e8e8e8;
  --se-border: #d0d0d0;
  --se-text: #333;
  --se-text-dim: #666;
  --se-text-id: #999;
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
  --se-dashed-border: #ccc;
  --se-dashed-hover: #1976d2;
  --se-dashed-item-hover: #388e3c;
}

.se-title-row {
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--se-border);
}

.se-title-input {
  width: 100%;
  background: var(--se-input-bg);
  border: 1px solid var(--se-input-border);
  color: var(--se-text);
  padding: 6px 10px;
  border-radius: 3px;
  font-size: 16px;
  font-weight: 600;
  font-family: inherit;
}
.se-title-input:focus { outline: none; border-color: var(--se-input-focus); }

.se-add-block-btn {
  display: block; width: 100%;
  background: transparent;
  border: 1px dashed var(--se-dashed-border);
  color: var(--se-text-dim);
  padding: 8px; border-radius: 4px; cursor: pointer;
  margin-top: 8px; font-family: inherit; font-size: 13px;
}
.se-add-block-btn:hover {
  border-color: var(--se-dashed-hover); color: var(--se-dashed-hover);
}
</style>
