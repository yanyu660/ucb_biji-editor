/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

/** 通过 preload 暴露给渲染进程的 API */
interface Window {
  electronAPI: {
    /** 打开 .ucb 包 */
    openNote: () => Promise<{
      manifest: import('./types/ucb').UcbManifest
      noteContent: import('./types/ucb').NoteContent | null
      noteSlug?: string
      assetFileNames: string[]
      filePath: string
      error?: string
    } | null>

    /** 保存笔记到 .ucb */
    saveNote: (
      noteContent: import('./types/ucb').NoteContent,
      assetPaths: string[],
      previousSlug?: string,
    ) => Promise<{ success: boolean; filePath?: string; slug?: string; error?: string }>

    /** 另存为 */
    saveNoteAs: (
      noteContent: import('./types/ucb').NoteContent,
      assetPaths: string[],
    ) => Promise<{ success: boolean; filePath?: string; slug?: string; error?: string }>

    /** 复制文件到临时媒体目录 */
    copyMediaToTemp: (sourcePaths: string[]) => Promise<string[]>

    /** 获取临时媒体目录路径 */
    getTempMediaDir: () => Promise<string>

    /** 打开文件对话框选择媒体文件，复制到 temp，返回 { mediaUrl, fileName } */
    selectMedia: (mediaType?: string) => Promise<{ mediaUrl: string; fileName: string } | null>

    /** 开关调试模式（DevTools） */
    toggleDevTools: (enabled: boolean) => Promise<boolean>

    /** 查询 DevTools 当前是否打开 */
    getDevToolsState: () => Promise<boolean>
  }
}
