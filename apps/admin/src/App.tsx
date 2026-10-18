import { Navigate, Route, Routes } from 'react-router-dom';
import DashboardPage from './admin/DashboardPage';
import { DEFS } from './admin/defs';
import {
  EquipmentTypesPage,
  RoomEquipmentPage,
  SubjectRequirementsPage,
} from './admin/EquipmentPage';
import { ResourcePage } from './admin/ResourcePage';
import SchedulesPage from './admin/SchedulesPage';
import TimetablePage from './admin/TimetablePage';
import UsersPage from './admin/UsersPage';
import Layout from './components/Layout';
import { Loading, ToastProvider } from './components/ui';
import { useAuth } from './lib/auth';
import LoginPage from './pages/LoginPage';
import StatusPage from './pages/StatusPage';
import UserHome from './pages/UserHome';

function Gate({ admin, children }: { admin?: boolean; children: React.ReactNode }) {
  const { session, me, loading, error, signOut } = useAuth();
  if (loading) return <Loading label="Signing you in…" />;
  if (!session) return <Navigate to="/login" replace />;
  if (!me)
    return (
      <main className="mx-auto max-w-md px-4 py-16" role="alert">
        <h1 className="font-heading text-xl font-semibold">We could not open your account</h1>
        <p className="mt-2 text-slate-700">{error ?? 'Try signing in again.'}</p>
        <button onClick={signOut} className="mt-4 text-sm font-medium text-ucc-navy underline">
          Sign out
        </button>
      </main>
    );
  if (admin && me.role !== 'admin') return <Navigate to="/" replace />;
  return <>{children}</>;
}

function Home() {
  const { me } = useAuth();
  return me?.role === 'admin' ? <Navigate to="/admin" replace /> : <UserHome />;
}

export default function App() {
  return (
    <ToastProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/status" element={<StatusPage />} />
        <Route
          path="/"
          element={
            <Gate>
              <Home />
            </Gate>
          }
        />
        <Route
          path="/admin"
          element={
            <Gate admin>
              <Layout />
            </Gate>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="schedules" element={<SchedulesPage />} />
          <Route path="timetable" element={<TimetablePage />} />
          {(
            [
              'buildings',
              'floors',
              'classrooms',
              'teachers',
              'subjects',
              'terms',
              'sections',
              'holidays',
              'maintenance',
              'cancellations',
              'exceptions',
            ] as const
          ).map((k) => (
            <Route key={k} path={k} element={<ResourcePage def={DEFS[k]} />} />
          ))}
          <Route path="equipment-types" element={<EquipmentTypesPage />} />
          <Route path="room-equipment" element={<RoomEquipmentPage />} />
          <Route path="subject-requirements" element={<SubjectRequirementsPage />} />
          <Route path="users" element={<UsersPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ToastProvider>
  );
}
