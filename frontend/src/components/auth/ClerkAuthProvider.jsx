import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ClerkProvider } from "@clerk/react";
import { dark } from "@clerk/ui/themes";
import { ptPT } from "@clerk/localizations";

// Brand Clerk here once: it styles sign-in, sign-up and the user menu.
const appearance = {
  theme: dark,
  variables: {
    colorPrimary: "#84CC16",
    colorPrimaryForeground: "#000000",
    colorBackground: "#12141C",
    colorForeground: "#FFFFFF",
    colorInput: "#0E1017",
    colorInputForeground: "#FFFFFF",
    colorBorder: "#2A3042",
    fontFamily: "Inter, sans-serif",
    borderRadius: "0.75rem",
  },
  captcha: { theme: "dark" },
};

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

// Starts Clerk from the backend's runtime config, so deploy's live keys need no rebuild.
// Must render inside <BrowserRouter> (see step 3) so Clerk navigates without reloading.
export default function ClerkAuthProvider({ children }) {
  const navigate = useNavigate();
  const [config, setConfig] = useState(null);
  const [unavailable, setUnavailable] = useState(false);

  // Retries while the backend restarts (e.g. right after provisioning): the app's
  // Clerk components crash if they ever render without <ClerkProvider>.
  useEffect(() => {
    let cancelled = false;
    const load = async (attempt = 0) => {
      try {
        const cfg = await (await fetch(`${BACKEND_URL}/api/clerk/config`)).json();
        if (cfg.enabled) return cancelled || setConfig(cfg);
      } catch {}
      if (cancelled) return;
      if (attempt >= 20) return setUnavailable(true);
      setTimeout(() => load(attempt + 1), 1500);
    };
    load();
    return () => { cancelled = true; };
  }, []);

  if (unavailable) return <p style={{ padding: 24 }}>O início de sessão está indisponível. Atualize a página para tentar novamente.</p>;
  if (!config) return null;
  return (
    <ClerkProvider
      publishableKey={config.publishable_key}
      proxyUrl={config.proxy_url || undefined}
      appearance={appearance}
      localization={ptPT}
      routerPush={(to) => navigate(to)}
      routerReplace={(to) => navigate(to, { replace: true })}
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      signInFallbackRedirectUrl="/crm"
      signUpFallbackRedirectUrl="/crm"
      afterSignOutUrl="/sign-in"
    >
      {children}
    </ClerkProvider>
  );
}
