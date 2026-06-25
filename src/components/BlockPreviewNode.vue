<script setup lang="ts">
import { inject, ref, computed, type Ref, reactive } from 'vue'
import type { Block, InlineSegment } from '@/types/blocks'
import { parseMarkTags } from '@/types/blocks'
import { resolveMediaUrl } from '@/platform/mediaResolver'

defineOptions({ name: 'BlockPreviewNode' })

const props = defineProps<{
  block: Block
  depth: number
}>()

const injected = inject('previewTheme', ref('light'))
const theme = computed(() => typeof injected === 'string' ? injected : injected.value)
const activeBlockId = inject<Ref<string | null>>('activeBlockId', ref(null))
const isActive = computed(() => activeBlockId?.value === props.block.id)

/** 解析文本内容为行内样式片段（自动处理 Mark 标签） */
function parseSegments(item: { text?: string }): InlineSegment[] {
  return parseMarkTags(item.text || '')
}

// ---- 音频播放器状态（按 src 共享）----
const audioStates = reactive<Record<string, {
  el: HTMLAudioElement | null
  playing: boolean
  currentTime: number
  duration: number
  rate: number
  progressDrag: boolean
  setEl: (el: HTMLAudioElement) => void
  togglePlay: (e: Event) => void
  seekStart: (e: MouseEvent) => void
  seekMove: (e: MouseEvent) => void
  seekEnd: () => void
  setRate: (r: number) => void
  formatTime: (t: number) => string
}>>({})

function getAudioState(src: string) {
  if (!audioStates[src]) {
    let el: HTMLAudioElement | null = null
    let progressDragging = false
    let rafId = 0
    let progressEl: HTMLElement | null = null
    let latestPct = 0

    // 先占位，再填充：确保 capture 的是 reactive proxy
    audioStates[src] = {
      el: null,
      playing: false,
      currentTime: 0,
      duration: 0,
      rate: 1,
      progressDrag: false,
      setEl: () => {},
      togglePlay: () => {},
      seekStart: () => {},
      seekMove: () => {},
      seekEnd: () => {},
      setRate: () => {},
      formatTime: () => '0:00',
    }
    const s = audioStates[src] // reactive proxy

    s.setEl = (e: HTMLAudioElement) => {
      el = e
      s.el = e
      s.duration = e.duration || 0
      s.currentTime = e.currentTime || 0
      e.addEventListener('timeupdate', () => {
        if (!progressDragging) {
          s.currentTime = e.currentTime
          s.duration = e.duration || s.duration
          const fillEl = e.parentElement!.querySelector('.audio-progress-fill') as HTMLElement | null
          if (fillEl && e.duration > 0) {
            fillEl.style.width = (e.currentTime / e.duration * 100).toFixed(2) + '%'
          }
        }
      })
      e.addEventListener('play', () => { s.playing = true })
      e.addEventListener('pause', () => { s.playing = false })
      e.addEventListener('ended', () => { s.playing = false })
    }

    s.togglePlay = (_e: MouseEvent | Event) => {
      if (!el) return
      if (el.paused) el.play()
      else el.pause()
    }

    s.seekStart = (e: MouseEvent) => {
      if (!el || !el.duration) return
      progressDragging = true
      s.progressDrag = true
      progressEl = (e.currentTarget as HTMLElement).querySelector('.audio-progress-fill') as HTMLElement
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
      latestPct = pct
      if (progressEl) progressEl.style.width = (pct * 100).toFixed(2) + '%'
      s.currentTime = pct * el.duration
    }

    s.seekMove = (e: MouseEvent) => {
      if (!progressDragging || !el || !el.duration) return
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
      if (progressEl) progressEl.style.width = (pct * 100).toFixed(2) + '%'
      latestPct = pct
      cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(() => {
        s.currentTime = latestPct * el!.duration
      })
    }

    s.seekEnd = () => {
      if (!el || !progressDragging) return
      cancelAnimationFrame(rafId)
      rafId = 0
      const targetTime = latestPct * el.duration
      if (progressEl) progressEl.style.width = (latestPct * 100).toFixed(2) + '%'
      progressDragging = false
      s.progressDrag = false
      progressEl = null
      el.currentTime = targetTime
      s.currentTime = targetTime
    }

    s.setRate = (r: number) => {
      if (!el) return
      s.rate = r
      el.playbackRate = r
    }

    s.formatTime = (t: number): string => {
      if (!isFinite(t)) return '0:00'
      const m = Math.floor(t / 60)
      const sec = Math.floor(t % 60).toString().padStart(2, '0')
      return `${m}:${sec}`
    }
  }
  return audioStates[src]
}

/** 供模板调用的音频就绪回调 */
function onAudioReady(e: Event) {
  const audio = e.target as HTMLAudioElement
  const src = audio.getAttribute('src') || ''
  if (!src) return
  getAudioState(src).setEl(audio)
}

function audioProgressPct(item: { src?: string }): string {
  const st = getAudioState(resolveMediaUrl(item.src || ''))
  if (!st.duration || st.duration <= 0) return '0%'
  return (st.currentTime / st.duration * 100).toFixed(2) + '%'
}
</script>

<template>
  <div class="preview-block" :class="[theme, 'preview-depth-' + depth, { 'preview-block-active': isActive }]">
    <template v-for="item in block.content" :key="item.id">
      <p v-if="item.type === 'text'" class="preview-text">
        <template v-for="(seg, si) in parseSegments(item)" :key="si">
          <span v-if="seg.bold || seg.italic || seg.color || seg.bgColor || seg.fontSize"
            :style="{ fontWeight: seg.bold ? 'bold' : undefined, fontStyle: seg.italic ? 'italic' : undefined, color: seg.color, backgroundColor: seg.bgColor, fontSize: seg.fontSize }"
          >{{ seg.text }}</span>
          <template v-else>{{ seg.text }}</template>
        </template>
      </p>

      <component
        v-else-if="item.type === 'heading'"
        :is="'h' + Math.min(Math.max(item.level || 2, 1), 6)"
        :class="'preview-heading preview-h' + Math.min(Math.max(item.level || 2, 1), 6)"
      >{{ item.text }}</component>

      <blockquote v-else-if="item.type === 'quote'" class="preview-quote">{{ item.text }}</blockquote>

      <div v-else-if="item.type === 'code'" class="preview-code-wrapper">
        <div class="preview-code-lang">{{ item.language || 'text' }}</div>
        <pre class="preview-code-pre"><code>{{ item.code }}</code></pre>
      </div>

      <div v-else-if="item.type === 'image'" class="preview-media">
        <img :src="resolveMediaUrl(item.src || '')" :alt="item.alt || ''" class="preview-image" />
        <div v-if="item.fileName" class="preview-media-name">{{ item.fileName }}</div>
      </div>

      <div v-else-if="item.type === 'video'" class="preview-media">
        <video :src="resolveMediaUrl(item.src || '')" controls class="preview-video"></video>
        <div v-if="item.fileName" class="preview-media-name">{{ item.fileName }}</div>
      </div>

      <!-- 音频：自定义播放器 -->
      <div v-else-if="item.type === 'audio'" class="preview-audio">
        <audio ref="audioEl" :src="resolveMediaUrl(item.src || '')" preload="metadata"
          @loadedmetadata="onAudioReady($event)"
          style="display:none"></audio>
        <div class="audio-player">
          <button class="audio-play-btn" @click="getAudioState(resolveMediaUrl(item.src || '')).togglePlay($event as MouseEvent)">
            {{ getAudioState(resolveMediaUrl(item.src || '')).playing ? '⏸' : '▶' }}
          </button>
          <div class="audio-progress"
            @mousedown="getAudioState(resolveMediaUrl(item.src || '')).seekStart($event)"
            @mousemove="getAudioState(resolveMediaUrl(item.src || '')).seekMove($event)"
            @mouseup="getAudioState(resolveMediaUrl(item.src || '')).seekEnd()"
            @mouseleave="getAudioState(resolveMediaUrl(item.src || '')).seekEnd()">
            <div class="audio-progress-fill" :style="{ width: audioProgressPct(item) }"></div>
          </div>
          <span class="audio-time">{{ getAudioState(resolveMediaUrl(item.src || '')).formatTime(getAudioState(resolveMediaUrl(item.src || '')).currentTime) }} / {{ getAudioState(resolveMediaUrl(item.src || '')).formatTime(getAudioState(resolveMediaUrl(item.src || '')).duration) }}</span>
          <select class="audio-rate" :value="getAudioState(resolveMediaUrl(item.src || '')).rate" @change="getAudioState(resolveMediaUrl(item.src || '')).setRate(Number(($event.target as HTMLSelectElement).value))">
            <option :value="0.5">0.5x</option>
            <option :value="0.75">0.75x</option>
            <option :value="1">1x</option>
            <option :value="1.25">1.25x</option>
            <option :value="1.5">1.5x</option>
            <option :value="2">2x</option>
          </select>
        </div>
        <div v-if="item.fileName" class="preview-media-name">{{ item.fileName }}</div>
      </div>

      <hr v-else-if="item.type === 'divider'" class="preview-divider" />

      <div v-else-if="item.type === 'list'" class="preview-list-wrapper">
        <ol v-if="item.ordered" class="preview-list">
          <li v-for="(li, i) in (item.items as any[])" :key="i">{{ li.text }}</li>
        </ol>
        <ul v-else class="preview-list">
          <li v-for="(li, i) in (item.items as any[])" :key="i">{{ li.text }}</li>
        </ul>
      </div>

      <div v-else-if="item.type === 'todo'" class="preview-todo-wrapper">
        <div v-for="(ti, i) in (item.items as any[])" :key="i" class="preview-todo-item">
          <span class="preview-todo-check" :class="{ checked: ti.checked }">{{ ti.checked ? '☑' : '☐' }}</span>
          <span :class="{ 'preview-todo-done': ti.checked }">{{ ti.text }}</span>
        </div>
      </div>

      <div v-else-if="item.type === 'kbd'" class="preview-kbd-item">
        <kbd class="preview-kbd-key">{{ item.keys }}</kbd>
        <span v-if="item.label" class="preview-kbd-label">{{ item.label }}</span>
      </div>
    </template>

    <div v-if="block.children.length" class="preview-children">
      <BlockPreviewNode v-for="child in block.children" :key="child.id" :block="child" :depth="depth + 1" />
    </div>
  </div>
</template>

<style scoped>
.preview-block {
  --pv-text: #333;
  --pv-quote-bg: #f9f9f9;
  --pv-quote-text: #666;
  --pv-quote-border: #ddd;
  --pv-code-bg: #fafafa;
  --pv-code-border: #e0e0e0;
  --pv-code-header-bg: #f0f0f0;
  --pv-code-header-text: #999;
  --pv-media-name: #aaa;
  --pv-divider: #e8e8e8;
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

  margin-bottom: 12px;
  background: var(--pv-card-bg, #fafafa);
  border: 1px solid var(--pv-card-border, #e8e8e8);
  border-radius: 8px;
  padding: 16px;
}
.preview-block.dark {
  --pv-text: #d4d4d4;
  --pv-quote-bg: #252525;
  --pv-quote-text: #aaa;
  --pv-quote-border: #444;
  --pv-code-bg: #252525;
  --pv-code-border: #333;
  --pv-code-header-bg: #2a2a2a;
  --pv-code-header-text: #888;
  --pv-media-name: #666;
  --pv-divider: #333;
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
  --pv-card-bg: #252525;
  --pv-card-border: #3a3a3a;
}

.preview-block-active {
  box-shadow: 0 0 0 2px #1976d2;
}
.preview-block-active.dark {
  box-shadow: 0 0 0 2px #569cd6;
}

.preview-depth-0 { margin-left: 0; }
.preview-depth-1 { margin-left: 24px; padding-left: 16px; border-left: 2px solid var(--pv-depth-border); }
.preview-depth-2 { margin-left: 24px; padding-left: 16px; border-left: 2px solid var(--pv-depth-inner); }
.preview-children { margin-top: 8px; }
.preview-text { margin: 6px 0; font-size: 15px; white-space: pre-wrap; color: var(--pv-text); }
.preview-heading { margin: 16px 0 8px; font-weight: 600; }
.preview-h1 { font-size: 24px; }
.preview-h2 { font-size: 20px; }
.preview-h3 { font-size: 17px; }
.preview-h4 { font-size: 15px; color: var(--pv-h4); }
.preview-h5 { font-size: 14px; color: var(--pv-h5); }
.preview-h6 { font-size: 13px; color: var(--pv-h6); }

.preview-quote {
  margin: 8px 0; padding: 8px 16px;
  border-left: 4px solid var(--pv-quote-border);
  color: var(--pv-quote-text); background: var(--pv-quote-bg);
  font-style: italic;
}
.preview-code-wrapper {
  margin: 8px 0; border: 1px solid var(--pv-code-border);
  border-radius: 6px; overflow: hidden; background: var(--pv-code-bg);
}
.preview-code-lang {
  padding: 4px 12px; font-size: 11px; color: var(--pv-code-header-text);
  background: var(--pv-code-header-bg); border-bottom: 1px solid var(--pv-code-border);
  text-transform: uppercase;
}
.preview-code-pre { margin: 0; padding: 12px 16px; overflow-x: auto; font-size: 13px; line-height: 1.5; }
.preview-code-pre code { font-family: 'Consolas', 'Monaco', 'Courier New', monospace; white-space: pre; }
.preview-media { margin: 8px 0; }
.preview-image { max-width: 100%; border-radius: 4px; }
.preview-video { max-width: 100%; border-radius: 4px; }
.preview-media-name { font-size: 11px; color: var(--pv-media-name); margin-top: 2px; }
.preview-divider { border: none; border-top: 1px solid var(--pv-divider); margin: 16px 0; }
.preview-list-wrapper { margin: 6px 0; }
.preview-list { margin: 4px 0; padding-left: 24px; }
.preview-list li { margin: 2px 0; }
.preview-todo-wrapper { margin: 6px 0; }
.preview-todo-item { display: flex; align-items: center; gap: 8px; margin: 3px 0; font-size: 15px; }
.preview-todo-check { font-size: 16px; }
.preview-todo-check.checked { color: var(--pv-todo-check); }
.preview-todo-done { text-decoration: line-through; color: var(--pv-todo-done); }
.preview-kbd-item { margin: 6px 0; display: flex; align-items: center; gap: 8px; }
.preview-kbd-key {
  display: inline-block; padding: 2px 8px; background: var(--pv-kbd-bg);
  border: 1px solid var(--pv-kbd-border); border-radius: 4px;
  font-family: inherit; font-size: 13px; box-shadow: 0 1px 0 var(--pv-kbd-shadow);
}
.preview-kbd-label { color: var(--pv-kbd-text); font-size: 14px; }

/* ---- 自定义音频播放器 ---- */
.preview-audio { margin: 8px 0; }
.audio-player {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 12px;
  background: var(--pv-quote-bg, #f9f9f9);
  border: 1px solid var(--pv-code-border, #e0e0e0);
  border-radius: 8px;
}
.audio-play-btn {
  background: var(--pv-todo-check, #4caf50); color: #fff;
  border: none; border-radius: 50%;
  width: 32px; height: 32px; font-size: 14px; cursor: pointer;
  flex-shrink: 0; display: flex; align-items: center; justify-content: center;
}
.audio-play-btn:hover { opacity: 0.85; }
.audio-progress {
  flex: 1; height: 6px;
  background: var(--pv-depth-border, #e0e0e0);
  border-radius: 3px; cursor: pointer; position: relative;
  min-width: 80px;
}
.audio-progress-fill {
  height: 100%; border-radius: 3px;
  background: var(--pv-todo-check, #4caf50);
  pointer-events: none;
}
.audio-time {
  font-size: 11px; color: var(--pv-media-name, #aaa);
  white-space: nowrap; min-width: 70px; text-align: right;
  font-variant-numeric: tabular-nums;
}
.audio-rate {
  background: var(--pv-code-header-bg, #f0f0f0);
  border: 1px solid var(--pv-code-border, #e0e0e0);
  color: var(--pv-text, #333);
  padding: 2px 4px; border-radius: 4px; font-size: 11px;
  font-family: inherit; cursor: pointer;
}
</style>
