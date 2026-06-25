# UCB 标准 v1.0 — 包结构规范

## 概述

UCB（Universal Content Bundle，通用内容包）是一种基于 ZIP 压缩的**结构化知识库文件格式**。
一个 .ucb 文件包含多条结构化笔记及其关联的多媒体资源，适用于本地知识库管理、笔记协作与跨平台阅读。

## 文件格式

- **物理格式**：标准 ZIP 压缩包
- **文件扩展名**：`.ucb`
- **MIME 类型**：`application/ucb+zip`

## 包目录结构

```
XXX.ucb                          # 实际为 ZIP 压缩包，改后缀为 .ucb
 │
 ├── manifest.json                # 【必需】包清单，描述元数据与内容索引
 │                                #   ─ 详见 UCB_MANIFEST_SPEC.md
 │
 ├── notes/                       # 【必需】笔记内容文件夹
 │   ├── {slug}/                  #       单条笔记 = 一个独立文件夹
 │   │   ├── content.json         #       【必需】笔记主体文件（结构化 Block 内容）
 │   │   │                        #         详见 content.json 文件格式
 │   │   └── assets/              #       【必需】该笔记的多媒体资源
 │   │       ├── image-1.png
 │   │       ├── video-1.mp4
 │   │       ├── audio-1.mp3
 │   │       └── ...
 │   ├── {slug}/                  #       另一条笔记
 │   │   ├── content.json
 │   │   └── assets/
 │   └── ...
 │
 └── .cache/                      # 【可选】阅读器临时数据（由阅读器自动创建）
     ├── index/                   #       阅读器构建的搜索索引
     └── thumbs/                  #       缩略图缓存
```

## 文件规范

### 1. manifest.json

**位置**：包根目录

**必需**：是

**说明**：包清单文件，是整个 .ucb 文件的入口。阅读器必须先读取此文件以获取包内所有笔记的索引信息。

**规范**：详见 [UCB_MANIFEST_SPEC.md](./UCB_MANIFEST_SPEC.md)

### 2. notes/{slug}/content.json

**位置**：`notes/{slug}/` 下

**必需**：是

**说明**：单条笔记的结构化内容文件。使用 Block 体系组织，每个 Block 是一个段落容器，可包含混合类型的 ContentItem 和嵌套子 Block。

**格式**（完整示例见 [content.json](./content.json)）：

```json
{
  "id": "note-unique-id",
  "title": "笔记标题",
  "blocks": [
    {
      "id": "block-001",
      "content": [
        { "id": "c-001", "type": "heading", "text": "标题文本", "level": 1 },
        { "id": "c-002", "type": "text", "text": "普通段落文本，支持<Mark bold>行内样式</Mark>标记。" }
      ],
      "children": [],
      "depth": 0
    },
    {
      "id": "block-002",
      "content": [
        { "id": "c-003", "type": "code", "language": "javascript", "code": "console.log('Hello');" },
        { "id": "c-004", "type": "text", "text": "代码块后可以继续写文字。" }
      ],
      "children": [],
      "depth": 0
    },
    {
      "id": "block-003",
      "content": [
        { "id": "c-005", "type": "heading", "text": "嵌套示例", "level": 2 }
      ],
      "depth": 0,
      "children": [
        {
          "id": "block-004",
          "content": [
            { "id": "c-006", "type": "text", "text": "这是子 Block 的内容。" }
          ],
          "depth": 1,
          "children": []
        }
      ]
    }
  ],
  "createdAt": "2026-06-17T12:00:00.000Z",
  "updatedAt": "2026-06-24T12:00:00.000Z"
}
```

#### 顶层字段

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `id` | `string` | **是** | 笔记唯一标识符，与 manifest.json 中的 id 一致 |
| `title` | `string` | **是** | 笔记标题 |
| `blocks` | `array` | **是** | 结构化 Block 数组 |
| `createdAt` | `string` (ISO 8601) | **是** | 笔记创建时间 |
| `updatedAt` | `string` (ISO 8601) | **是** | 笔记最后修改时间 |

#### Block 结构

每个 Block 是一个段落容器，包含以下字段：

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `id` | `string` | **是** | Block 唯一标识符 |
| `content` | `ContentItem[]` | **是** | 内容项列表，同一 Block 内可混合多种类型 |
| `children` | `Block[]` | **是** | 嵌套子 Block 列表，最多 3 层 |
| `depth` | `number` | **是** | 当前嵌套深度（0=顶层，1=第二层，2=第三层） |

#### ContentItem 类型

`ContentItem` 是 `content` 数组中的最小组成单元：

| type | 字段 | 说明 |
|------|------|------|
| `text` | `text` | 普通文本段落，支持 Mark 标签行内样式 |
| `heading` | `text`, `level` (1-6) | 标题 |
| `quote` | `text` | 引用文本 |
| `code` | `language`, `code` | 代码块 |
| `list` | `items: { text }[]`, `ordered: bool` | 列表（ordered=true 为有序列表） |
| `todo` | `items: { text, checked }[]` | 待办事项列表 |
| `image` | `src`, `alt?`, `fileName?` | 图片 |
| `video` | `src`, `alt?`, `fileName?` | 视频 |
| `audio` | `src`, `alt?`, `fileName?` | 音频 |
| `kbd` | `keys`, `label` | 快捷键提示 |
| `divider` | — | 分割线 |

所有 ContentItem 共有的字段：`id`（字符串，唯一标识符）、`type`。

#### 行内样式（Mark 标签）

文本型 ContentItem（text、heading、quote）的 `text` 字段中使用 `<Mark>` 标签标记行内样式：

**语法**：`<Mark [属性]>文字</Mark>`

**属性**：

| 属性 | 类型 | 示例 |
|------|------|------|
| `bold` | 布尔 | `<Mark bold>加粗</Mark>` |
| `italic` | 布尔 | `<Mark italic>斜体</Mark>` |
| `color` | 色值 | `<Mark color="#e53935">红色</Mark>` |
| `bg` | 色值 | `<Mark bg="#ffff00">黄色背景</Mark>` |
| `size` | CSS 字号 | `<Mark size="20px">大号</Mark>` |

多个属性可组合使用：`<Mark bold italic color="#1976d2">蓝粗斜</Mark>`

### 3. notes/{slug}/assets/

**位置**：`notes/{slug}/assets/`

**必需**：是（无媒体文件时可为空目录）

**说明**：该笔记关联的多媒体资源文件。所有文件名**必须与** manifest.json 中该笔记的 `assets` 数组一一对应。

### 4. .cache/

**位置**：包根目录

**必需**：否

**说明**：阅读器自动创建的临时数据目录，不参与版本管理。编辑器在打包时应忽略此目录。

## 内容数据说明

### Block 嵌套规则

- 最大嵌套深度为 3 层（`depth` 值 0、1、2）
- 第 3 层 Block 的 `children` 必须为空数组
- 阅读器应确保递归渲染深度不超过 3 层

### src 路径规则

image、video、audio 类型 ContentItem 的 `src` 字段遵循以下路径规则：

| 前缀 | 说明 | 示例 |
|------|------|------|
| 无前缀（纯文件名） | 指向 `assets/` 下的文件 | `"image-1.png"` |
| `media://` | 阅读器临时目录协议 | `"media://image-1.png"` |
| `https://` | 网络资源 | `"https://example.com/img.png"` |
| 绝对路径 | 本地文件系统 | `"C:/Users/xxx/Downloads/img.png"` |

## 编码规范

1. **ZIP 压缩**：使用 Deflate 算法，非加密
2. **JSON 编码**：所有 JSON 文件使用 **UTF-8 without BOM**
3. **换行符**：建议使用 `LF`（Unix 风格）
4. **缩进**：建议使用 2 空格缩进
5. **文件名**：`{slug}` 目录名由标题自动生成，只允许包含字母、数字、中文、连字符和下划线
6. **assets 文件名**：保留原始扩展名，文件名不应重复
7. **严格模式**：不允许在标准文件中添加未定义的字段，以保证跨阅读器兼容性

## 约束规则

1. **一条笔记对应一个 `{slug}` 目录**：目录名在包内必须唯一
2. **`slug` 一经创建不应修改**：slug 是笔记在包内的永久标识，修改会导致引用断裂
3. **无额外文件**：不允许在包根目录或 notes/ 下添加未定义的文件
4. **阅读器必须从 manifest.json 开始读取**：不支持无 manifest.json 的 .ucb 文件

## 版本兼容

| 版本 | 说明 |
|------|------|
| 1.0 | 初始标准，定义包结构、manifest.json、Block 体系（旧版 `{type, data}` 结构） |
| 1.1 | Block 升级为容器架构：`{content, children, depth}`，引入 ContentItem 混合内容、Mark 标签行内样式、嵌套 Block |

阅读器应检查 manifest.json 中的 `version` 字段以确保兼容性。遇到未知版本号时应提示用户升级阅读器。
