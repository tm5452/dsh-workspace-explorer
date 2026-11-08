import { Explorer, ExplorerTitle } from '../ui/explorer.js';
import { explorerCss } from '../ui/styles.js';

const id = 'dsh-workspace-explorer';
const inject = ['slots'];
const h = react.createElement;

function apply(ctx) {
  if (location.protocol !== 'dsh-app:' || location.hostname !== 'app') return;
  if (!navigator.platform.startsWith('Win')) return;
  ctx.inject(['sidebarRightTabs', 'sidebarRight'], (scope) => {
    const sidebar = scope.sidebarRight;
    const host = document.createElement('div');
    host.className = 'dwe-host';
    const anchors = new Map();
    let currentTarget;
    let carryToNextSession = false;
    let refreshList;
    const getTarget = () => currentTarget;
    const bindRefresh = refresh => {
      refreshList = refresh;
      return () => { refreshList = undefined; };
    };

    function show(target) {
      currentTarget = target;
      carryToNextSession = true;
      target.element.appendChild(host);
    }

    function Anchor({ sessionId, useTabInfo }) {
      const { tab } = useTabInfo();
      const anchor = react.useRef(null);
      react.useLayoutEffect(() => {
        if (!tab.visible) return;
        const element = anchor.current;
        const target = { element, sessionId, actions: tab.actions };
        anchors.set(element, target);
        show(target);
        const dispose = tab.actions.bindCommands?.({ refresh: () => refreshList?.() });
        return () => {
          dispose?.();
          anchors.delete(element);
          if (currentTarget !== target) return;
          const mounted = sidebar.mounted.getSnapshot();
          const replacement = [...anchors.values()].findLast(anchor => anchor.sessionId === mounted);
          if (replacement) {
            show(replacement);
            return;
          }
          currentTarget = undefined;
          if (mounted === sessionId) carryToNextSession = false;
          if (host.parentNode === element) host.remove();
        };
      }, [sessionId, tab.visible, tab.actions]);
      return h('div', { className: 'dwe-host', ref: anchor },
        h('div', { className: 'dwe-anchor-empty' },
          h('button', {
            type: 'button', onClick: () => {
              const target = anchors.get(anchor.current);
              if (target) show(target);
            },
          }, '在此分栏显示文件浏览')));
    }

    function Keeper({ useSessions }) {
      const sessionId = react.useSyncExternalStore(sidebar.mounted.subscribe, sidebar.mounted.getSnapshot);
      const cwd = useSessions(state => sessionId ? state.byId[sessionId]?.cwd : undefined);
      const previous = react.useRef();
      react.useLayoutEffect(() => {
        if (!sessionId || previous.current === sessionId) return;
        const carry = previous.current !== undefined && carryToNextSession;
        previous.current = sessionId;
        if (!carry) return;
        // The target conversation's own dock store is adopted in this commit.
        let active = true;
        queueMicrotask(() => {
          if (!active || sidebar.mounted.getSnapshot() !== sessionId) return;
          if (!sidebar.isExpanded() || sidebar.active()?.kind !== 'files') sidebar.openTab('files');
        });
        return () => { active = false; };
      }, [sessionId]);
      return reactDom.createPortal(h(Explorer, {
        sessionId, cwd, getTarget, bindRefresh,

      }), host);
    }

    scope.effect(() => {
      const style = document.createElement('style');
      style.dataset.dshWorkspaceExplorer = '';
      style.textContent = explorerCss;
      document.head.appendChild(style);
      return () => style.remove();
    });
    for (const [name, key, component] of [
      ['shell.overlay', undefined, Keeper],
      ['sidebar.right.pane.tab', id, Anchor],
      ['sidebar.right.pane.tab.title', id, ExplorerTitle],
    ]) {
      scope.effect(() => scope.slots.inject(name, () =>
        scope.slots.register(key ? { name, key } : { name, id }, component)));
    }
    scope.effect(() => scope.sidebarRightTabs.register({
      id, kind: 'files', priority: 'extension', title: () => '文件浏览', keepMounted: true,
      guide: [{
        id: 'workspace', commandId: 'workspace.files', order: 10, title: () => '文件浏览',
        description: () => '浏览本机磁盘，在下方独立预览文件',
        icon: primitives.GuideArtworkFiles,
      }],
    }));
  });
}

export { apply, inject };


