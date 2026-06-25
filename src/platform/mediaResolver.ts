/**
 * 媒体 URL 解析器
 *
 * 提供给渲染层（BlockPreviewNode）统一调用，屏蔽平台差异。
 * - Electron: media:// 由自定义协议处理，直接返回原值
 * - Capacitor(Android): media:// 映射为 blob URL
 */
import { platform } from './index'

/**
 * 将 media:// 协议的 URL 解析为当前平台可用的实际 URL
 * 非 media:// 的 URL 原样返回
 */
export function resolveMediaUrl(src: string): string {
  if (!src || !src.startsWith('media://')) return src
  return platform.resolveMediaUrl(src)
}
