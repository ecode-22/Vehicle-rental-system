from django.core.management.base import BaseCommand
from accounts.models import User
from cars.models import Car


class Command(BaseCommand):
    help = "Create demo users (renter1 / customer1, password: demo12345) and sample cars"

    def handle(self, *args, **opts):
        renter, _ = User.objects.get_or_create(username="renter1", defaults={"role": "renter", "email": "renter@example.com"})
        renter.set_password("demo12345"); renter.save()
        cust, _ = User.objects.get_or_create(username="customer1", defaults={"role": "customer", "email": "customer@example.com"})
        cust.set_password("demo12345"); cust.save()
        samples = [
            ("Toyota", "Corolla", 2022, 450, 5, "manual", "petrol", "Cape Town"),
            ("VW", "Polo", 2021, 380, 5, "manual", "petrol", "Stellenbosch"),
            ("Toyota", "Hilux", 2023, 850, 5, "auto", "diesel", "Paarl"),
            ("BMW", "i4", 2024, 1400, 5, "auto", "electric", "Cape Town"),
        ]
        for mk, md, yr, pr, st, tr, fu, loc in samples:
            Car.objects.get_or_create(owner=renter, make=mk, model=md, defaults=dict(year=yr, price_per_day=pr, seats=st, transmission=tr, fuel=fu, location=loc))
        self.stdout.write(self.style.SUCCESS("Seeded. Log in as renter1 or customer1 (password demo12345)."))
