from django.db import migrations
from django.db.models import F


def backfill_handover_locations(apps, schema_editor):
    Car = apps.get_model("cars", "Car")
    Booking = apps.get_model("cars", "Booking")

    Car.objects.filter(collection_location="").exclude(location="").update(collection_location=F("location"))
    Car.objects.filter(dropoff_location="").exclude(location="").update(dropoff_location=F("location"))

    for booking in Booking.objects.select_related("car").filter(collection_location="", dropoff_location=""):
        location = booking.car.location
        Booking.objects.filter(pk=booking.pk).update(
            collection_location=booking.car.collection_location or location,
            dropoff_location=booking.car.dropoff_location or location,
        )


class Migration(migrations.Migration):
    dependencies = [("cars", "0004_booking_collection_location_booking_dropoff_location_and_more")]

    operations = [migrations.RunPython(backfill_handover_locations, migrations.RunPython.noop)]
