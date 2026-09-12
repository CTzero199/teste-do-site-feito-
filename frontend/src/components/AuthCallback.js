import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

export default function AuthCallback() {
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const processed = useRef(false);

  useEffect(() => {
    if (processed.current) return;
    processed.current = true;
    const hash = window.location.hash || "";
    const match = hash.match(/session_id=([^&]+)/);
    const sessionId = match ? decodeURIComponent(match[1]) : null;
    (async () => {
      if (!sessionId) { navigate("/login"); return; }
      try {
        const { data } = await api.post("/auth/google", {}, { headers: { "X-Session-ID": sessionId } });
        setUser(data);
        window.history.replaceState({}, document.title, "/minha-conta");
        navigate("/minha-conta", { replace: true, state: { user: data } });
      } catch {
        navigate("/login");
      }
    })();
  }, [navigate, setUser]);

  return (
    <div className="min-h-screen grid place-items-center paper-bg" data-testid="auth-callback">
      <div className="text-center">
        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-gold border-t-transparent" />
        <p className="mt-4 eyebrow">Entrando…</p>
      </div>
    </div>
  );
}
