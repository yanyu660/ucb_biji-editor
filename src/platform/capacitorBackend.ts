import type { PlatformAPI, OpenNoteResult, SaveResult, SelectMediaResult } from './types'
import type { NoteContent, UcbManifest } from '@/types/ucb'
import { createManifest, createManifestNote } from '@/types/ucb'
import { extractMediaPaths } from '@/types/blocks'
import JSZip from 'jszip'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { Capacitor } from '@capacitor/core'

const DATA_DIR = 'Biji笔记'
const ASSETS_CACHE_DIR = 'ucb-assets'

// ---- 辅助函数 ----

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'note'
}

function genId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function getMimeType(fileName: string): string {
  const ext = fileName.toLowerCase().split('.').pop() || ''
  const mimeMap: Record<string, string> = {
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'svg': 'image/svg+xml',
    'bmp': 'image/bmp',
    'mp4': 'video/mp4',
    'webm': 'video/webm',
    'ogg': 'audio/ogg',
    'mov': 'video/quicktime',
    'mp3': 'audio/mpeg',
    'wav': 'audio/wav',
    'flac': 'audio/flac',
    'aac': 'audio/aac',
    'm4a': 'audio/mp4',
  }
  return mimeMap[ext] || 'application/octet-stream'
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryStr = atob(base64)
  const bytes = new Uint8Array(binaryStr.length)
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i)
  }
  return bytes.buffer
}

/** 缓存的 asset 条目 */
interface CachedAsset {
  buffer: ArrayBuffer
  mimeType: string
  /** Capacitor convertFileSrc() 转换后的 WebView 可访问 URL */
  webUrl: string
}

export class CapacitorBackend implements PlatformAPI {
  readonly name = 'capacitor' as const

  /** 内存中的 asset 缓存 */
  private assetCache = new Map<string, CachedAsset>()

  private currentPackagePath: string | null = null
  private currentManifest: UcbManifest | null = null

  // ---------------------------------------------------------------
  // 打开
  // ---------------------------------------------------------------

  async openNote(): Promise<OpenNoteResult | null> {
    await this.clearCache()

    try {
      const file = await this.pickFile('*/*')
      if (!file) return null

      const header = await file.slice(0, 2).arrayBuffer()
      const isZip = new Uint8Array(header)[0] === 0x50 && new Uint8Array(header)[1] === 0x4b

      if (isZip) {
        const buffer = await file.arrayBuffer()
        const zip = await JSZip.loadAsync(buffer)

        const manifestEntry = zip.file('manifest.json')
        if (!manifestEntry) {
          return { error: '无效的 .ucb 文件：缺少 manifest.json', noteContent: null, filePath: '' }
        }

        const manifestStr = await manifestEntry.async('string')
        const manifest: UcbManifest = JSON.parse(manifestStr)
        this.currentManifest = manifest

        let result: OpenNoteResult
        if (manifest.notes.length === 0) {
          const noteSlugs = new Set<string>()
          zip.forEach((relPath, entry) => {
            const m = relPath.match(/^notes\/([^/]+)\/content\.json$/)
            if (m && !entry.dir) noteSlugs.add(m[1])
          })
          if (noteSlugs.size === 0) {
            result = { manifest, noteContent: null, filePath: file.name }
          } else {
            result = await this.readNoteFromZip(zip, manifest, [...noteSlugs][0], file.name)
          }
        } else {
          result = await this.readNoteFromZip(zip, manifest, manifest.notes[0].slug, file.name)
        }

        return result
      } else {
        const text = await file.text()
        try {
          const noteContent: NoteContent = JSON.parse(text)
          this.currentPackagePath = null
          this.currentManifest = null
          return {
            noteContent,
            noteSlug: slugify(noteContent.title),
            filePath: file.name,
            manifest: { name: noteContent.title || '未命名知识库', notes: [{ slug: slugify(noteContent.title) }] },
          }
        } catch {
          return { error: '无法解析此文件：不是有效的 .ucb 包或 JSON 文件。', noteContent: null, filePath: '' }
        }
      }
    } catch (err: any) {
      console.error('[Capacitor] openNote error:', err)
      return { error: err.message || '打开失败', noteContent: null, filePath: '' }
    }
  }

  private async readNoteFromZip(
    zip: JSZip,
    manifest: UcbManifest,
    slug: string,
    fileName: string,
  ): Promise<OpenNoteResult> {
    const entryPath = `notes/${slug}/content.json`
    const entry = zip.file(entryPath)
    if (!entry) {
      return { error: `笔记 "${slug}" 不存在于包中。`, noteContent: null, filePath: fileName, manifest }
    }

    const contentStr = await entry.async('string')
    const noteContent: NoteContent = JSON.parse(contentStr)

    const prefix = `notes/${slug}/assets/`
    const assetFileNames: string[] = []

    for (const relPath of Object.keys(zip.files)) {
      if (relPath.startsWith(prefix) && !zip.files[relPath].dir) {
        const assetName = relPath.slice(prefix.length)
        const assetEntry = zip.files[relPath]
        const assetBuffer = await assetEntry.async('arraybuffer')
        const mimeType = getMimeType(assetName)

        const contentUri = await this.writeAssetToCache(assetName, assetBuffer)
        const webUrl = Capacitor.convertFileSrc(contentUri)

        this.assetCache.set(assetName, { buffer: assetBuffer, mimeType, webUrl })
        assetFileNames.push(assetName)
      }
    }

    this.currentPackagePath = fileName

    return {
      noteContent,
      noteSlug: slug,
      filePath: fileName,
      manifest,
      assetFilenames: assetFileNames,
    }
  }

  // ---------------------------------------------------------------
  // 保存
  // ---------------------------------------------------------------

  async saveNote(content: NoteContent, previousSlug?: string): Promise<SaveResult> {
    try {
      return await this.writePackage(content, previousSlug)
    } catch (err: any) {
      console.error('[Capacitor] saveNote error:', err)
      return { success: false, error: err.message || '保存失败' }
    }
  }

  async saveNoteAs(content: NoteContent): Promise<SaveResult> {
    try {
      this.currentPackagePath = null
      this.currentManifest = null
      return await this.writePackage(content, undefined)
    } catch (err: any) {
      console.error('[Capacitor] saveNoteAs error:', err)
      return { success: false, error: err.message || '另存为失败' }
    }
  }

  private async writePackage(content: NoteContent, previousSlug?: string): Promise<SaveResult> {
    await this.ensureDataDir()

    const slug = previousSlug || slugify(content.title)
    const fileName = `${content.title || '未命名笔记'}.ucb`

    let manifest: UcbManifest
    let existingNotes = new Map<string, NoteContent>()

    if (this.currentPackagePath && this.currentManifest) {
      manifest = { ...this.currentManifest }
      try {
        const existingPath = `${DATA_DIR}/${this.currentPackagePath}`
        const readResult = await Filesystem.readFile({ path: existingPath, directory: Directory.Documents })
        const dataStr = typeof readResult.data === 'string' ? readResult.data : ''
        if (dataStr) {
          const existingZip = await JSZip.loadAsync(base64ToArrayBuffer(dataStr))
          for (const noteMeta of manifest.notes) {
            if (noteMeta.slug !== slug) {
              const otherEntry = existingZip.file(`notes/${noteMeta.slug}/content.json`)
              if (otherEntry) {
                existingNotes.set(noteMeta.slug, JSON.parse(await otherEntry.async('string')))
              }
            }
          }
        }
      } catch { /* 忽略 */ }
    } else {
      manifest = createManifest(content.title || '未命名知识库')
    }

    const mediaNames = extractMediaPaths(content.blocks)
    const assetBuffers = new Map<string, ArrayBuffer>()
    for (const name of mediaNames) {
      const cached = this.assetCache.get(name)
      if (cached) assetBuffers.set(name, cached.buffer)
    }

    const zip = new JSZip()
    const assetNames = [...assetBuffers.keys()]
    const noteMeta = createManifestNote(content, slug, assetNames)
    const existingIdx = manifest.notes.findIndex(n => n.id === content.id)
    if (existingIdx >= 0) manifest.notes[existingIdx] = noteMeta
    else manifest.notes.push(noteMeta)
    manifest.updatedAt = new Date().toISOString()

    zip.file('manifest.json', JSON.stringify(manifest, null, 2))
    content.updatedAt = new Date().toISOString()
    zip.file(`notes/${slug}/content.json`, JSON.stringify(content, null, 2))
    for (const [name, buffer] of assetBuffers) zip.file(`notes/${slug}/assets/${name}`, buffer)
    for (const [otherSlug, otherContent] of existingNotes) {
      if (otherSlug !== slug) zip.file(`notes/${otherSlug}/content.json`, JSON.stringify(otherContent, null, 2))
    }

    const zipBlob = await zip.generateAsync({ type: 'blob' })
    const zipBuffer = await zipBlob.arrayBuffer()
    const base64 = arrayBufferToBase64(zipBuffer)

    const filePath = `${DATA_DIR}/${fileName}`
    await Filesystem.writeFile({ path: filePath, data: base64, directory: Directory.Documents })

    this.currentPackagePath = fileName
    this.currentManifest = manifest

    return { success: true, filePath: `Documents/${filePath}`, slug }
  }

  // ---------------------------------------------------------------
  // 媒体选择
  // ---------------------------------------------------------------

  async selectMedia(mediaType?: string): Promise<SelectMediaResult | null> {
    try {
      const accept = mediaType === 'video' ? 'video/*' : mediaType === 'audio' ? 'audio/*' : 'image/*'
      const file = await this.pickFile(accept)
      if (!file) return null

      const buffer = await file.arrayBuffer()
      const uniqueName = `${genId()}-${file.name}`
      const mimeType = getMimeType(file.name)

      const contentUri = await this.writeAssetToCache(uniqueName, buffer)
      const webUrl = Capacitor.convertFileSrc(contentUri)
      this.assetCache.set(uniqueName, { buffer, mimeType, webUrl })

      return { mediaUrl: `media://${uniqueName}`, fileName: file.name }
    } catch (err: any) {
      console.error('[Capacitor] selectMedia error:', err)
      return null
    }
  }

  // ---------------------------------------------------------------
  // media:// 协议解析
  // ---------------------------------------------------------------

  resolveMediaUrl(mediaUrl: string): string {
    if (!mediaUrl.startsWith('media://')) return mediaUrl

    const fileName = mediaUrl.slice('media://'.length)
    const cached = this.assetCache.get(fileName)
    if (!cached) {
      return mediaUrl
    }

    return cached.webUrl
  }

  // ---------------------------------------------------------------
  // DevTools
  // ---------------------------------------------------------------

  async toggleDevTools(_enabled: boolean): Promise<boolean> {
    console.warn('[Capacitor] DevTools 切换仅支持 Electron 环境')
    return false
  }

  async getDevToolsState(): Promise<boolean> {
    return false
  }

  // ---------------------------------------------------------------
  // 辅助方法
  // ---------------------------------------------------------------

  private async ensureDataDir(): Promise<void> {
    try { await Filesystem.readdir({ path: DATA_DIR, directory: Directory.Documents }) }
    catch { await Filesystem.mkdir({ path: DATA_DIR, directory: Directory.Documents, recursive: true }) }
  }

  private async clearCache(): Promise<void> {
    this.assetCache.clear()
    try {
      const entries = await Filesystem.readdir({ path: ASSETS_CACHE_DIR, directory: Directory.Cache })
      for (const entry of entries.files) {
        try { await Filesystem.deleteFile({ path: `${ASSETS_CACHE_DIR}/${entry.name}`, directory: Directory.Cache }) }
        catch { /* 忽略 */ }
      }
    } catch { /* 目录不存在忽略 */ }
  }

  /**
   * 将 asset 写入文件系统缓存目录，返回 content:// URI
   */
  private async writeAssetToCache(assetName: string, buffer: ArrayBuffer): Promise<string> {
    try { await Filesystem.readdir({ path: ASSETS_CACHE_DIR, directory: Directory.Cache }) }
    catch { await Filesystem.mkdir({ path: ASSETS_CACHE_DIR, directory: Directory.Cache, recursive: true }) }

    const base64 = arrayBufferToBase64(buffer)
    await Filesystem.writeFile({ path: `${ASSETS_CACHE_DIR}/${assetName}`, data: base64, directory: Directory.Cache })

    const result = await Filesystem.getUri({ path: `${ASSETS_CACHE_DIR}/${assetName}`, directory: Directory.Cache })
    return result.uri
  }

  private pickFile(accept: string): Promise<File | null> {
    return new Promise((resolve) => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = accept
      input.style.display = 'none'
      input.addEventListener('change', () => {
        const file = input.files?.[0] || null
        document.body.removeChild(input)
        resolve(file)
      })
      input.addEventListener('cancel', () => {
        document.body.removeChild(input)
        resolve(null)
      })
      document.body.appendChild(input)
      input.click()
    })
  }
}
