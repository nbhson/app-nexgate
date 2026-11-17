import { useEffect, useState } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { api } from "./api/client";
import { Login } from "./pages/Login";
import { Overview } from "./pages/Overview";
import { Providers } from "./pages/Providers";
import { Models } from "./pages/Models";
import { ApiKeys } from "./pages/ApiKeys";
import { Usage } from "./pages/Usage";
import { Settings } from "./pages/Settings";
import { Layout } from "./components/Layout";
import { Spinner } from "./components/ui";

function AuthGate({ children }: { children: React.ReactNode }) {
  const [checking, setChecking] = useState(true);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    api
      .get<{ username: string | null }>("/admin/auth/me")
      .then((r) => setAuthed(!!r.username))
      .catch(() => setAuthed(false))
      .finally(() => setChecking(false));
  }, []);

  if (checking) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950">
        <Spinner />
      </div>
    );
  }

  return authed ? <>{children}</> : <Navigate to="/login" replace />;
}

export default function App() {
  const location = useLocation();

  return (
    <Routes location={location}>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <AuthGate>
            <Layout />
          </AuthGate>
        }
      >
        <Route index element={<Overview />} />
        <Route path="providers" element={<Providers />} />
        <Route path="models" element={<Models />} />
        <Route path="keys" element={<ApiKeys />} />
        <Route path="usage" element={<Usage />} />
        <Route path="settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
