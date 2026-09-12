import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Lock, ArrowLeft, ShieldCheck } from "lucide-react";
import api, { apiError } from "@/lib/api";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (password !== confirm) { toast.error("As senhas não conferem."); return; }
    setBusy(true);
    try {
      await api.post("/auth/reset-password", { token, password });
      toast.success("Senha redefinida! Faça login.");
      navigate("/login", { replace: true });
    } catch (err) {
      toast.error(apiError(err.response?.data?.detail) || err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative grid min-h-screen place-items-center bg-ink px-6">
      <div className="paper-bg pointer-events-none fixed inset-0 z-0 opacity-[0.12] mix-blend-overlay" />
      <div className="relative z-10 w-full max-w-md card-dark p-8 sm:p-10" data-testid="reset-card">
        <Link to="/login" className="mb-6 inline-flex items-center gap-2 font-cond uppercase tracking-widest text-sm text-muted-foreground hover:text-gold" data-testid="back-login"><ArrowLeft className="size-4" /> Voltar ao login</Link>
        <div className="grid size-12 place-items-center rounded-sm border border-gold-soft text-gold"><ShieldCheck className="size-5" /></div>
        <h1 className="mt-5 font-display text-4xl text-foreground">Nova senha</h1>
        <p className="mt-2 text-sm text-muted-foreground">Defina uma nova senha para sua conta.</p>

        {!token ? (
          <p className="mt-6 text-sm text-rose-400" data-testid="no-token">Link inválido. Solicite um novo em "Esqueceu a senha?".</p>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-4" data-testid="reset-form">
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input required type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Nova senha" className="field-dark pl-10" data-testid="reset-password" />
            </div>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input required type="password" minLength={6} value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Confirme a senha" className="field-dark pl-10" data-testid="reset-confirm" />
            </div>
            <button type="submit" disabled={busy} className="btn-gold w-full" data-testid="reset-submit">{busy ? "Salvando…" : "Redefinir senha"}</button>
          </form>
        )}
      </div>
    </div>
  );
}
