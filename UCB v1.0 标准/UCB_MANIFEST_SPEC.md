# UCB 标准 v1.0 — manifest.json 规范

## 文件位置
解压后根目录下的 `manifest.json`，**必需**，是整个包的入口文件。

## JSON Schema

```json
{
  "version": "1.0",
  "name": "MyKnowledge",
  "createdAt": "2026-06-17T11:53:00.000Z",
  "updatedAt": "2026-06-17T11:53:00.000Z",
  "notes": [
    {
      "id": "a1b2c3d4",
      "title": "我的笔记",
      "slug": "my-first-note",
      "createdAt": "2026-06-17T11:53:00.000Z",
      "updatedAt": "2026-06-17T11:53:00.000Z",
      "assets": ["image-1.png", "video-1.mp4"]
    }
  ]
}
```

## 字段说明

### 顶层字段

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `version` | `string` | **是** | 包规范版本号，当前为 `"1.0"` |
| `name` | `string` | **是** | 知识库名称（对应 .ucb 文件名，不包含扩展名） |
| `createdAt` | `string` (ISO 8601) | **是** | 包的创建时间 |
| `updatedAt` | `string` (ISO 8601) | **是** | 包的最后修改时间 |
| `notes` | `array` | **是** | 笔记索引列表，至少包含一条笔记索引 |

### notes[i] 字段

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `id` | `string` | **是** | 笔记唯一标识符，由编辑器生成，全局唯一 |
| `title` | `string` | **是** | 笔记标题，用户可修改 |
| `slug` | `string` | **是** | 笔记文件夹名，对应 `notes/{slug}/` 目录，由标题自动生成 |
| `createdAt` | `string` (ISO 8601) | **是** | 该笔记的创建时间 |
| `updatedAt` | `string` (ISO 8601) | **是** | 该笔记的最后修改时间 |
| `assets` | `string[]` | **是** | 该笔记 `assets/` 目录下的文件名列表，无媒体文件则为空数组 `[]` |

## 约束规则

1. **`slug` 不可变更**：一旦创建，slug 不应修改，否则会导致与其他阅读器的目录索引错乱
2. **`assets` 必须与文件系统一致**：`assets` 数组中的文件名必须与 `notes/{slug}/assets/` 下的实际文件一一对应
3. **无额外字段**：不允许在 manifest.json 中添加除本规范定义之外的字段，以保证跨阅读器兼容性
4. **编码**：JSON 文件必须使用 **UTF-8 without BOM** 编码
5. **换行**：建议使用 `LF` 换行符
