from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import BackgroundCheckRequestViewSet, CarViewSet, BookingViewSet, DashboardView, ProblemReportViewSet, ReviewViewSet

router = DefaultRouter()
router.register("cars", CarViewSet, basename="car")
router.register("bookings", BookingViewSet, basename="booking")
router.register("reviews", ReviewViewSet, basename="review")
router.register("problem-reports", ProblemReportViewSet, basename="problem-report")
router.register("background-checks", BackgroundCheckRequestViewSet, basename="background-check")

urlpatterns = [path("dashboard/", DashboardView.as_view()), path("", include(router.urls))]
