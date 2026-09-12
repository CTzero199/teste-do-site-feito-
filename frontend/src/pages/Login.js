import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { toast } from "sonner";
import { Mail, Lock, User as UserIcon, ArrowLeft } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { apiError } from "@/lib/api";

export default function Login() {
  const navigate = useNavigate();
  const { user, login, register, googleLogin } = useAuth();
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user && user.role) navigate(user.role === "admin" ? "/admin" : "/minha-conta", { replace: true });
  }, [user, navigate]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "login") await login(form.email, form.password);
      else await register(form.name, form.email, form.password);
      toast.success("Bem-vindo à Padrão RD!");
      navigate("/minha-conta");
    } catch (err) {
      toast.error(apiError(err.response?.data?.detail) || err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative grid min-h-screen lg:grid-cols-2">
      <div className="paper-bg pointer-events-none fixed inset-0 z-0 opacity-[0.12] mix-blend-overlay" />
      <div className="relative hidden lg:block">
        <img src="https://images.unsplash.com/photo-1585747860715-2ba37e788b70?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NTYxODh8MHwxfHNlYXJjaHwxfHxsdXh1cnklMjBiYXJiZXJzaG9wJTIwZGFyayUyMGludGVyaW9yfGVufDB8fHx8MTc4ODY0MDk4OXww&ixlib=rb-4.1.0&q=85" alt="Padrão RD" className="h-full w-full object-cover opacity-40" />
        <div className="absolute inset-0 bg-gradient-to-r from-ink/60 to-ink" />
        <div className="absolute bottom-14 left-14 max-w-md">
          <img src="/logo-padrao-rd.jpg" alt="Padrão RD" className="h-20 w-20 rounded-sm object-cover ring-1 ring-gold-soft" />
          <h2 className="mt-6 font-display text-5xl text-foreground">O padrão começa aqui.</h2>
          <p className="mt-3 text-muted-foreground">Entre para gerenciar seus horários, planos e agendamentos.</p>
        </div>
      </div>

      <div className="relative z-10 flex items-center justify-center bg-ink px-6 py-16">
        <div className="w-full max-w-md">
          <Link to="/" className="mb-8 inline-flex items-center gap-2 font-cond uppercase tracking-widest text-sm text-muted-foreground hover:text-gold" data-testid="back-home"><ArrowLeft className="size-4" /> Início</Link>
          <p className="eyebrow">{mode === "login" ? "Área do cliente" : "Criar conta"}</p>
          <h1 className="mt-3 font-display text-5xl text-foreground">{mode === "login" ? "Entrar" : "Cadastre-se"}</h1>

          <form onSubmit={submit} className="mt-8 space-y-4" data-testid="auth-form">
            {mode === "register" && (
              <div className="relative">
                <UserIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Seu nome" className="field-dark pl-10" data-testid="input-name" />
              </div>
            )}
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="E-mail" className="field-dark pl-10" data-testid="input-email" />
            </div>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input required type="password" minLength={6} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Senha" className="field-dark pl-10" data-testid="input-password" />
            </div>
            {mode === "login" && (
              <div className="text-right">
                <Link to="/esqueci-senha" className="font-cond text-xs uppercase tracking-widest text-muted-foreground hover:text-gold" data-testid="forgot-password-link">Esqueceu a senha?</Link>
              </div>
            )}
            <button type="submit" disabled={busy} className="btn-gold w-full" data-testid="submit-auth">
              {busy ? "Aguarde…" : mode === "login" ? "Entrar" : "Criar conta"}
            </button>
          </form>

          <div className="my-6 flex items-center gap-4">
            <div className="h-px flex-1 gold-line opacity-40" />
            <span className="font-cond text-xs uppercase tracking-widest text-muted-foreground">ou</span>
            <div className="h-px flex-1 gold-line opacity-40" />
          </div>

          <button onClick={googleLogin} className="flex w-full items-center justify-center gap-3 rounded-sm border border-gold-soft bg-ink-surface px-6 py-3 font-cond uppercase tracking-widest text-sm text-foreground transition-colors hover:border-gold" data-testid="google-login">
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="size-5" />
            Continuar com Google
          </button>

          <p className="mt-8 text-center text-sm text-muted-foreground">
            {mode === "login" ? "Ainda não tem conta?" : "Já é cliente?"}{" "}
            <button onClick={() => setMode(mode === "login" ? "register" : "login")} className="font-semibold text-gold" data-testid="toggle-mode">
              {mode === "login" ? "Cadastre-se" : "Entrar"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
