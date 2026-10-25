import re
from django.utils import timezone
from rest_framework import serializers
from .models import BackgroundCheckRequest, Booking, Car, CarPhoto, ProblemReport, Review

PHONE_PATTERN = re.compile(r"^\+?[\d\s\-()]{7,20}$")
_UNKNOWN = object()  # "this car was loaded without the booking annotation"


class CarPhotoSerializer(serializers.ModelSerializer):
    class Meta:
        model = CarPhoto
        fields = ["id", "image", "created_at"]
        read_only_fields = fields


class CarSerializer(serializers.ModelSerializer):
    owner_name = serializers.CharField(source="owner.username", read_only=True)
    # The owner's contact details are part of every ad, but only visible to signed-in users.
    owner_contact = serializers.SerializerMethodField()
    # active | booked | paused | removed (booked_until is set while a confirmed booking is running or upcoming)
    status = serializers.SerializerMethodField()
    booked_until = serializers.SerializerMethodField()
    average_rating = serializers.FloatField(read_only=True, allow_null=True)
    rating_count = serializers.IntegerField(read_only=True)
    photos = CarPhotoSerializer(many=True, read_only=True)
    # Where the car is. Customers choose their own pick-up and drop-off when they book.
    location = serializers.CharField(required=True, allow_blank=False, max_length=180)
    latitude = serializers.FloatField(required=False, allow_null=True, min_value=-90, max_value=90)
    longitude = serializers.FloatField(required=False, allow_null=True, min_value=-180, max_value=180)
    # Saved on the owner's profile so it appears on every one of their ads.
    contact_phone = serializers.CharField(write_only=True, required=False, allow_blank=True, max_length=30)

    class Meta:
        model = Car
        fields = "__all__"
        read_only_fields = ["owner", "created_at", "is_archived", "available"]

    def get_owner_contact(self, obj):
        request = self.context.get("request")
        if not (request and request.user.is_authenticated):
            return None
        owner = obj.owner
        return {"name": owner.get_full_name() or owner.username, "phone": owner.phone, "email": owner.email}

    def get_booked_until(self, obj):
        end = getattr(obj, "active_booking_end", _UNKNOWN)
        return None if end is _UNKNOWN else end

    def get_status(self, obj):
        if obj.is_archived:
            return "removed"
        if not obj.available:
            return "paused"
        end = getattr(obj, "active_booking_end", _UNKNOWN)
        if end is _UNKNOWN:
            return None
        return "booked" if end else "active"

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
        # A listed car must be on the map, so its location has to be a real place.
        if latitude is None and (self.instance is None or any(key in data for key in ("location", "latitude", "longitude"))):
            raise serializers.ValidationError({"location": "Pick the car's location from the suggestions so it appears on the map."})

        user = self.context["request"].user
        phone = (data.pop("contact_phone", "") or "").strip() or (user.phone or "").strip()
        if not phone:
            raise serializers.ValidationError({"contact_phone": "Add a contact phone number so customers can reach you about this car."})
        if not PHONE_PATTERN.match(phone):
            raise serializers.ValidationError({"contact_phone": "Enter a valid phone number, for example 082 123 4567."})
        self._contact_phone = phone
        return data

    def _save_contact_phone(self):
        user = self.context["request"].user
        if user.phone != self._contact_phone:
            user.phone = self._contact_phone
            user.save(update_fields=["phone"])

    def create(self, validated):
        car = super().create(validated)
        self._save_contact_phone()
        return car

    def update(self, instance, validated):
        car = super().update(instance, validated)
        self._save_contact_phone()
        return car


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
    # The customer decides where they collect and return the car.
    collection_location = serializers.CharField(required=True, allow_blank=False, max_length=180)
    collection_latitude = serializers.FloatField(required=False, allow_null=True, min_value=-90, max_value=90)
    collection_longitude = serializers.FloatField(required=False, allow_null=True, min_value=-180, max_value=180)
    dropoff_location = serializers.CharField(required=True, allow_blank=False, max_length=180)
    dropoff_latitude = serializers.FloatField(required=False, allow_null=True, min_value=-90, max_value=90)
    dropoff_longitude = serializers.FloatField(required=False, allow_null=True, min_value=-180, max_value=180)

    class Meta:
        model = Booking
        fields = [
            "id", "car", "car_detail", "customer", "customer_name", "start_date", "end_date",
            "collection_location", "collection_latitude", "collection_longitude",
            "dropoff_location", "dropoff_latitude", "dropoff_longitude",
            "total_price", "status", "created_at",
        ]
        read_only_fields = ["customer", "total_price", "status", "created_at"]

    def validate(self, data):
        start, end, car = data["start_date"], data["end_date"], data["car"]
        if end < start:
            raise serializers.ValidationError("End date must be on or after start date.")
        if start < timezone.localdate():
            raise serializers.ValidationError("Start date cannot be in the past.")
        if car.is_archived:
            raise serializers.ValidationError("This car is no longer listed.")
        if not car.available:
            raise serializers.ValidationError("This car is paused for maintenance and can't be booked right now.")
        # A car with a confirmed booking that is running or upcoming is off the market (no double booking).
        booked_until = car.booked_until()
        if booked_until:
            raise serializers.ValidationError(f"This car is already booked until {booked_until:%d %b %Y}.")
        for prefix, label in (("collection", "pick-up"), ("dropoff", "drop-off")):
            lat, lng = data.get(f"{prefix}_latitude"), data.get(f"{prefix}_longitude")
            if (lat is None) != (lng is None):
                raise serializers.ValidationError({f"{prefix}_location": f"The {label} point needs both a latitude and a longitude."})
        return data

    def create(self, validated):
        days = (validated["end_date"] - validated["start_date"]).days + 1
        validated["total_price"] = days * validated["car"].price_per_day
        validated["customer"] = self.context["request"].user
        return super().create(validated)
