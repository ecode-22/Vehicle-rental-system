from rest_framework import serializers
from django.contrib.auth.password_validation import validate_password
from .models import User


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)

    def validate_password(self, value):
        candidate = User(
            username=self.initial_data.get("username", ""),
            email=self.initial_data.get("email", ""),
        )
        validate_password(value, user=candidate)
        return value

    class Meta:
        model = User
        fields = ["id", "username", "email", "password", "role", "phone", "first_name", "last_name"]

    def create(self, data):
        return User.objects.create_user(**data)


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "username", "email", "role", "phone", "first_name", "last_name"]
