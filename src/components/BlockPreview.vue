<script setup lang="ts">
import { inject, ref, computed } from 'vue'
import type { Block } from '@/types/blocks'
import BlockPreviewNode from './BlockPreviewNode.vue'

defineProps<{
  title: string
  blocks: Block[]
}>()

const injected = inject('previewTheme', ref('light'))
const theme = computed(() => typeof injected === 'string' ? injected : injected.value)
</script>

<template>
  <div class="block-preview" :class="theme">
    <h1 class="preview-note-title">{{ title }}</h1>
    <BlockPreviewNode v-for="block in blocks" :key="block.id" :block="block" :depth="0" />
  </div>
</template>

<style scoped>
.block-preview {
  --pv-bg: #fff;
  --pv-text: #333;
  --pv-heading: #1a1a1a;
  --pv-border: #e8e8e8;
  --pv-quote-bg: #f9f9f9;
  --pv-quote-text: #666;
  --pv-quote-border: #ddd;
  --pv-code-bg: #fafafa;
  --pv-code-border: #e0e0e0;
  --pv-code-header-bg: #f0f0f0;
  --pv-code-header-text: #999;
  --pv-media-name: #aaa;
  --pv-depth-border: #e0e0e0;
  --pv-depth-inner: #f0f0f0;
  --pv-kbd-bg: #eee;
  --pv-kbd-border: #ccc;
  --pv-kbd-shadow: #bbb;
  --pv-kbd-text: #666;
  --pv-h4: #555;
  --pv-h5: #666;
  --pv-h6: #777;
  --pv-todo-done: #999;
  --pv-todo-check: #4caf50;

  height: 100%;
  overflow-y: auto;
  padding: 24px 32px;
  background: var(--pv-bg);
  color: var(--pv-text);
  line-height: 1.7;
}
.block-preview.dark {
  --pv-bg: #1e1e1e;
  --pv-text: #d4d4d4;
  --pv-heading: #e0e0e0;
  --pv-border: #333;
  --pv-quote-bg: #252525;
  --pv-quote-text: #aaa;
  --pv-quote-border: #444;
  --pv-code-bg: #252525;
  --pv-code-border: #333;
  --pv-code-header-bg: #2a2a2a;
  --pv-code-header-text: #888;
  --pv-media-name: #666;
  --pv-depth-border: #333;
  --pv-depth-inner: #2a2a2a;
  --pv-kbd-bg: #333;
  --pv-kbd-border: #555;
  --pv-kbd-shadow: #222;
  --pv-kbd-text: #aaa;
  --pv-h4: #aaa;
  --pv-h5: #999;
  --pv-h6: #888;
  --pv-todo-done: #777;
  --pv-todo-check: #6a9955;
}

.preview-note-title {
  font-size: 28px; font-weight: 700;
  margin-top: 0; margin-bottom: 24px; padding-bottom: 12px;
  border-bottom: 2px solid var(--pv-border);
  color: var(--pv-heading);
}
</style>
