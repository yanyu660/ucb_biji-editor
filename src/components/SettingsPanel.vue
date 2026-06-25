<script setup lang="ts">
defineProps<{
  editorTheme: string
  previewTheme: string
  debugMode: boolean
}>()

const emit = defineEmits<{
  'update:editorTheme': [value: string]
  'update:previewTheme': [value: string]
  'update:debugMode': [value: boolean]
  close: []
}>()

function setBoth(theme: string) {
  emit('update:editorTheme', theme)
  emit('update:previewTheme', theme)
}

async function onToggleDebug(enabled: boolean) {
  emit('update:debugMode', enabled)
}
</script>

<template>
  <div class="settings-overlay" @click.self="emit('close')">
    <div class="settings-panel">
      <div class="settings-header">
        <h3>设置</h3>
        <button class="settings-close" @click="emit('close')">×</button>
      </div>

      <div class="settings-section">
        <h4>主题</h4>

        <!-- 快速切换 -->
        <div class="settings-quick">
          <button
            class="theme-btn"
            :class="{ active: editorTheme === 'dark' && previewTheme === 'dark' }"
            @click="setBoth('dark')"
          >🌙 全部暗色</button>
          <button
            class="theme-btn"
            :class="{ active: editorTheme === 'light' && previewTheme === 'light' }"
            @click="setBoth('light')"
          >☀️ 全部亮色</button>
        </div>

        <!-- 分开设置 -->
        <div class="settings-separate">
          <div class="theme-row">
            <span class="theme-label">编辑区（左侧）</span>
            <label class="toggle" :class="{ active: editorTheme === 'light' }">
              <input
                type="checkbox"
                :checked="editorTheme === 'light'"
                @change="emit('update:editorTheme', ($event.target as HTMLInputElement).checked ? 'light' : 'dark')"
              />
              <span class="toggle-track">
                <span class="toggle-thumb"></span>
              </span>
              <span class="toggle-text">{{ editorTheme === 'dark' ? '暗色' : '亮色' }}</span>
            </label>
          </div>
          <div class="theme-row">
            <span class="theme-label">渲染区（右侧）</span>
            <label class="toggle" :class="{ active: previewTheme === 'light' }">
              <input
                type="checkbox"
                :checked="previewTheme === 'light'"
                @change="emit('update:previewTheme', ($event.target as HTMLInputElement).checked ? 'light' : 'dark')"
              />
              <span class="toggle-track">
                <span class="toggle-thumb"></span>
              </span>
              <span class="toggle-text">{{ previewTheme === 'dark' ? '暗色' : '亮色' }}</span>
            </label>
          </div>
        </div>
      </div>

      <div class="settings-section">
        <h4>开发工具</h4>
        <div class="theme-row">
          <span class="theme-label">调试模式（DevTools）</span>
          <label class="toggle" :class="{ active: debugMode }">
            <input
              type="checkbox"
              :checked="debugMode"
              @change="onToggleDebug(($event.target as HTMLInputElement).checked)"
            />
            <span class="toggle-track">
              <span class="toggle-thumb"></span>
            </span>
            <span class="toggle-text">{{ debugMode ? '开启' : '关闭' }}</span>
          </label>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.4);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.settings-panel {
  background: #252525;
  border: 1px solid #444;
  border-radius: 8px;
  width: 400px;
  max-height: 80vh;
  overflow-y: auto;
  color: #ddd;
  box-shadow: 0 8px 32px rgba(0,0,0,0.5);
}

.settings-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid #333;
}

.settings-header h3 {
  margin: 0;
  font-size: 16px;
  color: #e0e0e0;
}

.settings-close {
  background: none;
  border: none;
  color: #888;
  font-size: 20px;
  cursor: pointer;
  padding: 0 4px;
}
.settings-close:hover { color: #fff; }

.settings-section {
  padding: 16px 20px;
}

.settings-section h4 {
  margin: 0 0 12px;
  font-size: 13px;
  color: #999;
  text-transform: uppercase;
  letter-spacing: 1px;
}

/* 快速切换按钮 */
.settings-quick {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.theme-btn {
  flex: 1;
  padding: 8px;
  border: 1px solid #555;
  border-radius: 4px;
  background: #333;
  color: #ccc;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.15s;
}
.theme-btn:hover { background: #3a3a3a; }
.theme-btn.active {
  border-color: #569cd6;
  background: #1e3a5f;
  color: #569cd6;
}

/* 分开设置 */
.settings-separate {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.theme-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.theme-label {
  font-size: 13px;
  color: #bbb;
}

/* Toggle 开关 */
.toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
}

.toggle input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}

.toggle-track {
  width: 36px;
  height: 20px;
  background: #444;
  border-radius: 10px;
  position: relative;
  transition: background 0.2s;
}

.toggle.active .toggle-track {
  background: #569cd6;
}

.toggle-thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  background: #ccc;
  border-radius: 50%;
  transition: left 0.2s;
}

.toggle.active .toggle-thumb {
  left: 18px;
  background: #fff;
}

.toggle-text {
  font-size: 12px;
  color: #888;
  min-width: 28px;
}
</style>
