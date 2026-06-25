import type { PlatformAPI } from './types'
import { ElectronBackend } from './electronBackend'
import { CapacitorBackend } from './capacitorBackend'

/**
 * 平台检测优先级：
 * 1. Capacitor（Android/iOS WebView）
 * 2. Electron（通过 window.electronAPI 检测）
 * 3. Web（开发环境降级到 Capacitor 后端）
 */
function detectPlatform(): PlatformAPI {
  // 优先检测 Capacitor
  if (typeof window !== 'undefined' && (window as any).Capacitor) {
    console.log('[Platform] 检测到 Capacitor 环境')
    return new CapacitorBackend()
  }

  // 检测 Electron
  if (typeof window !== 'undefined' && window.electronAPI) {
    console.log('[Platform] 检测到 Electron 环境')
    return new ElectronBackend()
  }

  // 降级到 Capacitor 后端（浏览器开发环境）
  console.log('[Platform] 未知环境，降级到 Capacitor 后端')
  return new CapacitorBackend()
}

/** 全局单例平台 API */
export const platform: PlatformAPI = detectPlatform()
