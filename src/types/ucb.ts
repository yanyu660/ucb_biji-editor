// ============================================================
// UCB 标准 v1.0 — 类型定义
// 严格对应 manifest.json 规范
// ============================================================

import type { Block } from './blocks'

/** 包规范版本号 */
export const UCB_VERSION = '1.0'

/**
 * 包清单 manifest.json
 * 必须位于 .ucb 解压后根目录
 */
export interface UcbManifest {
  /** 包规范版本号，当前为 "1.0" */
  version: string
  /** 知识库名称 */
  name: string
  /** 包的创建时间 (ISO 8601) */
  createdAt: string
  /** 包的最后修改时间 (ISO 8601) */
  updatedAt: string
  /** 笔记索引列表 */
  notes: UcbManifestNote[]
}

/**
 * manifest.json 中单条笔记的索引
 */
export interface UcbManifestNote {
  /** 笔记唯一标识符 */
  id: string
  /** 笔记标题 */
  title: string
  /** 笔记文件夹名，对应 notes/{slug}/ 目录 */
  slug: string
  /** 该笔记的创建时间 (ISO 8601) */
  createdAt: string
  /** 该笔记的最后修改时间 (ISO 8601) */
  updatedAt: string
  /** assets/ 目录下的文件名列表 */
  assets: string[]
}

/**
 * 单条笔记的 content.json
 * 位于 notes/{slug}/content.json
 */
export interface NoteContent {
  /** 笔记唯一标识符 */
  id: string
  /** 笔记标题 */
  title: string
  /** 结构化 Block 内容 */
  blocks: Block[]
  /** 创建时间 (ISO 8601) */
  createdAt: string
  /** 最后修改时间 (ISO 8601) */
  updatedAt: string
}

/**
 * 创建初始 Manifest
 */
export function createManifest(name: string): UcbManifest {
  const now = new Date().toISOString()
  return {
    version: UCB_VERSION,
    name,
    createdAt: now,
    updatedAt: now,
    notes: [],
  }
}

/**
 * 根据 NoteContent 创建 manifest 笔记索引条目
 */
export function createManifestNote(
  content: NoteContent,
  slug: string,
  assetFileNames: string[],
): UcbManifestNote {
  return {
    id: content.id,
    title: content.title,
    slug,
    createdAt: content.createdAt,
    updatedAt: new Date().toISOString(),
    assets: assetFileNames,
  }
}
