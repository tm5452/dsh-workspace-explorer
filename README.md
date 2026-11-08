# DSH 工作区资源管理器

适用于 DeepSeek Harness 的 Windows 桌面插件。通过右侧栏原有的「文件浏览」入口浏览本机磁盘，并在下方独立预览文件。

## 安装

1. 在 Harness 的「插件 → 添加插件」中粘贴下方安装包链接。
2. 安装完成后重启 Harness，再打开右侧栏的「文件浏览」。

```text
https://github.com/tm5452/dsh-workspace-explorer/releases/download/v1.0.0/dsh-workspace-explorer-1.0.0.tgz
```

从源码安装时，也可将插件目录以 `link:<绝对路径>` 添加。旧的同名插件记录可先从插件列表移除。

## 浏览本机磁盘

- 点首页图标返回「此电脑」，双击盘符进入。后退、前进、上一级和刷新仍在顶部。
- 点路径栏右侧的编辑按钮，或在列表中按 Ctrl+L，可以粘贴 Windows 的绝对路径。目录路径打开列表，文件路径直接打开下方预览。
- 双击文件打开预览。换目录、切换会话和刷新列表时，下方继续显示原来的文件。点 × 收起预览。PDF 和 Office 文档可以从预览栏交给 Harness 原生预览。
- 「跟随会话工作区」默认开启。切换会话时，上方跳到该会话的工作区；关闭跟随后，当前位置、滚动位置、前进后退历史和预览跨会话保留。开关在该桌面配置中记忆。

本机磁盘访问仅在 Windows 桌面 Host 上启用，按启动 Harness 的 Windows 账户权限只读访问。Windows 拒绝访问的路径会在列表或地址栏显示提示。盘符首页只列本机磁盘、可移动盘和光驱，网络位置留在访问范围之外。图片、音视频和扩展格式的内嵌预览最多读取 32 MB，文本预览读取前 2 MB。

## 构建

运行 `node scripts/build-client.mjs` 生成 `lib/client.js`。安装目录已包含构建产物。

扩展预览实现沿用 [dsh-preview-extra](https://github.com/LeiYuXingZhou/dsh-preview-extra)，许可证见 `LICENSE-preview-extra`。
