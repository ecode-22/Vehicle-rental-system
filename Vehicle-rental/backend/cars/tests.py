import importlib
import os
from io import BytesIO
import tempfile
from datetime import timedelta
from unittest import mock
from PIL import Image
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APITestCase
from rest_framework.throttling import SimpleRateThrottle
from django.test.utils import override_settings
from django.utils import timezone
from accounts.models import User
from cars.models import Booking, Car

# Logins are limited to 20/hour and the counter lives in a cache. These tests log in far more often than
# that, so each test run uses its own in-memory cache and a high limit (otherwise the suite fails with 429).
IN_MEMORY_CACHE = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}


@override_settings(CACHES=IN_MEMORY_CACHE)
@mock.patch.object(SimpleRateThrottle, "THROTTLE_RATES", {"login": "10000/h"})
class FlowTest(APITestCase):
    def test_missing_env_defaults_to_dev_settings(self):
        import config.settings as settings_module

        original_debug = os.environ.get("DJANGO_DEBUG")
        original_secret = os.environ.get("DJANGO_SECRET_KEY")
        os.environ.pop("DJANGO_DEBUG", None)
        os.environ.pop("DJANGO_SECRET_KEY", None)

        try:
            reloaded = importlib.reload(settings_module)
            self.assertTrue(reloaded.DEBUG)
            self.assertTrue(reloaded.SECRET_KEY)
        finally:
            if original_debug is None:
                os.environ.pop("DJANGO_DEBUG", None)
            else:
                os.environ["DJANGO_DEBUG"] = original_debug
            if original_secret is None:
                os.environ.pop("DJANGO_SECRET_KEY", None)
            else:
                os.environ["DJANGO_SECRET_KEY"] = original_secret
            importlib.reload(settings_module)

    def auth(self, username, role, phone="082 123 4567", email=""):
        self.client.credentials()
        payload = {"username": username, "password": "pass12345", "role": role, "phone": phone, "email": email}
        self.client.post("/api/auth/register/", payload, format="json")
        r = self.client.post("/api/auth/login/", {"username": username, "password": "pass12345"}, format="json")
        self.assertEqual(r.status_code, 200)
        self.client.credentials(HTTP_AUTHORIZATION="Bearer " + r.data["access"])
        return r.data

    def car_data(self, **extra):
        return {"make": "Toyota", "model": "Corolla", "year": 2022, "price_per_day": "500", "location": "Cape Town, Western Cape", "latitude": -33.9249, "longitude": 18.4241, **extra}

    def trip(self, car_id, start, end, **extra):
        return {"car": car_id, "start_date": start, "end_date": end, "collection_location": "Durban North, KwaZulu-Natal", "dropoff_location": "Stellenbosch, Western Cape", **extra}

    def listed_ids(self):
        return [row["id"] for row in self.client.get("/api/cars/").data]

    def test_full_flow(self):
        self.auth("rent", "renter")
        no_location = self.client.post("/api/cars/", {"make": "Mazda", "model": "2", "year": 2022, "price_per_day": "300"}, format="json")
        self.assertEqual(no_location.status_code, 400)
        car = self.client.post("/api/cars/", self.car_data(), format="json")
        self.assertEqual(car.status_code, 201)
        cid = car.data["id"]

        self.auth("cust", "customer")
        self.assertEqual(self.client.post("/api/cars/", self.car_data(), format="json").status_code, 403)
        s, e = timezone.localdate() + timedelta(days=1), timezone.localdate() + timedelta(days=3)
        # the customer chooses where to collect and return the car; it does not have to match the car's location
        b = self.client.post("/api/bookings/", self.trip(cid, s, e), format="json")
        self.assertEqual(b.status_code, 201)
        self.assertEqual(float(b.data["total_price"]), 1500.0)
        self.assertEqual(b.data["collection_location"], "Durban North, KwaZulu-Natal")
        self.assertEqual(b.data["dropoff_location"], "Stellenbosch, Western Cape")
        competing = self.client.post("/api/bookings/", self.trip(cid, s, e), format="json")
        self.assertEqual(competing.status_code, 201)

        self.auth("rent", "renter")
        d = self.client.get("/api/dashboard/").data
        self.assertEqual(d["pending_requests"], 2)
        self.assertEqual(self.client.post(f"/api/bookings/{b.data['id']}/confirm/").status_code, 200)
        competing_result = next(row for row in self.client.get("/api/bookings/").data if row["id"] == competing.data["id"])
        self.assertEqual(competing_result["status"], "rejected")

        self.auth("cust", "customer")
        dup = self.client.post("/api/bookings/", self.trip(cid, s, e), format="json")
        self.assertEqual(dup.status_code, 400)
        self.assertEqual(self.client.get("/api/dashboard/").data["confirmed"], 1)

    def test_customer_must_choose_pickup_and_dropoff_and_can_add_map_points(self):
        self.auth("handover_owner", "renter")
        car = self.client.post("/api/cars/", self.car_data(), format="json")
        self.auth("handover_customer", "customer")
        s = timezone.localdate() + timedelta(days=2)

        missing = {"car": car.data["id"], "start_date": s, "end_date": s}
        self.assertEqual(self.client.post("/api/bookings/", missing, format="json").status_code, 400)
        no_dropoff = self.client.post("/api/bookings/", {**missing, "collection_location": "Sandton"}, format="json")
        self.assertEqual(no_dropoff.status_code, 400)
        self.assertIn("dropoff_location", no_dropoff.data)
        half_point = self.client.post("/api/bookings/", self.trip(car.data["id"], s, s, collection_latitude=-26.1), format="json")
        self.assertEqual(half_point.status_code, 400)

        booking = self.client.post("/api/bookings/", self.trip(
            car.data["id"], s, s,
            collection_latitude=-29.79, collection_longitude=31.03, dropoff_latitude=-33.93, dropoff_longitude=18.86,
        ), format="json")
        self.assertEqual(booking.status_code, 201)
        self.assertEqual(booking.data["collection_latitude"], -29.79)
        self.assertEqual(booking.data["dropoff_longitude"], 18.86)
        # the owner sees the customer's points on their booking
        self.auth("handover_owner", "renter")
        row = self.client.get("/api/bookings/").data[0]
        self.assertEqual(row["collection_location"], "Durban North, KwaZulu-Natal")
        self.assertEqual(row["dropoff_latitude"], -33.93)

    def test_owner_contact_is_part_of_every_ad_for_signed_in_users(self):
        self.auth("contact_owner", "renter", phone="083 555 0100", email="owner@example.com")
        car = self.client.post("/api/cars/", self.car_data(), format="json")
        self.assertEqual(car.status_code, 201)
        self.assertEqual(car.data["owner_contact"], {"name": "contact_owner", "phone": "083 555 0100", "email": "owner@example.com"})

        self.auth("contact_customer", "customer")
        listed = self.client.get("/api/cars/").data[0]
        self.assertEqual(listed["owner_contact"]["phone"], "083 555 0100")
        self.assertEqual(self.client.get(f"/api/cars/{car.data['id']}/").data["owner_contact"]["email"], "owner@example.com")

        # visitors who are not signed in can browse, but do not get the owner's phone or email
        self.client.credentials()
        self.assertIsNone(self.client.get("/api/cars/").data[0]["owner_contact"])
        self.assertIsNone(self.client.get(f"/api/cars/{car.data['id']}/").data["owner_contact"])

    def test_owner_needs_a_contact_phone_to_list_a_car(self):
        self.auth("no_phone_owner", "renter", phone="")
        without = self.client.post("/api/cars/", self.car_data(), format="json")
        self.assertEqual(without.status_code, 400)
        self.assertIn("contact_phone", without.data)
        invalid = self.client.post("/api/cars/", self.car_data(contact_phone="abc"), format="json")
        self.assertEqual(invalid.status_code, 400)

        created = self.client.post("/api/cars/", self.car_data(contact_phone="082 999 8877"), format="json")
        self.assertEqual(created.status_code, 201)
        self.assertEqual(created.data["owner_contact"]["phone"], "082 999 8877")
        self.assertNotIn("contact_phone", created.data)
        self.assertEqual(self.client.get("/api/auth/me/").data["phone"], "082 999 8877")  # saved on the profile

        # later ads reuse the profile phone; changing it on one ad updates every ad
        second = self.client.post("/api/cars/", self.car_data(model="Yaris"), format="json")
        self.assertEqual(second.status_code, 201)
        self.client.patch(f"/api/cars/{second.data['id']}/", {"contact_phone": "071 000 1111"}, format="json")
        mine = self.client.get("/api/cars/mine/").data
        self.assertEqual({row["owner_contact"]["phone"] for row in mine}, {"071 000 1111"})

    def test_completed_booking_unlocks_reviews_and_consent(self):
        self.auth("review_renter", "renter")
        car = self.client.post("/api/cars/", self.car_data(make="Honda", model="Fit", year=2023, price_per_day="400"), format="json")
        self.assertEqual(car.status_code, 201)

        self.auth("review_customer", "customer")
        start = timezone.localdate()
        booking = self.client.post("/api/bookings/", self.trip(car.data["id"], start, start), format="json")
        self.assertEqual(booking.status_code, 201)

        self.auth("review_renter", "renter")
        check_request = self.client.post("/api/background-checks/", {"booking_id": booking.data["id"]}, format="json")
        self.assertEqual(check_request.status_code, 201)
        repeated_check_request = self.client.post("/api/background-checks/", {"booking_id": booking.data["id"]}, format="json")
        self.assertEqual(repeated_check_request.status_code, 200)
        self.assertEqual(repeated_check_request.data["id"], check_request.data["id"])

        self.auth("review_customer", "customer")
        self.assertEqual(self.client.post(f"/api/background-checks/{check_request.data['id']}/respond/", {"decision": "consented"}, format="json").status_code, 200)
        self.assertEqual(self.client.post("/api/reviews/", {"booking_id": booking.data["id"], "target_car": car.data["id"], "score": 5}, format="json").status_code, 400)

        self.auth("review_renter", "renter")
        self.assertEqual(self.client.post(f"/api/bookings/{booking.data['id']}/confirm/").status_code, 200)
        self.assertEqual(self.client.post(f"/api/bookings/{booking.data['id']}/complete/").status_code, 200)

        self.auth("review_customer", "customer")
        review = self.client.post("/api/reviews/", {"booking_id": booking.data["id"], "target_car": car.data["id"], "score": 5, "comment": "Clean and ready to go."}, format="json")
        self.assertEqual(review.status_code, 201)
        self.assertEqual(self.client.get("/api/cars/").data[0]["average_rating"], 5.0)
        public_reviews = self.client.get(f"/api/cars/{car.data['id']}/reviews/")
        self.assertEqual(public_reviews.status_code, 200)
        self.assertEqual(public_reviews.data[0]["comment"], "Clean and ready to go.")
        self.assertEqual(self.client.post("/api/reviews/", {"booking_id": booking.data["id"], "target_user": booking.data["customer"], "score": 5}, format="json").status_code, 400)

    def test_renter_can_report_only_their_own_car(self):
        self.auth("report_owner", "renter")
        car = self.client.post("/api/cars/", self.car_data(make="Mazda", model="2", price_per_day="300", location="Paarl, Western Cape"), format="json")
        report = self.client.post("/api/problem-reports/", {"car": car.data["id"], "description": "Tyre needs inspection."}, format="json")
        self.assertEqual(report.status_code, 201)
        self.assertEqual(report.data["status"], "open")

        self.auth("report_customer", "customer")
        self.assertEqual(self.client.post("/api/problem-reports/", {"car": car.data["id"], "description": "Issue"}, format="json").status_code, 400)

    def test_invalid_price_filter_returns_validation_error(self):
        for value in ("abc", "-1", "NaN"):
            response = self.client.get(f"/api/cars/?max_price={value}")
            self.assertEqual(response.status_code, 400)

    def test_car_location_must_be_a_real_map_point(self):
        self.auth("coordinate_owner", "renter")
        created = self.client.post("/api/cars/", self.car_data(model="Yaris"), format="json")
        self.assertEqual(created.status_code, 201)
        self.assertEqual(created.data["latitude"], -33.9249)
        self.assertEqual(created.data["longitude"], 18.4241)
        self.assertEqual(created.data["location"], "Cape Town, Western Cape")

        self.assertEqual(self.client.post("/api/cars/", self.car_data(model="Invalid", latitude=100), format="json").status_code, 400)
        self.assertEqual(self.client.post("/api/cars/", self.car_data(model="Incomplete", longitude=None), format="json").status_code, 400)
        # a car with no map point cannot be listed: it has to appear on the map
        unlocated = self.client.post("/api/cars/", self.car_data(model="Unlocated", latitude="", longitude=""), format="multipart")
        self.assertEqual(unlocated.status_code, 400)
        self.assertIn("location", unlocated.data)
        blank_location = self.client.post("/api/cars/", self.car_data(model="Blank", location=""), format="json")
        self.assertEqual(blank_location.status_code, 400)
        # editing something else on an existing car keeps its map point
        edited = self.client.patch(f"/api/cars/{created.data['id']}/", {"price_per_day": "650"}, format="json")
        self.assertEqual(edited.status_code, 200)
        self.assertEqual(edited.data["latitude"], -33.9249)

    def test_date_search_excludes_confirmed_overlap_and_exposes_availability(self):
        self.auth("date_owner", "renter")
        car = self.client.post("/api/cars/", self.car_data(make="Mazda", model="3", year=2024, price_per_day="350"), format="json")
        self.assertEqual(car.status_code, 201)

        start = timezone.localdate() + timedelta(days=10)
        end = start + timedelta(days=2)
        self.auth("date_customer", "customer")
        booking = self.client.post("/api/bookings/", self.trip(car.data["id"], start, end), format="json")
        self.assertEqual(booking.status_code, 201)

        self.auth("date_owner", "renter")
        self.assertEqual(self.client.post(f"/api/bookings/{booking.data['id']}/confirm/").status_code, 200)
        availability = self.client.get(f"/api/cars/{car.data['id']}/availability/")
        self.assertEqual(availability.status_code, 200)
        self.assertEqual(availability.data, [{"start_date": start, "end_date": end}])

        query = f"start_date={start.isoformat()}&end_date={end.isoformat()}"
        self.assertEqual(self.client.get(f"/api/cars/?{query}").data, [])
        self.assertEqual(self.client.get(f"/api/cars/?start_date={start.isoformat()}").status_code, 400)

    def test_public_car_list_preloads_owner_and_photos(self):
        self.auth("query_owner", "renter")
        for index in range(3):
            response = self.client.post("/api/cars/", self.car_data(model=f"Model {index}", year=2024, price_per_day="300"), format="json")
            self.assertEqual(response.status_code, 201)

        self.client.credentials()
        with self.assertNumQueries(2):
            response = self.client.get("/api/cars/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 3)

    def test_pausing_a_car_hides_it_and_blocks_booking_until_resumed(self):
        self.auth("pause_owner", "renter")
        car = self.client.post("/api/cars/", self.car_data(), format="json")
        cid = car.data["id"]
        self.assertEqual(car.data["status"], "active")
        start = timezone.localdate() + timedelta(days=2)

        self.auth("pause_customer", "customer")
        pending = self.client.post("/api/bookings/", self.trip(cid, start, start), format="json")
        self.assertEqual(pending.status_code, 201)
        self.assertEqual(self.client.post(f"/api/cars/{cid}/pause/").status_code, 403)  # customers cannot pause

        self.auth("pause_other_owner", "renter")
        self.assertIn(self.client.post(f"/api/cars/{cid}/pause/").status_code, (403, 404))  # nor can another owner

        self.auth("pause_owner", "renter")
        paused = self.client.post(f"/api/cars/{cid}/pause/")
        self.assertEqual(paused.status_code, 200)
        self.assertEqual(paused.data["status"], "paused")
        self.assertEqual(self.client.get("/api/cars/mine/").data[0]["status"], "paused")
        # a pending request cannot be confirmed while the car is paused
        blocked_confirm = self.client.post(f"/api/bookings/{pending.data['id']}/confirm/")
        self.assertEqual(blocked_confirm.status_code, 400)
        self.assertIn("paused", blocked_confirm.data["detail"])

        self.auth("pause_customer", "customer")
        self.assertNotIn(cid, self.listed_ids())
        self.assertEqual(self.client.get("/api/cars/?all=1").data, [])  # the old "show everything" switch is gone
        detail = self.client.get(f"/api/cars/{cid}/")
        self.assertEqual(detail.status_code, 200)  # a direct link still explains why it cannot be booked
        self.assertEqual(detail.data["status"], "paused")
        refused = self.client.post("/api/bookings/", self.trip(cid, start + timedelta(days=5), start + timedelta(days=6)), format="json")
        self.assertEqual(refused.status_code, 400)
        self.assertIn("maintenance", str(refused.data))

        self.auth("pause_owner", "renter")
        self.assertEqual(self.client.post(f"/api/cars/{cid}/resume/").data["status"], "active")
        self.auth("pause_customer", "customer")
        self.assertIn(cid, self.listed_ids())
        self.assertEqual(self.client.post("/api/bookings/", self.trip(cid, start + timedelta(days=5), start + timedelta(days=6)), format="json").status_code, 201)

    def test_booked_car_leaves_discovery_and_cannot_be_double_booked(self):
        self.auth("booked_owner", "renter")
        car = self.client.post("/api/cars/", self.car_data(), format="json")
        cid = car.data["id"]
        start = timezone.localdate() + timedelta(days=4)
        end = start + timedelta(days=2)

        self.auth("booked_customer", "customer")
        booking = self.client.post("/api/bookings/", self.trip(cid, start, end), format="json")
        self.assertEqual(booking.status_code, 201)
        self.assertIn(cid, self.listed_ids())  # a request alone does not take the car off the board

        self.auth("booked_owner", "renter")
        self.assertEqual(self.client.post(f"/api/bookings/{booking.data['id']}/confirm/").status_code, 200)
        mine = self.client.get("/api/cars/mine/").data[0]
        self.assertEqual((mine["status"], mine["booked_until"]), ("booked", end))

        self.auth("another_customer", "customer")
        self.assertNotIn(cid, self.listed_ids())
        detail = self.client.get(f"/api/cars/{cid}/").data
        self.assertEqual((detail["status"], detail["booked_until"]), ("booked", end))
        # even a different, non-overlapping date range is refused: the car is booked
        later = self.client.post("/api/bookings/", self.trip(cid, end + timedelta(days=30), end + timedelta(days=31)), format="json")
        self.assertEqual(later.status_code, 400)
        self.assertIn("already booked", str(later.data))

        # cancelling puts it back on the board
        self.auth("booked_customer", "customer")
        self.assertEqual(self.client.post(f"/api/bookings/{booking.data['id']}/cancel/").status_code, 200)
        self.assertIn(cid, self.listed_ids())

    def test_finished_or_unconfirmed_bookings_do_not_hide_a_car(self):
        self.auth("history_owner", "renter")
        car = self.client.post("/api/cars/", self.car_data(), format="json")
        owner = User.objects.get(username="history_owner")
        customer = User.objects.create_user("history_customer", password="pass12345")
        today = timezone.localdate()
        past = Booking.objects.create(car_id=car.data["id"], customer=customer, start_date=today - timedelta(days=9), end_date=today - timedelta(days=7), total_price=1, status=Booking.CONFIRMED)
        self.assertIn(car.data["id"], self.listed_ids())  # ended last week
        past.delete()
        for state in (Booking.PENDING, Booking.REJECTED, Booking.CANCELLED, Booking.COMPLETED):
            Booking.objects.create(car_id=car.data["id"], customer=customer, start_date=today + timedelta(days=1), end_date=today + timedelta(days=2), total_price=1, status=state)
        self.assertIn(car.data["id"], self.listed_ids())
        Booking.objects.create(car_id=car.data["id"], customer=customer, start_date=today, end_date=today, total_price=1, status=Booking.CONFIRMED)
        self.assertNotIn(car.data["id"], self.listed_ids())  # a rental that ends today is still running
        self.assertEqual(owner.cars.count(), 1)

    def test_deleting_car_archives_it_and_preserves_booking_history(self):
        self.auth("archive_owner", "renter")
        car = self.client.post("/api/cars/", self.car_data(make="Kia", model="Picanto", year=2024, price_per_day="250"), format="json")
        self.assertEqual(car.status_code, 201)

        self.auth("archive_customer", "customer")
        start = timezone.localdate() + timedelta(days=2)
        booking = self.client.post("/api/bookings/", self.trip(car.data["id"], start, start), format="json")
        self.assertEqual(booking.status_code, 201)

        self.auth("archive_owner", "renter")
        self.assertEqual(self.client.get("/api/dashboard/").data["total_cars"], 1)
        deleted = self.client.delete(f"/api/cars/{car.data['id']}/")
        self.assertEqual(deleted.status_code, 204)
        self.assertEqual(self.client.get("/api/cars/mine/").data[0]["is_archived"], True)
        self.assertEqual(self.client.get("/api/cars/mine/").data[0]["status"], "removed")
        self.assertEqual(self.client.get("/api/dashboard/").data["total_cars"], 0)
        self.assertFalse(any(row["id"] == car.data["id"] for row in self.client.get("/api/cars/").data))

        self.auth("archive_customer", "customer")
        self.assertEqual(self.client.get("/api/bookings/").data[0]["id"], booking.data["id"])

    def test_renter_image_upload_is_visible_in_public_car_list(self):
        self.auth("photo_renter", "renter")
        image_bytes = BytesIO()
        Image.new("RGB", (2, 2), color="green").save(image_bytes, format="PNG")
        image_bytes.seek(0)

        with tempfile.TemporaryDirectory() as media_dir, override_settings(MEDIA_ROOT=media_dir):
            response = self.client.post("/api/cars/", {
                "make": "Honda",
                "model": "Fit",
                "year": 2023,
                "price_per_day": "400",
                "location": "Stellenbosch, Western Cape",
                "latitude": "-33.9321",
                "longitude": "18.8602",
                "image": SimpleUploadedFile("honda-fit.png", image_bytes.read(), content_type="image/png"),
                "photos": [
                    SimpleUploadedFile("honda-front.png", image_bytes.getvalue(), content_type="image/png"),
                    SimpleUploadedFile("honda-side.png", image_bytes.getvalue(), content_type="image/png"),
                ],
            }, format="multipart")

            self.assertEqual(response.status_code, 201)
            self.assertIn("/media/cars/honda-fit.png", response.data["image"])
            public_cars = self.client.get("/api/cars/")
            self.assertEqual(public_cars.status_code, 200)
            self.assertEqual(public_cars.data[0]["image"], response.data["image"])
            self.assertEqual(len(public_cars.data[0]["photos"]), 2)
            self.assertEqual(public_cars.data[0]["photos"][0]["image"], response.data["photos"][0]["image"])
