import { useEffect, useRef } from 'react';
import { useCampus } from '../lib/campus';
import { useTheme } from '../lib/theme';
import { STATUS, StatusPill } from './ui';

/**
 * The one and only 3D viewer. The layout mounts this once, outside the routed pages, so changing
 * pages never recreates the scene: camera, zoom, floor filter and loaded model all stay as they are.
 */
export default function CampusPanel() {
  const c = useCampus();
  const { theme } = useTheme();
  const first = useRef(theme); // the iframe address must never change, or the scene would reload
  const { setViewerReady } = c;

  useEffect(() => {
    const on = (e: MessageEvent) => {
      if (e.origin === window.location.origin && e.data?.type === 'ucc:ready') setViewerReady(true);
    };
    window.addEventListener('message', on);
    return () => window.removeEventListener('message', on);
  }, [setViewerReady]);

  const sel = c.selected.map((id) => c.byClassroom.get(id)).filter(Boolean);
  const first1 = sel[0];

  return (
    <aside
      aria-label="Interactive 3D Campus"
      className="neo flex h-[72vh] min-h-[420px] flex-col overflow-hidden p-3 lg:sticky lg:top-4 lg:h-[calc(100vh-2rem)]"
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1">
        <h2 className="font-heading text-lg font-semibold">Interactive 3D Campus</h2>
        <ul className="flex flex-wrap gap-2 text-xs" aria-label="Colour key">
          {(['free', 'occupied'] as const).map((k) => (
            <li key={k} className={`rounded px-2 py-0.5 font-semibold ${STATUS[k].cls}`}>
              {STATUS[k].label}
            </li>
          ))}
          <li className="neo-in rounded px-2 py-0.5 text-ink-soft">Not a classroom</li>
        </ul>
      </div>
      <div className="neo-in mb-2 min-h-[3.25rem] px-3 py-2 text-sm" aria-live="polite">
        {first1 ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <strong>{sel.length > 1 ? `${sel.length} rooms selected` : first1.name}</strong>
              {sel.length === 1 && (
                <span className="text-ink-mute">
                  {' '}
                  · {first1.building.name}, floor {first1.floor.level}
                </span>
              )}
              {!first1.model_object_id && (
                <p className="text-xs text-ink-mute">
                  This room is not placed in the 3D model yet.
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              {sel.length === 1 && <StatusPill status={first1.status} />}
              <button
                className="text-xs font-medium text-accent-text underline"
                onClick={() => c.select(null)}
              >
                Clear
              </button>
            </div>
          </div>
        ) : (
          <p className="text-ink-mute">
            Click a room in the building, or pick one from the list, to see where it is.
          </p>
        )}
      </div>
      <iframe
        ref={c.frame}
        title="3D model of the UCC Congress Building"
        src={`/campus-3d.html?embed=1&theme=${first.current}`}
        className="min-h-0 w-full flex-1 rounded-md border-0"
      />
    </aside>
  );
}
