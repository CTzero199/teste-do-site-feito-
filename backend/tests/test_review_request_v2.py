"""Padrão RD — Review request v2:
- Client cancel subscription + 404 on other user's sub
- /subscriptions/me returns usage array + next_renewal_date
- Booking a Corte increments Cortes 'used'
- /admin/earnings shape (6 months, mrr_cents, current)
- /cron/subscription-reminders auth gating (401 without / 202 with secret)
"""
import os
import time
import pytest
import requests
from datetime import date, timedelta

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or
            open("/app/frontend/.env").read().split("REACT_APP_BACKEND_URL=")[1].splitlines()[0].strip()).rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "wandersoniury17@gmail.com"
ADMIN_PW = "Akatsuki2022@"
CRON_SECRET = "2b14a6150bba0c9e963280704befb9a6a29ede4060d09f55add72678a5b9a61c"


def _future_weekday(target=2):
    d = date.today()
    for i in range(1, 14):
        cand = d + timedelta(days=i)
        wd = (cand.weekday() + 1) % 7
        if wd == target:
            return cand.isoformat()
    return (d + timedelta(days=2)).isoformat()


@pytest.fixture(scope="module")
def admin_sess():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PW})
    assert r.status_code == 200, r.text
    return s


def _register_client(prefix="cli"):
    s = requests.Session()
    email = f"TEST_{prefix}_{int(time.time()*1000)}@teste.com"
    r = s.post(f"{API}/auth/register",
               json={"name": "TEST U", "email": email, "password": "cliente123"})
    assert r.status_code == 200, r.text
    s._email = email
    return s


def _activate_cash_sub(user_sess, admin_sess, plan_id="completo"):
    r = user_sess.post(f"{API}/subscriptions", json={"plan_id": plan_id, "method": "cash"})
    assert r.status_code == 200, r.text
    sub_id = r.json()["subscription_id"]
    rc = admin_sess.post(f"{API}/admin/subscriptions/{sub_id}/confirm")
    assert rc.status_code == 200
    return sub_id


class TestSubscriptionsMeUsage:
    def test_me_includes_usage_and_next_renewal(self, admin_sess):
        u = _register_client("me_usage")
        sub_id = _activate_cash_sub(u, admin_sess, "completo")
        mine = u.get(f"{API}/subscriptions/me").json()
        target = next(s for s in mine if s["id"] == sub_id)
        assert target["status"] == "active"
        assert target["next_renewal_date"], "next_renewal_date should be set on activation"
        assert isinstance(target.get("usage"), list)
        cats = {x["category"]: x for x in target["usage"]}
        assert "Cortes" in cats and cats["Cortes"]["limit"] == 4 and cats["Cortes"]["used"] == 0
        assert "Barba" in cats and cats["Barba"]["limit"] == 4
        assert "Pintura" in cats and cats["Pintura"]["limit"] == 2

    def test_elite_cortes_unlimited(self, admin_sess):
        u = _register_client("elite")
        sub_id = _activate_cash_sub(u, admin_sess, "elite")
        mine = u.get(f"{API}/subscriptions/me").json()
        target = next(s for s in mine if s["id"] == sub_id)
        cortes = next(x for x in target["usage"] if x["category"] == "Cortes")
        assert cortes["limit"] is None  # unlimited

    def test_corte_appointment_increments_used(self, admin_sess):
        u = _register_client("usage_incr")
        sub_id = _activate_cash_sub(u, admin_sess, "completo")

        d = _future_weekday(3)
        slots = requests.get(f"{API}/availability/slots", params={
            "barber_id": "barber_rd", "service_ids": "svc_social", "date": d}).json()
        assert slots
        t = slots[0]["time"]
        appt = u.post(f"{API}/appointments", json={
            "barber_id": "barber_rd", "service_ids": ["svc_social"],
            "date": d, "time": t, "phone": "11999999999",
            "payment_method": "cash",
        }).json()
        rc = admin_sess.post(f"{API}/admin/appointments/{appt['id']}/confirm-cash")
        assert rc.status_code == 200

        mine = u.get(f"{API}/subscriptions/me").json()
        target = next(s for s in mine if s["id"] == sub_id)
        cortes = next(x for x in target["usage"] if x["category"] == "Cortes")
        assert cortes["used"] == 1


class TestClientCancel:
    def test_client_cancels_own_sub(self, admin_sess):
        u = _register_client("cancel_own")
        sub_id = _activate_cash_sub(u, admin_sess, "manutencao")
        r = u.post(f"{API}/subscriptions/{sub_id}/cancel")
        assert r.status_code == 200, r.text
        mine = u.get(f"{API}/subscriptions/me").json()
        target = next(s for s in mine if s["id"] == sub_id)
        assert target["status"] == "cancelled"

    def test_client_cannot_cancel_others_sub(self, admin_sess):
        owner = _register_client("cancel_owner")
        sub_id = _activate_cash_sub(owner, admin_sess, "manutencao")
        other = _register_client("cancel_other")
        r = other.post(f"{API}/subscriptions/{sub_id}/cancel")
        assert r.status_code == 404

    def test_cancel_unauth(self):
        r = requests.post(f"{API}/subscriptions/nope/cancel")
        assert r.status_code == 401


class TestAdminEarnings:
    def test_earnings_shape(self, admin_sess):
        r = admin_sess.get(f"{API}/admin/earnings")
        assert r.status_code == 200, r.text
        d = r.json()
        assert "mrr_cents" in d and isinstance(d["mrr_cents"], int)
        assert "current" in d
        assert isinstance(d["months"], list) and len(d["months"]) == 6
        for m in d["months"]:
            for k in ("month", "label", "appointments_cents",
                      "subscriptions_cents", "total_cents"):
                assert k in m
            assert m["total_cents"] == m["appointments_cents"] + m["subscriptions_cents"]

    def test_earnings_unauth(self):
        assert requests.get(f"{API}/admin/earnings").status_code == 401


class TestCronSubscriptionReminders:
    def test_no_auth_returns_401(self):
        r = requests.post(f"{API}/cron/subscription-reminders")
        assert r.status_code == 401

    def test_wrong_secret_returns_401(self):
        r = requests.post(f"{API}/cron/subscription-reminders",
                          headers={"Authorization": "Bearer wrong"})
        assert r.status_code == 401

    def test_correct_secret_returns_202(self):
        r = requests.post(f"{API}/cron/subscription-reminders",
                          headers={"Authorization": f"Bearer {CRON_SECRET}"})
        assert r.status_code == 202


class TestRenewalDate:
    def test_activation_sets_next_renewal(self, admin_sess):
        u = _register_client("renewal")
        sub_id = _activate_cash_sub(u, admin_sess, "fiel")
        mine = u.get(f"{API}/subscriptions/me").json()
        target = next(s for s in mine if s["id"] == sub_id)
        assert target["next_renewal_date"], "next_renewal_date should be set"
        # It should be ~1 month ahead of activated_at
        from datetime import datetime
        act = datetime.fromisoformat(target["activated_at"].replace("Z", "+00:00"))
        rnw = datetime.fromisoformat(target["next_renewal_date"].replace("Z", "+00:00"))
        delta = (rnw - act).days
        assert 27 <= delta <= 32, f"expected ~30d, got {delta}"
