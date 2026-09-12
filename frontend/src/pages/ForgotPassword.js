import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Mail, ArrowLeft, Copy, KeyRound } from "lucide-react";
import api, { apiError } from "@/lib/api";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null); // { found, reset_url, message }

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await api.post("/auth/forgot-password", { email });
      setResult(data);
    } catch (err) {
      toast.error(apiError(err.response?.data?.detail) || err.message);
    } finally {
      setBusy(false);
    }
  };

  const copyLink = () => {
    if (result?.reset_url) {
      navigator.clipboard.writeText(result.reset_url);
      toast.success("Link copiado!");
    }
  };

  return (
    <div className="relative grid min-h-screen place-items-center bg-ink px-6">
      <div className="paper-bg pointer-events-none fixed inset-0 z-0 opacity-[0.12] mix-blend-overlay" />
      <div className="relative z-10 w-full max-w-md card-dark p-8 sm:p-10" data-testid="forgot-card">
        <Link to="/login" className="mb-6 inline-flex items-center gap-2 font-cond uppercase tracking-widest text-sm text-muted-foreground hover:text-gold" data-testid="back-login"><ArrowLeft className="size-4" /> Voltar ao login</Link>
        <div className="grid size-12 place-items-center rounded-sm border border-gold-soft text-gold"><KeyRound className="size-5" /></div>
        <h1 className="mt-5 font-display text-4xl text-foreground">Esqueceu a senha?</h1>
        <p className="mt-2 text-sm text-muted-foreground">Informe seu e-mail para gerar um link de redefinição.</p>

        {!result?.reset_url ? (
          <form onSubmit={submit} className="mt-6 space-y-4" data-testid="forgot-form">
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-mail" className="field-dark pl-10" data-testid="forgot-email" />
            </div>
            {result && !result.found && <p className="text-sm text-rose-400" data-testid="forgot-notfound">{result.message}</p>}
            <button type="submit" disabled={busy} className="btn-gold w-full" data-testid="forgot-submit">{busy ? "Gerando…" : "Gerar link de redefinição"}</button>
          </form>
        ) : (
          <div className="mt-6 space-y-4" data-testid="forgot-result">
            <p className="text-sm text-emerald-400">{result.message}</p>
            <div className="rounded-sm border border-gold-soft bg-ink p-3 text-xs text-muted-foreground break-all" data-testid="reset-link">{result.reset_url}</div>
            <div className="flex gap-2">
              <button onClick={copyLink} className="btn-outline-gold py-2 text-sm" data-testid="copy-link"><Copy className="size-4" /> Copiar</button>
              <a href={result.reset_url} className="btn-gold py-2 text-sm" data-testid="open-reset">Redefinir agora</a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
