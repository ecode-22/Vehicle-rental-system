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
    collection_location = models.CharField(max_length=180, blank=True)
    dropoff_location = models.CharField(max_length=180, blank=True)
    image_url = models.URLField(blank=True)
    image = models.ImageField(upload_to="cars/", blank=True, null=True)
    description = models.TextField(blank=True)
    available = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.year} {self.make} {self.model}"


class CarPhoto(models.Model):
    car = models.ForeignKey(Car, on_delete=models.CASCADE, related_name="photos")
    image = models.ImageField(upload_to="cars/gallery/")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at", "id"]


class Booking(models.Model):
    PENDING, CONFIRMED, REJECTED, CANCELLED, COMPLETED = "pending", "confirmed", "rejected", "cancelled", "completed"
    STATUSES = [(s, s.title()) for s in (PENDING, CONFIRMED, REJECTED, CANCELLED, COMPLETED)]

    car = models.ForeignKey(Car, on_delete=models.CASCADE, related_name="bookings")
    customer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="bookings")
    start_date = models.DateField()
    end_date = models.DateField()
    collection_location = models.CharField(max_length=180, blank=True)
    dropoff_location = models.CharField(max_length=180, blank=True)
    total_price = models.DecimalField(max_digits=12, decimal_places=2)
    status = models.CharField(max_length=10, choices=STATUSES, default=PENDING)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    @staticmethod
    def overlapping(car, start, end, exclude_id=None):
        qs = Booking.objects.filter(car=car, status=Booking.CONFIRMED, start_date__lte=end, end_date__gte=start)
        return qs.exclude(id=exclude_id) if exclude_id else qs


class Review(models.Model):
    booking = models.ForeignKey(Booking, on_delete=models.CASCADE, related_name="reviews")
    reviewer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="rental_reviews")
    target_user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="received_rental_reviews", null=True, blank=True)
    target_car = models.ForeignKey(Car, on_delete=models.CASCADE, related_name="reviews", null=True, blank=True)
    score = models.PositiveSmallIntegerField()
    comment = models.CharField(max_length=1000, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.CheckConstraint(
                condition=(
                    models.Q(target_user__isnull=False, target_car__isnull=True)
                    | models.Q(target_user__isnull=True, target_car__isnull=False)
                ),
                name="review_has_one_target",
            ),
            models.CheckConstraint(condition=models.Q(score__gte=1, score__lte=5), name="review_score_1_to_5"),
            models.UniqueConstraint(
                fields=["booking", "reviewer", "target_user"],
                condition=models.Q(target_user__isnull=False),
                name="unique_booking_user_review",
            ),
            models.UniqueConstraint(
                fields=["booking", "reviewer", "target_car"],
                condition=models.Q(target_car__isnull=False),
                name="unique_booking_car_review",
            ),
        ]


class ProblemReport(models.Model):
    OPEN, REVIEWED, RESOLVED = "open", "reviewed", "resolved"
    STATUSES = [(value, value.title()) for value in (OPEN, REVIEWED, RESOLVED)]

    car = models.ForeignKey(Car, on_delete=models.CASCADE, related_name="problem_reports")
    booking = models.ForeignKey(Booking, on_delete=models.SET_NULL, related_name="problem_reports", null=True, blank=True)
    reported_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="car_problem_reports")
    description = models.TextField(max_length=2000)
    status = models.CharField(max_length=10, choices=STATUSES, default=OPEN)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]


class BackgroundCheckRequest(models.Model):
    REQUESTED, CONSENTED, DECLINED = "requested", "consented", "declined"
    STATUSES = [(value, value.title()) for value in (REQUESTED, CONSENTED, DECLINED)]

    booking = models.OneToOneField(Booking, on_delete=models.CASCADE, related_name="background_check_request")
    status = models.CharField(max_length=10, choices=STATUSES, default=REQUESTED)
    created_at = models.DateTimeField(auto_now_add=True)
    responded_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
