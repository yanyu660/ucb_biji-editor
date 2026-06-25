import AdmZip from 'adm-zip'
import * as path from 'path'
import * as fs from 'fs'
import type { UcbManifest, UcbManifestNote, NoteContent } from '@/types/ucb'
import { UCB_VERSION, createManifest, createManifestNote } from '@/types/ucb'

/**
 * UCB 标准 v1.0 文件管理
 *
 * 包结构:
 *   XXX.ucb (ZIP)
 *   ├── manifest.json        ← UCB_MANIFEST_SPEC.md
 *   ├── notes/
 *   │   ├── {slug}/
 *   │   │   ├── content.json
 *   │   │   └── assets/
 *   │   │       ├── image.png
 *   │   │       └── video.mp4
 *   │   └── ...
 *   └── .cache/          (可选)
 */
export class NoteFileManager {
  static readonly MANIFEST_VERSION = UCB_VERSION

  /**
   * 从 .ucb 文件中读取包清单
   */
  readManifest(ucbPath: string): UcbManifest {
    const zip = new AdmZip(ucbPath)
    const entry = zip.getEntry('manifest.json')
    if (!entry) {
      throw new Error('无效的 .ucb 文件：缺少 manifest.json')
    }
    return JSON.parse(entry.getData().toString('utf-8'))
  }

  /**
   * 从 .ucb 文件中读取指定笔记的内容
   */
  readNoteContent(ucbPath: string, slug: string): NoteContent {
    const zip = new AdmZip(ucbPath)
    const entryPath = `notes/${slug}/content.json`
    const entry = zip.getEntry(entryPath)
    if (!entry) {
      throw new Error(`笔记 "${slug}" 不存在`)
    }
    return JSON.parse(entry.getData().toString('utf-8'))
  }

  /**
   * 从 .ucb 中提取指定笔记的 assets 文件
   * 返回 { fileName → Buffer }
   */
  extractNoteAssets(ucbPath: string, slug: string): Map<string, Buffer> {
    const zip = new AdmZip(ucbPath)
    const prefix = `notes/${slug}/assets/`
    const assets = new Map<string, Buffer>()

    for (const entry of zip.getEntries()) {
      if (entry.entryName.startsWith(prefix) && !entry.isDirectory) {
        const fileName = path.basename(entry.entryName)
        assets.set(fileName, entry.getData())
      }
    }

    return assets
  }

  /**
   * 创建或更新 .ucb 包
   *
   * @param outputPath - 输出文件路径
   * @param manifest  - 包清单
   * @param notes     - 笔记列表（按 slug 索引）
   * @param assetFiles - 媒体文件路径映射 { "note-slug": [绝对路径] }
   */
  async writePackage(
    outputPath: string,
    manifest: UcbManifest,
    notes: Map<string, NoteContent>,
    assetFiles: Map<string, string[]>,
  ): Promise<void> {
    const finalPath = outputPath.toLowerCase().endsWith('.ucb')
      ? outputPath
      : `${outputPath}.ucb`

    const zip = new AdmZip()

    // 1. manifest.json
    manifest.version = NoteFileManager.MANIFEST_VERSION
    manifest.updatedAt = new Date().toISOString()
    zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2), 'utf-8'))

    // 2. 每条笔记
    for (const [slug, content] of notes) {
      const noteDir = `notes/${slug}/`

      // content.json
      content.updatedAt = new Date().toISOString()
      zip.addFile(`${noteDir}content.json`, Buffer.from(JSON.stringify(content, null, 2), 'utf-8'))

      // assets
      const assets = assetFiles.get(slug) || []
      for (const filePath of assets) {
        if (!fs.existsSync(filePath)) {
          console.warn(`[NoteFileManager] 文件不存在，已跳过: ${filePath}`)
          continue
        }
        const fileName = path.basename(filePath)
        zip.addLocalFile(filePath, `${noteDir}assets`)
      }
    }

    zip.writeZip(finalPath)
  }

  /**
   * 便利方法：保存单条笔记到已有的 .ucb 包中
   * 会读取现有 manifest 并更新对应笔记
   */
  async updateNoteInPackage(
    packagePath: string,
    content: NoteContent,
    slug: string,
    assetPaths: string[],
    packageName?: string,
  ): Promise<void> {
    // 读取现有 manifest
    let manifest: UcbManifest
    try {
      manifest = this.readManifest(packagePath)
    } catch {
      // 如果文件不存在或不完整，创建新的 manifest
      manifest = createManifest(packageName || '未命名知识库')
    }

    const assetNames = assetPaths.map(p => path.basename(p))
    const noteMeta: UcbManifestNote = createManifestNote(content, slug, assetNames)

    const idx = manifest.notes.findIndex(n => n.id === content.id)
    if (idx >= 0) {
      manifest.notes[idx] = noteMeta
    } else {
      manifest.notes.push(noteMeta)
    }

    // 写入
    const notesMap = new Map<string, NoteContent>()
    notesMap.set(slug, content)
    const assetsMap = new Map<string, string[]>()
    assetsMap.set(slug, assetPaths)

    await this.writePackage(packagePath, manifest, notesMap, assetsMap)
  }
}
