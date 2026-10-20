import { useEffect, useRef } from 'react';
import { useCampus } from '../lib/campus';
import { useTheme } from '../lib/theme';
import { Icon, STATUS_ICON } from './Icon';
import { STATUS } from './ui';

/**
 * The one and only 3D viewer. The layout mounts this once, outside the routed pages, so changing
 * pages never recreates the scene: camera, zoom, floor filter and loaded model all stay as they are.
 * The selected room's status is shown by a floating card inside the viewer itself.
 */
export default function CampusPanel() {
  const c = useCampus();
  const { theme } = useTheme();
  const first = useRef(theme); // the iframe address must never change, or the scene would reload
  const panel = useRef<HTMLElement>(null);
  const native = useRef(false); // true while the browser's own full screen is on
  const { setViewerReady, expanded, setExpanded } = c;

  useEffect(() => {
    const on = (e: MessageEvent) => {
      if (e.origin === window.location.origin && e.data?.type === 'ucc:ready') setViewerReady(true);
    };
    window.addEventListener('message', on);
    return () => window.removeEventListener('message', on);
  }, [setViewerReady]);

  // Full screen: use the browser's full screen when it is available, and a fixed full-window panel otherwise.
  useEffect(() => {
    const el = panel.current;
    if (!el) return;
    if (expanded) {
      document.body.style.overflow = 'hidden';
      if (el.requestFullscreen && !document.fullscreenElement) {
        el.requestFullscreen().then(
          () => (native.current = true),
          () => (native.current = false),
        );
      }
    } else {
      document.body.style.overflow = '';
      if (native.current && document.fullscreenElement === el) void document.exitFullscreen();
      native.current = false;
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [expanded]);

  useEffect(() => {
    const onFs = () => {
      if (!document.fullscreenElement && native.current) {
        native.current = false;
        setExpanded(false);
      }
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !native.current && setExpanded(false);
    document.addEventListener('fullscreenchange', onFs);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('fullscreenchange', onFs);
      document.removeEventListener('keydown', onKey);
    };
  }, [setExpanded]);

  const sel = c.selected.map((id) => c.byClassroom.get(id)).filter(Boolean);
  const first1 = sel[0];

  return (
    <aside
      ref={panel}
      aria-label="Interactive 3D Campus"
      className={
        expanded
          ? 'neo fixed inset-0 z-50 flex h-screen w-screen flex-col overflow-hidden rounded-none p-3'
          : 'neo flex h-[72vh] min-h-[420px] flex-col overflow-hidden p-3 lg:sticky lg:top-4 lg:h-[calc(100vh-2rem)]'
      }
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1">
        <h2 className="font-heading text-lg font-semibold">Interactive 3D Campus</h2>
        <ul className="flex flex-wrap gap-2 text-xs" aria-label="Colour key">
          {(['free', 'occupied'] as const).map((k) => (
            <li
              key={k}
              className={`flex items-center gap-1 rounded px-2 py-0.5 font-semibold ${STATUS[k].cls}`}
            >
              <Icon name={STATUS_ICON[k]} />
              {STATUS[k].label}
            </li>
          ))}
          <li className="neo-in rounded px-2 py-0.5 text-ink-soft">Not a classroom</li>
        </ul>
      </div>
      <p className="sr-only" aria-live="polite">
        {first1
          ? `${first1.name} selected, ${STATUS[first1.status]?.label ?? first1.status}.`
          : 'No room selected.'}
      </p>
      <iframe
        ref={c.frame}
        title="3D model of the UCC Congress Building"
        src={`/campus-3d.html?embed=1&theme=${first.current}`}
        className="min-h-0 w-full flex-1 rounded-md border-0"
      />
    </aside>
  );
}
