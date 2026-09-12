# PRD — Padrão RD (Barbearia)

## Problem statement (current iteration)
Integrar planos de mensalidade recorrente (imagem: Manutenção R$90, Fiel R$130, Completo R$180, Elite R$250); permitir pagamento também em dinheiro (pendente até admin confirmar); adicionar "esqueceu senha"; criar admin wandersoniury17@gmail.com/Akatsuki2022@ que vê os demais logins e concede admin a outros; permitir selecionar mais de um serviço no agendamento.

## Architecture
- Frontend: React (CRA/craco), Tailwind, shadcn/ui, react-router-dom, sonner, lucide-react.
- Backend: FastAPI + MongoDB (motor). All routes under /api.
- Auth: httpOnly `session_token` cookie (bcrypt password + Emergent Google). Forgot/reset via hashed one-time tokens; reset link shown on screen (no email).
- Payments: Stripe (Emergent claimable sandbox, account country BR, BRL). One-time Checkout for appointments; subscription-mode Checkout for the 4 monthly plans (prices auto-created at startup via lookup_keys). Cash option for both appointments and subscriptions → pending until admin confirms. Tax mode: DIY (Stripe processes only, no tax layer) — suitable for a local BRL business.

## Personas
- Client: browses services/barbers/plans, books (multi-service), pays online or cash, subscribes, manages appointments + memberships.
- Admin/Owner (wandersoniury17@gmail.com): manages agenda, subscriptions, users (grant/revoke admin), services, barbers.

## Implemented (2026-06)
- Recurring monthly plans page /planos (4 tiers, benefits/prices from image) with online (auto-renew) or cash checkout.
- Cash payment for appointments and subscriptions; admin confirms (agenda + assinaturas tabs).
- Forgot password (/esqueci-senha) → on-screen reset link → /redefinir-senha.
- Admin owner seeded from env; Admin "Usuários" tab lists all logins and grants/revokes admin (owner cannot be demoted).
- Multi-service booking: checkbox selection, barber filtered to those attending ALL, summed price/duration.
- Admin dashboard metrics incl. active subscriptions.
- Tested: 16/16 backend pytest pass; frontend flows verified (100%).

## Admin credentials
- wandersoniury17@gmail.com / Akatsuki2022@ (owner/admin). Additional admins granted via the Usuários tab.

## Backlog (P1/P2)
- P1: Stripe subscription lifecycle webhooks (cancel/renew sync via customer.subscription.*).
- P1: Client-facing "cancel subscription" action.
- P2: Split server.py into modules; remove unused AppointmentEditBody; email notifications (Resend); barber-specific dashboards.
