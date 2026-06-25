import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  /** 打开 .ucb 包 */
  openNote: (): Promise<any> => ipcRenderer.invoke('note:open'),

  /** 保存笔记到 .ucb（传 slug 用于更新已有包） */
  saveNote: (noteContent: any, assetPaths: string[], previousSlug?: string): Promise<any> =>
    ipcRenderer.invoke('note:save', noteContent, assetPaths, previousSlug),

  /** 另存为 */
  saveNoteAs: (noteContent: any, assetPaths: string[]): Promise<any> =>
    ipcRenderer.invoke('note:saveAs', noteContent, assetPaths),

  /** 复制文件到临时媒体目录 */
  copyMediaToTemp: (sourcePaths: string[]): Promise<string[]> =>
    ipcRenderer.invoke('media:copyToTemp', sourcePaths),

  /** 获取临时媒体目录路径 */
  getTempMediaDir: (): Promise<string> => ipcRenderer.invoke('media:getTempDir'),

  /** 选择媒体文件，复制到 temp，返回 { mediaUrl, fileName }；mediaType: 'image' | 'video' */
  selectMedia: (mediaType?: string): Promise<{ mediaUrl: string; fileName: string } | null> =>
    ipcRenderer.invoke('media:select', mediaType),

  /** 开关调试模式（DevTools） */
  toggleDevTools: (enabled: boolean): Promise<boolean> =>
    ipcRenderer.invoke('window:toggleDevTools', enabled),

  /** 查询 DevTools 当前是否打开 */
  getDevToolsState: (): Promise<boolean> =>
    ipcRenderer.invoke('window:getDevToolsState'),
})
