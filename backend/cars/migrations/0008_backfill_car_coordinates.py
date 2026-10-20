from django.db import migrations


TOWN_COORDINATES = {
    "cape town": (-33.9249, 18.4241),
    "stellenbosch": (-33.9321, 18.8602),
    "paarl": (-33.7342, 18.9621),
}


def backfill_coordinates(apps, schema_editor):
    Car = apps.get_model("cars", "Car")
    for location, (latitude, longitude) in TOWN_COORDINATES.items():
        Car.objects.filter(
            location__iexact=location,
            latitude__isnull=True,
            longitude__isnull=True,
        ).update(latitude=latitude, longitude=longitude)


class Migration(migrations.Migration):
    dependencies = [("cars", "0007_car_latitude_car_longitude")]

    operations = [migrations.RunPython(backfill_coordinates, migrations.RunPython.noop)]