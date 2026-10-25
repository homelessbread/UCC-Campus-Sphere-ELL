import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import FindRoomPage from './pages/FindRoomPage';
import RoomsPage from './pages/RoomsPage';
import RoomsSection from './components/RoomsSection';
import StatusPage from './pages/StatusPage';
import SubjectsPage from './pages/SubjectsPage';
import TeachersPage from './pages/TeachersPage';
import TimetablePage from './pages/TimetablePage';

// No sign-in anywhere on this site. It only reads public data from the API.
export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route element={<RoomsSection />}>
          <Route index element={<RoomsPage />} />
          <Route path="find" element={<FindRoomPage />} />
          <Route path="subjects" element={<SubjectsPage />} />
        </Route>
        <Route path="timetable" element={<TimetablePage />} />
        <Route path="teachers" element={<TeachersPage />} />
        <Route path="status" element={<StatusPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
