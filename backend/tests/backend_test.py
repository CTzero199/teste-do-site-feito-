"""Padrão RD Backend tests: catalog v2, auth, booking flow, reviews, cron, admin."""
import os
import time
import pytest
import requests
from datetime import date, timedelta

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or
            open("/app/frontend/.env").read().split("REACT_APP_BACKEND_URL=")[1].splitlines()[0].strip())
BASE_URL = BASE_URL.rstrip("/")
API = f"{BASE_URL}/api"

ADMINS = [
    ("wandersoniury17@gmail.com", "PadraoRD@2026"),
    ("gerente@padraord.com", "Gerente@2026"),
    ("recepcao@padraord.com", "Recepcao@2026"),
]
CRON_SECRET = "2b14a6150bba0c9e963280704befb9a6a29ede4060d09f55add72678a5b9a61c"

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")


# ---------- Fixtures ----------
@pytest.fixture(scope="session")
def admin_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": ADMINS[0][0], "password": ADMINS[0][1]})
    assert r.status_code == 200, r.text
    return s


@pytest.fixture(scope="session")
def client_session():
    s = requests.Session()
    email = f"TEST_client_{int(time.time()*1000)}_{os.getpid()}@teste.com"
    r = s.post(f"{API}/auth/register", json={"name": "TEST Client", "email": email, "password": "cliente123"})
    assert r.status_code == 200, r.text
    s._email = email
    return s


@pytest.fixture(scope="session")
def mongo_db():
    from pymongo import MongoClient
    c = MongoClient(MONGO_URL)
    return c[DB_NAME]


# ---------- Catalog v2 (price table + categories) ----------
class TestCatalog:
    def test_catalog_shape(self):
        r = requests.get(f"{API}/catalog")
        assert r.status_code == 200
        d = r.json()
        assert len(d["services"]) >= 21, f"expected >=21 services, got {len(d['services'])}"
        # counts by category
        cats = {}
        for s in d["services"]:
            cats.setdefault(s.get("category", "Cortes"), []).append(s)
        assert len(cats.get("Cortes", [])) >= 5
        assert len(cats.get("Barba", [])) >= 4
        assert len(cats.get("Sobrancelha", [])) >= 3
        assert len(cats.get("Pintura", [])) >= 5
        assert len(cats.get("Extras", [])) >= 4

    def test_specific_prices(self):
        d = requests.get(f"{API}/catalog").json()
        by_id = {s["id"]: s for s in d["services"]}
        expected = {
            "svc_maquina": 2000, "svc_degrade": 2500, "svc_degrade_navalhado": 3000,
            "svc_barba": 1500, "svc_sob_masc": 700, "svc_platinado": 9000, "svc_selagem": 7000,
        }
        for k, v in expected.items():
            assert k in by_id, f"missing service {k}"
            assert by_id[k]["price_cents"] == v, f"{k} price {by_id[k]['price_cents']} != {v}"

    def test_barbers_have_review_count(self):
        d = requests.get(f"{API}/catalog").json()
        for b in d["barbers"]:
            assert "review_count" in b
            assert "rating" in b


# ---------- Auth ----------
class TestAuth:
    def test_all_admin_logins(self):
        for email, pw in ADMINS:
            s = requests.Session()
            r = s.post(f"{API}/auth/login", json={"email": email, "password": pw})
            assert r.status_code == 200, f"{email} => {r.status_code} {r.text}"
            assert r.json()["role"] == "admin"

    def test_register_and_me(self, client_session):
        me = client_session.get(f"{API}/auth/me")
        assert me.status_code == 200
        assert me.json()["role"] == "user"


# ---------- Booking + phone ----------
class TestBooking:
    def _future_weekday(self, weekday_target=2):
        d = date.today()
        for i in range(1, 14):
            cand = d + timedelta(days=i)
            wd = (cand.weekday() + 1) % 7
            if wd == weekday_target:
                return cand.isoformat()
        return (d + timedelta(days=2)).isoformat()

    def test_slots_available(self):
        d = self._future_weekday(2)
        r = requests.get(f"{API}/availability/slots", params={
            "barber_id": "barber_rd", "service_id": "svc_degrade", "date": d})
        assert r.status_code == 200
        assert len(r.json()) > 0

    def test_create_appointment_with_phone(self, client_session):
        d = self._future_weekday(3)
        slots = requests.get(f"{API}/availability/slots", params={
            "barber_id": "barber_rd", "service_id": "svc_degrade", "date": d}).json()
        assert slots
        t = slots[0]["time"]
        r = client_session.post(f"{API}/appointments", json={
            "barber_id": "barber_rd", "service_id": "svc_degrade",
            "date": d, "time": t, "phone": "11987654321", "customer_note": "TEST"})
        assert r.status_code == 200, r.text
        appt = r.json()
        assert appt["status"] == "pending"
        client_session._appt = appt
        # conflict
        r2 = client_session.post(f"{API}/appointments", json={
            "barber_id": "barber_rd", "service_id": "svc_degrade",
            "date": d, "time": t, "phone": "11987654321"})
        assert r2.status_code == 409

    def test_phone_stored_and_normalized(self, client_session, mongo_db):
        aid = client_session._appt["id"]
        doc = mongo_db.appointments.find_one({"id": aid})
        assert doc is not None
        # normalize adds +55 prefix
        assert doc.get("phone", "").startswith("+55"), f"phone={doc.get('phone')}"

    def test_checkout_redirect(self, client_session):
        r = client_session.post(f"{API}/payments/checkout", json={
            "appointment_id": client_session._appt["id"], "origin_url": BASE_URL})
        assert r.status_code == 200, r.text
        assert "checkout.stripe.com" in r.json()["checkout_url"]


# ---------- Reviews ----------
class TestReviews:
    def test_review_rejected_when_not_paid(self, client_session):
        # create a fresh pending appointment
        d = date.today()
        for i in range(1, 10):
            cand = d + timedelta(days=i)
            wd = (cand.weekday() + 1) % 7
            if wd in (1, 2, 3, 4, 5, 6):
                d = cand.isoformat()
                break
        slots = requests.get(f"{API}/availability/slots", params={
            "barber_id": "barber_rd", "service_id": "svc_social", "date": d}).json()
        assert slots
        appt = client_session.post(f"{API}/appointments", json={
            "barber_id": "barber_rd", "service_id": "svc_social",
            "date": d, "time": slots[-1]["time"], "phone": "11987654321"}).json()
        r = client_session.post(f"{API}/appointments/{appt['id']}/review", json={"rating": 5, "comment": "x"})
        assert r.status_code == 400
        assert "pago" in r.json()["detail"].lower()

    def test_review_flow_paid(self, client_session, mongo_db):
        # create a fresh appointment then mark paid directly
        d = date.today() + timedelta(days=7)
        for i in range(7):
            cand = d + timedelta(days=i)
            wd = (cand.weekday() + 1) % 7
            if wd in (1, 2, 3, 4, 5, 6):
                d = cand.isoformat()
                break
        else:
            d = d.isoformat()
        slots = requests.get(f"{API}/availability/slots", params={
            "barber_id": "barber_marcos", "service_id": "svc_barba", "date": d}).json()
        assert slots
        t = slots[-1]["time"]
        appt = client_session.post(f"{API}/appointments", json={
            "barber_id": "barber_marcos", "service_id": "svc_barba",
            "date": d, "time": t, "phone": "11987654321"}).json()
        aid = appt["id"]
        # mark paid via mongo
        mongo_db.appointments.update_one(
            {"id": aid}, {"$set": {"payment_status": "paid", "status": "confirmed"}}
        )
        # capture rating before
        before_reviews = requests.get(f"{API}/barbers/barber_marcos/reviews").json()
        rc_before = len(before_reviews)

        # submit review
        r = client_session.post(f"{API}/appointments/{aid}/review",
                                 json={"rating": 4, "comment": "TEST muito bom"})
        assert r.status_code == 200, r.text
        # 2nd attempt -> 400
        r2 = client_session.post(f"{API}/appointments/{aid}/review",
                                  json={"rating": 5, "comment": "again"})
        assert r2.status_code == 400
        # GET /barbers/{id}/reviews shows it
        revs = requests.get(f"{API}/barbers/barber_marcos/reviews").json()
        assert any(rv.get("comment") == "TEST muito bom" for rv in revs)
        assert len(revs) == rc_before + 1
        # catalog review_count reflects total reviews (recomputed)
        after = requests.get(f"{API}/catalog").json()
        barber_after = next(b for b in after["barbers"] if b["id"] == "barber_marcos")
        assert barber_after["review_count"] == len(revs)
        # cleanup
        mongo_db.reviews.delete_many({"comment": "TEST muito bom"})
        mongo_db.appointments.delete_one({"id": aid})

    def test_review_invalid_rating(self, client_session):
        r = client_session.post(f"{API}/appointments/anything/review",
                                json={"rating": 6, "comment": ""})
        assert r.status_code == 422


# ---------- Cron reminders ----------
class TestCron:
    def test_cron_requires_bearer(self):
        r = requests.post(f"{API}/cron/reminders")
        assert r.status_code == 401

    def test_cron_wrong_secret(self):
        r = requests.post(f"{API}/cron/reminders", headers={"Authorization": "Bearer wrong"})
        assert r.status_code == 401

    def test_cron_accepted(self):
        r = requests.post(f"{API}/cron/reminders",
                          headers={"Authorization": f"Bearer {CRON_SECRET}"})
        assert r.status_code == 200
        assert r.json().get("status") == "accepted"


# ---------- Admin services with category ----------
class TestAdminServices:
    def test_service_crud_with_category(self, admin_session):
        r = admin_session.post(f"{API}/admin/services", json={
            "name": "TEST_Svc", "description": "d", "category": "Pintura",
            "duration_minutes": 30, "price_cents": 1000, "active": True})
        assert r.status_code == 200
        svc = r.json()
        assert svc["category"] == "Pintura"
        sid = svc["id"]
        r2 = admin_session.post(f"{API}/admin/services", json={
            "id": sid, "name": "TEST_Svc2", "category": "Extras",
            "duration_minutes": 30, "price_cents": 2000, "active": True})
        assert r2.status_code == 200 and r2.json()["category"] == "Extras"
        r3 = admin_session.delete(f"{API}/admin/services/{sid}")
        assert r3.status_code == 200

    def test_admin_overview(self, admin_session):
        r = admin_session.get(f"{API}/admin/overview")
        assert r.status_code == 200
        d = r.json()
        assert "stats" in d and len(d["services"]) >= 21
