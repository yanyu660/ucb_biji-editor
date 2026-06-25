import type { NoteContent } from '@/types/ucb'

export interface OpenNoteResult {
  noteContent: NoteContent | null
  noteSlug?: string
  filePath: string
  manifest?: any
  error?: string
  /** 解压后的 asset 文件名列表（仅 Capacitor） */
  assetFilenames?: string[]
}

export interface SaveResult {
  success: boolean
  filePath?: string
  slug?: string
  error?: string
}

export interface SelectMediaResult {
  mediaUrl: string
  fileName: string
}

export interface PlatformAPI {
  readonly name: 'electron' | 'capacitor' | 'web'

  openNote(): Promise<OpenNoteResult | null>
  saveNote(content: NoteContent, previousSlug?: string): Promise<SaveResult>
  saveNoteAs(content: NoteContent): Promise<SaveResult>
  selectMedia(mediaType?: string): Promise<SelectMediaResult | null>
  toggleDevTools(enabled: boolean): Promise<boolean>
  getDevToolsState(): Promise<boolean>

  /**
   * 将 media:// 协议的 URL 解析为当前平台可用的实际 URL
   * Electron: 返回原样（media:// 由自定义协议处理）
   * Capacitor: 返回 blob URL 或 data URL
   */
  resolveMediaUrl(mediaUrl: string): string
}
