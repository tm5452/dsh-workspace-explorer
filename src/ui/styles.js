export const explorerCss = `
.dwe-host { height: 100%; min-height: 0; min-width: 0; }
.dwe-anchor-empty { display: grid; place-items: center; height: 100%; }
.dwe-host:has(> .dwe-host) > .dwe-anchor-empty { display: none; }
.dwe-anchor-empty button {
  color: inherit; font: inherit; padding: 6px 10px;
  border: 1px solid var(--dsw-alias-border-l3); border-radius: 6px; background: transparent;
}
.dwe {
  --dwe-line: var(--dsw-alias-border-l3, color-mix(in srgb, currentColor 14%, transparent));
  --dwe-tint: color-mix(in srgb, currentColor 5%, transparent);
  --dwe-hover: color-mix(in srgb, currentColor 8%, transparent);
  --dwe-blue: #458bf5;
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
  height: 100%;
  font-size: 13px;
  container-type: inline-size;
}
.dwe-folder { display: flex; flex-direction: column; flex: 1 1 0; min-height: 0; }
.dwe-toolbar, .dwe-preview-bar {
  display: flex; flex: none; align-items: center; gap: 6px;
  padding: 5px 8px; min-width: 0; border-bottom: 1px solid var(--dwe-line);
}
.dwe-nav { display: flex; align-items: center; gap: 2px; flex: none; }
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
  background: var(--dsw-alias-bg-base, Canvas); border-bottom: 1px solid var(--dwe-line);
}
.dwe-head span + span { border-inline-start: 1px solid var(--dwe-line); }
.dwe-columns > span:last-child { text-align: end; }
.dwe-entries { list-style: none; margin: 0; padding: 3px 6px; }
.dwe-row { width: 100%; text-align: start; padding: 0; min-height: 29px; border-radius: 4px; }
.dwe-row[aria-pressed="true"], .dwe-row[aria-pressed="true"]:hover:not(:disabled) {
  background: color-mix(in srgb, var(--dwe-blue) 20%, transparent);
}
.dwe-name, .dwe-preview-name { display: flex; align-items: center; gap: 7px; }
.dwe-name svg, .dwe-preview-name svg { flex: none; }
.dwe-name > span:last-child, .dwe-preview-name > span:last-child {
  min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.dwe-meta, .dwe-status, .dwe-preview-label { opacity: .72; font-size: 12px; }
.dwe-status { padding: 4px 12px; border-top: 1px solid var(--dwe-line); flex: none; }
.dwe-preview {
  flex: 0 1 48%; min-height: 0; display: flex; flex-direction: column;
  border-top: 2px solid var(--dwe-line);
}
.dwe-preview-bar { background: var(--dwe-tint); }
.dwe-preview-label { flex: none; margin-inline: 4px; }
.dwe-preview-name { flex: 1; min-width: 0; font-weight: 600; }
.dwe-preview-body { flex: 1 1 auto; min-height: 0; overflow: auto; }
.dwe-image { display: block; max-width: 100%; max-height: 100%; object-fit: contain; margin-inline: auto; }
.dwe-text { margin: 0; padding: 12px; white-space: pre-wrap; overflow-wrap: anywhere; font: 12px/1.55 monospace; }
.dwe-message { padding: 0 12px; margin: 12px 0; overflow-wrap: anywhere; }
.dwe-error { color: var(--dsw-alias-text-error, #cf4d52); }
@container (max-width: 380px) {
  .dwe-columns { grid-template-columns: minmax(0, 1fr) 62px; }
  .dwe-columns > span:nth-child(2) { display: none; }
}
@container (max-width: 250px) {
  .dwe-columns { grid-template-columns: minmax(0, 1fr); }
  .dwe-columns > span:last-child { display: none; }
}
`;


