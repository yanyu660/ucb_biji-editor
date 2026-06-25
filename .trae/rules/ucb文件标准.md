# UCB 标准 v1.0 — 完整规范（开发参考）

## 概述

UCB（Unified Companion Book，统一知识库）是一种基于 ZIP 压缩的结构化知识库文件格式。

- **物理格式**：标准 ZIP 压缩包，扩展名 `.ucb`
- **MIME 类型**：`application/ucb+zip`
- **压缩算法**：Deflate，非加密
- **JSON 编码**：UTF-8 without BOM，LF 换行

## 包目录结构

```
XXX.ucb
 ├── manifest.json           【必需】包清单入口
 ├── notes/
 │   ├── {slug}/
 │   │   ├── content.json    【必需】笔记主体（Block 结构）
 │   │   └── assets/         【必需】多媒体资源（可为空）
 │   └── ...
 └── .cache/                 【可选】阅读器临时数据
```

## manifest.json 规范

```typescript
// 顶层
interface UcbManifest {
  version: string           // "1.0"
  name: string              // 知识库名称
  createdAt: string         // ISO 8601
  updatedAt: string         // ISO 8601
  notes: UcbManifestNote[]  // 至少一条
}

// notes[i]
interface UcbManifestNote {
  id: string                // 全局唯一
  title: string             // 用户可修改
  slug: string              // 文件夹名，创建后不可变更
  createdAt: string
  updatedAt: string
  assets: string[]           // 与 assets/ 目录一一对应
}
```

**约束**：不允许添加未定义的字段；slug 不可变更；assets 数组必须与文件系统一致。

## content.json 规范

```typescript
interface NoteContent {
  id: string
  title: string
  blocks: Block[]           // Block 容器体系
  createdAt: string
  updatedAt: string
}
```

### Block 结构

```typescript
interface Block {
  id: string
  content: ContentItem[]     // 混合内容列表
  children: Block[]          // 嵌套子 Block，最多 3 层
  depth: number              // 0=顶层, 1=二层, 2=三层（最深）
}
```

### ContentItem 类型

| type | 必需字段 | 说明 |
|------|---------|------|
| `text` | `text` | 普通文本，支持 Mark 行内标签 |
| `heading` | `text`, `level` (1-6) | 标题 |
| `quote` | `text` | 引用 |
| `code` | `language`, `code` | 代码块 |
| `list` | `items: {text}[]`, `ordered` | 有序/无序列表 |
| `todo` | `items: {text, checked}[]` | 待办事项 |
| `image` | `src`, `alt?`, `fileName?` | 图片 |
| `video` | `src`, `alt?`, `fileName?` | 视频 |
| `audio` | `src`, `alt?`, `fileName?` | 音频 |
| `kbd` | `keys`, `label` | 快捷键 |
| `divider` | — | 分割线 |

所有 ContentItem 共有字段：`id`（唯一标识符）、`type`。

### Mark 行内标签（仅用于 text/heading/quote）

语法：`<Mark [属性]>文字</Mark>`

| 属性 | 类型 | 示例 |
|------|------|------|
| `bold` | 布尔 | `<Mark bold>加粗</Mark>` |
| `italic` | 布尔 | `<Mark italic>斜体</Mark>` |
| `color` | 色值 | `<Mark color="#e53935">红色</Mark>` |
| `bg` | 色值 | `<Mark bg="#ffff00">黄底</Mark>` |
| `size` | CSS 字号 | `<Mark size="20px">大号</Mark>` |

### src 路径规则（image/video/audio）

| 前缀 | 说明 | 示例 |
|------|------|------|
| 无前缀 | 指向 `assets/` | `"image-1.png"` |
| `media://` | 阅读器临时目录协议 | `"media://image-1.png"` |
| `https://` | 网络资源 | `"https://example.com/img.png"` |

## 平台差异

### Electron（桌面端）
- ZIP 解压 → 媒体文件解压到 `temp_media` 目录
- 注册 `media://` 自定义协议，支持 Range 请求
- `resolveMediaUrl()` 直接返回 `media://` 原值

### Capacitor（Android）
- ZIP 解压 → 媒体文件写入 `Cache/ucb-assets/` 文件系统缓存
- 通过 `Capacitor.convertFileSrc(contentUri)` 转为 `http://localhost/_capacitor_file_/...` 路径
- 支持 Range 请求（视频/音频渐进加载）

## 编码规范

1. 所有 JSON 文件使用 **UTF-8 without BOM**
2. 缩进使用 2 空格
3. `{slug}` 目录名只允许：字母、数字、中文、连字符、下划线
4. 不允许在标准文件中添加未定义字段

## 版本兼容

| 版本 | 说明 |
|------|------|
| 1.0 | 初始标准，Block 旧版 `{type, data}` 结构 |
| 1.1 | Block 新版容器架构 `{content, children, depth}`，引入 ContentItem、Mark 标签 |
