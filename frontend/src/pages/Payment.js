import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { CheckCircle2, XCircle, Loader2, ArrowRight, Crown } from "lucide-react";
import api from "@/lib/api";

export function PaymentSuccess() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [state, setState] = useState("checking");
  const sessionId = params.get("session_id");
  const kind = params.get("kind") || "appointment";
  const isSub = kind === "subscription";

  useEffect(() => {
    if (!sessionId) { setState("error"); return; }
    let tries = 0;
    const poll = async () => {
      try {
        const { data } = await api.get(`/payments/status/${sessionId}`);
        if (data.payment_status === "paid") { setState("paid"); return; }
        if (["expired", "failed"].includes(data.payment_status)) { setState("error"); return; }
      } catch { /* keep trying */ }
      tries += 1;
      if (tries < 8) setTimeout(poll, 2000);
      else setState("error");
    };
    poll();
  }, [sessionId]);

  return (
    <div className="relative grid min-h-screen place-items-center bg-ink px-6">
      <div className="paper-bg pointer-events-none fixed inset-0 opacity-[0.12] mix-blend-overlay" />
      <div className="relative z-10 w-full max-w-md text-center card-dark p-10" data-testid="payment-success">
        {state === "checking" && <><Loader2 className="mx-auto size-12 animate-spin text-gold" /><h1 className="mt-6 font-display text-4xl text-foreground">Confirmando pagamento…</h1><p className="mt-2 text-muted-foreground">Só um instante.</p></>}
        {state === "paid" && (isSub ? (
          <><Crown className="mx-auto size-14 text-gold" /><h1 className="mt-6 font-display text-4xl text-foreground">Assinatura ativada!</h1><p className="mt-2 text-muted-foreground">Bem-vindo ao Clube Padrão RD. Sua mensalidade está ativa.</p><button onClick={() => navigate("/minha-conta")} className="btn-gold mt-8 w-full" data-testid="go-account">Minha conta <ArrowRight className="size-4" /></button></>
        ) : (
          <><CheckCircle2 className="mx-auto size-14 text-emerald-400" /><h1 className="mt-6 font-display text-4xl text-foreground">Agendamento confirmado!</h1><p className="mt-2 text-muted-foreground">Pagamento aprovado. Seu horário está garantido na Padrão RD.</p><button onClick={() => navigate("/minha-conta")} className="btn-gold mt-8 w-full" data-testid="go-account">Ver meus horários <ArrowRight className="size-4" /></button></>
        ))}
        {state === "error" && <><XCircle className="mx-auto size-14 text-rose-400" /><h1 className="mt-6 font-display text-4xl text-foreground">Não confirmado</h1><p className="mt-2 text-muted-foreground">Não conseguimos confirmar o pagamento. Verifique em Minha Conta.</p><button onClick={() => navigate("/minha-conta")} className="btn-outline-gold mt-8 w-full">Minha conta</button></>}
      </div>
    </div>
  );
}

export function PaymentCancel() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const apptId = params.get("appointment_id");

  useEffect(() => {
    if (apptId) api.post(`/appointments/${apptId}/cancel`).catch(() => {});
    toast.info("Pagamento cancelado.");
  }, [apptId]);

  return (
    <div className="relative grid min-h-screen place-items-center bg-ink px-6">
      <div className="paper-bg pointer-events-none fixed inset-0 opacity-[0.12] mix-blend-overlay" />
      <div className="relative z-10 w-full max-w-md text-center card-dark p-10" data-testid="payment-cancel">
        <XCircle className="mx-auto size-14 text-muted-foreground" />
        <h1 className="mt-6 font-display text-4xl text-foreground">Pagamento cancelado</h1>
        <p className="mt-2 text-muted-foreground">Sem problemas. Você pode escolher outro horário ou plano quando quiser.</p>
        <button onClick={() => navigate("/agendar")} className="btn-gold mt-8 w-full" data-testid="retry-booking">Agendar novamente</button>
      </div>
    </div>
  );
}
