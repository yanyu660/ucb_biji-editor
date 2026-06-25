# Biji 笔记

> 开放格式 · 跨平台 · 属于你自己的知识库

Biji（笔迹）是一个基于 **UCB 开放格式** 的跨平台知识库编辑器。一个 `.ucb` 文件就是一个完整的结构化知识包——包含文字、图片、视频、音频，跨平台无缝流转。

## ✨ 特性

- **开放格式** — UCB 本质是标准 ZIP 包，纯 JSON 结构化数据，无厂商锁定
- **跨平台** — 同一文件可在 Windows 桌面版编辑、Android 手机端阅读
- **多媒体知识库** — 文本、图片、视频、音频内嵌于一体
- **Block 编辑器** — 灵活的段落容器，同一段落混排文字、代码、列表、图片
- **行内样式** — Mark 标签实现富文本，数据保持纯结构化
- **离线可用** — 所有数据在本地，无需联网

## 📦 安装

### Windows

从 [Releases](https://github.com/你的用户名/biji-editor/releases) 下载最新版本：

- `Biji Setup 0.1.2.exe` — 安装版
- `Biji 0.1.2.exe` — 便携版（双击即用）

### Android

从 Releases 下载 `app-release.apk`，或通过 Android Studio 自行构建。

## 🚀 快速开始

1. 打开 Biji，点击 **新建** 创建笔记
2. 左侧编辑源数据，右侧实时预览渲染效果
3. 点击 **保存** 导出为 `.ucb` 文件
4. 将 `.ucb` 文件传到其他设备，用 Biji 直接打开

## 📖 UCB 标准

UCB（Unified Companion Book）是一种基于 ZIP 压缩的结构化知识库文件格式。

```
XXX.ucb
 ├── manifest.json        包清单入口
 ├── notes/
 │   ├── {slug}/
 │   │   ├── content.json 结构化笔记（Block 体系）
 │   │   └── assets/       多媒体资源
 │   └── ...
 └── .cache/              阅读器临时数据（可选）
```

详见 [UCB 标准文档](https://github.com/你的用户名/biji-editor/tree/main/UCB%20v1.0%20%E6%A0%87%E5%87%86)。

## 🛠 本地开发

```bash
# 安装依赖
npm install

# 启动开发环境
npm run dev

# 构建桌面端
npm run pack

# 构建 Android
npm run android:build && cd android && ./gradlew assembleDebug
```

## 🗺 未来计划

- [ ] 多笔记管理（一个包内多条笔记）
- [ ] 全文搜索
- [ ] 导出 PDF / Markdown / HTML
- [ ] iOS 端
- [ ] WebDAV 同步
- [ ] 自定义主题

## 📄 开源协议

[MIT License](LICENSE)

---

**Biji 笔记** — 如果你的知识有价值，它值得一个开放的容器。
