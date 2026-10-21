from decimal import Decimal, InvalidOperation
from django.utils import timezone
from rest_framework import serializers
from .models import BackgroundCheckRequest, Booking, Car, CarPhoto, ProblemReport, Review


class CarPhotoSerializer(serializers.ModelSerializer):
    class Meta:
        model = CarPhoto
        fields = ["id", "image", "created_at"]
        read_only_fields = fields


class CarSerializer(serializers.ModelSerializer):
    owner_name = serializers.CharField(source="owner.username", read_only=True)
    average_rating = serializers.FloatField(read_only=True, allow_null=True)
    rating_count = serializers.IntegerField(read_only=True)
    photos = CarPhotoSerializer(many=True, read_only=True)
    collection_location = serializers.CharField(required=True, allow_blank=False)
    dropoff_location = serializers.CharField(required=True, allow_blank=False)
    latitude = serializers.FloatField(required=False, allow_null=True, min_value=-90, max_value=90)
    longitude = serializers.FloatField(required=False, allow_null=True, min_value=-180, max_value=180)

    class Meta:
        model = Car
        fields = "__all__"
        read_only_fields = ["owner", "created_at", "is_archived"]

    def to_representation(self, instance):
        data = super().to_representation(instance)
        fallback = instance.location
        data["collection_location"] = data["collection_location"] or fallback
        data["dropoff_location"] = data["dropoff_location"] or fallback
        return data

    def validate_image(self, value):
        if value and value.size > 8 * 1024 * 1024:
            raise serializers.ValidationError("Car images must be 8 MB or smaller.")
        return value

    def validate(self, data):
        uploads = self.context["request"].FILES.getlist("photos")
        existing_count = self.instance.photos.count() if self.instance else 0
        if existing_count + len(uploads) > 10:
            raise serializers.ValidationError({"photos": "A car can have up to 10 photos."})
        if any(image.size > 8 * 1024 * 1024 for image in uploads):
            raise serializers.ValidationError({"photos": "Each photo must be 8 MB or smaller."})
        latitude = data.get("latitude", self.instance.latitude if self.instance else None)
        longitude = data.get("longitude", self.instance.longitude if self.instance else None)
        if (latitude is None) != (longitude is None):
            raise serializers.ValidationError({"latitude": "Latitude and longitude must be provided together."})
        location = data.get("location")
        if not location and data.get("collection_location"):
            data["location"] = data["collection_location"]
        return data


class ReviewSerializer(serializers.ModelSerializer):
    booking_id = serializers.PrimaryKeyRelatedField(source="booking", queryset=Booking.objects.all())
    reviewer_name = serializers.CharField(source="reviewer.username", read_only=True)
    target_user_name = serializers.CharField(source="target_user.username", read_only=True, allow_null=True)
    car_name = serializers.SerializerMethodField()

    class Meta:
        model = Review
        fields = ["id", "booking_id", "reviewer", "reviewer_name", "target_user", "target_user_name", "target_car", "car_name", "score", "comment", "created_at"]
        read_only_fields = ["reviewer", "created_at"]

    def get_car_name(self, obj):
        return str(obj.target_car) if obj.target_car else None

    def validate(self, data):
        booking = data["booking"]
        reviewer = self.context["request"].user
        target_user = data.get("target_user")
        target_car = data.get("target_car")
        if bool(target_user) == bool(target_car):
            raise serializers.ValidationError("Choose exactly one review target.")
        if booking.status != Booking.COMPLETED:
            raise serializers.ValidationError("Reviews are available after the booking is completed.")
        if reviewer not in (booking.customer, booking.car.owner):
            raise serializers.ValidationError("You are not part of this booking.")
        if target_car:
            if reviewer.role != "customer":
                raise serializers.ValidationError({"target_car": "Only customers can rate a rental car."})
            if target_car.id != booking.car_id:
                raise serializers.ValidationError({"target_car": "Review the car from this booking."})
        elif reviewer.role != "renter" or target_user != booking.customer:
            raise serializers.ValidationError({"target_user": "Only the renter can rate the customer from this booking."})
        return data


class ProblemReportSerializer(serializers.ModelSerializer):
    car_name = serializers.SerializerMethodField()

    class Meta:
        model = ProblemReport
        fields = ["id", "car", "car_name", "booking", "reported_by", "description", "status", "created_at"]
        read_only_fields = ["reported_by", "status", "created_at"]

    def get_car_name(self, obj):
        return str(obj.car)

    def validate(self, data):
        user = self.context["request"].user
        car = data["car"]
        booking = data.get("booking")
        if user.role != "renter" or car.owner_id != user.id:
            raise serializers.ValidationError({"car": "You can report issues only for cars in your fleet."})
        if booking and booking.car_id != car.id:
            raise serializers.ValidationError({"booking": "Choose a booking for this car."})
        return data


class BackgroundCheckRequestSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(source="booking.customer.username", read_only=True)
    car_name = serializers.SerializerMethodField()
    booking_id = serializers.PrimaryKeyRelatedField(source="booking", queryset=Booking.objects.all())

    class Meta:
        model = BackgroundCheckRequest
        fields = ["id", "booking_id", "customer_name", "car_name", "status", "created_at", "responded_at"]
        read_only_fields = ["booking", "status", "created_at", "responded_at"]

    def get_car_name(self, obj):
        return str(obj.booking.car)

    def validate_booking_id(self, booking):
        user = self.context["request"].user
        if user.role != "renter" or booking.car.owner_id != user.id:
            raise serializers.ValidationError("Only the renter for this booking can request consent.")
        return booking


class BookingSerializer(serializers.ModelSerializer):
    car_detail = CarSerializer(source="car", read_only=True)
    customer_name = serializers.CharField(source="customer.username", read_only=True)

    class Meta:
        model = Booking
        fields = ["id", "car", "car_detail", "customer", "customer_name", "start_date", "end_date", "collection_location", "dropoff_location", "total_price", "status", "created_at"]
        read_only_fields = ["customer", "total_price", "status", "created_at"]

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data["collection_location"] = data["collection_location"] or instance.car.collection_location or instance.car.location
        data["dropoff_location"] = data["dropoff_location"] or instance.car.dropoff_location or instance.car.location
        return data

    collection_location = serializers.CharField(required=True, allow_blank=False)
    dropoff_location = serializers.CharField(required=True, allow_blank=False)

    def validate(self, data):
        start, end, car = data["start_date"], data["end_date"], data["car"]
        if end < start:
            raise serializers.ValidationError("End date must be on or after start date.")
        if start < timezone.localdate():
            raise serializers.ValidationError("Start date cannot be in the past.")
        if not car.available:
            raise serializers.ValidationError("This car is not available.")
        if data["collection_location"] != (car.collection_location or car.location):
            raise serializers.ValidationError({"collection_location": "Choose the collection point listed for this car."})
        if data["dropoff_location"] != (car.dropoff_location or car.location):
            raise serializers.ValidationError({"dropoff_location": "Choose the drop-off point listed for this car."})
        if Booking.overlapping(car, start, end).exists():
            raise serializers.ValidationError("Car is already booked for those dates.")
        return data

    def create(self, validated):
        days = (validated["end_date"] - validated["start_date"]).days + 1
        validated["total_price"] = days * validated["car"].price_per_day
        validated["customer"] = self.context["request"].user
        return super().create(validated)
