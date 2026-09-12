"""Padrão RD — E2E tests for review request:
plans, admin user role management, forgot/reset password,
multi-service booking, cash appointment/subscription, Stripe checkout, auth guards.
"""
import os
import time
import pytest
import requests
from datetime import date, timedelta

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or
            open("/app/frontend/.env").read().split("REACT_APP_BACKEND_URL=")[1].splitlines()[0].strip())
BASE_URL = BASE_URL.rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "wandersoniury17@gmail.com"
ADMIN_PW = "Akatsuki2022@"


def _future_weekday(target=2):
    d = date.today()
    for i in range(1, 14):
        cand = d + timedelta(days=i)
        wd = (cand.weekday() + 1) % 7  # 0=Sun..6=Sat matching backend
        if wd == target:
            return cand.isoformat()
    return (d + timedelta(days=2)).isoformat()


@pytest.fixture(scope="module")
def admin_sess():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PW})
    assert r.status_code == 200, r.text
    assert r.json()["role"] == "admin"
    return s


@pytest.fixture(scope="module")
def user_sess():
    s = requests.Session()
    email = f"TEST_user_{int(time.time()*1000)}@teste.com"
    r = s.post(f"{API}/auth/register", json={"name": "TEST U", "email": email, "password": "cliente123"})
    assert r.status_code == 200, r.text
    s._email = email.lower()
    s._pw = "cliente123"
    return s


# ---------- Plans ----------
class TestPlans:
    def test_plans_shape_and_prices(self):
        r = requests.get(f"{API}/plans")
        assert r.status_code == 200
        plans = r.json()["plans"]
        by_id = {p["id"]: p for p in plans}
        assert by_id["manutencao"]["price_cents"] == 9000
        assert by_id["fiel"]["price_cents"] == 13000
        assert by_id["completo"]["price_cents"] == 18000
        assert by_id["elite"]["price_cents"] == 25000
        for p in plans:
            assert isinstance(p.get("features"), list) and len(p["features"]) > 0


# ---------- Admin overview + users listing ----------
class TestAdminBasics:
    def test_admin_overview(self, admin_sess):
        r = admin_sess.get(f"{API}/admin/overview")
        assert r.status_code == 200
        d = r.json()
        assert "stats" in d
        for k in ("revenue_cents", "appointments", "barbers", "services", "active_subscriptions"):
            assert k in d["stats"]

    def test_admin_users_list_and_owner_flag(self, admin_sess, user_sess):
        r = admin_sess.get(f"{API}/admin/users")
        assert r.status_code == 200
        users = r.json()
        owners = [u for u in users if u["email"] == ADMIN_EMAIL]
        assert owners and owners[0]["is_owner"] is True
        emails = [u["email"] for u in users]
        assert user_sess._email in emails


# ---------- Role management ----------
class TestRoleManagement:
    def test_grant_and_revoke_admin(self, admin_sess, user_sess):
        # get target user_id
        users = admin_sess.get(f"{API}/admin/users").json()
        tgt = next(u for u in users if u["email"] == user_sess._email)
        uid = tgt["user_id"]

        # grant admin
        r = admin_sess.put(f"{API}/admin/users/{uid}/role", json={"role": "admin"})
        assert r.status_code == 200 and r.json()["role"] == "admin"

        # promoted user can access /admin/overview
        me = user_sess.get(f"{API}/auth/me").json()
        assert me["role"] == "admin"
        r2 = user_sess.get(f"{API}/admin/overview")
        assert r2.status_code == 200

        # revoke
        r3 = admin_sess.put(f"{API}/admin/users/{uid}/role", json={"role": "user"})
        assert r3.status_code == 200 and r3.json()["role"] == "user"
        # should now be forbidden
        r4 = user_sess.get(f"{API}/admin/overview")
        assert r4.status_code == 403

    def test_cannot_demote_owner(self, admin_sess):
        users = admin_sess.get(f"{API}/admin/users").json()
        owner = next(u for u in users if u["is_owner"])
        r = admin_sess.put(f"{API}/admin/users/{owner['user_id']}/role", json={"role": "user"})
        assert r.status_code == 400


# ---------- Forgot / Reset password ----------
class TestForgotReset:
    def test_forgot_unknown_email(self):
        r = requests.post(f"{API}/auth/forgot-password", json={"email": "nobody_TEST@nope.com"})
        assert r.status_code == 200
        assert r.json()["found"] is False

    def test_forgot_and_reset_flow(self):
        s = requests.Session()
        email = f"TEST_reset_{int(time.time()*1000)}@teste.com"
        old = "oldpass123"
        new = "newpass456"
        assert s.post(f"{API}/auth/register", json={"name": "R", "email": email, "password": old}).status_code == 200
        s.post(f"{API}/auth/logout")

        r = requests.post(f"{API}/auth/forgot-password", json={"email": email})
        assert r.status_code == 200
        j = r.json()
        assert j["found"] is True and "reset_url" in j
        token = j["reset_url"].split("token=")[1]
        assert token and len(token) >= 20

        r2 = requests.post(f"{API}/auth/reset-password", json={"token": token, "password": new})
        assert r2.status_code == 200

        # old fails
        s2 = requests.Session()
        r3 = s2.post(f"{API}/auth/login", json={"email": email, "password": old})
        assert r3.status_code == 401
        # new works
        r4 = s2.post(f"{API}/auth/login", json={"email": email, "password": new})
        assert r4.status_code == 200

        # token cannot be reused
        r5 = requests.post(f"{API}/auth/reset-password", json={"token": token, "password": "another1"})
        assert r5.status_code == 400


# ---------- Multi-service booking ----------
class TestMultiBooking:
    def test_barbers_for_multiple_services(self):
        r = requests.get(f"{API}/barbers/for-services", params={"service_ids": "svc_social,svc_barba"})
        assert r.status_code == 200
        barbers = r.json()
        ids = [b["id"] for b in barbers]
        assert "barber_rd" in ids and "barber_marcos" in ids
        for b in barbers:
            assert "svc_social" in b["service_ids"] and "svc_barba" in b["service_ids"]

    def test_slots_multi_service(self):
        d = _future_weekday(3)  # Tuesday
        r = requests.get(f"{API}/availability/slots", params={
            "barber_id": "barber_rd", "service_ids": "svc_social,svc_barba", "date": d})
        assert r.status_code == 200
        assert len(r.json()) > 0

    def test_create_multi_service_appointment_online(self, user_sess):
        d = _future_weekday(4)  # Wed
        slots = requests.get(f"{API}/availability/slots", params={
            "barber_id": "barber_rd", "service_ids": "svc_social,svc_barba", "date": d}).json()
        assert slots, "expected slots"
        t = slots[0]["time"]
        r = user_sess.post(f"{API}/appointments", json={
            "barber_id": "barber_rd",
            "service_ids": ["svc_social", "svc_barba"],
            "date": d, "time": t, "phone": "11987654321",
            "payment_method": "online",
        })
        assert r.status_code == 200, r.text
        appt = r.json()
        # svc_social 2000 + svc_barba 1500 = 3500
        assert appt["price_cents"] == 3500
        assert "Corte Social" in appt["service_name"] and "Barba" in appt["service_name"]
        assert appt["payment_method"] == "online"
        user_sess._appt_online = appt

    def test_online_checkout_returns_stripe(self, user_sess):
        appt = user_sess._appt_online
        r = user_sess.post(f"{API}/payments/checkout", json={
            "appointment_id": appt["id"], "origin_url": BASE_URL})
        assert r.status_code == 200, r.text
        d = r.json()
        assert "checkout.stripe.com" in d["checkout_url"]


# ---------- Cash appointment ----------
class TestCashAppointment:
    def test_create_cash_and_admin_confirm(self, user_sess, admin_sess):
        d = _future_weekday(5)  # Thu
        slots = requests.get(f"{API}/availability/slots", params={
            "barber_id": "barber_marcos", "service_ids": "svc_barba", "date": d}).json()
        assert slots
        t = slots[0]["time"]
        r = user_sess.post(f"{API}/appointments", json={
            "barber_id": "barber_marcos", "service_ids": ["svc_barba"],
            "date": d, "time": t, "phone": "11987654321",
            "payment_method": "cash",
        })
        assert r.status_code == 200, r.text
        appt = r.json()
        assert appt["payment_method"] == "cash"
        assert appt["payment_status"] == "pending"

        rc = admin_sess.post(f"{API}/admin/appointments/{appt['id']}/confirm-cash")
        assert rc.status_code == 200
        updated = rc.json()
        assert updated["payment_status"] == "paid"
        assert updated["status"] == "confirmed"


# ---------- Subscriptions ----------
class TestSubscriptions:
    def test_subscribe_cash_and_admin_confirm(self, user_sess, admin_sess):
        r = user_sess.post(f"{API}/subscriptions", json={"plan_id": "completo", "method": "cash"})
        assert r.status_code == 200, r.text
        sub_id = r.json()["subscription_id"]

        subs = admin_sess.get(f"{API}/admin/subscriptions").json()
        assert any(s["id"] == sub_id and s["status"] == "pending_cash" for s in subs)

        rc = admin_sess.post(f"{API}/admin/subscriptions/{sub_id}/confirm")
        assert rc.status_code == 200

        mine = user_sess.get(f"{API}/subscriptions/me").json()
        target = next(s for s in mine if s["id"] == sub_id)
        assert target["status"] == "active"

    def test_subscribe_online_stripe_checkout(self, user_sess):
        r = user_sess.post(f"{API}/subscriptions", json={
            "plan_id": "completo", "method": "online", "origin_url": BASE_URL})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["method"] == "online"
        assert "checkout.stripe.com" in d["checkout_url"]

        # Verify a payment_transactions row exists with kind=subscription
        from pymongo import MongoClient
        mc = MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
        dbn = os.environ.get("DB_NAME", "test_database")
        row = mc[dbn].payment_transactions.find_one({"session_id": d["session_id"]})
        assert row is not None
        assert row["kind"] == "subscription"


# ---------- Auth guards ----------
class TestAuthGuards:
    def test_admin_endpoints_unauth_returns_401(self):
        assert requests.get(f"{API}/admin/users").status_code == 401
        assert requests.get(f"{API}/admin/subscriptions").status_code == 401
        assert requests.get(f"{API}/admin/overview").status_code == 401

    def test_admin_endpoints_normaluser_returns_403(self):
        s = requests.Session()
        email = f"TEST_guard_{int(time.time()*1000)}@teste.com"
        s.post(f"{API}/auth/register", json={"name": "G", "email": email, "password": "cliente123"})
        assert s.get(f"{API}/admin/users").status_code == 403
        assert s.get(f"{API}/admin/overview").status_code == 403
