import type { PlatformAPI, OpenNoteResult, SaveResult, SelectMediaResult } from './types'
import type { NoteContent } from '@/types/ucb'
import { extractMediaPaths } from '@/types/blocks'

export class ElectronBackend implements PlatformAPI {
  readonly name = 'electron' as const

  private get api() {
    return window.electronAPI!
  }

  private ensure() {
    if (!window.electronAPI) {
      throw new Error('Electron API 不可用')
    }
  }

  async openNote(): Promise<OpenNoteResult | null> {
    this.ensure()
    const result = await this.api.openNote()
    return result as OpenNoteResult | null
  }

  async saveNote(content: NoteContent, previousSlug?: string): Promise<SaveResult> {
    this.ensure()
    // 收集媒体文件全路径（Electron 需要将媒体文件打包进 .ucb）
    const mediaFileNames = extractMediaPaths(content.blocks).map(p => p)
    let mediaPaths: string[] = []
    if (mediaFileNames.length > 0) {
      const tempDir = await this.api.getTempMediaDir()
      mediaPaths = mediaFileNames.map(name => `${tempDir}\\${name}`)
    }
    const result = await this.api.saveNote(content, mediaPaths, previousSlug)
    return result as SaveResult
  }

  async saveNoteAs(content: NoteContent): Promise<SaveResult> {
    this.ensure()
    const mediaFileNames = extractMediaPaths(content.blocks).map(p => p)
    let mediaPaths: string[] = []
    if (mediaFileNames.length > 0) {
      const tempDir = await this.api.getTempMediaDir()
      mediaPaths = mediaFileNames.map(name => `${tempDir}\\${name}`)
    }
    const result = await this.api.saveNoteAs(content, mediaPaths)
    return result as SaveResult
  }

  async selectMedia(mediaType?: string): Promise<SelectMediaResult | null> {
    this.ensure()
    const result = await this.api.selectMedia(mediaType)
    return result as SelectMediaResult | null
  }

  async toggleDevTools(enabled: boolean): Promise<boolean> {
    this.ensure()
    return await this.api.toggleDevTools(enabled)
  }

  async getDevToolsState(): Promise<boolean> {
    this.ensure()
    const state = await this.api.getDevToolsState?.()
    return !!state
  }

  resolveMediaUrl(mediaUrl: string): string {
    // Electron 端 media:// 由主进程自定义协议处理，直接返回原值
    return mediaUrl
  }
}
