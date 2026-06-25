// 兼容旧引用，所有新类型定义移至 ucb.ts
export type { NoteContent, UcbManifest, UcbManifestNote } from './ucb'

/** @deprecated 使用 NoteContent */
export type NoteData = import('./ucb').NoteContent

/** @deprecated 保留兼容 */
export interface MediaFile {
  fileName: string
  buffer: Buffer
}
