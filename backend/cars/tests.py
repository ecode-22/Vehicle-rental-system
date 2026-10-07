from io import BytesIO
import tempfile
from datetime import date, timedelta
from PIL import Image
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APITestCase
from django.test.utils import override_settings
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
        car = self.client.post("/api/cars/", {"make": "Toyota", "model": "Corolla", "year": 2022, "price_per_day": "500"}, format="json")
        self.assertEqual(car.status_code, 201)
        cid = car.data["id"]

        self.auth("cust", "customer")
        self.assertEqual(self.client.post("/api/cars/", {"make": "x", "model": "y", "year": 2020, "price_per_day": "1"}, format="json").status_code, 403)
        s, e = date.today() + timedelta(days=1), date.today() + timedelta(days=3)
        b = self.client.post("/api/bookings/", {"car": cid, "start_date": s, "end_date": e}, format="json")
        self.assertEqual(b.status_code, 201)
        self.assertEqual(float(b.data["total_price"]), 1500.0)

        self.auth("rent", "renter")
        d = self.client.get("/api/dashboard/").data
        self.assertEqual(d["pending_requests"], 1)
        self.assertEqual(self.client.post(f"/api/bookings/{b.data['id']}/confirm/").status_code, 200)

        self.auth("cust", "customer")
        dup = self.client.post("/api/bookings/", {"car": cid, "start_date": s, "end_date": e}, format="json")
        self.assertEqual(dup.status_code, 400)
        self.assertEqual(self.client.get("/api/dashboard/").data["confirmed"], 1)

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
                "available": "true",
                "image": SimpleUploadedFile("honda-fit.png", image_bytes.read(), content_type="image/png"),
            }, format="multipart")

            self.assertEqual(response.status_code, 201)
            self.assertIn("/media/cars/honda-fit.png", response.data["image"])
            public_cars = self.client.get("/api/cars/")
            self.assertEqual(public_cars.status_code, 200)
            self.assertEqual(public_cars.data[0]["image"], response.data["image"])
