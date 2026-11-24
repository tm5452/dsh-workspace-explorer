export const explorerCss = `
body {
  --dwe-panel-inset: 10px;
  --dwe-ui-radius: 8px;
  --dwe-tool-size: 28px;
  --dwe-tool-background: #fff;
  --dwe-tool-hover: #e1e3e8;
  --dwe-tool-active: #f1f3f5;
  --dwe-toolbar-icon: #61666b;
  --dwe-toolbar-icon-disabled: #adb2b8;
  --dwe-file-shortcut-background: #fff;
  --dwe-file-shortcut-marker: #c7cbd4;
  --dwe-file-shortcut-active: #e1e3e8;
  --dwe-file-shortcut-border: #e0e0e0;
  --dwe-floating-tool-fill: 20%;
  --dwe-floating-tool-blur: 3px;
  --dwe-preview-tool-color: var(--dsw-alias-label-primary, #212529);
  --dwe-file-menu-surface: #f8f9fa;
  --dwe-floating-tool-shadow: 0 1px 2px #0f172a1a, 0 2px 8px #0f172a0f;
  --dwe-file-row-size: 28px;
  --dwe-file-icon-size: 16px;
  --dwe-file-icon-inset: calc((var(--dwe-file-row-size) - var(--dwe-file-icon-size)) / 2);
  --dwe-hover-delay: 50ms;
  --dwe-line: var(--dsw-alias-border-l3, color-mix(in srgb, currentColor 14%, transparent));
  --dwe-hairline: var(--dsw-alias-border-l1, rgba(0, 0, 0, 0.04));
  --dwe-tint: color-mix(in srgb, currentColor 5%, transparent);
  --dwe-path-surface: #f1f3f5;
  --dwe-path-muted: #92959e;
  --dwe-path-hover-muted: #6e7076;
  --dwe-hover: color-mix(in srgb, currentColor 8%, transparent);
  --dwe-accent: var(--dsw-alias-button-info-fill, #4176E6);
  --dwe-accent-hover: var(--dsw-alias-button-info-hover, #5686FE);
  --dwe-icon-ink: currentColor;
  --dwe-media-hue: 260;
  --dwe-media-collapse-delay: 1s;
  --dwe-media-light: oklch(.988 .008 var(--dwe-media-hue));
  --dwe-video-ink: oklch(from #4f3422 l c var(--dwe-media-hue));
  --dwe-video-overlay-ink: oklch(.15 .021 var(--dwe-media-hue));
  --dwe-music-ink-source: #4f3422;
  --dwe-music-control-source: #edebeb;
  --dwe-music-secondary-source: #7e7472;
  --dwe-music-track-source: #e8ddd9;
  --dwe-media-header-ink-source: var(--dsw-alias-label-primary, #212529);
  --dwe-preview-tab-active: #f1f3f5;
  --dwe-media-action-hover-source: #270700;
  --dwe-music-surface: var(--dwe-media-light);
  --dwe-music-ink: oklch(from var(--dwe-music-ink-source) l c var(--dwe-media-hue));
  --dwe-music-secondary: oklch(from var(--dwe-music-secondary-source) l c var(--dwe-media-hue));
  --dwe-music-control: oklch(from var(--dwe-music-control-source) l c var(--dwe-media-hue));
  --dwe-seek-track: oklch(from var(--dwe-music-track-source) l c var(--dwe-media-hue));
  --dwe-music-control-hover: oklch(from color-mix(in srgb, var(--dwe-music-control-source) 87%, var(--dwe-music-ink-source)) l c var(--dwe-media-hue));
  --dwe-shadow-xs: 0 1px 4px rgb(0 0 0 / 24%);
  --dwe-shadow-sm: 0 2px 8px rgb(0 0 0 / 24%);
  --dwe-shadow-md: 0 4px 16px rgb(0 0 0 / 20%);
  --dwe-shadow-lg: 0 8px 32px rgb(0 0 0 / 26%);
}
body[data-ds-dark-theme] {
  --dwe-tool-background: var(--dsw-alias-bg-base, #151517);
  --dwe-tool-hover: #30333a;
  --dwe-tool-active: #26282e;
  --dwe-toolbar-icon: #c0c2c4;
  --dwe-toolbar-icon-disabled: #64696e;
  /* Reflect the light palette's OKLab lightness differences around the dark surface. */
  --dwe-file-shortcut-background: #222225;
  --dwe-file-shortcut-marker: #676b74;
  --dwe-file-shortcut-active: #35373e;
  --dwe-file-shortcut-border: #39393c;
  --dwe-preview-tool-color: var(--dsw-alias-label-primary, #eee);
  --dwe-file-menu-surface: #303136;
  --dwe-floating-tool-shadow: 0 1px 2px #00000080, 0 2px 10px #00000073;
  --dwe-path-surface: var(--dsw-alias-interactive-bg-active, #30343b);
  --dwe-path-hover-muted: var(--dsw-alias-label-secondary, #b6b8c1);
  --dwe-icon-muted: #aaa4a1;
  --dwe-icon-highlight: #272321;
  --dwe-icon-star-edge: #ffd0a0;
  --dwe-music-ink-source: #efdad0;
  --dwe-music-control-source: #433631;
  --dwe-music-secondary-source: #baaaa3;
  --dwe-music-track-source: #53433d;
  --dwe-media-header-ink-source: var(--dsw-alias-label-primary, #eee);
  --dwe-preview-tab-active: var(--dsw-alias-interactive-bg-active, #30343b);
  --dwe-media-action-hover-source: var(--dsw-alias-label-primary, #eee);
  --dwe-music-surface: oklch(from #292323 l c var(--dwe-media-hue));
  --dwe-shadow-xs: 0 1px 4px rgb(0 0 0 / 55%);
  --dwe-shadow-sm: 0 2px 8px rgb(0 0 0 / 55%);
  --dwe-shadow-md: 0 4px 16px rgb(0 0 0 / 50%);
  --dwe-shadow-lg: 0 8px 32px rgb(0 0 0 / 58%);
}
[data-dwe-sidebar-handoff] {
  grid-template-columns: var(--dwe-handoff-columns) !important;
  transition: none !important;
}
[data-dwe-sidebar-track-instant],
[data-sidebar-right-panel] :is([data-dockkit-host='dock'], [data-dockkit-empty], [data-dockkit-divider]):not([data-dwe-sidebar-toggle-motion]),
[data-dwe-sidebar-handoff] [data-sidebar-right-panel] :is([data-dockkit-host='dock'], [data-dockkit-empty], [data-dockkit-divider]) {
  transition: none !important;
}
.dwe-guide-entry {
  display: flex; box-sizing: border-box; width: 100%; max-width: 380px;
  min-height: 56px; overflow: hidden;
  border: .5px solid var(--dsw-alias-border-l3);
  border-radius: var(--dsl-guide-entry-radius, 20px);
  background: var(--dsw-alias-bg-layer-1);
}
.dwe-guide-entry > button {
  display: flex; align-items: center; border: 0; background: transparent;
  color: var(--dsw-alias-label-primary); font: inherit; cursor: pointer;
}
.dwe-guide-entry > button:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dwe-guide-entry > button:focus-visible { outline: 2px solid currentColor; outline-offset: -3px; }
.dwe-guide-entry .dwe-guide-main {
  flex: 1; min-width: 0; gap: 14px; padding: 14px 20px; text-align: start;
}
.dwe-guide-entry svg { flex: none; }
.dwe-guide-copy { display: grid; gap: 3px; min-width: 0; line-height: 1.4; }
.dwe-guide-title, .dwe-guide-description { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.dwe-guide-title { font-size: 14px; }
.dwe-guide-description { font-size: 11px; color: var(--dsw-alias-label-tertiary); }
.dwe-guide-entry .dwe-guide-computer {
  flex: 0 0 56px; justify-content: center; padding: 0;
  border-inline-start: .5px solid var(--dsw-alias-border-l3);
}
.dwe-conversation-drop {
  position: fixed; inset: 0; z-index: calc(var(--dsh-dockkit-float-layer, 60) - 1);
  display: grid; box-sizing: border-box; padding: 0 6px 6px 3px;
  --dwe-drop-blue: var(--dwe-accent, #4176E6);
  pointer-events: none; user-select: none;
}
.dwe-conversation-drop-area, .dwe-path-drop-frame { border-radius: 15px; }
.dwe-conversation-drop-area[hidden] { display: none; }
.dwe-preview-page-drop { padding: 3px; }
.dwe-preview-page-drop[data-dwe-floating-drop] { position: absolute; z-index: 5; }
.dwe-parked-preview-surfaces {
  position: fixed; inset: 0 auto auto -10000px; visibility: hidden; pointer-events: none;
}
.dwe-parked-preview-surfaces > .dwe-preview-surface {
  width: var(--dwe-parked-width, 1px); height: var(--dwe-parked-height, 1px);
}
.dwe-conversation-drop-area {
  position: relative; display: grid; place-items: center; padding: 24px;
  overflow: hidden;
  background: color-mix(in srgb, var(--dsw-alias-bg-base, Canvas) 38%, transparent);
  backdrop-filter: blur(7.5px); color: var(--dwe-drop-blue);
  text-align: center; font-size: 24px;
}
.dwe-conversation-drop-area::before {
  content: ''; position: absolute; inset: 0; border: 4px solid var(--dwe-drop-blue); border-radius: inherit;
}
.dwe-conversation-drop[data-dwe-drop-active] .dwe-conversation-drop-area::before { border-width: 8px; }
.dwe-conversation-drag-icon {
  position: fixed; top: 0; left: 0; width: 40px; height: 40px;
  z-index: 2147483647; pointer-events: none;
  display: grid; place-items: center; border-radius: 8px;
  background: var(--dsw-alias-bg-base, Canvas); box-shadow: var(--dwe-shadow-sm);
  transform: translate3d(clamp(0px, var(--dwe-drag-x), 100vw - 44px), clamp(0px, var(--dwe-drag-y), 100vh - 44px), 0);
}
.dwe-conversation-drag-icon[hidden] { display: none; }
.dwe-sidebar-tab-drag {
  position: fixed; top: 0; left: 0; z-index: 2147483647;
  display: grid; place-items: center; width: 36px; height: 36px;
  border-radius: 9px; pointer-events: none; user-select: none;
  color: var(--dsw-alias-label-primary, CanvasText);
  background: var(--dsw-alias-bg-base, Canvas);
  box-shadow: var(--dwe-shadow-sm);
  transform: translate3d(clamp(0px, var(--dwe-drag-x), 100vw - 40px), clamp(0px, var(--dwe-drag-y), 100vh - 40px), 0);
}
.dwe-sidebar-tab-drag > :is(svg, img) { width: 22px; height: 22px; object-fit: contain; }
.dwe-float-dock-drag {
  box-sizing: border-box; width: var(--dwe-tool-size); height: var(--dwe-tool-size);
  border: 1px solid var(--dwe-file-shortcut-border); border-radius: var(--dwe-ui-radius);
  background-color: var(--dwe-file-shortcut-background);
  transform: translate3d(max(0px, calc(var(--dwe-drag-x) - 26px)), max(0px, calc(var(--dwe-drag-y) - 26px)), 0);
}
.dwe-float-dock-drag > svg { width: var(--dwe-file-icon-size); height: var(--dwe-file-icon-size); }
.dwe-float-dock-drag[data-opened] { background-color: var(--dwe-file-shortcut-active); }
[data-dwe-shortcut-flight-target] { visibility: hidden; }
.dwe-preview-shortcut-flight {
  position: fixed; top: 0; left: 0; z-index: 2147483647; overflow: hidden;
  box-sizing: border-box; outline: 1px solid transparent; outline-offset: -1px; pointer-events: none;
}
.dwe-preview-shortcut-flight > * { position: absolute; top: 0; left: 0; }
.dwe-preview-shortcut-flight > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
:is([data-dwe-mouse-gesture-tracking], [data-dwe-preview-dragging],
  [data-dwe-explorer-file-drag], [data-dwe-desktop-preview-drag], [data-dwe-conversation-file-drag])
  :is(iframe, webview, object, embed) { pointer-events: none !important; }
.dwe-mouse-gesture {
  position: fixed; inset: 0; z-index: 2147483647;
  display: grid; place-items: center; pointer-events: none; user-select: none;
}
.dwe-mouse-gesture-trail {
  position: absolute; inset: 0; width: 100%; height: 100%;
  fill: none; stroke: var(--dwe-accent, #3262E9); stroke-width: 6px; stroke-linecap: round; stroke-linejoin: round;
}
.dwe-mouse-gesture[data-stable-click] .dwe-mouse-gesture-trail { visibility: hidden; }
.dwe-mouse-gesture[data-finished] .dwe-mouse-gesture-trail {
  animation: dwe-mouse-gesture-trail-fade 220ms ease-out forwards;
}
@keyframes dwe-mouse-gesture-trail-fade { to { opacity: 0; } }
.dwe-mouse-gesture-badge {
  position: absolute; left: var(--dwe-gesture-badge-x); top: var(--dwe-gesture-badge-y);
  transform: translate(-50%, -50%);
  display: none; flex-direction: column; align-items: center; justify-content: center;
  width: 112px; height: 112px; gap: 8px; border-radius: 20px;
  background: rgb(0 0 0 / 74%); color: white; font-size: 14px; font-weight: 600; line-height: 1.25;
}
.dwe-mouse-gesture[data-action] .dwe-mouse-gesture-badge { display: flex; }
.dwe-mouse-gesture-badge svg {
  --dwe-icon-ink: #fff;
  width: 46px; height: 46px;
}
.dwe-host { height: 100%; min-height: 0; min-width: 0; }
/* Keep the native pane and tab record while giving the preview its own fixed slot. */
[data-dockkit-strip-tabs] > [data-dockkit-tab]:has([data-dwe-preview-window-title]),
[data-dockkit-strip-tabs] > :not([data-dockkit-tab], [data-dockkit-caret]):has(+ [data-dockkit-tab]:has([data-dwe-preview-window-title])),
[data-dockkit-strip-tabs] > [data-dockkit-tab]:has([data-dwe-preview-window-title]):first-child + :not([data-dockkit-tab], [data-dockkit-caret]) {
  display: none !important;
}
.dwe [data-dwe-tool="delete"]:not(:disabled) { color: var(--dsw-alias-state-error-primary, #b83540); }
[data-dockkit-strip]:has([data-dockkit-tab][aria-selected="true"] [data-dwe-tab-title]) {
  --dsh-dockkit-strip-inline-start: var(--dwe-panel-inset);
}
[data-dockkit-strip]:has([data-dockkit-tab][aria-selected="true"] [data-dwe-tab-title])
  :is([data-dockkit-add-tab], [data-dockkit-split-button], [data-dockkit-strip-chrome] button),
[data-dockkit-tab]:has([data-dwe-tab-title]) [data-dockkit-tab-close] { border-radius: var(--dwe-ui-radius); }
[data-dockkit-tab]:has([data-dwe-tab-title]) {
  flex-shrink: 0; min-inline-size: calc(5em + 59px); max-inline-size: max(170px, calc(5em + 59px));
  box-sizing: border-box; block-size: var(--dwe-file-row-size);
  padding-inline: var(--dwe-file-icon-inset) 27px; border-radius: var(--dwe-ui-radius);
}
[data-dockkit-tab][aria-selected]:has([data-dwe-workspace-fold]) {
  transition: min-inline-size var(--dwe-workspace-tab-duration, 0s) ease,
    max-inline-size var(--dwe-workspace-tab-duration, 0s) ease,
    padding-inline-end var(--dwe-workspace-tab-duration, 0s) ease;
}
@media (prefers-reduced-motion: no-preference) {
  [data-dockkit-tab]:has([data-dwe-workspace-fold]) { --dwe-workspace-tab-duration: 140ms; }
}
[data-dockkit-tab][aria-selected="false"]:has([data-dwe-workspace-fold]) {
  min-inline-size: var(--dwe-file-row-size); max-inline-size: var(--dwe-file-row-size);
  padding-inline-end: var(--dwe-file-icon-inset);
}
[data-dockkit-tab][aria-selected="false"]:has([data-dwe-workspace-fold]):is(:hover:not([data-dwe-tab-wait]), :focus-visible, :has(:focus-visible)) {
  min-inline-size: min(calc(5em + 59px), var(--dwe-tab-fit-width, 100vw));
  max-inline-size: min(max(170px, calc(5em + 59px)), var(--dwe-tab-fit-width, 100vw));
  padding-inline-end: 27px;
}
[data-dockkit-tab][aria-selected="false"]:has([data-dwe-workspace-fold]) [data-dockkit-tab-close] {
  visibility: hidden; transition: visibility 0s;
}
[data-dockkit-tab][aria-selected="false"]:has([data-dwe-workspace-fold]):is(:hover:not([data-dwe-tab-wait]), :focus-visible, :has(:focus-visible)) [data-dockkit-tab-close] {
  visibility: visible; transition-delay: var(--dwe-workspace-tab-duration, 0s);
}
[data-dockkit-tab][aria-selected="false"]:has([data-dwe-workspace-fold]):hover:not(:focus-visible, :has(:focus-visible)) {
  transition-delay: var(--dwe-hover-delay);
}
[data-dockkit-tab][aria-selected="false"]:has([data-dwe-workspace-fold]):hover:not(:focus-visible, :has(:focus-visible)) [data-dockkit-tab-close] {
  transition-delay: calc(var(--dwe-hover-delay) + var(--dwe-workspace-tab-duration, 0s));
}
[data-dockkit-strip-tabs]:has(> [aria-selected="false"][data-dwe-tab-snap]) {
  scroll-snap-type: x mandatory;
  scroll-padding-inline-end: var(--dwe-left-expansion-inset, 0px);
}
[data-dwe-tab-snap] { scroll-snap-align: end; }
[data-dockkit-strip-tabs][data-dockkit-strip-scroll]:has(> [data-dwe-tab-expand-left]) { mask-image: none; }
[data-dockkit-strip-tabs][data-dockkit-strip-scroll~="start"]:has(> [data-dwe-tab-expand-left]) {
  mask-image: linear-gradient(to right, transparent, black 24px);
}
[data-dockkit-tab]:has([data-dwe-tab-title]) > [data-dockkit-tab-title] { mask-image: none; }
[data-dockkit-tab][aria-selected]:has([data-dwe-workspace-fold]):is(:hover, :focus-within, [aria-selected="true"]) > [data-dockkit-tab-title] {
  mask-image: none;
}
[data-dwe-tab-title] {
  display: flex; align-items: center; gap: 5px; min-inline-size: 0; max-inline-size: 100%;
}
[data-dwe-workspace-tab] { min-inline-size: var(--dwe-file-icon-size); }
[data-dwe-tab-title] svg { flex: none; }
[data-dwe-tab-title] > span { min-inline-size: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dwe {
  --dwe-rule-inset: var(--dwe-panel-inset);
  --dwe-blue: var(--dwe-accent, #4176E6);
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
  height: 100%;
  overflow: hidden;
  font-size: 13px;
  container-type: inline-size;
}
.dwe-folder { position: relative; display: flex; flex-direction: column; flex: 1 1 0; min-height: 0; }
.dwe[data-preview-open] {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: minmax(min(var(--dwe-folder-min, 123px), 48%), var(--dwe-upper)) 0 minmax(min(72px, 44%), var(--dwe-lower));
}
.dwe[data-workspace-mode] { --dwe-folder-min: 155px; }
.dwe-divider {
  position: relative; z-index: 2; align-self: center; height: 8px; box-sizing: border-box;
  cursor: row-resize; user-select: none; touch-action: none;
  background: linear-gradient(var(--dwe-line), var(--dwe-line)) center / 100% 1px no-repeat;
}
.dwe-divider:focus-visible {
  outline: none; background-image: linear-gradient(var(--dsw-alias-label-tertiary, #7A7A7A), var(--dsw-alias-label-tertiary, #7A7A7A));
}
.dwe-toolbar, .dwe-preview-bar {
  display: flex; flex: none; align-items: center; gap: 6px;
  padding: 3px var(--dwe-panel-inset); min-width: 0; border-bottom: 1px solid transparent;
}
.dwe-toolbar, .dwe-status-bar {
  background-image: linear-gradient(var(--dwe-hairline), var(--dwe-hairline));
  background-repeat: no-repeat; background-origin: border-box;
  background-size: calc(100% - 2 * var(--dwe-rule-inset)) 1px; background-position: center bottom;
}
.dwe-address-bar { display: flex; min-width: 0; flex: none; align-items: center; gap: 3px; padding: 5px var(--dwe-panel-inset) 0; }
.dwe-toolbar { justify-content: space-between; gap: 4px; overflow-x: auto; scrollbar-width: none; }
.dwe-toolbar-navigation > .dwe-tool > .dwe-interface-icon { scale: .8; }
.dwe :is(.dwe-toolbar .dwe-tool:not([data-dwe-tool="delete"]), .dwe-favorites-tool) .dwe-interface-icon {
  color: var(--dwe-toolbar-icon); --dwe-icon-ink: currentColor;
}
.dwe .dwe-toolbar .dwe-tool:not([data-dwe-tool="delete"]):disabled { opacity: 1; }
.dwe .dwe-toolbar .dwe-tool:not([data-dwe-tool="delete"]):disabled .dwe-interface-icon { color: var(--dwe-toolbar-icon-disabled); }
.dwe .dwe-toolbar .dwe-tool:disabled .dwe-expanding-label { opacity: .4; }
.dwe-nav { display: flex; align-items: center; gap: 2px; flex: none; }
.dwe-v-divider { flex: 0 0 1px; height: 15px; margin-inline: 3px; background: var(--dwe-line); }
.dwe button {
  font: inherit; color: inherit; border: 0; background: transparent; cursor: default;
}
.dwe :where(button) { border-radius: var(--dwe-ui-radius); }
.dwe button:focus-visible { outline: 2px solid var(--dwe-blue); outline-offset: -2px; }
.dwe-tool {
  box-sizing: border-box; width: var(--dwe-tool-size); height: var(--dwe-tool-size); flex: 0 0 var(--dwe-tool-size);
  display: grid; place-items: center; padding: 0; border-radius: var(--dwe-ui-radius);
}
.dwe-interface-icon { display: block; flex: none; }
body[data-ds-dark-theme] [data-dwe-interface-icon="file-folder-workspace"] > path { fill: #c4c4c4; }
body[data-ds-dark-theme] [data-dwe-interface-icon="file-folder-workspace"] > rect { fill: #646464; }
[data-dwe-header-proxied],
[data-dockkit-split-control]:has([data-dwe-header-proxied]) {
  visibility: hidden !important;
  pointer-events: none;
}
[data-sidebar-right-expand][data-dwe-header-proxied] { display: none !important; }
[data-dwe-wide-tabs] { position: relative; }
[data-dwe-wide-tabs] > [data-dockkit-split-control]:has([data-dwe-header-proxied]),
[data-dwe-wide-tabs] > [data-dockkit-split-button][data-dwe-header-proxied],
[data-dwe-wide-tabs] > [data-dockkit-strip-chrome]:has([data-dwe-header-proxied]):not(:has(button:not([data-dwe-header-proxied]))) {
  position: absolute; inset-inline-end: 0; inline-size: max-content;
  visibility: hidden; pointer-events: none;
}
[data-conversation-header-corner][data-dwe-shortcut-offset] {
  position: relative; align-self: stretch;
  padding-inline-end: var(--dwe-tool-size);
  margin-inline-end: -20px;
}
.dwe-sidebar-header-controls {
  position: fixed; z-index: calc(var(--dsh-dockkit-float-layer, 60) - 1);
  top: var(--dwe-shortcut-top, 8px); right: var(--dwe-shortcut-right, 8px); width: var(--dwe-tool-size);
  display: flex; flex-direction: column; align-items: center; gap: 3px;
}
.dwe-sidebar-header-controls[data-dwe-shortcuts-detached] { top: calc(var(--dwe-window-content-top, 0px) + 8px); right: 8px; }
.dwe-sidebar-header-controls[hidden] { display: none; }
.dwe-sidebar-header-controls[data-dwe-shortcuts-detached] .dwe-shortcut-extensions { display: none; }
[data-conversation-header-corner]:not(:first-child):has([data-sidebar-right-expand]:not(:disabled, [data-dwe-header-proxied]))::before {
  content: ''; flex: 0 0 1px; height: 15px; margin-inline-end: 6px;
  background: #D6D6D6;
}
.dwe-sidebar-header-controls > button, .dwe-sidebar-header-controls .dwe-extension-button,
.dwe-float-dock-button, .dwe-float-dock-add {
  display: grid; place-items: center; flex: none; box-sizing: border-box; padding: 0;
  inline-size: var(--dwe-tool-size); block-size: var(--dwe-tool-size);
  border: 1px solid var(--dwe-line); border-radius: var(--dwe-ui-radius);
  background: color-mix(in srgb, var(--dwe-tool-state-background, var(--dwe-tool-background)) var(--dwe-floating-tool-fill), transparent);
  backdrop-filter: blur(var(--dwe-floating-tool-blur));
  box-shadow: var(--dwe-floating-tool-shadow); color: #64696E; cursor: pointer;
}
.dwe-sidebar-header-controls > button[hidden] { display: none; }
.dwe-sidebar-header-controls button:disabled { color: #C0C2C4; }
body[data-ds-dark-theme] .dwe-sidebar-header-controls button { color: #C0C2C4; }
body[data-ds-dark-theme] .dwe-sidebar-header-controls button:disabled { color: #64696E; }
:is(.dwe-sidebar-header-controls > button, .dwe-shortcut-extensions .dwe-extension-button, .dwe-float-dock-add) > svg {
  display: block; width: var(--dwe-shortcut-icon-size, 16px); height: var(--dwe-shortcut-icon-size, 16px);
}
.dwe-shortcut-extensions { display: contents; }
.dwe-extension-group { display: flex; flex: none; align-items: center; gap: 2px; }
.dwe-sidebar-header-controls .dwe-extension-group {
  flex-direction: column; gap: 3px; max-height: 45vh; overflow-y: auto; scrollbar-width: none;
  padding: 8px; margin: -8px;
}
.dwe-extension-button { --dwe-icon-ink: currentColor; }
.dwe-sidebar-header-controls button:focus-visible { outline: 2px solid var(--dwe-accent); outline-offset: -2px; }
html[data-windows-titlebar]:not([data-fullscreen]) :is([data-dwe-file-preview-float], .dwe-sidebar-header-controls) {
  --dwe-window-content-top: var(--dsh-windows-titlebar-height, 36px);
}
.dwe-preview-float-dock { display: grid; gap: 3px; }
.dwe-preview-float-dock:empty { display: none; }
.dwe-float-dock-add { opacity: 0; pointer-events: none; -webkit-app-region: no-drag; }
:is(.dwe-sidebar-header-controls, .dwe-preview-float-dock):hover .dwe-float-dock-add,
.dwe-float-dock-add:focus-visible {
  opacity: 1; pointer-events: auto;
}
.dwe-float-dock-add:focus-visible { outline: 2px solid var(--dwe-accent); outline-offset: -2px; }
.dwe-float-dock-slot {
  --dwe-float-label-gap: 6px;
  width: var(--dwe-tool-size); height: var(--dwe-tool-size); position: relative;
}
.dwe-float-dock-button {
  --dwe-file-shortcut-current-marker: var(--dwe-file-shortcut-marker);
  --dwe-file-shortcut-stroke: 1.35px;
  position: absolute; right: 0; top: 0; display: grid; place-items: center;
  width: var(--dwe-tool-size); overflow: hidden;
  background-color: var(--dwe-file-shortcut-background); border-color: var(--dwe-file-shortcut-border);
  touch-action: none; -webkit-app-region: no-drag;
}
.dwe-float-dock-slot:not([data-dwe-float-dragging]):has(.dwe-float-dock-button:is(:hover, :focus-visible)) { z-index: 1; }
.dwe-float-dock-file-icon {
  position: absolute; inset-block: 0; right: 0; width: calc(var(--dwe-tool-size) - 2px);
  display: grid; place-items: center; pointer-events: none;
}
.dwe-float-dock-label {
  position: absolute; right: calc(100% + var(--dwe-float-label-gap)); top: 0;
  box-sizing: border-box; width: max-content; height: var(--dwe-tool-size);
  max-width: max(0px, calc(var(--dwe-shortcut-available-width, 100vw - 16px) - var(--dwe-tool-size) - var(--dwe-float-label-gap)));
  display: flex; align-items: center; gap: 6px; padding-inline: 8px; overflow: hidden;
  border: 1px solid var(--dwe-file-shortcut-border); border-radius: var(--dwe-ui-radius);
  background: var(--dwe-file-shortcut-background); box-shadow: var(--dwe-floating-tool-shadow);
  font: var(--dsh-content-font-size-secondary, 13px)/calc(var(--dwe-tool-size) - 2px) system-ui, sans-serif;
  color: var(--dwe-preview-tool-color); opacity: 0; transform: translateX(4px); pointer-events: none;
}
.dwe-float-dock-label-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dwe-float-dock-slot:not([data-dwe-float-dragging]) > .dwe-float-dock-button:is(:hover, :focus-visible) + .dwe-float-dock-label {
  opacity: 1; transform: translateX(0);
}
.dwe-float-dock-outline {
  position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none;
  color: var(--dwe-file-shortcut-current-marker);
  fill: none; stroke: currentColor; stroke-width: var(--dwe-file-shortcut-stroke);
}
[data-dwe-preview-mode="sidebar"] .dwe-float-dock-outline { transform: scaleX(-1); }
.dwe-float-dock-button:focus-visible { outline: 2px solid var(--dwe-accent); outline-offset: -2px; }
.dwe-float-dock-button:is([aria-pressed="true"], [data-dwe-shortcut-retracting]),
.dwe-float-dock-slot[data-dwe-float-collapsing] > .dwe-float-dock-button {
  --dwe-file-shortcut-current-marker: var(--dwe-file-shortcut-background);
  --dwe-file-shortcut-stroke: 2px;
  background-color: var(--dwe-file-shortcut-active);
}
.dwe-float-dock-add:is(:hover, :focus-visible, :active) {
  --dwe-tool-state-background: var(--dwe-tool-hover);
}
.dwe-float-dock-slot[data-dwe-float-dragging] > button { opacity: 0; }
.dwe-float-dock-slot[data-dwe-float-insert]::after {
  content: ''; position: absolute; left: 0; right: 0; height: 2px; border-radius: 2px;
  background: var(--dwe-accent); pointer-events: none; z-index: 2;
}
.dwe-float-dock-slot[data-dwe-float-insert="before"]::after { top: -2px; }
.dwe-float-dock-slot[data-dwe-float-insert="after"]::after { bottom: -2px; }
@media (prefers-reduced-motion: no-preference) {
  .dwe-float-dock-button { transition: background-color 100ms ease-out; }
  .dwe-float-dock-outline { transition: color 100ms ease-out, stroke-width 100ms ease-out; }
  .dwe-float-dock-label { transition: opacity 110ms ease-out, transform 150ms ease-out; }
  .dwe-float-dock-add { transition: opacity 150ms ease-out; }
}
.dwe-preferences {
  --dwe-preference-ink: #000;
  --dwe-preference-heading: #000;
  --dwe-preference-note: #b2b7bd;
  --dwe-preference-surface: #eff1f2;
  --dwe-preference-select-fill: #f5f6f7;
  --dwe-preference-picker-fill: var(--dsw-menu-surface-fill, #f8f9fa);
  --dwe-preference-switch-on: #0f1115;
  --dwe-preference-switch-off: #e0e0e0;
  --dwe-preference-switch-thumb: #fff;
  --dwe-preference-switch-on-thumb: var(--dwe-preference-switch-thumb);
  --dwe-preference-rule: #aab0b7;
  --dwe-preference-blue: #3f6fe6;
  --dwe-preference-control-size: calc(28em / 15);
  --dwe-preference-control-radius: calc(8em / 15);
  box-sizing: border-box; inline-size: 100%;
  padding: calc(26em / 15) clamp(calc(16em / 15), 5%, 2em) 2.8em;
  display: grid; gap: 2em; container-type: inline-size;
  font-size: var(--dsh-content-font-size, 14px); line-height: 1.25; font-weight: 400;
  color: var(--dwe-preference-ink);
}
body[data-ds-dark-theme] .dwe-preferences {
  --dwe-preference-ink: var(--dsw-alias-label-primary, #d6d9df);
  --dwe-preference-heading: var(--dsw-static-neutral-00, #fff);
  --dwe-preference-note: var(--dsw-alias-label-tertiary, #a4aab4);
  --dwe-preference-surface: var(--dsw-alias-interactive-bg-hover, #292b30);
  --dwe-preference-select-fill: #292b30;
  --dwe-preference-picker-fill: var(--dsw-menu-surface-fill, #303136);
  --dwe-preference-switch-on: var(--dsw-alias-label-primary, #d6d9df);
  --dwe-preference-switch-off: #44464e;
  --dwe-preference-switch-on-thumb: #151517;
  --dwe-preference-rule: var(--dsw-alias-border-l3, #50545b);
}
.dwe-preferences fieldset {
  min-inline-size: 0; margin: 0; padding: 0 0 2.2em;
  border: 0; border-block-end: 1px solid var(--dwe-preference-rule);
}
.dwe-preferences legend {
  padding: 0; font-size: calc(22em / 15); line-height: 1.17; font-weight: 700;
  color: var(--dwe-preference-heading);
}
.dwe-preference-rows { display: grid; gap: calc(13em / 15); padding-block-start: 2.6em; }
.dwe-preference-row {
  display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 38%);
  align-items: center; gap: calc(10em / 15); min-block-size: 2.2em;
  padding-inline-end: min(1.6%, 9px);
}
.dwe-preference-copy { min-inline-size: 0; }
.dwe-preference-copy > label { display: inline; }
.dwe-preference-icon {
  display: inline-grid; place-items: center; inline-size: var(--dwe-preference-control-size); block-size: var(--dwe-preference-control-size);
  margin-inline-start: calc(8em / 15); vertical-align: middle; border-radius: var(--dwe-preference-control-radius);
  background: var(--dwe-preference-surface); --dwe-icon-ink: var(--dwe-preference-heading);
}
.dwe-preference-icon > svg { inline-size: calc(22em / 15); block-size: calc(22em / 15); }
.dwe-preference-select { position: relative; min-inline-size: 0; }
.dwe-preference-row select {
  appearance: none; display: block; box-sizing: border-box; inline-size: 100%; min-block-size: 2.4em;
  padding-block: .35em; padding-inline: .9em 2.1em;
  border: 0; border-radius: .7em; background: var(--dwe-preference-select-fill);
  color: inherit; font: inherit; cursor: pointer; text-overflow: ellipsis;
}
.dwe-preference-chevron {
  position: absolute; inset-inline-end: 1.15em; inset-block-start: 50%;
  inline-size: .4em; block-size: .4em; border: solid currentColor; border-width: 0 .1em .1em 0;
  transform: translateY(-70%) rotate(45deg); pointer-events: none;
}
.dwe-preference-row select:hover:not(:open) {
  background: color-mix(in srgb, var(--dwe-preference-select-fill) 94%, currentColor);
}
.dwe-preference-range {
  display: flex; align-items: center; gap: .65em; min-inline-size: 0;
}
.dwe-preference-range input {
  appearance: none; margin: 0; flex: 1; min-inline-size: 0; block-size: 1.6em;
  background: transparent; cursor: pointer;
  accent-color: var(--dwe-preference-switch-on);
}
.dwe-preference-range input::-webkit-slider-runnable-track {
  block-size: .4em; border-radius: 999px; background: var(--dwe-preference-switch-off);
}
.dwe-preference-range input::-webkit-slider-thumb {
  appearance: none; block-size: 1em; inline-size: 1em; margin-block-start: -.3em; border: 0;
  border-radius: 50%; background: var(--dwe-preference-switch-on);
}
.dwe-preference-range input:focus-visible {
  outline: 1px solid currentColor; outline-offset: 3px; border-radius: 4px;
}
.dwe-preference-range output {
  flex: none; min-inline-size: 3ch; font-variant-numeric: tabular-nums; text-align: end;
}
body[data-ds-dark-theme] .dwe-preferences select { color-scheme: dark; }
@supports (appearance: base-select) and selector(::picker(select)) {
  .dwe-preference-row select, .dwe-preference-row select::picker(select) { appearance: base-select; }
  .dwe-preference-row select::picker-icon { display: none; }
  .dwe-preference-row select::picker(select) {
    position-area: block-end span-inline-start; justify-self: end;
    position-try-fallbacks: flip-block, flip-inline, flip-block flip-inline;
    box-sizing: border-box; inline-size: max-content;
    min-inline-size: min(calc(anchor-size(inline) + 1.35em), calc(100vi - 16px));
    max-inline-size: calc(100vi - 16px); max-block-size: min(19em, calc(100dvb - 16px));
    margin-block: .24em; padding: .32em; overflow: auto;
    border: 1px solid var(--dwe-hairline); border-radius: .85em;
    background: var(--dwe-preference-picker-fill); color: inherit; font: inherit;
    --dsw-elevation-stroke-color: var(--dwe-hairline);
    backdrop-filter: var(--dsw-menu-backdrop-filter, blur(12px));
    box-shadow: var(--dsw-elevation-prominent, 0 4px 14px rgb(0 0 0 / 9%));
  }
  .dwe-preference-row option {
    align-items: center; gap: .8em; min-block-size: 2.3em; padding: .45em .6em;
    box-sizing: border-box; border-radius: .5em; cursor: pointer; white-space: normal; overflow-wrap: anywhere;
  }
  .dwe-preference-row option:is(:hover, :focus-visible) {
    background: color-mix(in srgb, currentColor 7%, transparent); outline: none;
  }
  .dwe-preference-row option::checkmark {
    content: ''; order: 1; flex: 0 0 auto; margin-inline-start: auto;
    inline-size: .62em; block-size: .32em; border: solid currentColor; border-width: 0 0 .1em .1em;
    transform: translateY(-.1em) rotate(-45deg);
  }
}
.dwe-preferences button.dwe-preference-switch {
  appearance: none; display: block; justify-self: start; box-sizing: border-box;
  block-size: 1.45em; inline-size: calc(1.45em * 58 / 32); min-block-size: 0; min-inline-size: 0;
  margin: 0; padding: 0; border: 0; border-radius: 999px;
  background: none; box-shadow: none; font: inherit; cursor: pointer;
}
.dwe-preferences button.dwe-preference-switch > svg {
  display: block; inline-size: 100%; block-size: 100%; pointer-events: none;
}
.dwe-preference-switch:dir(rtl) > svg { transform: scaleX(-1); }
.dwe-preference-switch-track { fill: var(--dwe-preference-switch-off); }
.dwe-preference-switch-thumb { fill: var(--dwe-preference-switch-thumb); }
.dwe-preference-switch[aria-checked="true"] .dwe-preference-switch-track {
  fill: var(--dwe-preference-switch-on);
}
.dwe-preference-switch[aria-checked="true"] .dwe-preference-switch-thumb {
  fill: var(--dwe-preference-switch-on-thumb); transform: translateX(26px);
}
.dwe-preference-row :is(select, button):focus-visible {
  outline: 2px solid var(--dwe-preference-blue); outline-offset: 2px;
}
@media (prefers-reduced-motion: no-preference) {
  .dwe-preference-switch-track { transition: fill 140ms ease; }
  .dwe-preference-switch-thumb { transition: fill 140ms ease, transform 140ms ease; }
}
.dwe-preference-description { margin: 0; font-size: calc(11em / 15); color: var(--dwe-preference-note); }
.dwe-gesture-preferences {
  display: grid; gap: calc(5em / 15); box-sizing: border-box; inline-size: 70%;
  margin-block: .4em calc(10em / 15); padding: calc(14em / 15) calc(14em / 15) calc(13em / 15) calc(20em / 15);
  border: 1px solid var(--dwe-preference-rule); border-radius: 1.4em;
}
.dwe-gesture-preferences .dwe-preference-row {
  grid-template-columns: minmax(0, 1fr) minmax(0, 60%);
  min-block-size: var(--dwe-preference-control-size); padding-inline-end: 0;
}
@container (max-width: 25em) {
  .dwe-preference-rows { padding-block-start: 1.6em; }
  .dwe-preference-row { grid-template-columns: minmax(0, 1fr); gap: calc(8em / 15); padding-inline-end: 0; }
  .dwe-gesture-preferences { inline-size: 100%; padding-inline: .8em; }
}
.dwe-file-mark > :not([data-file-type-mark]),
.dwe-file-language:not(:has(> svg[viewBox="0 0 20 20"])),
.dwe-file-language:has(> svg[viewBox="0 0 20 20"]) + .dwe-file-mark { display: none; }
.dwe-file-mark > [data-file-type-mark] { color: var(--dsw-static-neutral-00, white); }
.dwe button:where(:not(.dwe-tool), .dwe-preview-name > .dwe-tool):hover:not(:disabled) { background: var(--dwe-hover); }
.dwe button:disabled { opacity: .4; }
.dwe :is(.dwe-address-bar, .dwe-toolbar, .dwe-status-bar) { --dwe-resting-tool-background: transparent; }
.dwe button.dwe-tool:where(:not(.dwe-preview-name > .dwe-tool)) {
  background: var(--dwe-tool-state-background, var(--dwe-resting-tool-background, var(--dwe-tool-background))); cursor: pointer;
}
:is(.dwe button.dwe-tool:where(:not(.dwe-preview-name > .dwe-tool)), .dwe-sidebar-header-controls button):is([aria-pressed="true"], [aria-expanded="true"]):not(:disabled) {
  --dwe-tool-state-background: var(--dwe-tool-active);
}
:is(.dwe button.dwe-tool:where(:not(.dwe-preview-name > .dwe-tool)), .dwe-sidebar-header-controls button):is(:hover, :active):not(:disabled) {
  --dwe-tool-state-background: var(--dwe-tool-hover);
}
:is(.dwe button.dwe-tool, .dwe-sidebar-header-controls button):disabled { cursor: default; }
.dwe-favorites {
  position: absolute; z-index: 4; display: flex; flex-direction: column; box-sizing: border-box;
  width: min(calc(10em + 53px), calc(100% - 8px)); max-height: min(250px, 50vh); overflow: hidden;
  padding: 3px 4px 4px; border: 1px solid var(--dwe-line); border-radius: var(--dwe-ui-radius);
  background: var(--dsw-alias-bg-base, Canvas); box-shadow: var(--dwe-shadow-md);
}
.dwe-favorites header {
  display: flex; align-items: center; justify-content: space-between; gap: 6px; flex: none;
  padding-inline-start: 6px; min-height: 25px;
}
.dwe-favorites[data-editing] header { justify-content: flex-start; gap: 2px; }
.dwe-favorites ul { list-style: none; margin: 0; padding: 0; overflow: auto; }
.dwe-favorites li { position: relative; display: flex; align-items: center; gap: 4px; }
.dwe-favorites li[data-dwe-favorite-drop]::after {
  content: ''; position: absolute; inset-inline: 4px; height: 2px; background: var(--dwe-blue); pointer-events: none;
}
.dwe-favorites li[data-dwe-favorite-drop='before']::after { top: 0; }
.dwe-favorites li[data-dwe-favorite-drop='after']::after { bottom: 0; }
.dwe-favorite-location {
  display: flex; flex: 1; min-width: 0; align-items: center; gap: 7px; text-align: start;
  min-height: var(--dwe-file-row-size); padding: 0 var(--dwe-file-icon-inset); border-radius: var(--dwe-ui-radius);
}
.dwe-favorite-location svg { flex: none; }
.dwe-favorite-location[aria-current] { background: color-mix(in srgb, var(--dwe-blue) 14%, transparent); }
.dwe-favorites[data-editing] li, .dwe-favorites[data-editing] .dwe-favorite-location { cursor: grab; }
.dwe-favorites[data-editing] .dwe-favorite-location:active { cursor: grabbing; }
.dwe-favorites[data-editing] .dwe-favorite-location::before {
  content: ''; flex: 0 0 2px; height: 8px; border-radius: 1px; pointer-events: none;
  background: var(--dsw-alias-label-tertiary, #777); opacity: .5;
}
.dwe-favorite-text { min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.dwe-favorites p { opacity: .72; }
.dwe-favorites p { margin: 3px 6px 6px; font-size: 12px; }
.dwe .dwe-clear-favorites { color: var(--dsw-alias-state-error-primary, #d93025); }
.dwe-favorites-exit { margin-inline-start: auto; }
.dwe-clear-favorites, .dwe-favorites-exit { padding: 3px 6px; }
.dwe-tool.dwe-expanding-tool {
  display: flex; align-items: center; justify-content: flex-start;
  width: max-content; min-width: var(--dwe-tool-size); height: var(--dwe-tool-size);
  flex: none; white-space: nowrap; border: 1px solid var(--dwe-path-surface);
}
.dwe-expanding-icon {
  display: grid; place-items: center; flex: none; width: calc(var(--dwe-tool-size) - 2px); height: 100%;
}
.dwe-expanding-label {
  display: grid; grid-template-columns: 0fr; padding-inline-end: 0;
  transition: grid-template-columns var(--dwe-expand-duration, 0s) ease,
    padding-inline-end var(--dwe-expand-duration, 0s) ease;
}
.dwe-expanding-label > span { min-width: 0; overflow: hidden; }
.dwe-expanding-tool:is([data-dwe-label-display="expanded"], [data-dwe-label-display="auto"]:is(:hover, :focus-visible):not(:disabled))
  .dwe-expanding-label {
  grid-template-columns: 1fr; padding-inline-end: 8px;
}
.dwe-expanding-tool[data-dwe-label-display="auto"]:hover:not(:focus-visible, :disabled) .dwe-expanding-label {
  transition-delay: var(--dwe-hover-delay);
}
@media (prefers-reduced-motion: no-preference) {
  .dwe-expanding-label { --dwe-expand-duration: 130ms; }
}
.dwe-search {
  display: flex; flex: none; align-items: center; gap: 6px; min-width: 0; height: 28px;
  margin: 4px var(--dwe-panel-inset); padding-inline: 7px; border: 1px solid var(--dwe-line); border-radius: var(--dwe-ui-radius);
  background: var(--dwe-tint);
}
.dwe-search:focus-within { border-color: var(--dwe-blue); }
.dwe-search > svg { flex: none; opacity: .7; }
.dwe-search input { flex: 1; min-width: 0; border: 0; padding: 0; outline: none; font: inherit; color: inherit; background: transparent; }
.dwe-row.dwe-search-hit {
  display: flex; align-items: center; gap: 7px;
  padding: 4px 8px 4px calc((33px - var(--dwe-file-icon-size)) / 2); min-height: 33px;
}
.dwe-search-hit > svg { flex: none; }
.dwe-search-hit > span { display: grid; min-width: 0; }
.dwe-search-hit > span > * { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.dwe-search-hit small { opacity: .68; }
.dwe-address {
  display: flex; align-items: center; flex: 1; min-width: 0;
}
.dwe-address input {
  flex: 1; min-width: 0; border: 0; padding: 3px 7px; outline: none;
  background: transparent; color: inherit; font: inherit;
}
.dwe-path-field {
  display: flex; align-items: center; flex: 1; min-width: 0; height: 28px;
  gap: 1px; border: 1px solid var(--dwe-path-surface); border-radius: var(--dwe-ui-radius);
  color: var(--dwe-path-muted); background: transparent;
}
.dwe-path-field:not([data-editing]):is(:hover, :has(:focus-visible)) {
  color: var(--dwe-path-hover-muted); background: var(--dwe-path-surface);
}
.dwe-path-field[data-editing] {
  border-color: var(--dwe-blue); background: var(--dwe-tint);
  color: var(--dsw-alias-label-primary, CanvasText);
}
.dwe-path-field:not(:hover) > [data-dwe-tool="star"]:not(:focus-visible) {
  opacity: 0; pointer-events: none;
}
.dwe-path {
  display: flex; align-items: center; align-self: stretch; flex: 1; min-width: 0;
  gap: 1px; white-space: nowrap; overflow: auto; scrollbar-width: none;
}
.dwe-path button, .dwe-crumb { display: flex; align-items: center; gap: 4px; flex: none; }
.dwe-path button { padding: 3px 6px; }
.dwe .dwe-path button:hover:not(:disabled) { background: transparent; }
.dwe .dwe-path-field:is(:hover, :has(:focus-visible)) .dwe-path button:is([aria-current], :hover, :focus-visible):not(:disabled) {
  color: var(--dsw-alias-label-primary, CanvasText);
}
.dwe-path button[aria-current] { font-weight: 600; }
.dwe-crumb > svg { width: 12px; --dwe-icon-muted: currentColor; }
.dwe-list { flex: 1 1 auto; min-height: 0; overflow: auto; }
.dwe-columns { display: grid; grid-template-columns: minmax(0, 1fr) 94px 70px; align-items: center; }
.dwe-columns > span { padding-inline: 8px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dwe-head {
  position: sticky; top: 0; z-index: 1; padding: 5px var(--dwe-panel-inset); font-size: 12px;
  padding-block-end: 6px;
}
.dwe-head > span { color: color-mix(in srgb, currentColor 80%, transparent); }
.dwe-head > span:first-of-type { padding-inline-start: 0; }
.dwe-head span + span { border-inline-start: 1px solid var(--dwe-line); }
.dwe-columns > span:last-child { text-align: end; }
.dwe-entries { list-style: none; margin: 0; padding: 3px var(--dwe-panel-inset); }
.dwe-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 106px), 1fr));
  gap: 4px; padding-block: 8px;
}
.dwe-row { width: 100%; text-align: start; padding: 0; min-height: var(--dwe-file-row-size); user-select: none; }
.dwe-row.dwe-columns > .dwe-name { padding-inline-start: var(--dwe-file-icon-inset); }
.dwe .dwe-tile { min-height: 99px; height: 100%; padding: 6px 5px; text-align: center; }
.dwe-tile .dwe-name { flex-direction: column; gap: 5px; }
.dwe-thumbnail {
  position: relative; display: grid; place-items: center; inline-size: 100%; max-inline-size: 110px;
  grid-template: minmax(0, 1fr) / minmax(0, 1fr); block-size: 60px; pointer-events: none;
}
.dwe-thumbnail-frame {
  position: relative; inline-size: min(100%, 97px); aspect-ratio: 154 / 95;
  overflow: hidden; border-radius: 13% / 21%; corner-shape: round;
}
.dwe-thumbnail-frame img {
  display: block; inline-size: 100%; block-size: 100%; object-fit: contain;
}
.dwe-thumbnail-frame:not([data-video]) {
  display: grid; place-items: center; grid-template: minmax(0, 1fr) / minmax(0, 1fr);
}
.dwe-thumbnail-frame:not([data-video]) img {
  inline-size: auto; block-size: auto; max-inline-size: 100%; max-block-size: 100%;
  border-radius: 13px; corner-shape: round;
}
.dwe-thumbnail-frame[data-video] img { object-fit: cover; }
.dwe-thumbnail-frame[data-video]::after {
  content: ''; position: absolute; inset: 0;
  background: linear-gradient(transparent 50%, oklch(from var(--dwe-video-overlay-ink) l c h / 46.667%));
}
.dwe-video-mark {
  position: absolute; display: flex; z-index: 1; inset-inline-start: 8.44%; inset-block-end: 15.48%; color: var(--dwe-media-light);
}
.dwe-video-mark svg { width: 7.5cqw; max-width: 8px; height: auto; }
.dwe-tile .dwe-name > span:last-child {
  flex: none; block-size: 2lh;
  display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2;
  white-space: normal; overflow-wrap: anywhere;
}
.dwe-row[aria-pressed="true"], .dwe-row[aria-pressed="true"]:hover:not(:disabled) {
  background: color-mix(in srgb, var(--dwe-blue) 20%, transparent);
}
.dwe-name, .dwe-preview-name, .dwe-preview-drag { display: flex; align-items: center; gap: 7px; }
.dwe-name svg, .dwe-preview-name svg { flex: none; }
.dwe-name > span:last-child, .dwe-preview-filename {
  min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.dwe-meta { opacity: .72; font-size: 12px; }
.dwe-status { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
.dwe-status, .dwe-status-bar .dwe-tool { color: var(--dsw-alias-label-tertiary, #7A7A7A); }
.dwe-status-bar {
  flex: none; display: flex; align-items: center; gap: 4px;
  padding: 2px var(--dwe-panel-inset); border-top: 1px solid transparent; background-position: center top;
}
.dwe-status-actions { margin-inline-start: auto; }
.dwe[data-preview-open] .dwe-status-bar:not(:hover, :focus-within) > :not(.dwe-status, [data-dwe-tool="preview"]) {
  opacity: 0; pointer-events: none;
}
@media (prefers-reduced-motion: no-preference) {
  .dwe-status-bar > :not(.dwe-status) { transition: opacity 150ms ease-out; }
}
.dwe-status-bar > .dwe-extension-group { flex: 0 1 auto; min-width: min(28px, 100%); max-width: 45%; overflow-x: auto; scrollbar-width: none; }
.dwe-preview {
  min-height: 0; display: flex; flex-direction: column;
  --dwe-preview-bar-height: calc(var(--dwe-file-row-size) + 7px);
}
.dwe-preview-mount, .dwe-preview-pane-host {
  display: flex; flex-direction: column; min-height: 0; min-width: 0; height: 100%;
}
.dwe-preview-mount[hidden] { display: none; }
.dwe-preview-pane-host > .dwe-preview { flex: 1; }
[data-dockkit-float-grip]:has([data-dwe-preview-window-title]) {
  box-sizing: border-box; height: 44px; padding-block: 0;
}
[data-dwe-preview-window-title] { display: flex; align-items: center; gap: 6px; min-width: 0; }
[data-dwe-preview-window-title] > svg { flex: none; }
[data-dwe-preview-window-title] > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
[data-dwe-file-preview-float] [data-dockkit-float-dock] { display: none !important; }
[data-dwe-file-preview-float][data-dwe-float-maximized] {
  position: fixed !important; inset: var(--dwe-window-content-top, 0px) 0 0 !important;
  width: auto !important; height: auto !important; max-width: none; max-height: none;
  border-radius: 0; margin: 0;
}
[data-dwe-float-maximized] [data-dockkit-float-resize] { display: none; }
[data-dwe-float-maximized] [data-dockkit-float-grip] { cursor: default; }
[data-dwe-file-preview-float][data-dwe-float-minimized]:not([data-dwe-float-motion]) { visibility: hidden; }
[data-dwe-file-preview-float][data-dwe-float-minimized] { pointer-events: none; }
[data-dockkit-host="float"]:has(> [data-dwe-file-preview-float][data-dwe-float-motion]),
[data-dwe-file-preview-float][data-dwe-float-motion] {
  z-index: calc(var(--dsh-dockkit-float-layer, 60) + 1) !important;
}
.dwe-preview-float-controls { display: flex; flex: none; align-items: center; gap: 3px; }
.dwe-preview-float-controls > button,
[data-dwe-file-preview-float] [data-dockkit-float-grip] > button[data-dockkit-float-close] {
  --dwe-icon-ink: currentColor;
  display: grid; place-items: center; flex: none; width: var(--dwe-tool-size); height: var(--dwe-tool-size);
  padding: 0; border: none; border-radius: var(--dwe-ui-radius); background: transparent;
  color: var(--dwe-preview-tool-color); cursor: pointer;
}
:is(.dwe-preview-float-controls > button, [data-dwe-file-preview-float] [data-dockkit-float-grip] > button[data-dockkit-float-close]):is(:hover, :active):not(:disabled) {
  background: var(--dwe-preview-header-hover, var(--dwe-tool-hover));
}
.dwe-preview-float-controls > button[data-dwe-float-action="preview-add-shortcut"]:disabled {
  color: #ADB2B8; opacity: 1; cursor: default;
}
:is(.dwe-preview-float-controls > button, [data-dwe-file-preview-float] [data-dockkit-float-grip] > button[data-dockkit-float-close]):focus-visible {
  outline: 2px solid var(--dwe-accent); outline-offset: -2px;
}
.dwe-preview-float-controls > button > svg { pointer-events: none; }
.dwe-preview-bar > .dwe-preview-float-controls { margin-inline-start: auto; pointer-events: auto; }
.dwe-preview-bar {
  --dwe-preview-header-hover: color-mix(in srgb, var(--dwe-tool-hover) 40%, transparent);
  position: relative; z-index: 1; box-sizing: border-box;
  height: var(--dwe-preview-bar-height);
  border-bottom: 0; pointer-events: none;
}
:is(.dwe-head, .dwe-preview-bar) {
  --dwe-header-rgb: 255 255 255;
  --dwe-header-rule-top: rgb(255 255 255 / 60%);
  --dwe-header-rule-bottom: rgb(128 128 128 / 10%);
  --dwe-header-rule-inset: var(--dwe-rule-inset);
}
body[data-ds-dark-theme] :is(.dwe-head, .dwe-preview-bar) {
  --dwe-header-rgb: 21 21 23;
  --dwe-header-rule-top: rgb(255 255 255 / 10%);
  --dwe-header-rule-bottom: rgb(35 35 37 / 30%);
  --dwe-header-rule-inset: 0px;
}
:is(.dwe-head, .dwe-preview-bar)::before, :is(.dwe-head, .dwe-preview-bar)::after,
:is(.dwe-head, .dwe-preview-bar) .dwe-header-blur {
  content: ''; position: absolute; inset: 0; pointer-events: none;
}
:is(.dwe-head, .dwe-preview-bar)::before {
  z-index: -4; backdrop-filter: blur(3px);
}
/* Stacked Gaussian variances add. The feathered layers raise 3px to 10px, then to 20px. */
:is(.dwe-head, .dwe-preview-bar) .dwe-header-blur {
  z-index: -3; backdrop-filter: blur(9.54px);
  mask-image: linear-gradient(to bottom, #000 75%, transparent);
}
:is(.dwe-head, .dwe-preview-bar)::after {
  z-index: -2; backdrop-filter: blur(17.32px);
  mask-image: linear-gradient(to bottom, #000 50%, transparent 75%);
}
:is(.dwe-head, .dwe-preview-bar) .dwe-header-tint {
  position: absolute; z-index: -1; inset: 0; pointer-events: none;
  background:
    linear-gradient(var(--dwe-header-rule-top), var(--dwe-header-rule-top))
      center calc(100% - 1px) / 100% 1px no-repeat,
    linear-gradient(var(--dwe-header-rule-bottom), var(--dwe-header-rule-bottom))
      center bottom / calc(100% - 2 * var(--dwe-header-rule-inset)) 1px no-repeat,
    linear-gradient(to bottom, rgb(var(--dwe-header-rgb)), rgb(var(--dwe-header-rgb) / 25%));
}
.dwe-preview-bar > .dwe-preview-tabs { pointer-events: auto; }
[data-dwe-docked-preview] > .dwe-preview-bar > .dwe-header-tint::before {
  content: ''; position: absolute; inset: 0 0 auto;
  border-block-start: .5px solid var(--dsw-alias-border-l4, var(--dwe-line));
  background: var(--dsw-alias-bg-base, var(--dwe-tool-background));
}
html[data-dwe-dock-preview-drag] [data-sidebar-right-panel] [data-dockkit-caret] { visibility: hidden; }
[data-sidebar-right-panel] [data-dockkit-pane]:has([data-dwe-docked-preview]) [data-dockkit-strip] :is(
  [data-dockkit-tab]:not(:hover, :focus-visible, :has(:focus-visible)) > [data-dockkit-tab-title],
  :is([data-dockkit-add-tab], [data-dockkit-split-button], [data-dockkit-strip-chrome] button):not(:hover, :focus-visible) > svg
) { opacity: .45; }
.dwe-preview-bar + .dwe-preview-body:has(
  > .dwe-preview-anchor > .dwe-preview-surface > :is(.dwe-image-scroll, .dwe-pdf-scroll, .dwe-office-preview),
  > .dwe-preview-anchor > .dwe-preview-surface > .dwe-text-file > .dwe-text
) {
  --dwe-preview-top-inset: var(--dwe-preview-bar-height);
  margin-block-start: calc(-1 * var(--dwe-preview-top-inset));
}
.dwe-preview-bar[data-dwe-media-header] {
  color: oklch(from var(--dwe-media-header-ink-source) l max(c, .014) var(--dwe-media-hue));
}
.dwe-preview-tabs {
  display: flex; flex: 1 1 auto; min-width: 0; align-items: center;
  padding-inline: 3px;
}
.dwe-preview-name {
  flex: 0 0 auto; max-width: 100%; height: var(--dwe-file-row-size);
  box-sizing: border-box;
}
.dwe button.dwe-preview-drag, .dwe button.dwe-preview-drag:hover:not(:disabled) {
  min-width: 0; height: 100%; width: 100%; box-sizing: border-box;
  padding-inline: var(--dwe-file-icon-inset);
  text-align: start; background: transparent; user-select: none; cursor: default;
}
.dwe-preview-bar [data-dwe-reference-only] button.dwe-preview-drag:is(:hover, :focus-visible) {
  background: var(--dwe-preview-header-hover);
}
.dwe-preview-icon { display: grid; place-items: center; flex: 0 0 var(--dwe-file-icon-size); pointer-events: none; }
.dwe-preview-drag[data-draggable] { touch-action: none; }
html[data-dwe-preview-dragging], html[data-dwe-preview-dragging] * { cursor: grabbing !important; }
html[data-dwe-preview-dragging] iframe { pointer-events: none !important; }
.dwe-preview-body {
  --dwe-preview-action-inset: 10px;
  --dwe-preview-action-gap: 6px;
  --dwe-preview-action-step: calc(var(--dwe-tool-size) + var(--dwe-preview-action-gap));
  --dwe-preview-action-start: calc(var(--dwe-preview-top-inset, 0px) + var(--dwe-preview-action-inset));
  position: relative; flex: 1 1 auto; min-height: 0; overflow: auto;
}
.dwe-preview-anchor, .dwe-preview-surface { height: 100%; min-height: 0; }
.dwe-preview-anchor { display: contents; }
.dwe-preview-anchor:empty { display: none; }
.dwe-preview-placeholder { position: absolute; inset: 0; }
.dwe-preview-body:has(.dwe-preview-media-action, .dwe-office-preview[data-dwe-outline]) { --dwe-extra-slot: var(--dwe-preview-action-step); }
.dwe button.dwe-preview-media-action {
  position: absolute; z-index: 2;
  top: var(--dwe-preview-action-start); right: 20px;
}
.dwe-preview-body > [data-dwe-extension-area="preview-actions"] {
  --dwe-extension-top: calc(var(--dwe-preview-action-start) + var(--dwe-extra-slot, 0px));
  position: absolute; z-index: 2; top: var(--dwe-extension-top); right: 12px;
  flex-direction: column; gap: var(--dwe-preview-action-gap); padding: 8px; margin-top: -8px;
  max-height: max(var(--dwe-tool-size), calc(100% - var(--dwe-extension-top))); overflow-y: auto; scrollbar-width: none;
}
.dwe-preview-body :is(button.dwe-preview-media-action, button.dwe-extension-button) {
  --dwe-icon-ink: currentColor;
  color: var(--dwe-preview-tool-color); border: 1px solid var(--dwe-line);
  background: color-mix(in srgb, var(--dwe-tool-state-background, var(--dwe-tool-background)) var(--dwe-preview-tool-fill, 50%), transparent);
  backdrop-filter: blur(6px);
  box-shadow: var(--dwe-floating-tool-shadow);
}
.dwe-preview-body :is(button.dwe-preview-media-action, button.dwe-extension-button):hover:not(:disabled) {
  --dwe-preview-tool-fill: 80%;
}
.dwe-preview-body :is(button.dwe-preview-media-action, button.dwe-extension-button):disabled {
  color: color-mix(in srgb, var(--dwe-preview-tool-color) 40%, var(--dwe-tool-background)); opacity: 1;
}
.dwe-preview-body :is(button.dwe-preview-media-action, button.dwe-extension-button) > svg {
  width: 18px; height: 18px;
}
.dwe-preview-action-error { position: absolute; z-index: 2; top: var(--dwe-preview-action-start); margin: 0 54px 0 10px; }
.dwe [data-dshpx-body="archive"] [data-dwe-archive-collapsed] > .dshpx-list { flex: 1 1 auto; min-height: 0; }
.dwe [data-dshpx-body="archive"] [data-dwe-archive-collapsed] > .dshpx-detail { flex: none; }
.dwe-archive-detail-bar {
  display: flex; align-items: center; flex: none; min-width: 0;
  min-height: var(--dwe-file-row-size); padding-inline-end: var(--dwe-panel-inset);
  border-bottom: 1px solid var(--dwe-hairline);
}
.dwe .dwe-archive-detail-bar > .dshpx-detail-head {
  flex: 1 1 auto; min-width: 0; border: 0; background: transparent;
}
.dwe-archive-detail-content:not([hidden]) { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.dwe .dwe-archive-toggle { margin-inline-start: auto; }
.dwe-html-preview { display: block; width: 100%; height: 100%; border: 0; }
.dwe-preview-cover {
  position: relative; display: grid; place-items: center; isolation: isolate;
  height: 100%; min-height: 112px; box-sizing: border-box; padding: 6px 12px;
  overflow: hidden; background: var(--dwe-tint);
}
.dwe-cover-content { display: grid; grid-template-columns: minmax(0, 1fr); justify-items: center; gap: 8px; width: 100%; }
.dwe-cover-action { display: flex; align-items: center; gap: 10px; }
.dwe .dwe-cover-open {
  padding: 7px 12px; border: 1px solid var(--dwe-line); border-radius: var(--dwe-ui-radius);
  background: var(--dsw-alias-bg-base, Canvas); white-space: nowrap; cursor: pointer;
}
.dwe-cover-details {
  display: grid; grid-template-columns: minmax(0, 1fr); justify-items: center; gap: 3px;
  max-width: 100%; min-width: 0; box-sizing: border-box; padding: 2px 8px; border-radius: 5px;
}
.dwe-cover-file { max-width: 100%; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dwe-cover-size { font-size: 12px; opacity: .72; }
.dwe-pdf-scroll {
  position: relative; overflow-anchor: none; box-sizing: border-box; height: 100%; padding-block-start: var(--dwe-preview-top-inset, 0px);
  overflow: auto; scrollbar-gutter: stable both-edges; background: var(--dwe-tint);
}
.dwe-pdf-scroll[data-dwe-pan-ready] { cursor: grab; }
.dwe-pdf-scroll:focus-visible, .dwe-image-scroll:focus-visible { outline: 2px solid var(--dwe-blue); outline-offset: -2px; }
.dwe [data-dwe-zoom-surface] { width: calc(var(--dwe-fit-width, 0px) * var(--dwe-preview-zoom, 1)); }
.dwe-pdf-page {
  height: calc(var(--dwe-fit-height) * var(--dwe-preview-zoom, 1));
  margin: 8px auto; background: white; color: #202124; box-shadow: 0 1px 3px #0002;
}
.dwe-pdf-bitmap:not([hidden]), .dwe-pdf-bitmap canvas { display: block; width: 100%; height: 100%; }
.dwe-pdf-more { height: 1px; }
.dwe-office-preview { position: relative; height: 100%; background: var(--dsw-alias-bg-base, Canvas); }
.dwe-office-frame { display: block; box-sizing: border-box; width: 100%; height: 100%; border: 0; }
.dwe-office-frame:focus { outline: none; }
.dwe-office-frame[data-loading] { position: absolute; inset: 0; visibility: hidden; pointer-events: none; }
.dwe-office-preview > .dwe-preview-hint { padding-block-start: calc(12px + var(--dwe-preview-top-inset, 0px)); }
.dwe-preview-hint {
  display: grid; place-items: center; min-height: 100%; margin: 0; padding: 12px; box-sizing: border-box;
  color: color-mix(in srgb, currentColor 62%, transparent); text-align: center; font-weight: 400;
}
.dwe-image-scroll {
  position: relative; height: 100%; overflow: hidden; touch-action: none; user-select: none;
}
.dwe-pdf-scroll[data-dwe-panning], .dwe-image-scroll[data-dwe-panning] { cursor: grabbing; }
.dwe-image {
  position: absolute; top: calc(50% + var(--dwe-preview-top-inset, 0px) / 2); left: 50%; display: block; height: auto;
  transform: translate(calc(-50% + var(--dwe-image-x, 0px)), calc(-50% + var(--dwe-image-y, 0px)));
}
.dwe-video-viewport {
  height: 100%; min-height: 0; display: grid; place-items: center; overflow: hidden;
  container-type: size; background: var(--dsw-alias-bg-base, var(--dwe-tool-background)); user-select: none;
}
.dwe-video-stage {
  position: relative; container-type: size; overflow: hidden;
  width: min(100cqw, calc(100cqh * var(--dwe-video-aspect)));
  height: min(100cqh, calc(100cqw / var(--dwe-video-aspect)));
  background: #1d1b1a; color: white;
}
.dwe-video-frame { display: block; position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; pointer-events: none; }
video.dwe-video-frame:not([data-ready]) { visibility: hidden; }
.dwe-video-intro {
  --dwe-video-play-size: clamp(22px, min(13cqw, 17cqh), 44px);
  position: absolute; inset: 0; background: rgb(0 0 0 / 26%);
}
.dwe :is(.dwe-video-start, .dwe-video-toggle, .dwe-music-play) {
  display: grid; place-items: center; flex: none; padding: 0; cursor: pointer;
}
.dwe button.dwe-video-start {
  position: absolute; top: 50%; left: 50%; translate: -50% -50%;
  width: var(--dwe-video-play-size); height: var(--dwe-video-play-size);
  box-sizing: border-box; aspect-ratio: 1; border-radius: 50%; corner-shape: round; clip-path: circle(50%);
  color: var(--dwe-video-ink);
  background: color-mix(in srgb, var(--dwe-media-light) 40%, transparent);
  backdrop-filter: blur(6px);
}
.dwe button.dwe-video-start:is(:hover, :active):not(:disabled) {
  background: color-mix(in srgb, oklch(from #f2e9e2 l c var(--dwe-media-hue)) 40%, transparent);
}
.dwe-video-start svg { width: 100%; height: 100%; }
.dwe-video-details {
  position: absolute; inset: calc(50% + var(--dwe-video-play-size) / 2 + min(3cqh, 8px)) 8px auto;
  display: grid; justify-items: center; gap: 2px; text-align: center; pointer-events: none;
}
.dwe-video-name {
  max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 700;
  font-size: clamp(9px, min(5cqh, 6cqw), 14px); line-height: 1.15;
}
.dwe-video-size { display: flex; align-items: center; gap: 3px; font-size: 10px; line-height: 1.1; }
.dwe button.dwe-video-info {
  display: grid; place-items: center; flex: none; padding: 0; width: 13px; height: 13px;
  border-radius: 50%; cursor: help; pointer-events: auto;
}
.dwe-video-info svg { display: block; width: 10px; height: 10px; }
.dwe button.dwe-video-info:is(:hover, :active):not(:disabled) { background: rgb(255 255 255 / 16%); }
.dwe-video-tooltip {
  display: none; position: absolute; bottom: calc(100% + 5px); left: 50%; translate: -50% 0;
  width: max-content; max-width: min(270px, 100%); box-sizing: border-box;
  gap: 3px; padding: 7px 9px; border-radius: 6px;
  background: rgb(15 15 16 / 85%); color: white;
  font-size: 11px; line-height: 1.35; overflow-wrap: anywhere;
}
.dwe-video-details:has(.dwe-video-info:is(:hover, :focus-visible)) .dwe-video-tooltip { display: grid; }
.dwe-video-meta-file { font-weight: 550; }
.dwe-video-message {
  position: absolute; top: 50%; left: 50%; translate: -50% -50%;
  color: white; background: rgb(15 15 16 / 60%); padding: 5px 8px; border-radius: 5px; white-space: nowrap;
}
.dwe-video-dock {
  --dwe-video-controls-size: 26px;
  position: absolute; z-index: 2; inset: auto 0 0;
  padding: 16px min(3cqw, 12px) min(3cqh, 10px);
}
.dwe-video-dock::before {
  content: ''; position: absolute; inset: 0; pointer-events: none; opacity: 1;
  background: linear-gradient(to top, rgb(0 0 0 / 40%), transparent);
  transition: opacity var(--dwe-video-bar-duration, 0s) ease-out;
}
.dwe-video-dock[data-autohide]:not(:hover, :has(:focus-visible))::before {
  opacity: 0; transition-delay: var(--dwe-media-collapse-delay);
}
.dwe-video-control-row {
  position: relative; opacity: 1; transform: translateY(0);
  transition: opacity var(--dwe-video-bar-duration, 0s) ease-out,
    transform var(--dwe-video-bar-duration, 0s) ease-out;
}
.dwe-video-dock[data-autohide]:not(:hover, :has(:focus-visible)) > .dwe-video-control-row {
  opacity: 0; transform: translateY(var(--dwe-video-bar-slide, 0px));
  transition-delay: var(--dwe-media-collapse-delay);
}
.dwe-video-controls {
  height: var(--dwe-video-controls-size); padding-inline-start: var(--dwe-video-controls-size);
  display: flex; align-items: center; border-radius: 999px;
  clip-path: inset(0 var(--dwe-video-progress-inset, 0px) 0 0 round 999px);
  transition: clip-path var(--dwe-media-collapse-duration, 0s) ease var(--dwe-video-progress-delay, 0s);
  background: color-mix(in srgb, var(--dwe-media-light) 40%, transparent);
  backdrop-filter: blur(6px); color: var(--dwe-video-ink);
  --dwe-seek-track: oklch(from #e8ddd9 l c var(--dwe-media-hue));
}
.dwe button.dwe-video-toggle {
  position: absolute; inset: 0 auto auto 0;
  width: var(--dwe-video-controls-size); height: var(--dwe-video-controls-size);
  border-radius: 50%; color: var(--dwe-video-ink);
}
.dwe-video-toggle svg { width: 14px; height: 14px; pointer-events: none; }
.dwe-video-dock[data-ended]:not([data-replay-condensed], :hover, :has(:focus-visible)) .dwe-video-controls,
.dwe-video-dock[data-ended][data-replay-condensed]
  .dwe-video-control-row:not(:has(> .dwe-video-toggle:is(:hover, :focus-visible)))
  > .dwe-video-controls:not(:hover, :has(:focus-visible)) {
  --dwe-video-progress-inset: calc(100% - var(--dwe-video-controls-size));
  --dwe-video-progress-delay: var(--dwe-media-collapse-delay);
  --dwe-video-progress-visibility: hidden;
  --dwe-video-progress-hide: calc(var(--dwe-media-collapse-delay) + var(--dwe-media-collapse-duration, 0s));
}
.dwe-video-controls > .dwe-media-progress {
  visibility: var(--dwe-video-progress-visibility, visible);
  transition: visibility 0s var(--dwe-video-progress-hide, 0s);
}
@media (prefers-reduced-motion: no-preference) {
  .dwe-video-controls, .dwe-music-capsule { --dwe-media-collapse-duration: 150ms; }
  .dwe-video-dock { --dwe-video-bar-duration: 180ms; --dwe-video-bar-slide: 10px; }
}
@starting-style {
  .dwe-video-dock[data-autohide]:not(:hover, :has(:focus-visible))::before { opacity: 1; }
  .dwe-video-dock[data-autohide]:not(:hover, :has(:focus-visible)) > .dwe-video-control-row {
    opacity: 1; transform: translateY(0);
  }
  .dwe-video-dock[data-ended] > .dwe-video-control-row {
    opacity: 0; transform: translateY(var(--dwe-video-bar-slide, 0px));
  }
  .dwe-video-controls { clip-path: inset(0 round 999px); }
  .dwe-video-controls > .dwe-media-progress { visibility: visible; }
}
.dwe-media-progress { flex: 1; display: flex; min-width: 0; align-items: center; gap: .85em; font-size: inherit; }
.dwe-media-time { flex: none; font-variant-numeric: tabular-nums; font-weight: 750; letter-spacing: .045em; }
.dwe-video-controls .dwe-media-progress {
  margin-inline: 3px 10px;
  font-size: 11px;
}
.dwe-media-seek {
  appearance: none; cursor: pointer; display: block; flex: 1; min-width: 0; width: 0; height: 16px; margin: 0;
  background: transparent; color: inherit;
}
.dwe-media-seek::-webkit-slider-runnable-track {
  height: var(--dwe-seek-height, 4px); border-radius: 999px;
  background: linear-gradient(to right, currentColor var(--dwe-media-progress), var(--dwe-seek-track) var(--dwe-media-progress));
}
.dwe-media-seek::-webkit-slider-thumb {
  appearance: none; width: var(--dwe-seek-height, 4px); height: var(--dwe-seek-height, 4px); border-radius: 50%; background: currentColor;
}
.dwe-media-seek:disabled { cursor: default; }
.dwe-music-viewport {
  position: relative; display: grid; place-items: center; overflow: hidden;
  height: 100%; min-height: 0; box-sizing: border-box; container-type: size;
  color: var(--dwe-music-ink); background: var(--dsw-alias-bg-base, Canvas);
}
.dwe-music-card, .dwe-music-capsule {
  position: relative; container-type: inline-size;
}
.dwe-music-card {
  display: flex; flex-direction: column; align-items: center;
  width: min(calc(100% - 24px), 343px); gap: clamp(10px, 4.3cqw, 16px);
}
.dwe-music-card[data-horizontal] { flex-direction: row; }
.dwe-music-cover {
  position: relative; display: grid; place-items: center; flex: none; overflow: hidden; contain: paint;
  border-radius: 50%; corner-shape: round;
  background: var(--dwe-music-control); color: var(--dwe-music-secondary);
}
.dwe-music-artwork { position: absolute; inset: 0; display: grid; place-items: center; pointer-events: none; }
.dwe-music-artwork img { width: 100%; height: 100%; object-fit: cover; position: absolute; inset: 0; }
.dwe-music-artwork svg { width: 100%; height: 100%; }
@media (prefers-reduced-motion: no-preference) {
  .dwe-music-artwork { animation: dwe-music-rotate 20s linear infinite paused; }
  .dwe-music-cover[data-playing] > .dwe-music-artwork[data-dwe-motion] { animation-play-state: running; }
}
@keyframes dwe-music-rotate { to { transform: rotate(1turn); } }
.dwe-music-card > .dwe-music-cover {
  width: 30.03cqw; height: 30.03cqw;
}
.dwe-music-card[data-horizontal] > .dwe-music-cover {
  width: min(30.03cqw, calc(100cqh - 8px)); height: min(30.03cqw, calc(100cqh - 8px));
}
.dwe button.dwe-music-play {
  position: absolute; width: var(--dwe-circle-size); height: var(--dwe-circle-size);
  border-radius: 50%; corner-shape: round; clip-path: circle(50%);
  background: var(--dwe-music-control); color: var(--dwe-music-ink);
}
.dwe button.dwe-music-play:is(:hover, :active):not(:disabled) {
  background: var(--dwe-music-control-hover);
}
.dwe .dwe-video-toggle:is(:hover, :active):not(:disabled) {
  background: oklch(from currentColor l max(c, .025) var(--dwe-media-hue) / 8%);
}
.dwe-music-play svg { width: 100%; height: 100%; }
.dwe-music-card .dwe-music-play { --dwe-circle-size: min(9.04cqw, 30cqh); }
.dwe-music-details { min-width: 0; display: grid; gap: 2.6cqw; }
.dwe-music-card > .dwe-music-details { width: 68%; }
.dwe-music-card[data-horizontal] > .dwe-music-details { flex: 1; width: auto; gap: min(2.6cqw, 6cqh); }
.dwe-music-title, .dwe-music-artist { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dwe-music-title-track { display: block; overflow: hidden; text-overflow: ellipsis; }
.dwe-music-title-track > [aria-hidden] { display: none; }
@media (prefers-reduced-motion: no-preference) {
  .dwe-music-title[data-scrolling] > .dwe-music-title-track {
    position: relative; display: flex; gap: 1.25em; width: max-content;
    animation: dwe-music-marquee var(--dwe-marquee-duration) linear infinite paused;
  }
  .dwe-music-title[data-scrolling] > .dwe-music-title-track[data-dwe-motion] { animation-play-state: running; }
  .dwe-music-title[data-scrolling] > .dwe-music-title-track > [aria-hidden] { display: block; }
}
@keyframes dwe-music-marquee { to { transform: translateX(calc(-50% - .625em)); } }
.dwe-music-title { font-size: clamp(15px, 6.85cqw, 24px); line-height: 1.15; font-weight: 750; }
.dwe-music-artist { font-size: clamp(11px, 4.45cqw, 16px); line-height: 1.2; font-weight: 450; color: var(--dwe-music-secondary); }
.dwe-music-details .dwe-media-progress { font-size: clamp(9px, 3cqw, 11px); }
.dwe-music-card[data-horizontal] .dwe-music-title { font-size: min(clamp(15px, 6.85cqw, 24px), 25cqh); }
.dwe-music-card[data-horizontal] .dwe-music-artist { font-size: min(clamp(11px, 4.45cqw, 16px), 19cqh); }
.dwe-music-card[data-horizontal] .dwe-media-progress { font-size: min(clamp(9px, 3cqw, 11px), 18cqh); }
.dwe-music-card[data-horizontal] .dwe-media-seek { height: min(16px, 24cqh); }
.dwe .dwe-music-restore {
  color: oklch(from var(--dsw-alias-label-tertiary, #7a7a7a) l max(c, .022) var(--dwe-media-hue));
}
.dwe .dwe-music-restore:is(:hover, :active, :focus-visible):not(:disabled) {
  color: oklch(from var(--dwe-media-action-hover-source) l max(c, .022) var(--dwe-media-hue));
}
.dwe-music-error { position: absolute; top: calc(100% + 2px); width: 100%; text-align: center; font-size: 10px; color: var(--dwe-music-secondary); }
.dwe.dwe-music-float {
  position: fixed; z-index: 300; inset: auto 16px 20px auto; height: auto;
  width: min(202px, calc((100vw - 32px) / 2)); overflow: visible; container-type: normal;
  pointer-events: none;
  filter: drop-shadow(0 3px 7px oklch(from rgb(55 32 20 / 24%) l c var(--dwe-media-hue) / alpha));
}
.dwe.dwe-music-float[data-dwe-in-conversation] {
  inset: var(--dwe-capsule-top) var(--dwe-capsule-right) auto auto;
  width: min(202px, calc(var(--dwe-capsule-width) / 2));
}
.dwe.dwe-music-float[data-dwe-positioned] { inset: var(--dwe-capsule-y) auto auto var(--dwe-capsule-x); }
.dwe-music-capsule {
  --dwe-capsule-ratio: calc(120 / 404);
  --dwe-capsule-travel: calc(1 - var(--dwe-capsule-ratio));
  --dwe-capsule-delay: 0s;
  --dwe-capsule-duration: var(--dwe-media-collapse-duration, 0s);
  display: grid; align-items: center; grid-template-columns: 26.4% minmax(0, 1fr) 28px; column-gap: 6.4%;
  box-sizing: border-box; height: auto; aspect-ratio: 404 / 120; padding: 0 6% 0 3%;
  border-radius: 999px; corner-shape: round;
  background: var(--dwe-music-surface); color: var(--dwe-music-ink);
  pointer-events: auto; user-select: none; touch-action: none; clip-path: inset(0 round 999px);
  transition: clip-path var(--dwe-capsule-duration) ease var(--dwe-capsule-delay);
}
.dwe-music-capsule[data-dwe-dragging] { cursor: grabbing; }
.dwe-music-capsule:not(:hover, :has(:focus-visible), [data-dwe-dragging]) {
  --dwe-capsule-delay: var(--dwe-media-collapse-delay);
  clip-path: inset(0 calc(100% * var(--dwe-capsule-travel)) 0 0 round 999px);
}
.dwe-music-capsule > .dwe-music-cover {
  --dwe-capsule-cover-size: 26.4cqw;
  position: absolute; z-index: 1;
  left: calc(50% * var(--dwe-capsule-ratio)); top: 50%; translate: -50% -50%;
  width: var(--dwe-capsule-cover-size); height: var(--dwe-capsule-cover-size);
  transition: width var(--dwe-capsule-duration) ease var(--dwe-capsule-delay),
    height var(--dwe-capsule-duration) ease var(--dwe-capsule-delay);
}
.dwe-music-capsule:not(:hover, :has(:focus-visible), [data-dwe-dragging]) > .dwe-music-cover {
  /* Container units exclude the capsule's 9% horizontal padding. */
  --dwe-capsule-cover-size: calc(100cqw / .91 * var(--dwe-capsule-ratio));
}
.dwe-music-capsule :is(.dwe-music-details, .dwe-music-restore, .dwe-music-play) {
  transition: opacity var(--dwe-capsule-duration) ease var(--dwe-capsule-delay), visibility 0s;
}
.dwe-music-capsule:not(:hover, :has(:focus-visible), [data-dwe-dragging]) :is(.dwe-music-details, .dwe-music-restore, .dwe-music-play) {
  opacity: 0; visibility: hidden;
  transition-delay: var(--dwe-capsule-delay), calc(var(--dwe-capsule-delay) + var(--dwe-capsule-duration));
}
@starting-style {
  .dwe-music-capsule:not(:hover, :has(:focus-visible), [data-dwe-dragging]) { clip-path: inset(0 round 999px); }
  .dwe-music-capsule:not(:hover, :has(:focus-visible), [data-dwe-dragging]) > .dwe-music-cover {
    --dwe-capsule-cover-size: 26.4cqw;
  }
  .dwe-music-capsule:not(:hover, :has(:focus-visible), [data-dwe-dragging]) :is(.dwe-music-details, .dwe-music-restore, .dwe-music-play) {
    opacity: 1; visibility: visible;
  }
}
.dwe-music-capsule > .dwe-music-details { grid-column: 2; }
.dwe-music-capsule > .dwe-music-restore { grid-column: 3; }
.dwe-music-capsule .dwe-music-play {
  --dwe-circle-size: 13.2cqw;
  background: color-mix(in srgb, var(--dwe-music-control) 94%, transparent);
  box-shadow: inset 0 0 0 .7cqw oklch(from var(--dwe-media-light) l c h / 22%);
}
.dwe-music-capsule .dwe-music-details { --dwe-capsule-text-size: clamp(9px, 7cqw, 13px); gap: 2.1cqw; }
.dwe-music-capsule :is(.dwe-music-title, .dwe-music-details .dwe-media-progress) { font-size: var(--dwe-capsule-text-size); }
.dwe-music-capsule .dwe-media-progress { gap: .4em; }
.dwe-music-capsule .dwe-media-seek { --dwe-seek-height: 3px; height: 14px; }
.dwe-text {
  box-sizing: border-box; height: 100%; overflow: auto; overflow-anchor: none;
  margin: 0; padding: calc(12px + var(--dwe-preview-top-inset, 0px)) 12px 12px;
  white-space: pre-wrap; overflow-wrap: anywhere; font: 12px/18.6px monospace;
}
.dwe-text-limit { margin: 18.6px 0 0; }
.dwe-text-file { position: relative; display: flex; flex-direction: column; height: 100%; min-height: 0; }
.dwe-text-file > :is(.dwe-text, .dwe-preview-hint) { flex: 1; min-height: 0; }
.dwe button.dwe-selection-quote {
  --dwe-quote-fill: var(--dsw-alias-markdown-tag, var(--dwe-preview-tab-active));
  position: absolute; z-index: 2; box-sizing: border-box; height: var(--dwe-file-row-size);
  max-width: calc(100% - 12px); padding: 0 10px; border: 1px solid currentColor;
  border-radius: var(--dsw-radius-sm, var(--dwe-ui-radius));
  background: var(--dwe-quote-fill);
  color: var(--dsw-alias-label-link, #3262e9); box-shadow: var(--dwe-floating-tool-shadow);
  font-size: var(--dsh-content-font-size-secondary, 13px); font-weight: 400; line-height: 1.4;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: pointer;
}
.dwe button.dwe-selection-quote:hover:not(:disabled) {
  background-color: color-mix(in srgb, var(--dwe-quote-fill) 90%, black);
}
.dwe-message-quote {
  color: var(--dsw-alias-label-link, #3262e9); white-space: pre-wrap; overflow-wrap: anywhere;
  font: inherit; padding: 0; border: 0; background: transparent; max-inline-size: 100%; text-align: start;
}
button.dwe-message-quote { cursor: pointer; }
button.dwe-message-quote:hover { text-decoration: underline; }
.dwe-text-pages {
  display: flex; flex: none; justify-content: flex-end; gap: 6px; padding: 3px 8px;
  border-top: 1px solid var(--dwe-hairline);
}
.dwe-text-pages button { padding: 3px 8px; }
.dwe-message { padding: 0 12px; margin: 12px 0; overflow-wrap: anywhere; }
.dwe-error { color: var(--dsw-alias-state-error-primary, #cf4d52); }
.dwe-path-drop-frame {
  position: fixed; z-index: calc(var(--dsh-dockkit-float-layer, 60) - 1); pointer-events: none; box-sizing: border-box;
  margin: 0 4px 4px; border: 4px solid var(--dwe-accent, #4176E6);
}
.dwe-path-drop-frame[data-drop-frame="tabs"] { margin: 0; }
.dwe-path-drop-frame[data-active] { border-width: 8px; }
.dwe-path-drop-frame[data-drop-frame="conversation"]::before {
  content: ''; position: absolute; inset: 0; border-radius: inherit; opacity: 0;
  background: color-mix(in srgb, var(--dsw-alias-bg-base, Canvas) 16%, transparent);
  backdrop-filter: blur(7.5px);
}
.dwe-path-drop-frame[data-drop-frame="conversation"][data-active]::before { opacity: 1; }
@media (prefers-reduced-motion: no-preference) {
  .dwe-path-drop-frame[data-drop-frame="conversation"]::before { transition: opacity 140ms ease-out; }
  .dwe-conversation-drop-area::before,
  .dwe-path-drop-frame {
    transition: border-width 100ms ease-out;
  }
  @starting-style {
    .dwe-conversation-drop[data-dwe-drop-active] .dwe-conversation-drop-area::before,
    .dwe-path-drop-frame[data-active] { border-width: 4px; }
  }
}
.dwe-file-menu {
  position: fixed; z-index: 100000; box-sizing: border-box; min-width: 172px;
  display: grid; gap: 6px; padding: 4px;
  max-width: calc(100vw - 8px); max-height: calc(100dvh - 8px); overflow: auto; scrollbar-width: thin;
  color: var(--dsw-alias-label-primary, CanvasText);
}
.dwe-file-menu-panel {
  min-width: 0; padding: 4px; border-radius: var(--dsw-radius-lg, 12px);
  background: var(--dsw-menu-surface-fill, var(--dwe-file-menu-surface));
  backdrop-filter: var(--dsw-menu-backdrop-filter, blur(12px));
  --dsw-elevation-stroke-color: var(--dwe-hairline);
  box-shadow: var(--dsw-elevation-prominent, 0 0 0 .5px var(--dwe-hairline), var(--dwe-floating-tool-shadow));
}
.dwe-file-menu button {
  display: flex; align-items: center; gap: 6px; box-sizing: border-box; width: 100%; min-height: 34px; padding: 6px 8px;
  border: 0; border-radius: var(--dsw-radius-md, var(--dwe-ui-radius)); background: transparent; color: inherit;
  font: inherit; font-size: 13px; font-weight: 400; line-height: 20px; text-align: start; cursor: pointer;
}
.dwe-file-menu button > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dwe-file-menu-divider { height: .5px; margin: 3px 8px; background: var(--dsw-alias-border-l2, var(--dwe-line)); }
.dwe-file-menu button:disabled { opacity: .4; cursor: default; }
.dwe-file-menu button:not(:disabled):is(:hover, :focus-visible) {
  background: var(--dsw-alias-interactive-bg-hover, var(--dwe-tool-hover)); outline: none;
}
.dwe-file-menu svg { display: block; flex: none; width: 14px; height: 14px; color: var(--dsw-alias-menu-icon, currentColor); }
.dwe-file-menu :is([data-dwe-action="delete"], [data-dwe-destructive]):not(:disabled) {
  color: var(--dsw-alias-state-error-primary, #b83540);
}
.dwe-file-menu :is([data-dwe-action="delete"], [data-dwe-destructive]) > svg {
  color: inherit; --dwe-icon-ink: currentColor;
}
.dwe-file-dialog {
  box-sizing: border-box; width: min(340px, calc(100vw - 24px)); padding: 16px;
  border: 1px solid var(--dwe-line); border-radius: 10px;
  color: var(--dsw-alias-label-primary, CanvasText); background: var(--dsw-alias-bg-base, Canvas);
  box-shadow: var(--dwe-shadow-lg);
}
.dwe-file-dialog::backdrop { background: var(--dsw-alias-bg-mask-1, rgb(0 0 0 / 25%)); }
.dwe-file-dialog h2 { margin: 0 0 12px; font-size: 15px; }
.dwe-file-dialog label { display: grid; gap: 5px; }
.dwe-file-dialog input {
  min-width: 0; padding: 6px 8px; border-radius: 5px; border: 1px solid var(--dwe-line);
  background: var(--dwe-tint); color: inherit; font: inherit;
}
.dwe-file-dialog p { color: var(--dsw-alias-state-error-primary, #cf4d52); }
.dwe-delete-path { overflow-wrap: anywhere; margin-bottom: 12px; }
.dwe-delete-paths { max-height: 180px; overflow: auto; padding-inline-start: 20px; }
.dwe-delete-paths li + li { margin-top: 4px; }
.dwe-dialog-actions { display: flex; justify-content: flex-end; gap: 6px; margin-top: 12px; }
.dwe-dialog-actions button { padding: 5px 12px; border-radius: var(--dwe-ui-radius); border: 1px solid var(--dwe-line); }
.dwe-dialog-actions button[type="submit"] { background: color-mix(in srgb, var(--dwe-blue) 23%, transparent); }
.dwe-dialog-actions button[data-dwe-action="delete"] { background: #ad303d; color: #fff; }
.dwe-dialog-actions button[data-dwe-action="delete"]:hover:not(:disabled) { background: #942634; }
@container (max-width: 380px) {
  .dwe-columns { grid-template-columns: minmax(0, 1fr) min(62px, 30%); }
  .dwe-columns > .dwe-type-column { display: none; }
}
`;
