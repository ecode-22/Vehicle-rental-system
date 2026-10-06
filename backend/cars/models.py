from django.conf import settings
from django.db import models


class Car(models.Model):
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="cars")
    make = models.CharField(max_length=60)
    model = models.CharField(max_length=60)
    year = models.PositiveIntegerField()
    price_per_day = models.DecimalField(max_digits=10, decimal_places=2)
    seats = models.PositiveSmallIntegerField(default=5)
    transmission = models.CharField(max_length=10, choices=[("manual", "Manual"), ("auto", "Automatic")], default="manual")
    fuel = models.CharField(max_length=10, choices=[("petrol", "Petrol"), ("diesel", "Diesel"), ("electric", "Electric"), ("hybrid", "Hybrid")], default="petrol")
    location = models.CharField(max_length=100, blank=True)
    image_url = models.URLField(blank=True)
    description = models.TextField(blank=True)
    available = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.year} {self.make} {self.model}"


class Booking(models.Model):
    PENDING, CONFIRMED, REJECTED, CANCELLED, COMPLETED = "pending", "confirmed", "rejected", "cancelled", "completed"
    STATUSES = [(s, s.title()) for s in (PENDING, CONFIRMED, REJECTED, CANCELLED, COMPLETED)]

    car = models.ForeignKey(Car, on_delete=models.CASCADE, related_name="bookings")
    customer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="bookings")
    start_date = models.DateField()
    end_date = models.DateField()
    total_price = models.DecimalField(max_digits=12, decimal_places=2)
    status = models.CharField(max_length=10, choices=STATUSES, default=PENDING)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    @staticmethod
    def overlapping(car, start, end, exclude_id=None):
        qs = Booking.objects.filter(car=car, status=Booking.CONFIRMED, start_date__lte=end, end_date__gte=start)
        return qs.exclude(id=exclude_id) if exclude_id else qs
