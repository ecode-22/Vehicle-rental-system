from django.db.models import Avg, Count, Sum, Q
from django.utils import timezone
from rest_framework import viewsets, permissions, serializers, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from .models import BackgroundCheckRequest, Car, CarPhoto, Booking, ProblemReport, Review
from .serializers import BackgroundCheckRequestSerializer, CarPhotoSerializer, CarSerializer, BookingSerializer, ProblemReportSerializer, ReviewSerializer
from .permissions import IsRenterOrReadOnly


class CarViewSet(viewsets.ModelViewSet):
    serializer_class = CarSerializer
    permission_classes = [IsRenterOrReadOnly]

    def get_queryset(self):
        qs = Car.objects.select_related("owner").annotate(average_rating=Avg("reviews__score"), rating_count=Count("reviews"))
        p = self.request.query_params
        if p.get("search"):
            qs = qs.filter(Q(make__icontains=p["search"]) | Q(model__icontains=p["search"]) | Q(location__icontains=p["search"]))
        if p.get("max_price"):
            qs = qs.filter(price_per_day__lte=p["max_price"])
        if p.get("transmission"):
            qs = qs.filter(transmission=p["transmission"])
        if p.get("fuel"):
            qs = qs.filter(fuel=p["fuel"])
        if self.action == "list" and p.get("all") != "1":
            qs = qs.filter(available=True)
        return qs

    def perform_create(self, serializer):
        car = serializer.save(owner=self.request.user)
        self._save_photos(car)

    def perform_update(self, serializer):
        car = serializer.save()
        self._save_photos(car)

    def _save_photos(self, car):
        uploads = self.request.FILES.getlist("photos")
        for image in uploads:
            CarPhoto.objects.create(car=car, image=image)

    @action(detail=False, permission_classes=[permissions.IsAuthenticated])
    def mine(self, request):
        cars = Car.objects.filter(owner=request.user).annotate(average_rating=Avg("reviews__score"), rating_count=Count("reviews"))
        return Response(CarSerializer(cars, many=True).data)

    @action(detail=True, methods=["get"], permission_classes=[permissions.AllowAny])
    def reviews(self, request, pk=None):
        car = self.get_object()
        reviews = Review.objects.filter(target_car=car).select_related("reviewer").order_by("-created_at")
        return Response(ReviewSerializer(reviews, many=True).data)


class BookingViewSet(viewsets.ModelViewSet):
    serializer_class = BookingSerializer
    permission_classes = [permissions.IsAuthenticated]
    http_method_names = ["get", "post", "head", "options"]

    def get_queryset(self):
        u = self.request.user
        qs = Booking.objects.select_related("car", "customer")
        return qs.filter(car__owner=u) if u.role == "renter" else qs.filter(customer=u)

    def create(self, request, *a, **kw):
        if request.user.role != "customer":
            return Response({"detail": "Only customers can book cars."}, status=403)
        return super().create(request, *a, **kw)

    @action(detail=True, methods=["post"])
    def confirm(self, request, pk=None):
        b = self.get_object()
        if request.user.role != "renter" or b.status != Booking.PENDING:
            return Response({"detail": "Not allowed."}, status=403)
        if Booking.overlapping(b.car, b.start_date, b.end_date, b.id).exists():
            return Response({"detail": "Dates conflict with a confirmed booking."}, status=400)
        b.status = Booking.CONFIRMED
        b.save()
        return Response(BookingSerializer(b).data)

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        b = self.get_object()
        if request.user.role != "renter" or b.status != Booking.PENDING:
            return Response({"detail": "Not allowed."}, status=403)
        b.status = Booking.REJECTED
        b.save()
        return Response(BookingSerializer(b).data)

    @action(detail=True, methods=["post"])
    def complete(self, request, pk=None):
        b = self.get_object()
        if request.user.role != "renter" or b.status != Booking.CONFIRMED or b.end_date > timezone.localdate():
            return Response({"detail": "Only the renter can complete a confirmed booking."}, status=403)
        b.status = Booking.COMPLETED
        b.save(update_fields=["status"])
        return Response(BookingSerializer(b).data)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        b = self.get_object()
        if request.user.role != "customer" or b.status not in (Booking.PENDING, Booking.CONFIRMED):
            return Response({"detail": "Not allowed."}, status=403)
        b.status = Booking.CANCELLED
        b.save()
        return Response(BookingSerializer(b).data)


class DashboardView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        u = request.user
        if u.role == "renter":
            bookings = Booking.objects.filter(car__owner=u)
            revenue = bookings.filter(status__in=["confirmed", "completed"]).aggregate(s=Sum("total_price"))["s"] or 0
            rating = Review.objects.filter(target_user=u).aggregate(average=Avg("score"), count=Count("id"))
            return Response({
                "role": "renter",
                "total_cars": Car.objects.filter(owner=u).count(),
                "pending_requests": bookings.filter(status="pending").count(),
                "confirmed_bookings": bookings.filter(status="confirmed").count(),
                "revenue": revenue,
                "average_rating": rating["average"],
                "rating_count": rating["count"],
                "recent": BookingSerializer(bookings[:5], many=True).data,
            })
        bookings = Booking.objects.filter(customer=u)
        spent = bookings.filter(status__in=["confirmed", "completed"]).aggregate(s=Sum("total_price"))["s"] or 0
        return Response({
            "role": "customer",
            "total_bookings": bookings.count(),
            "pending": bookings.filter(status="pending").count(),
            "confirmed": bookings.filter(status="confirmed").count(),
            "total_spent": spent,
            "recent": BookingSerializer(bookings[:5], many=True).data,
        })


class ReviewViewSet(viewsets.ModelViewSet):
    serializer_class = ReviewSerializer
    permission_classes = [permissions.IsAuthenticated]
    http_method_names = ["get", "post", "head", "options"]

    def get_queryset(self):
        return Review.objects.filter(reviewer=self.request.user).select_related("booking", "reviewer", "target_user", "target_car")

    def perform_create(self, serializer):
        serializer.save(reviewer=self.request.user)


class ProblemReportViewSet(viewsets.ModelViewSet):
    serializer_class = ProblemReportSerializer
    permission_classes = [permissions.IsAuthenticated]
    http_method_names = ["get", "post", "head", "options"]

    def get_queryset(self):
        return ProblemReport.objects.filter(reported_by=self.request.user).select_related("car", "booking")

    def perform_create(self, serializer):
        serializer.save(reported_by=self.request.user)


class BackgroundCheckRequestViewSet(viewsets.ModelViewSet):
    serializer_class = BackgroundCheckRequestSerializer
    permission_classes = [permissions.IsAuthenticated]
    http_method_names = ["get", "post", "head", "options"]

    def get_queryset(self):
        user = self.request.user
        qs = BackgroundCheckRequest.objects.select_related("booking__customer", "booking__car__owner", "booking__car")
        return qs.filter(booking__car__owner=user) if user.role == "renter" else qs.filter(booking__customer=user)

    def create(self, request, *args, **kwargs):
        if request.user.role != "renter":
            return Response({"detail": "Only renters can request background-check consent."}, status=status.HTTP_403_FORBIDDEN)
        return super().create(request, *args, **kwargs)

    @action(detail=True, methods=["post"])
    def respond(self, request, pk=None):
        check_request = self.get_object()
        if request.user != check_request.booking.customer or check_request.status != BackgroundCheckRequest.REQUESTED:
            return Response({"detail": "Only the requested customer can respond."}, status=status.HTTP_403_FORBIDDEN)
        decision = request.data.get("decision")
        if decision not in (BackgroundCheckRequest.CONSENTED, BackgroundCheckRequest.DECLINED):
            return Response({"detail": "Decision must be consented or declined."}, status=status.HTTP_400_BAD_REQUEST)
        check_request.status = decision
        check_request.responded_at = timezone.now()
        check_request.save(update_fields=["status", "responded_at"])
        return Response(self.get_serializer(check_request).data)
