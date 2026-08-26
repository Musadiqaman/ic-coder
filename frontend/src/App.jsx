import React, { lazy, Suspense } from "react";
import { HashRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { ThemeProvider, useTheme } from "./theme.jsx";
import { AuthProvider, useAuth } from "./context/AuthContext.jsx";
import Layout from "./components/Layout.jsx";
import Login from "./pages/Login.jsx";
import PageLoader from "./components/PageLoader.jsx";

// Route-level code splitting keeps heavy modules (especially face-api.js and
// charting) out of the initial dashboard bundle. Each page is fetched only
// when the user actually navigates to it.
const Dashboard = lazy(() => import("./pages/Dashboard.jsx"));
const Students = lazy(() => import("./pages/Students.jsx"));
const Employees = lazy(() => import("./pages/Employees.jsx"));
const Teachers = lazy(() => import("./pages/Teachers.jsx"));
const Expenses = lazy(() => import("./pages/Expenses.jsx"));
const Projects = lazy(() => import("./pages/Projects.jsx"));
const Loans = lazy(() => import("./pages/Loans.jsx"));
const Attendance = lazy(() => import("./pages/Attendance.jsx"));
const Settings = lazy(() => import("./pages/Settings.jsx"));
const TeacherDashboard = lazy(() => import("./pages/TeacherDashboard.jsx"));
const InitialAdminSetup = lazy(() => import("./pages/InitialAdminSetup.jsx"));

function AuthGate() {
  return <PageLoader label="Checking your session…" />;
}

function RequireAuth({ children }) {
  const { user, checking } = useAuth();
  const location = useLocation();
  if (checking) return <AuthGate />;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  return children;
}

function RequireRole({ roles, children }) {
  const { user, checking } = useAuth();
  if (checking) return <AuthGate />;
  if (!roles.includes(user?.role)) return <Navigate to="/" replace />;
  return children;
}

function RoleHome() {
  const { user } = useAuth();
  return user?.role === "teacher" ? <TeacherDashboard /> : <Dashboard />;
}

export default function App() {
  return (
    <ThemeProvider>
      <HashRouter>
        <AuthProvider>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/setup-admin" element={<InitialAdminSetup />} />
              <Route path="/" element={<RequireAuth><Layout /></RequireAuth>}>
                <Route index element={<RoleHome />} />
                <Route path="students" element={<RequireRole roles={["admin"]}><Students /></RequireRole>} />
                <Route path="employees" element={<RequireRole roles={["admin"]}><Employees /></RequireRole>} />
                <Route path="teachers" element={<RequireRole roles={["admin"]}><Teachers /></RequireRole>} />
                <Route path="expenses" element={<RequireRole roles={["admin"]}><Expenses /></RequireRole>} />
                <Route path="projects" element={<RequireRole roles={["admin"]}><Projects /></RequireRole>} />
                <Route path="loans" element={<RequireRole roles={["admin"]}><Loans /></RequireRole>} />
                <Route path="attendance" element={<RequireRole roles={["admin","teacher"]}><Attendance /></RequireRole>} />
                <Route path="settings" element={<Settings />} />
                <Route path="teacher-home" element={<RequireRole roles={["teacher"]}><TeacherDashboard /></RequireRole>} />
              </Route>
            </Routes>
          </Suspense>
        </AuthProvider>
      </HashRouter>
    </ThemeProvider>
  );
}
