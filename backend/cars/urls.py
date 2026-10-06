from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import CarViewSet, BookingViewSet, DashboardView

router = DefaultRouter()
router.register("cars", CarViewSet, basename="car")
router.register("bookings", BookingViewSet, basename="booking")

urlpatterns = [path("dashboard/", DashboardView.as_view()), path("", include(router.urls))]
