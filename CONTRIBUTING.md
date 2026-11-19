# 贡献扩展功能

维护者通过 Pull Request 审阅设置页可选择的扩展功能。Explorer 本体的文件操作、导航、会话接管、预览引擎和宿主桥接由维护者开发。有关本体的建议请开 Issue 讨论。扩展作为受审源码随 Explorer 一同打包，由维护者合并。

## 新增功能

1. 从维护者指定的开发分支创建功能分支。在 `src/extensions/` 新建一个以功能命名的模块并导出贡献定义。
2. 在 `src/extensions/index.js` 导入定义并加入注册列表。每项扩展有独立设置，显示在「设置 → 电脑文件资源管理器 → 扩展功能」。
3. 执行 `npm test` 和 `npm run build` 验证注册契约与打包。安装测试包后检查默认行为、设置开关、亮暗主题和窄栏显示。PR 说明功能、默认值、按钮位置和试用方式。

设置和按钮使用 [界面设计规范](docs/ui-design.md)。功能实现和资源放在独立模块。需要扩大接口能力时，先在 Issue 说明用例，由维护者更新本体接口。

## 声明示例

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
