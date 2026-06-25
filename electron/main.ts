import { app, BrowserWindow, ipcMain, dialog, protocol, Menu } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import AdmZip from 'adm-zip'
import { NoteFileManager } from '../src/utils/FileManager'
import type { NoteContent } from '../src/types/ucb'

let mainWindow: BrowserWindow | null = null
let tempMediaDir = ''
let debuggerAttached = false
let debugLogStream: fs.WriteStream | null = null
const manager = new NoteFileManager()

function genId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

/** 从笔记标题生成 slug */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'note'
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    autoHideMenuBar: true,
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  // 调试模式开关（IPC 控制）：打开/关闭 DevTools + CDP Console 日志
  ipcMain.handle('window:toggleDevTools', (_event, enabled: boolean) => {
    const wc = mainWindow!.webContents
    if (enabled) {
      wc.openDevTools()

      if (!debuggerAttached) {
        try {
          const dp = wc.debugger
          dp.attach('1.3')
          dp.sendCommand('Console.enable')

          // 生成日志路径
          const dbgDir = path.join(process.cwd(), '.dbg')
          if (!fs.existsSync(dbgDir)) fs.mkdirSync(dbgDir, { recursive: true })
          const logFile = path.join(dbgDir, `console-${Date.now()}.log`)
          debugLogStream = fs.createWriteStream(logFile, { flags: 'a' })

          debugLogStream.write(`=== Debug Console Log ${new Date().toISOString()} ===\n\n`)

          dp.on('message', (_event2, method, params: any) => {
            if (method === 'Console.messageAdded') {
              const msg = params.message
              const level = msg.level.toUpperCase().padEnd(7)
              const text = msg.text || ''
              const url = msg.url || ''
              const line = msg.line || ''
              const stack = msg.stackTrace?.callFrames?.map((f: any) =>
                `    at ${f.functionName || '(anonymous)'} (${f.url}:${f.lineNumber}:${f.columnNumber})`
              ).join('\n') || ''
              const entry = `[${level}] ${text}\n  ${url}:${line}${stack ? '\n' + stack : ''}\n`
              debugLogStream!.write(entry)
            }
          })

          dp.on('detach', () => {
            debuggerAttached = false
            if (debugLogStream) { debugLogStream.end(); debugLogStream = null }
          })

          debuggerAttached = true
        } catch (err: any) {
          console.error('[Debugger] attach failed:', err.message)
        }
      }
    } else {
      wc.closeDevTools()
      if (debugLogStream) { debugLogStream.end(); debugLogStream = null }
      if (debuggerAttached) {
        try { wc.debugger.detach() } catch {}
        debuggerAttached = false
      }
    }
    return wc.isDevToolsOpened()
  })

  ipcMain.handle('window:getDevToolsState', () => {
    return mainWindow?.webContents.isDevToolsOpened() ?? false
  })
}

// ---- 自定义协议 media:// ----
function registerMediaProtocol() {
  protocol.handle('media', (request) => {
    // 从 URL 中提取文件名: media://abc.mp4 -> abc.mp4
    const rawUrl = request.url
    const fileName = decodeURIComponent(rawUrl.slice('media://'.length))
    const filePath = path.join(tempMediaDir, fileName)

    if (!fs.existsSync(filePath)) {
      return new Response('Not Found', { status: 404 })
    }

    const stat = fs.statSync(filePath)
    const fileSize = stat.size
    const rangeHeader = request.headers.get('range')

    // 无 Range 请求，直接返回完整文件
    if (!rangeHeader) {
      const mimeType = getMimeType(filePath)
      const data = fs.readFileSync(filePath)
      return new Response(data, {
        status: 200,
        headers: {
          'Content-Type': mimeType,
          'Content-Length': String(fileSize),
          'Accept-Ranges': 'bytes',
        },
      })
    }

    // 处理 Range 请求（视频逐段加载必须）
    const matches = rangeHeader.match(/bytes=(\d+)-(\d*)/)
    if (!matches) {
      return new Response('Invalid Range', { status: 416 })
    }

    const start = parseInt(matches[1], 10)
    const end = matches[2] ? parseInt(matches[2], 10) : fileSize - 1

    if (start >= fileSize) {
      return new Response('Range Not Satisfiable', {
        status: 416,
        headers: { 'Content-Range': `bytes */${fileSize}` },
      })
    }

    const chunkSize = end - start + 1
    const buffer = Buffer.alloc(chunkSize)
    const fd = fs.openSync(filePath, 'r')
    fs.readSync(fd, buffer, 0, chunkSize, start)
    fs.closeSync(fd)

    const mimeType = getMimeType(filePath)
    return new Response(buffer, {
      status: 206,
      headers: {
        'Content-Type': mimeType,
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Content-Length': String(chunkSize),
        'Accept-Ranges': 'bytes',
      },
    })
  })
}

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  const mimeMap: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.bmp': 'image/bmp',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.ogg': 'video/ogg',
    '.mov': 'video/quicktime',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.flac': 'audio/flac',
    '.aac': 'audio/aac',
    '.oga': 'audio/ogg',
    '.m4a': 'audio/mp4',
  }
  return mimeMap[ext] || 'application/octet-stream'
}

// ---- 临时媒体目录管理 ----
function initTempMediaDir() {
  tempMediaDir = path.join(app.getPath('userData'), 'temp_media')
  if (!fs.existsSync(tempMediaDir)) {
    fs.mkdirSync(tempMediaDir, { recursive: true })
  }
  cleanupTempMedia()
}

function cleanupTempMedia() {
  if (!fs.existsSync(tempMediaDir)) return
  for (const f of fs.readdirSync(tempMediaDir)) {
    try { fs.unlinkSync(path.join(tempMediaDir, f)) } catch { /* ignore */ }
  }
}

// ---- IPC: 打开 .ucb 包 ----
ipcMain.handle('note:open', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: '打开知识库',
    filters: [{ name: '知识库文件', extensions: ['ucb'] }],
    properties: ['openFile'],
  })

  if (result.canceled || result.filePaths.length === 0) return null

  const filePath = result.filePaths[0]

  // 打开前清理临时媒体目录，避免残留文件冲突
  cleanupTempMedia()

  try {
    const manifest = manager.readManifest(filePath)

    // 如果有笔记，读取第一条
    if (manifest.notes.length === 0) {
      // 兼容旧保存 bug：manifest.notes 为空时，扫描 notes/ 目录
      try {
        const zip = new AdmZip(filePath)
        const noteDirs = new Set<string>()
        for (const entry of zip.getEntries()) {
          const m = entry.entryName.match(/^notes\/([^/]+)\/content\.json$/)
          if (m) noteDirs.add(m[1])
        }
        if (noteDirs.size > 0) {
          const fallbackSlug = [...noteDirs][0]
          const content = manager.readNoteContent(filePath, fallbackSlug)
          const assets = manager.extractNoteAssets(filePath, fallbackSlug)
          const assetFileNames: string[] = []
          for (const [name, buffer] of assets) {
            const dest = path.join(tempMediaDir, name)
            fs.writeFileSync(dest, buffer)
            assetFileNames.push(name)
          }
          return {
            manifest: { ...manifest, notes: [{ id: content.id, title: content.title, slug: fallbackSlug, createdAt: content.createdAt, updatedAt: content.updatedAt, assets: assetFileNames }] },
            noteContent: content,
            noteSlug: fallbackSlug,
            assetFileNames,
            filePath,
          }
        }
      } catch (scanErr) {
        console.error('[note:open] 扫描 notes 目录失败:', scanErr)
      }
      return { manifest, noteContent: null, filePath }
    }

    const firstNote = manifest.notes[0]
    const content = manager.readNoteContent(filePath, firstNote.slug)

    // 将 assets 解压到临时目录
    const assets = manager.extractNoteAssets(filePath, firstNote.slug)
    const assetFileNames: string[] = []
    for (const [name, buffer] of assets) {
      const dest = path.join(tempMediaDir, name)
      fs.writeFileSync(dest, buffer)
      assetFileNames.push(name)
    }

    return {
      manifest,
      noteContent: content,
      noteSlug: firstNote.slug,
      assetFileNames,
      filePath,
    }
  } catch (err: any) {
    return { error: err.message }
  }
})

// ---- IPC: 保存笔记到 .ucb ----
ipcMain.handle('note:save', async (
  _,
  noteContent: NoteContent,
  assetPaths: string[],
  previousSlug?: string,
) => {
  const result = await dialog.showSaveDialog(mainWindow!, {
    title: '保存知识库',
    defaultPath: `${noteContent.title || '未命名知识库'}.ucb`,
    filters: [{ name: '知识库文件', extensions: ['ucb'] }],
  })

  if (result.canceled || !result.filePath) {
    return { success: false }
  }

  try {
    const slug = previousSlug || slugify(noteContent.title)

    // 如果文件已存在，用 updateNoteInPackage 更新
    if (fs.existsSync(result.filePath)) {
      await manager.updateNoteInPackage(
        result.filePath,
        noteContent,
        slug,
        assetPaths,
        noteContent.title || '未命名知识库',
      )
    } else {
      // 新文件，创建完整的包
      const manifest = {
        version: NoteFileManager.MANIFEST_VERSION,
        name: noteContent.title || '未命名知识库',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        notes: [] as { id: string; title: string; slug: string; createdAt: string; updatedAt: string; assets: string[] }[],
      }

      // 将笔记写入 manifest.notes
      manifest.notes.push({
        id: noteContent.id,
        title: noteContent.title,
        slug,
        createdAt: noteContent.createdAt,
        updatedAt: new Date().toISOString(),
        assets: assetPaths.map(p => path.basename(p)),
      })

      const notesMap = new Map<string, NoteContent>()
      notesMap.set(slug, noteContent)
      const assetsMap = new Map<string, string[]>()
      assetsMap.set(slug, assetPaths)

      await manager.writePackage(result.filePath, manifest, notesMap, assetsMap)
    }

    return { success: true, filePath: result.filePath, slug }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('note:saveAs', async (
  _,
  noteContent: NoteContent,
  assetPaths: string[],
) => {
  const result = await dialog.showSaveDialog(mainWindow!, {
    title: '另存为',
    defaultPath: `${noteContent.title || '未命名知识库'}.ucb`,
    filters: [{ name: '知识库文件', extensions: ['ucb'] }],
  })

  if (result.canceled || !result.filePath) {
    return { success: false }
  }

  try {
    const slug = slugify(noteContent.title)

    const manifest = {
      version: NoteFileManager.MANIFEST_VERSION,
      name: noteContent.title || '未命名知识库',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      notes: [],
    }

    const notesMap = new Map<string, NoteContent>()
    notesMap.set(slug, noteContent)
    const assetsMap = new Map<string, string[]>()
    assetsMap.set(slug, assetPaths)

    await manager.writePackage(result.filePath, manifest, notesMap, assetsMap)

    return { success: true, filePath: result.filePath, slug }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
})

// ---- IPC: 媒体文件处理 ----
ipcMain.handle('media:copyToTemp', async (_, sourcePaths: string[]) => {
  const newPaths: string[] = []
  for (const sp of sourcePaths) {
    if (!fs.existsSync(sp)) continue
    const ext = path.extname(sp)
    const newName = `${genId()}${ext}`
    const dest = path.join(tempMediaDir, newName)
    fs.copyFileSync(sp, dest)
    newPaths.push(dest)
  }
  return newPaths
})

ipcMain.handle('media:getTempDir', () => tempMediaDir)

// ---- IPC: 选择媒体文件 ----
ipcMain.handle('media:select', async (_, mediaType?: string) => {
  const isVideo = mediaType === 'video'
  const isAudio = mediaType === 'audio'
  const filters = isAudio
    ? [
        { name: '音频文件', extensions: ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a'] },
        { name: '图片文件', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'] },
        { name: '视频文件', extensions: ['mp4', 'webm', 'ogg', 'mov'] },
        { name: '所有文件', extensions: ['*'] },
      ]
    : isVideo
    ? [
        { name: '视频文件', extensions: ['mp4', 'webm', 'ogg', 'mov'] },
        { name: '图片文件', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'] },
        { name: '所有文件', extensions: ['*'] },
      ]
    : [
        { name: '图片文件', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'] },
        { name: '视频文件', extensions: ['mp4', 'webm', 'ogg', 'mov'] },
        { name: '所有文件', extensions: ['*'] },
      ]

  const result = await dialog.showOpenDialog(mainWindow!, {
    title: '选择媒体文件',
    filters,
    properties: ['openFile'],
  })

  if (result.canceled || result.filePaths.length === 0) return null

  const sourcePath = result.filePaths[0]
  const ext = path.extname(sourcePath)
  const newName = `${genId()}${ext}`
  const dest = path.join(tempMediaDir, newName)
  fs.copyFileSync(sourcePath, dest)

  return { mediaUrl: `media://${newName}`, fileName: path.basename(sourcePath) }
})

// ---- App 生命周期 ----
app.whenReady().then(() => {
  Menu.setApplicationMenu(null)
  registerMediaProtocol()
  initTempMediaDir()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  cleanupTempMedia()
  if (process.platform !== 'darwin') app.quit()
})
