import "@/App.css";
import { BrowserRouter, Routes, Route, Outlet } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import ClerkAuthProvider from "@/components/auth/ClerkAuthProvider";
import ConnectPage from "@/pages/ConnectPage";
import { SignInPage, SignUpPage } from "@/pages/AuthPages";
import CrmLayout from "@/components/cc/CrmLayout";
import Dashboard from "@/pages/crm/Dashboard";
import Queue from "@/pages/crm/Queue";
import Sessions from "@/pages/crm/Sessions";
import Console from "@/pages/crm/Console";
import Devices from "@/pages/crm/Devices";
import Links from "@/pages/crm/Links";
import SettingsPage from "@/pages/crm/Settings";

const WithClerk = () => (
  <ClerkAuthProvider><Outlet /></ClerkAuthProvider>
);

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ConnectPage />} />
        <Route path="/assistir/:token" element={<ConnectPage />} />
        <Route element={<WithClerk />}>
          <Route path="/sign-in/*" element={<SignInPage />} />
          <Route path="/sign-up/*" element={<SignUpPage />} />
          <Route path="/crm" element={<CrmLayout />}>
            <Route index element={<Console />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="fila" element={<Queue />} />
            <Route path="atendimentos" element={<Sessions />} />
            <Route path="atendimentos/:id" element={<Console />} />
            <Route path="dispositivos" element={<Devices />} />
            <Route path="links" element={<Links />} />
            <Route path="configuracoes" element={<SettingsPage />} />
          </Route>
        </Route>
      </Routes>
      <Toaster theme="dark" position="top-right" richColors />
    </BrowserRouter>
  );
}

export default App;
