from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    CUSTOMER, RENTER = "customer", "renter"
    ROLES = [(CUSTOMER, "Customer"), (RENTER, "Renter")]
    role = models.CharField(max_length=10, choices=ROLES, default=CUSTOMER)
    phone = models.CharField(max_length=30, blank=True)
