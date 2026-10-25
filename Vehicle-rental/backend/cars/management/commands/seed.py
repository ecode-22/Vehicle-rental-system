from django.core.management.base import BaseCommand
from accounts.models import User
from cars.models import Car


class Command(BaseCommand):
    help = "Create demo users (renter1 / customer1, password: demo12345) and sample cars"

    def handle(self, *args, **opts):
        renter, _ = User.objects.get_or_create(username="renter1", defaults={"role": "renter", "email": "renter@example.com"})
        renter.phone = "+27 82 555 0101"
        renter.set_password("demo12345"); renter.save()
        cust, _ = User.objects.get_or_create(username="customer1", defaults={"role": "customer", "email": "customer@example.com"})
        cust.phone = "+27 82 555 0102"
        cust.set_password("demo12345"); cust.save()
        samples = [
            ("Toyota", "Corolla", 2022, 450, 5, "manual", "petrol", "Cape Town", -33.9249, 18.4241),
            ("VW", "Polo", 2021, 380, 5, "manual", "petrol", "Stellenbosch", -33.9321, 18.8602),
            ("Toyota", "Hilux", 2023, 850, 5, "auto", "diesel", "Paarl", -33.7342, 18.9621),
            ("BMW", "i4", 2024, 1400, 5, "auto", "electric", "Cape Town", -33.9249, 18.4241),
        ]
        for mk, md, yr, pr, st, tr, fu, loc, latitude, longitude in samples:
            car, _ = Car.objects.get_or_create(
                owner=renter,
                make=mk,
                model=md,
                defaults=dict(
                    year=yr,
                    price_per_day=pr,
                    seats=st,
                    transmission=tr,
                    fuel=fu,
                    location=loc,
                    latitude=latitude,
                    longitude=longitude,
                ),
            )
            if car.latitude is None or car.longitude is None:
                car.latitude = latitude
                car.longitude = longitude
                car.save(update_fields=["latitude", "longitude"])
        self.stdout.write(self.style.SUCCESS("Seeded. Log in as renter1 or customer1 (password demo12345)."))
