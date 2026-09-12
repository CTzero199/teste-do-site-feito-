import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Crown, Check, Banknote, CreditCard, Gem, Sparkles, X } from "lucide-react";
import Layout from "@/components/Layout";
import api, { apiError } from "@/lib/api";
import { formatCurrency } from "@/lib/format";
import { useAuth } from "@/context/AuthContext";

const ACCENTS = {
  orange: { ring: "border-orange-500/40", glow: "", text: "text-orange-400", chip: "bg-orange-500/10 text-orange-300" },
  silver: { ring: "border-zinc-400/40", glow: "", text: "text-zinc-300", chip: "bg-zinc-400/10 text-zinc-300" },
  gold: { ring: "border-gold", glow: "shadow-[0_0_40px_-8px_rgba(212,175,55,0.5)]", text: "text-gold", chip: "bg-gold/10 text-gold" },
  diamond: { ring: "border-sky-400/40", glow: "", text: "text-sky-300", chip: "bg-sky-400/10 text-sky-300" },
};

export default function Plans() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [plans, setPlans] = useState([]);
  const [mySubs, setMySubs] = useState([]);
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { api.get("/plans").then((r) => setPlans(r.data.plans)).catch(() => {}); }, []);
  useEffect(() => { if (user && user.role) api.get("/subscriptions/me").then((r) => setMySubs(r.data)).catch(() => {}); }, [user]);

  const activePlanIds = mySubs.filter((s) => s.status === "active").map((s) => s.plan_id);

  const subscribe = async (method) => {
    if (!user) { toast.info("Entre para assinar um plano."); navigate("/login"); return; }
    setBusy(true);
    try {
      const { data } = await api.post("/subscriptions", { plan_id: selected.id, method, origin_url: window.location.origin });
      if (method === "cash") {
        toast.success(data.message);
        setSelected(null);
        api.get("/subscriptions/me").then((r) => setMySubs(r.data)).catch(() => {});
      } else {
        window.location.href = data.checkout_url;
      }
    } catch (err) {
      toast.error(apiError(err.response?.data?.detail) || err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Layout>
      <main className="mx-auto max-w-7xl px-5 py-14 sm:px-8 sm:py-20">
        <div className="text-center">
          <div className="mx-auto inline-flex items-center gap-2 border border-gold-soft px-4 py-1.5"><Crown className="size-3.5 text-gold" /><span className="eyebrow">Clube Padrão RD</span></div>
          <h1 className="mt-6 font-display text-5xl text-foreground sm:text-7xl">Planos <span className="italic text-gold">Exclusivos</span></h1>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground">Assine uma mensalidade e mantenha o padrão o mês inteiro. Pague no cartão (renovação automática) ou em dinheiro na barbearia.</p>
        </div>

        <div className="mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {plans.map((p) => {
            const a = ACCENTS[p.accent] || ACCENTS.gold;
            const isActive = activePlanIds.includes(p.id);
            return (
              <article key={p.id} data-testid={`plan-card-${p.id}`}
                className={`relative flex flex-col rounded-sm border bg-ink-surface p-7 transition-transform hover:-translate-y-1 ${a.ring} ${p.highlight ? a.glow : ""}`}>
                {p.highlight && <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-sm bg-gold px-3 py-1 font-cond text-[0.65rem] uppercase tracking-widest text-ink">Mais popular</span>}
                <div className="flex items-center gap-2">
                  {p.accent === "diamond" ? <Gem className={`size-6 ${a.text}`} /> : p.highlight ? <Sparkles className={`size-6 ${a.text}`} /> : <Crown className={`size-6 ${a.text}`} />}
                </div>
                <h3 className="mt-4 font-cond text-xl uppercase tracking-wide text-foreground">{p.name}</h3>
                <div className="mt-4 flex items-end gap-1">
                  <span className={`font-display text-5xl ${a.text}`}>{formatCurrency(p.price_cents).replace(/\s/g, "")}</span>
                  <span className="mb-2 font-cond text-xs uppercase tracking-widest text-muted-foreground">/mês</span>
                </div>
                <ul className="mt-6 flex-1 space-y-3">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <Check className={`mt-0.5 size-4 shrink-0 ${a.text}`} /> <span>{f}</span>
                    </li>
                  ))}
                </ul>
                {isActive ? (
                  <span className="mt-7 inline-flex items-center justify-center gap-2 rounded-sm bg-emerald-400/15 py-3 font-cond text-sm uppercase tracking-widest text-emerald-300" data-testid={`plan-active-${p.id}`}><Check className="size-4" /> Ativo</span>
                ) : (
                  <button onClick={() => setSelected(p)} className="btn-gold mt-7 w-full" data-testid={`subscribe-${p.id}`}>Assinar</button>
                )}
              </article>
            );
          })}
        </div>
      </main>

      {selected && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-6" onClick={() => setSelected(null)} data-testid="pay-method-modal">
          <div className="w-full max-w-md card-dark p-7" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div>
                <p className="eyebrow">Assinatura</p>
                <h3 className="mt-1 font-display text-3xl text-foreground">{selected.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{formatCurrency(selected.price_cents)} por mês</p>
              </div>
              <button onClick={() => setSelected(null)} className="text-muted-foreground hover:text-gold"><X className="size-5" /></button>
            </div>
            <p className="mt-6 font-cond text-xs uppercase tracking-widest text-muted-foreground">Como deseja pagar?</p>
            <div className="mt-3 space-y-3">
              <button onClick={() => subscribe("online")} disabled={busy} className="btn-gold w-full" data-testid="pay-online">
                <CreditCard className="size-4" /> Cartão — renovação automática
              </button>
              <button onClick={() => subscribe("cash")} disabled={busy} className="btn-outline-gold w-full" data-testid="pay-cash">
                <Banknote className="size-4" /> Dinheiro na barbearia
              </button>
            </div>
            <p className="mt-4 text-xs leading-relaxed text-muted-foreground">No dinheiro, sua assinatura fica pendente até o administrador confirmar o pagamento presencial.</p>
          </div>
        </div>
      )}
    </Layout>
  );
}
