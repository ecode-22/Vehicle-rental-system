from django.db import migrations, models


def car_location_from_collection_point(apps, schema_editor):
    """Cars used to carry an owner-set collection point. The car's location is now that point."""
    Car = apps.get_model("cars", "Car")
    for car in Car.objects.exclude(collection_location=""):
        car.location = car.collection_location
        car.save(update_fields=["location"])


def restore_handover_points(apps, schema_editor):
    Car = apps.get_model("cars", "Car")
    Car.objects.update(collection_location=models.F("location"), dropoff_location=models.F("location"))


class Migration(migrations.Migration):
    dependencies = [("cars", "0008_backfill_car_coordinates")]

    operations = [
        migrations.AlterField(model_name="car", name="location", field=models.CharField(blank=True, max_length=180)),
        migrations.RunPython(car_location_from_collection_point, restore_handover_points),
        migrations.RemoveField(model_name="car", name="collection_location"),
        migrations.RemoveField(model_name="car", name="dropoff_location"),
        migrations.AddField(model_name="booking", name="collection_latitude", field=models.FloatField(blank=True, null=True)),
        migrations.AddField(model_name="booking", name="collection_longitude", field=models.FloatField(blank=True, null=True)),
        migrations.AddField(model_name="booking", name="dropoff_latitude", field=models.FloatField(blank=True, null=True)),
        migrations.AddField(model_name="booking", name="dropoff_longitude", field=models.FloatField(blank=True, null=True)),
    ]
