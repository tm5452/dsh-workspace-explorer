export const explorerCss = `
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
  position: fixed; inset: 0; z-index: 2147483647;
  display: grid; box-sizing: border-box; padding: 0 6px 6px 3px;
  --dwe-drop-blue: #4176E6;
  pointer-events: none; user-select: none;
}
.dwe-conversation-drop-area {
  position: relative; display: grid; place-items: center; padding: 24px;
  border-radius: 10px; overflow: hidden;
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
  background: var(--dsw-alias-bg-base, Canvas); box-shadow: 0 2px 8px #0004;
  transform: translate3d(clamp(0px, var(--dwe-drag-x), 100vw - 44px), clamp(0px, var(--dwe-drag-y), 100vh - 44px), 0);
}
.dwe-sidebar-tab-drag {
  position: fixed; top: 0; left: 0; z-index: 2147483647;
  display: grid; place-items: center; width: 36px; height: 36px;
  border-radius: 9px; pointer-events: none; user-select: none;
  color: var(--dsw-alias-label-primary, CanvasText);
  background: var(--dsw-alias-bg-base, Canvas);
  box-shadow: 0 2px 8px #0004;
  transform: translate3d(clamp(0px, var(--dwe-drag-x), 100vw - 40px), clamp(0px, var(--dwe-drag-y), 100vh - 40px), 0);
}
.dwe-sidebar-tab-drag > :is(svg, img) { width: 22px; height: 22px; object-fit: contain; }
[data-dwe-mouse-gesture-tracking] :is(iframe, webview, object, embed) { pointer-events: none !important; }
.dwe-mouse-gesture {
  position: fixed; inset: 0; z-index: 2147483647;
  display: grid; place-items: center; pointer-events: none; user-select: none;
}
.dwe-mouse-gesture-trail {
  position: absolute; inset: 0; width: 100%; height: 100%;
  fill: none; stroke: #3262E9; stroke-width: 6px; stroke-linecap: round; stroke-linejoin: round;
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
  width: 46px; height: 46px; fill: none; stroke: currentColor; stroke-width: 2;
  stroke-linecap: round; stroke-linejoin: round;
}
.dwe-mouse-gesture[data-action="left"] .dwe-mouse-gesture-badge svg { transform: rotate(180deg); }
.dwe-mouse-gesture[data-action="up"] .dwe-mouse-gesture-badge svg { transform: rotate(-90deg); }
.dwe-host { height: 100%; min-height: 0; min-width: 0; }
[data-dockkit-tab]:has([data-dwe-tab-title]) {
  flex-shrink: 0; min-inline-size: calc(5em + 59px); max-inline-size: max(170px, calc(5em + 59px));
  box-sizing: border-box; padding-inline-end: 27px;
}
[data-dockkit-tab]:has([data-dwe-tab-title]) > [data-dockkit-tab-title] { mask-image: none; }
[data-dwe-tab-title] {
  display: flex; align-items: center; gap: 5px; min-inline-size: 0; max-inline-size: 100%;
}
[data-dwe-tab-title] svg { flex: none; }
[data-dwe-tab-title] > span { min-inline-size: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dwe {
  --dwe-line: var(--dsw-alias-border-l3, color-mix(in srgb, currentColor 14%, transparent));
  --dwe-rule-inset: 8px;
  --dwe-tint: color-mix(in srgb, currentColor 5%, transparent);
  --dwe-hover: color-mix(in srgb, currentColor 8%, transparent);
  --dwe-blue: #458bf5;
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
  outline: none; background-image: linear-gradient(#7A7A7A, #7A7A7A);
}
.dwe-toolbar, .dwe-preview-bar {
  display: flex; flex: none; align-items: center; gap: 6px;
  padding: 3px 8px; min-width: 0; border-bottom: 1px solid transparent;
}
.dwe-toolbar, .dwe-head, .dwe-status-bar, .dwe-preview-bar {
  background-image: linear-gradient(#F5F5F5, #F5F5F5);
  background-repeat: no-repeat; background-origin: border-box;
  background-size: calc(100% - 2 * var(--dwe-rule-inset)) 1px; background-position: center bottom;
}
.dwe-address-bar { display: flex; min-width: 0; flex: none; align-items: center; gap: 3px; padding: 5px 8px 0; }
.dwe-toolbar { justify-content: space-between; gap: 4px; overflow-x: auto; scrollbar-width: none; }
.dwe-nav { display: flex; align-items: center; gap: 2px; flex: none; }
.dwe-v-divider { flex: 0 0 1px; height: 15px; margin-inline: 3px; background: var(--dwe-line); }
.dwe button {
  font: inherit; color: inherit; border: 0; background: transparent; cursor: default;
}
.dwe button:focus-visible { outline: 2px solid var(--dwe-blue); outline-offset: -2px; }
.dwe-tool {
  width: 28px; height: 28px; flex: 0 0 28px; display: grid; place-items: center; border-radius: 5px;
}
.dwe button:hover:not(:disabled) { background: var(--dwe-hover); }
.dwe button:disabled { opacity: .4; }
.dwe-tool[aria-pressed="true"], .dwe-tool[aria-pressed="true"]:hover {
  background: color-mix(in srgb, var(--dwe-blue) 20%, transparent);
}
.dwe-tool[data-dwe-tool="star"][aria-pressed="true"] svg { color: #a36a00; fill: #ffca58; }
.dwe-tool:is(.dwe-scope-tool, .dwe-favorites-tool, [data-dwe-tool="preview"], [data-dwe-tool="recent"], [data-dwe-tool="list"], [data-dwe-tool="grid"]) {
  &:is([aria-pressed="true"], [aria-expanded="true"]) { background: var(--dwe-hover); }
  &:hover:not(:disabled) { background: color-mix(in srgb, var(--dwe-blue) 20%, transparent); }
}
.dwe-favorites {
  position: absolute; z-index: 4; display: flex; flex-direction: column; box-sizing: border-box;
  width: min(calc(10em + 53px), calc(100% - 8px)); max-height: min(250px, 50vh); overflow: hidden;
  padding: 3px 4px 4px; border: 1px solid var(--dwe-line); border-radius: 7px;
  background: var(--dsw-alias-bg-base, Canvas); box-shadow: 0 4px 16px #0003;
}
.dwe-favorites header {
  display: flex; align-items: center; justify-content: space-between; gap: 6px; flex: none;
  padding-inline-start: 6px; min-height: 25px;
}
.dwe-favorites ul { list-style: none; margin: 0; padding: 0; overflow: auto; }
.dwe-favorites li { position: relative; display: flex; align-items: center; gap: 4px; }
.dwe-favorites li[data-dwe-favorite-drop]::after {
  content: ''; position: absolute; inset-inline: 4px; height: 2px; background: var(--dwe-blue); pointer-events: none;
}
.dwe-favorites li[data-dwe-favorite-drop='before']::after { top: 0; }
.dwe-favorites li[data-dwe-favorite-drop='after']::after { bottom: 0; }
.dwe-favorite-location {
  display: flex; flex: 1; min-width: 0; align-items: center; gap: 7px; text-align: start;
  min-height: 28px; padding: 2px 4px; border-radius: 5px;
}
.dwe-favorite-location svg { flex: none; }
.dwe-favorite-location[aria-current] { background: color-mix(in srgb, var(--dwe-blue) 14%, transparent); }
.dwe-favorite-text { min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.dwe-favorites p { opacity: .72; }
.dwe-favorites p { margin: 3px 6px 6px; font-size: 12px; }
.dwe-clear-favorites { padding: 3px 6px; border-radius: 4px; }
.dwe-tool.dwe-favorites-tool, .dwe-tool.dwe-scope-tool {
  width: auto; flex: 0 0 auto; padding-inline: 8px; white-space: nowrap;
  border: 1px solid color-mix(in srgb, currentColor 24%, transparent);
}
.dwe-tool.dwe-favorites-tool { display: flex; align-items: center; justify-content: center; gap: 4px; }
.dwe-favorites-tool svg { flex: none; }
.dwe-search {
  display: flex; flex: none; align-items: center; gap: 6px; min-width: 0; height: 28px;
  margin: 4px 8px; padding-inline: 7px; border: 1px solid var(--dwe-line); border-radius: 6px;
  background: var(--dwe-tint);
}
.dwe-search:focus-within { border-color: var(--dwe-blue); }
.dwe-search > svg { flex: none; opacity: .7; }
.dwe-search input { flex: 1; min-width: 0; border: 0; padding: 0; outline: none; font: inherit; color: inherit; background: transparent; }
.dwe-search-hit { display: flex; align-items: center; gap: 7px; padding: 4px 8px; min-height: 33px; }
.dwe-search-hit > svg { flex: none; }
.dwe-search-hit > span { display: grid; min-width: 0; }
.dwe-search-hit > span > * { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.dwe-search-hit small { opacity: .68; }
.dwe-address {
  display: flex; align-items: center; flex: 1; min-width: 0; height: 28px;
  border: 1px solid var(--dwe-blue); border-radius: 6px; background: var(--dwe-tint);
}
.dwe-address input {
  flex: 1; min-width: 0; border: 0; padding: 3px 7px; outline: none;
  background: transparent; color: inherit; font: inherit;
}
.dwe-path {
  display: flex; align-items: center; flex: 1; min-width: 0; height: 28px;
  gap: 1px; border: 1px solid var(--dwe-line); border-radius: 6px;
  background: var(--dwe-tint); white-space: nowrap; overflow: auto; scrollbar-width: none;
}
.dwe-path button, .dwe-crumb { display: flex; align-items: center; gap: 4px; flex: none; }
.dwe-path button { padding: 3px 6px; border-radius: 4px; }
.dwe-path button[aria-current] { font-weight: 600; }
.dwe-crumb > svg { opacity: .55; width: 12px; }
.dwe-list { flex: 1 1 auto; min-height: 0; overflow: auto; }
.dwe-columns { display: grid; grid-template-columns: minmax(0, 1fr) 94px 70px; align-items: center; }
.dwe-columns > span { padding-inline: 8px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dwe-head {
  position: sticky; top: 0; z-index: 1; padding: 5px 6px; font-size: 12px;
  background-color: var(--dsw-alias-bg-base, Canvas); border-bottom: 1px solid transparent;
}
.dwe-head span + span { border-inline-start: 1px solid var(--dwe-line); }
.dwe-columns > span:last-child { text-align: end; }
.dwe-entries { list-style: none; margin: 0; padding: 3px 6px; }
.dwe-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 106px), 1fr));
  gap: 4px; padding: 8px;
}
.dwe-row { width: 100%; text-align: start; padding: 0; min-height: 29px; border-radius: 4px; user-select: none; }
.dwe .dwe-tile { min-height: 99px; height: 100%; padding: 6px 5px; text-align: center; }
.dwe-tile .dwe-name { flex-direction: column; gap: 5px; }
.dwe-thumbnail {
  position: relative; display: grid; place-items: center; inline-size: 100%; max-inline-size: 110px;
  grid-template: minmax(0, 1fr) / minmax(0, 1fr); block-size: 60px; pointer-events: none;
}
.dwe-thumbnail img {
  display: block; max-inline-size: 100%; max-block-size: 100%; object-fit: contain; border-radius: 3px;
  box-shadow: 0 1px 4px #0003;
}
.dwe-video-mark {
  position: absolute; inset-inline-end: 5px; inset-block-end: 3px;
  padding: 1px 4px; border-radius: 3px; background: #000b; color: #fff; font-size: 9px;
}
.dwe-tile .dwe-name > span:last-child {
  display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2;
  white-space: normal; overflow-wrap: anywhere;
}
.dwe-row[aria-pressed="true"], .dwe-row[aria-pressed="true"]:hover:not(:disabled) {
  background: color-mix(in srgb, var(--dwe-blue) 20%, transparent);
}
.dwe-name, .dwe-preview-name { display: flex; align-items: center; gap: 7px; }
.dwe-name svg, .dwe-preview-name svg { flex: none; }
.dwe-name > span:last-child, .dwe-preview-name > span {
  min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.dwe-meta { opacity: .72; font-size: 12px; }
.dwe-status { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
.dwe-status, .dwe-status-bar .dwe-tool svg, .dwe-preview-bar > [data-dwe-tool="external"] svg { color: #7A7A7A; }
.dwe-status-bar:hover .dwe-tool svg { color: #000; }
.dwe-status-bar {
  flex: none; display: flex; align-items: center; gap: 4px;
  padding: 2px 8px; border-top: 1px solid transparent; background-position: center top;
}
.dwe-status-bar > [data-dwe-tool="recent"] { margin-inline-start: auto; }
.dwe-preview {
  min-height: 0; display: flex; flex-direction: column;
}
.dwe-preview-bar { background-color: var(--dsw-alias-bg-base, Canvas); }
.dwe-preview-label { flex: none; margin-inline: 4px; line-height: 28px; }
.dwe-preview-name {
  min-width: 0; height: 28px; box-sizing: border-box; padding-inline: 8px 4px;
  border-radius: 6px; background-color: #F1F3F5;
}
body[data-ds-dark-theme] .dwe-preview-name { color: #212529; }
.dwe-preview-name > .dwe-tool { width: 22px; height: 22px; flex-basis: 22px; padding: 0; }
.dwe-preview-bar > .dwe-tool { margin-inline-start: auto; }
.dwe-preview-body { flex: 1 1 auto; min-height: 0; overflow: auto; }
.dwe-preview-cover {
  position: relative; display: grid; place-items: center; isolation: isolate;
  height: 100%; min-height: 112px; box-sizing: border-box; padding: 6px 12px;
  overflow: hidden; background: var(--dwe-tint);
}
.dwe-preview-cover[data-video] { min-height: 128px; }
.dwe-preview-cover[data-poster] { background: #15171a; }
.dwe-preview-cover > img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; z-index: -1; }
.dwe-cover-content { display: grid; grid-template-columns: minmax(0, 1fr); justify-items: center; gap: 8px; width: 100%; }
.dwe-cover-action { display: flex; align-items: center; gap: 10px; }
.dwe .dwe-cover-play {
  display: grid; place-items: center; width: 52px; height: 52px; padding: 0; box-sizing: border-box;
  border-radius: 50%; corner-shape: round;
  background: #243953; color: #fff; box-shadow: 0 2px 8px #0003; cursor: pointer;
}
.dwe .dwe-cover-play:hover:not(:disabled) { background: #34577f; }
.dwe .dwe-cover-open {
  padding: 7px 12px; border: 1px solid var(--dwe-line); border-radius: 6px;
  background: var(--dsw-alias-bg-base, Canvas); white-space: nowrap; cursor: pointer;
}
.dwe-cover-details {
  display: grid; grid-template-columns: minmax(0, 1fr); justify-items: center; gap: 3px;
  max-width: 100%; min-width: 0; box-sizing: border-box; padding: 2px 8px; border-radius: 5px;
}
.dwe-cover-file { max-width: 100%; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dwe-cover-size { font-size: 12px; opacity: .72; }
.dwe-preview-cover[data-video] .dwe-cover-details {
  position: absolute; inset: 0 0 auto; display: flex; align-items: center; gap: 6px;
  padding: 8px; border-radius: 0; background: #0009; color: #fff;
}
.dwe-preview-cover[data-video] .dwe-cover-size { flex: none; white-space: nowrap; }
.dwe-pdf-scroll {
  height: 100%; overflow: auto; scrollbar-gutter: stable both-edges; background: var(--dwe-tint);
}
.dwe-pdf-scroll[data-dwe-pan-ready] { cursor: grab; }
.dwe-pdf-scroll:focus-visible, .dwe-image-scroll:focus-visible { outline: 2px solid var(--dwe-blue); outline-offset: -2px; }
.dwe [data-dwe-zoom-surface] { width: calc(var(--dwe-fit-width) * var(--dwe-preview-zoom, 1)); }
.dwe-pdf-page {
  height: calc(var(--dwe-fit-height) * var(--dwe-preview-zoom, 1));
  margin: 8px auto; background: white; color: #202124; box-shadow: 0 1px 3px #0002;
}
.dwe-pdf-page canvas:not([hidden]) { display: block; width: 100%; height: 100%; }
.dwe-pdf-more { height: 1px; }
.dwe-preview-hint {
  display: grid; place-items: center; min-height: 100%; margin: 0; padding: 12px; box-sizing: border-box;
  color: color-mix(in srgb, currentColor 62%, transparent); text-align: center; font-weight: 400;
}
.dwe-image-scroll {
  position: relative; height: 100%; overflow: hidden; cursor: grab; touch-action: none; user-select: none;
}
.dwe-pdf-scroll[data-dwe-panning], .dwe-image-scroll[data-dwe-panning] { cursor: grabbing; }
.dwe-image {
  position: absolute; top: 50%; left: 50%; display: block; height: auto;
  transform: translate(calc(-50% + var(--dwe-image-x, 0px)), calc(-50% + var(--dwe-image-y, 0px)));
}
.dwe-text { margin: 0; padding: 12px; white-space: pre-wrap; overflow-wrap: anywhere; font: 12px/1.55 monospace; }
.dwe-message { padding: 0 12px; margin: 12px 0; overflow-wrap: anywhere; }
.dwe-error { color: var(--dsw-alias-text-error, #cf4d52); }
[data-composer-card].dwe-drop-target { outline: 2px solid #458bf5; outline-offset: -2px; }
[data-dockkit-strip].dwe-tab-drop-target {
  outline: 2px solid #458bf5; outline-offset: -2px;
  background: color-mix(in srgb, #458bf5 12%, transparent);
}
.dwe-file-menu {
  position: fixed; z-index: 100000; box-sizing: border-box; min-width: 172px;
  display: grid; gap: 6px;
  max-width: calc(100vw - 8px); max-height: calc(100dvh - 8px); overflow: auto;
  color: var(--dsw-alias-label-primary, CanvasText);
  filter: drop-shadow(0 4px 8px #0003);
}
.dwe-file-menu-panel {
  padding: 4px; border: 1px solid var(--dsw-alias-border-l3, #8886); border-radius: 8px;
  background: var(--dsw-alias-bg-base, Canvas);
}
.dwe-file-menu button {
  display: flex; align-items: center; gap: 8px; width: 100%; min-height: 30px; padding: 5px 9px;
  border: 0; border-radius: 5px; background: none; color: inherit; font: inherit; text-align: start;
}
.dwe-file-menu button[data-dwe-action="reveal"] {
  margin-top: 4px; border-top: 1px solid var(--dsw-alias-border-l3, #8884); border-radius: 0 0 5px 5px;
}
.dwe-file-menu button:disabled { opacity: .4; }
.dwe-file-menu button:not(:disabled):is(:hover, :focus-visible) {
  background: color-mix(in srgb, currentColor 9%, transparent); outline: none;
}
.dwe-file-menu svg { flex: none; }
.dwe-file-menu [data-dwe-action="delete"]:not(:disabled) { color: var(--dsw-alias-text-error, #b83540); }
.dwe-file-dialog {
  box-sizing: border-box; width: min(340px, calc(100vw - 24px)); padding: 16px;
  border: 1px solid var(--dwe-line); border-radius: 10px;
  color: var(--dsw-alias-label-primary, CanvasText); background: var(--dsw-alias-bg-base, Canvas);
  box-shadow: 0 8px 32px #0003;
}
.dwe-file-dialog::backdrop { background: #0004; }
.dwe-file-dialog h2 { margin: 0 0 12px; font-size: 15px; }
.dwe-file-dialog label { display: grid; gap: 5px; }
.dwe-file-dialog input {
  min-width: 0; padding: 6px 8px; border-radius: 5px; border: 1px solid var(--dwe-line);
  background: var(--dwe-tint); color: inherit; font: inherit;
}
.dwe-file-dialog p { color: var(--dsw-alias-text-error, #cf4d52); }
.dwe-delete-path { overflow-wrap: anywhere; margin-bottom: 12px; }
.dwe-delete-paths { max-height: 180px; overflow: auto; padding-inline-start: 20px; }
.dwe-delete-paths li + li { margin-top: 4px; }
.dwe-dialog-actions { display: flex; justify-content: flex-end; gap: 6px; margin-top: 12px; }
.dwe-dialog-actions button { padding: 5px 12px; border-radius: 5px; border: 1px solid var(--dwe-line); }
.dwe-dialog-actions button[type="submit"] { background: color-mix(in srgb, var(--dwe-blue) 23%, transparent); }
.dwe-dialog-actions button[data-dwe-action="delete"] { background: #ad303d; color: #fff; }
.dwe-dialog-actions button[data-dwe-action="delete"]:hover:not(:disabled) { background: #942634; }
@container (max-width: 440px) {
  .dwe-toolbar .dwe-tool:not(.dwe-scope-tool) { width: 26px; height: 26px; flex-basis: 26px; }
}
@container (max-width: 380px) {
  .dwe-columns { grid-template-columns: minmax(0, 1fr) 62px; }
  .dwe-columns > span:nth-child(2) { display: none; }
}
@container (max-width: 250px) {
  .dwe-columns { grid-template-columns: minmax(0, 1fr); }
  .dwe-columns > span:last-child { display: none; }
}
`;


