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
  // 优先检测 Electron（vite-plugin-electron 可能在开发环境同时暴露 Capacitor 和 electronAPI）
  if (typeof window !== 'undefined' && window.electronAPI) {
    console.log('[Platform] 检测到 Electron 环境')
    return new ElectronBackend()
  }

  // 检测 Capacitor（Android/iOS WebView）
  if (typeof window !== 'undefined' && (window as any).Capacitor) {
    console.log('[Platform] 检测到 Capacitor 环境')
    return new CapacitorBackend()
  }

  // 降级到 Capacitor 后端（浏览器开发环境）
  console.log('[Platform] 未知环境，降级到 Capacitor 后端')
  return new CapacitorBackend()
}

/** 全局单例平台 API */
export const platform: PlatformAPI = detectPlatform()

/**
 * 将 media:// 协议的 URL 解析为当前平台可用的实际 URL
 * 非 media:// 的 URL 原样返回
 */
export function resolveMediaUrl(src: string): string {
  if (!src || !src.startsWith('media://')) return src
  return platform.resolveMediaUrl(src)
}
