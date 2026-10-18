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
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
