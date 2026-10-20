import { useQuery } from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { STATUS } from '../components/ui';
import { api } from './api';
import { useTheme } from './theme';

export interface RoomInfo {
  classroom_id: string;
  name: string;
  model_object_id: string | null;
  status: string;
  [k: string]: any;
}

interface CampusCtx {
  rooms: RoomInfo[];
  isPending: boolean;
  error: Error | null;
  refetch: () => void;
  byClassroom: Map<string, RoomInfo>;
  /** Classroom ids currently highlighted in the building. */
  selected: string[];
  select: (ids: string | string[] | null, opts?: { view?: boolean }) => void;
  statusOf: (classroomId: string | null | undefined) => string | undefined;
  frame: React.RefObject<HTMLIFrameElement | null>;
  viewerReady: boolean;
  setViewerReady: (v: boolean) => void;
  /** The 3D panel fills the screen. */
  expanded: boolean;
  setExpanded: (v: boolean) => void;
}

/** '2026-10-19 15:30' becomes '3:30 PM', with a short date when it is not today. */
function niceLocal(s?: string | null, now?: string) {
  if (!s) return '';
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (!m) return s;
  const h = Number(m[4]);
  const t = `${h % 12 || 12}:${m[5]} ${h >= 12 ? 'PM' : 'AM'}`;
  if (!now || now.slice(0, 10) === s.slice(0, 10)) return t;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}, ${t}`;
}

/** What the floating card inside the 3D view shows for a room. */
function infoFor(r: RoomInfo, now?: string) {
  const rows: [string, string][] = [];
  const t = (x?: string | null) => niceLocal(x, now);
  if (r.category?.name) rows.push(['Type', r.category.name]);
  if (r.capacity) rows.push(['Capacity', `${r.capacity} seats`]);
  if (r.current)
    rows.push(['Now', `${r.current.label}${r.current.teacher ? `, ${r.current.teacher}` : ''}`]);
  if (r.status === 'occupied' && r.available_from_local)
    rows.push(['Free again', t(r.available_from_local)]);
  if (r.status === 'free')
    rows.push(['Free until', r.free_until_local ? t(r.free_until_local) : 'No later class found']);
  if (r.next_class)
    rows.push(['Next class', `${r.next_class.label}, ${t(r.next_class.starts_local)}`]);
  const eq: string[] = (r.equipment ?? []).map((e: any) => e.name);
  rows.push([
    'Equipment',
    eq.length
      ? eq.slice(0, 3).join(', ') + (eq.length > 3 ? ` +${eq.length - 3}` : '')
      : 'None recorded',
  ]);
  return {
    id: r.model_object_id,
    title: r.name,
    sub: `${r.building?.name ?? ''}, floor ${r.floor?.level ?? ''}`,
    status: r.status,
    statusLabel: STATUS[r.status]?.label ?? r.status,
    rows,
    link: true,
  };
}
const Ctx = createContext<CampusCtx>(null as never);
export const useCampus = () => useContext(Ctx);

/**
 * One shared source for room status (the same query the Rooms page uses) and one shared selection.
 * The 3D viewer lives in an iframe that is mounted once by the layout, so it keeps its camera and
 * state while pages change. This provider only sends it small messages: colours, selection, theme.
 */
export function CampusProvider({ children }: { children: ReactNode }) {
  const q = useQuery({
    queryKey: ['status'],
    queryFn: () => api<any>('/availability/status'),
    refetchInterval: 60_000,
  });
  const frame = useRef<HTMLIFrameElement | null>(null);
  const [viewerReady, setViewerReady] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [expanded, setExpanded] = useState(false);
  const nav = useNavigate();
  const view = useRef(false);
  const { theme } = useTheme();

  const rooms: RoomInfo[] = q.data?.rooms ?? [];
  const byClassroom = useMemo(() => new Map(rooms.map((r) => [r.classroom_id, r])), [q.data]);
  const byModel = useMemo(
    () => new Map(rooms.filter((r) => r.model_object_id).map((r) => [r.model_object_id!, r])),
    [q.data],
  );

  const post = useCallback((msg: object) => {
    frame.current?.contentWindow?.postMessage(msg, window.location.origin);
  }, []);

  // Colours: re-sent whenever the schedule data refreshes, so rooms change colour when a class starts or ends.
  useEffect(() => {
    if (!viewerReady) return;
    const map: Record<string, string> = {};
    for (const r of rooms) if (r.model_object_id) map[r.model_object_id] = r.status;
    post({ type: 'ucc:status', rooms: map });
  }, [viewerReady, q.data, post]);

  useEffect(() => {
    if (!viewerReady) return;
    const ids = selected.map((id) => byClassroom.get(id)?.model_object_id).filter(Boolean);
    post({ type: 'ucc:select', ids, view: view.current });
    view.current = false;
  }, [viewerReady, selected, q.data, post]);

  useEffect(() => {
    if (viewerReady) post({ type: 'ucc:theme', theme });
  }, [viewerReady, theme, post]);

  // The floating card inside the 3D view: sent for the first selected room, refreshed with the data.
  useEffect(() => {
    if (!viewerReady) return;
    const r = byClassroom.get(selected[0]);
    post({ type: 'ucc:info', info: r?.model_object_id ? infoFor(r, q.data?.at_local) : null });
  }, [viewerReady, selected, q.data, post]);

  useEffect(() => {
    if (viewerReady) post({ type: 'ucc:fsstate', on: expanded });
  }, [viewerReady, expanded, post]);

  // A room clicked inside the building becomes the selection everywhere else.
  useEffect(() => {
    const on = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.data?.type !== 'ucc:picked') return;
      const r = e.data.id ? byModel.get(e.data.id) : null;
      setSelected(r ? [r.classroom_id] : []);
    };
    window.addEventListener('message', on);
    return () => window.removeEventListener('message', on);
  }, [byModel]);

  // Buttons on the floating card: open the timetable, or enter and leave full screen.
  useEffect(() => {
    const on = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      if (e.data?.type === 'ucc:open') {
        const r = byModel.get(e.data.id);
        if (r) nav(`/timetable?room=${r.classroom_id}`);
      } else if (e.data?.type === 'ucc:fullscreen') {
        setExpanded(Boolean(e.data.on));
      }
    };
    window.addEventListener('message', on);
    return () => window.removeEventListener('message', on);
  }, [byModel, nav]);

  const select = useCallback((ids: string | string[] | null, opts?: { view?: boolean }) => {
    view.current = Boolean(opts?.view);
    setSelected(ids == null ? [] : Array.isArray(ids) ? ids : [ids]);
  }, []);

  const value: CampusCtx = {
    rooms,
    isPending: q.isPending,
    error: q.error,
    refetch: () => void q.refetch(),
    byClassroom,
    selected,
    select,
    statusOf: (id) => (id ? byClassroom.get(id)?.status : undefined),
    frame,
    viewerReady,
    setViewerReady,
    expanded,
    setExpanded,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
