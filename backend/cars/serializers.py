from datetime import date
from rest_framework import serializers
from .models import Car, Booking


class CarSerializer(serializers.ModelSerializer):
    owner_name = serializers.CharField(source="owner.username", read_only=True)

    class Meta:
        model = Car
        fields = "__all__"
        read_only_fields = ["owner", "created_at"]


class BookingSerializer(serializers.ModelSerializer):
    car_detail = CarSerializer(source="car", read_only=True)
    customer_name = serializers.CharField(source="customer.username", read_only=True)

    class Meta:
        model = Booking
        fields = ["id", "car", "car_detail", "customer", "customer_name", "start_date", "end_date", "total_price", "status", "created_at"]
        read_only_fields = ["customer", "total_price", "status", "created_at"]

    def validate(self, data):
        start, end, car = data["start_date"], data["end_date"], data["car"]
        if end < start:
            raise serializers.ValidationError("End date must be on or after start date.")
        if start < date.today():
            raise serializers.ValidationError("Start date cannot be in the past.")
        if not car.available:
            raise serializers.ValidationError("This car is not available.")
        if Booking.overlapping(car, start, end).exists():
            raise serializers.ValidationError("Car is already booked for those dates.")
        return data

    def create(self, validated):
        days = (validated["end_date"] - validated["start_date"]).days + 1
        validated["total_price"] = days * validated["car"].price_per_day
        validated["customer"] = self.context["request"].user
        return super().create(validated)
