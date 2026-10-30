import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import ConnectPage from "@/pages/ConnectPage";
import { SignInPage } from "@/pages/AuthPages";
import Account from "@/pages/crm/Account";
import CrmLayout from "@/components/cc/CrmLayout";
import Dashboard from "@/pages/crm/Dashboard";
import Sessions from "@/pages/crm/Sessions";
import Console from "@/pages/crm/Console";
import Devices from "@/pages/crm/Devices";
import Links from "@/pages/crm/Links";
import SettingsPage from "@/pages/crm/Settings";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ConnectPage />} />
        <Route path="/assistir/:token" element={<ConnectPage />} />
        <Route path="/sign-in/*" element={<SignInPage />} />
        <Route path="/sign-up/*" element={<Navigate to="/sign-in" replace />} />
        <Route path="/crm" element={<CrmLayout />}>
            <Route index element={<Console />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="atendimentos" element={<Sessions />} />
            <Route path="atendimentos/:id" element={<Console />} />
            <Route path="dispositivos" element={<Devices />} />
            <Route path="links" element={<Links />} />
            <Route path="configuracoes" element={<SettingsPage />} />
            <Route path="conta" element={<Account />} />
        </Route>
      </Routes>
      <Toaster theme="dark" position="top-right" richColors />
    </BrowserRouter>
  );
}

export default App;
