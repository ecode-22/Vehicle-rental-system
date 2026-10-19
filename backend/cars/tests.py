from io import BytesIO
import tempfile
from datetime import timedelta
from PIL import Image
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APITestCase
from django.test.utils import override_settings
from django.utils import timezone
from accounts.models import User


class FlowTest(APITestCase):
    def auth(self, username, role):
        self.client.post("/api/auth/register/", {"username": username, "password": "pass12345", "role": role}, format="json")
        r = self.client.post("/api/auth/login/", {"username": username, "password": "pass12345"}, format="json")
        self.assertEqual(r.status_code, 200)
        self.client.credentials(HTTP_AUTHORIZATION="Bearer " + r.data["access"])
        return r.data

    def test_full_flow(self):
        self.auth("rent", "renter")
        missing_handover = self.client.post("/api/cars/", {"make": "Mazda", "model": "2", "year": 2022, "price_per_day": "300"}, format="json")
        self.assertEqual(missing_handover.status_code, 400)
        car = self.client.post("/api/cars/", {"make": "Toyota", "model": "Corolla", "year": 2022, "price_per_day": "500", "collection_location": "Cape Town", "dropoff_location": "Stellenbosch"}, format="json")
        self.assertEqual(car.status_code, 201)
        cid = car.data["id"]

        self.auth("cust", "customer")
        self.assertEqual(self.client.post("/api/cars/", {"make": "x", "model": "y", "year": 2020, "price_per_day": "1"}, format="json").status_code, 403)
        s, e = timezone.localdate() + timedelta(days=1), timezone.localdate() + timedelta(days=3)
        wrong_handover = self.client.post("/api/bookings/", {"car": cid, "start_date": s, "end_date": e, "collection_location": "Durban", "dropoff_location": "Stellenbosch"}, format="json")
        self.assertEqual(wrong_handover.status_code, 400)
        b = self.client.post("/api/bookings/", {"car": cid, "start_date": s, "end_date": e, "collection_location": "Cape Town", "dropoff_location": "Stellenbosch"}, format="json")
        self.assertEqual(b.status_code, 201)
        self.assertEqual(float(b.data["total_price"]), 1500.0)
        competing = self.client.post("/api/bookings/", {"car": cid, "start_date": s, "end_date": e, "collection_location": "Cape Town", "dropoff_location": "Stellenbosch"}, format="json")
        self.assertEqual(competing.status_code, 201)

        self.auth("rent", "renter")
        d = self.client.get("/api/dashboard/").data
        self.assertEqual(d["pending_requests"], 2)
        self.assertEqual(self.client.post(f"/api/bookings/{b.data['id']}/confirm/").status_code, 200)
        competing_result = next(row for row in self.client.get("/api/bookings/").data if row["id"] == competing.data["id"])
        self.assertEqual(competing_result["status"], "rejected")

        self.auth("cust", "customer")
        dup = self.client.post("/api/bookings/", {"car": cid, "start_date": s, "end_date": e, "collection_location": "Cape Town", "dropoff_location": "Stellenbosch"}, format="json")
        self.assertEqual(dup.status_code, 400)
        self.assertEqual(self.client.get("/api/dashboard/").data["confirmed"], 1)

    def test_completed_booking_unlocks_reviews_and_consent(self):
        self.auth("review_renter", "renter")
        car = self.client.post("/api/cars/", {"make": "Honda", "model": "Fit", "year": 2023, "price_per_day": "400", "collection_location": "Cape Town", "dropoff_location": "Cape Town"}, format="json")
        self.assertEqual(car.status_code, 201)

        self.auth("review_customer", "customer")
        start = timezone.localdate()
        booking = self.client.post("/api/bookings/", {"car": car.data["id"], "start_date": start, "end_date": start, "collection_location": "Cape Town", "dropoff_location": "Cape Town"}, format="json")
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
        car = self.client.post("/api/cars/", {"make": "Mazda", "model": "2", "year": 2022, "price_per_day": "300", "collection_location": "Paarl", "dropoff_location": "Cape Town"}, format="json")
        report = self.client.post("/api/problem-reports/", {"car": car.data["id"], "description": "Tyre needs inspection."}, format="json")
        self.assertEqual(report.status_code, 201)
        self.assertEqual(report.data["status"], "open")

        self.auth("report_customer", "customer")
        self.assertEqual(self.client.post("/api/problem-reports/", {"car": car.data["id"], "description": "Issue"}, format="json").status_code, 400)

    def test_invalid_price_filter_returns_validation_error(self):
        for value in ("abc", "-1", "NaN"):
            response = self.client.get(f"/api/cars/?max_price={value}")
            self.assertEqual(response.status_code, 400)

    def test_car_coordinates_are_saved_and_validated(self):
        self.auth("coordinate_owner", "renter")
        payload = {
            "make": "Toyota",
            "model": "Yaris",
            "year": 2024,
            "price_per_day": "300",
            "collection_location": "Cape Town",
            "dropoff_location": "Cape Town",
            "latitude": -33.9249,
            "longitude": 18.4241,
        }
        created = self.client.post("/api/cars/", payload, format="json")
        self.assertEqual(created.status_code, 201)
        self.assertEqual(created.data["latitude"], -33.9249)
        self.assertEqual(created.data["longitude"], 18.4241)

        invalid = {**payload, "model": "Invalid", "latitude": 100}
        self.assertEqual(self.client.post("/api/cars/", invalid, format="json").status_code, 400)

        incomplete = {**payload, "model": "Incomplete", "longitude": None}
        self.assertEqual(self.client.post("/api/cars/", incomplete, format="json").status_code, 400)

        unlocated = {
            "make": "Honda",
            "model": "Unlocated",
            "year": 2024,
            "price_per_day": "300",
            "collection_location": "Paarl",
            "dropoff_location": "Paarl",
            "latitude": "",
            "longitude": "",
        }
        response = self.client.post("/api/cars/", unlocated, format="multipart")
        self.assertEqual(response.status_code, 201)
        self.assertIsNone(response.data["latitude"])
        self.assertIsNone(response.data["longitude"])

    def test_public_car_list_preloads_owner_and_photos(self):
        self.auth("query_owner", "renter")
        for index in range(3):
            response = self.client.post("/api/cars/", {
                "make": "Toyota",
                "model": f"Model {index}",
                "year": 2024,
                "price_per_day": "300",
                "collection_location": "Cape Town",
                "dropoff_location": "Cape Town",
            }, format="json")
            self.assertEqual(response.status_code, 201)

        self.client.credentials()
        with self.assertNumQueries(2):
            response = self.client.get("/api/cars/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 3)

    def test_deleting_car_archives_it_and_preserves_booking_history(self):
        self.auth("archive_owner", "renter")
        car = self.client.post("/api/cars/", {"make": "Kia", "model": "Picanto", "year": 2024, "price_per_day": "250", "collection_location": "Cape Town", "dropoff_location": "Cape Town"}, format="json")
        self.assertEqual(car.status_code, 201)

        self.auth("archive_customer", "customer")
        start = timezone.localdate() + timedelta(days=2)
        booking = self.client.post("/api/bookings/", {"car": car.data["id"], "start_date": start, "end_date": start, "collection_location": "Cape Town", "dropoff_location": "Cape Town"}, format="json")
        self.assertEqual(booking.status_code, 201)

        self.auth("archive_owner", "renter")
        deleted = self.client.delete(f"/api/cars/{car.data['id']}/")
        self.assertEqual(deleted.status_code, 204)
        self.assertEqual(self.client.get("/api/cars/mine/").data[0]["is_archived"], True)
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
                "location": "Stellenbosch",
                "collection_location": "Stellenbosch",
                "dropoff_location": "Cape Town",
                "available": "true",
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
