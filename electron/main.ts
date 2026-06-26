import { app, BrowserWindow, ipcMain, dialog, protocol, Menu } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import type { NoteContent } from '../src/types/ucb'
import { UCB_VERSION } from '../src/types/ucb'

let mainWindow: BrowserWindow | null = null
let tempMediaDir = ''

// 延迟初始化 NoteFileManager（依赖 adm-zip，避免启动时同步加载）
let _manager: any = null
async function getManager() {
  if (!_manager) {
    const { NoteFileManager } = await import('../src/utils/FileManager')
    _manager = new NoteFileManager()
  }
  return _manager
}

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
    const mgr = await getManager()
    const manifest = mgr.readManifest(filePath)

    // 如果有笔记，读取第一条
    if (manifest.notes.length === 0) {
      // 兼容旧保存 bug：manifest.notes 为空时，扫描 notes/ 目录
      try {
        const AdmZip = (await import('adm-zip')).default
        const zip = new AdmZip(filePath)
        const noteDirs = new Set<string>()
        for (const entry of zip.getEntries()) {
          const m = entry.entryName.match(/^notes\/([^/]+)\/content\.json$/)
          if (m) noteDirs.add(m[1])
        }
        if (noteDirs.size > 0) {
          const fallbackSlug = [...noteDirs][0]
          const content = mgr.readNoteContent(filePath, fallbackSlug)
          const assets = mgr.extractNoteAssets(filePath, fallbackSlug)
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
    const content = mgr.readNoteContent(filePath, firstNote.slug)

    // 将 assets 解压到临时目录
    const assets = mgr.extractNoteAssets(filePath, firstNote.slug)
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
    const mgr = await getManager()
    const slug = previousSlug || slugify(noteContent.title)

    // 如果文件已存在，用 updateNoteInPackage 更新
    if (fs.existsSync(result.filePath)) {
      await mgr.updateNoteInPackage(
        result.filePath,
        noteContent,
        slug,
        assetPaths,
        noteContent.title || '未命名知识库',
      )
    } else {
      // 新文件，创建完整的包
      const manifest = {
        version: UCB_VERSION,
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

      await mgr.writePackage(result.filePath, manifest, notesMap, assetsMap)
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
    const mgr = await getManager()
    const slug = slugify(noteContent.title)

    const manifest = {
      version: UCB_VERSION,
      name: noteContent.title || '未命名知识库',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      notes: [],
    }

    const notesMap = new Map<string, NoteContent>()
    notesMap.set(slug, noteContent)
    const assetsMap = new Map<string, string[]>()
    assetsMap.set(slug, assetPaths)

    await mgr.writePackage(result.filePath, manifest, notesMap, assetsMap)

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

// ---- IPC: DevTools 调试模式 ----
ipcMain.handle('window:toggleDevTools', async (_event, enabled: boolean) => {
  const wc = mainWindow!.webContents
  if (enabled) {
    await wc.openDevTools()
    return true
  } else {
    wc.closeDevTools()
    return false
  }
})

ipcMain.handle('window:getDevToolsState', () => {
  return mainWindow?.webContents.isDevToolsOpened() ?? false
})

// ---- 注册特权协议（必须在 app ready 之前完成）----
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'media',
    privileges: {
      stream: true,          // 支持流式响应（视频/音频分段加载必需）
      supportFetchAPI: true, // 支持 fetch 请求
      corsEnabled: false,    // 本地文件无需 CORS
    },
  },
])

// ---- App 生命周期 ----
app.whenReady().then(() => {
  Menu.setApplicationMenu(null)
  registerMediaProtocol()
  initTempMediaDir()
  createWindow()

  // 窗口显示后再清理临时媒体，不阻塞启动
  setTimeout(() => cleanupTempMedia(), 2000)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  cleanupTempMedia()
  if (process.platform !== 'darwin') app.quit()
})
