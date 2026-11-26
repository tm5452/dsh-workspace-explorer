# 贡献指南

欢迎提交 Pull Request。资源管理器的任何部分都可以提出和实现修改，包括文件浏览、预览、会话联动、平台适配、界面和文档。

## 提交 Pull Request

1. 从最新的主分支创建功能分支。涉及界面的修改可参考 [界面设计规范](docs/ui-design.md)。
2. 新增可选功能、改变现有操作习惯时，优先在「设置 → 电脑文件资源管理器」提供开关或选项，并说明默认值。修复错误和常规维护可以直接改善默认行为。
3. 运行 `npm test` 和 `npm run build`，一并提交更新后的 `lib/client.js`。在 PR 中说明改动目的、验证步骤和涉及的平台，有明显视觉变化时可附上截图。

## 接入可选扩展

可独立启用的功能可以通过现有扩展接口实现。在 `src/extensions/` 添加模块，并在 `src/extensions/index.js` 注册。扩展设置显示在「设置 → 电脑文件资源管理器 → 扩展功能」。

## 扩展示例

```js
import { extensionAreas } from './registry.js';

export const folderRefresh = {
  id: 'folder-refresh',
  setting: {
    label: '快捷刷新位置',
    description: '选择显示刷新按钮的位置。',
    options: { off: '关闭', toolbar: '工具栏', footer: '文件浏览底栏' },
    default: 'off',
  },
  buttons: [
    {
      id: 'toolbar-refresh', area: extensionAreas.fileToolbar,
      label: '刷新当前目录', icon: 'refresh', values: ['toolbar'],
      disabled: ({ folder }) => !folder.path,
      run: ({ actions }) => actions.refreshFiles(),
    },
    {
      id: 'footer-refresh', area: extensionAreas.fileFooter,
      label: '刷新当前目录', icon: 'refresh', values: ['footer'],
      disabled: ({ folder }) => !folder.path,
      run: ({ actions }) => actions.refreshFiles(),
    },
  ],
};
```

功能 ID、同一功能内的按钮 ID 和选项值使用小写英文、数字和连字符，以英文字母开头。设置名称和说明采用实际用户能读懂的短句。省略 `setting.options` 使用开关，默认关闭。下拉框须指定合法 `default`，新功能推荐提供关闭选项。使用已有 SVG 键作为 `icon`，注册器会在构建时验证图标名称。

## 按钮接口

| `extensionAreas` 成员 | 实际区域及位置 | 上下文 |
| --- | --- | --- |
| `sidebarShortcuts` | 侧列快捷键，在 DSH 收起、分屏、全屏按钮后。随原生快捷键组显示 | `sessionId` |
| `previewActions` | 文件预览侧列按钮，在 DSH 原生预览、内置全屏及媒体或文档大纲按钮之后。支持小窗预览与独立预览 | `sessionId`、`preview: { name, path, size, mode }`，`mode` 为 `inline` 或 `standalone` |
| `fileFooter` | 文件浏览底栏，在视图按钮与预览窗格按钮之间 | `sessionId`、`folder: { path, workspaceRoot, selection }`、`actions.refreshFiles()` |
| `fileToolbar` | 工具栏，在工作区内浏览之后 | 同文件浏览底栏 |

所有回调都收到 `area` 和当前设置值 `value`。`folder.path` 在「此电脑」可为空，`workspaceRoot` 仅在工作区内浏览时有值。选中项是 `{ name, type, size }` 的只读快照，大小在不可用时可省略。`visible`、`disabled`、`pressed` 是可选的纯判断函数，`run` 可同步执行或返回 Promise。多个按钮按注册顺序显示。使用 `values` 限定按钮对应的设置值。省略时，开关取 `true`，下拉框取全部非默认值，或采用显式的功能 `activeValues`。

无需按钮的功能可以声明 `activate(value)`。它在已启用的值变更时运行一次，可以返回清理函数。切换选项、关闭功能或卸载插件时会先清理已有实例。将副作用写入 `activate` 或 `run`，让模块可以在 Node 构建阶段安全导入。设置值独立保存在 `extensions.<功能 ID>`，界面刷新和同源窗口同步沿用插件设置机制。
