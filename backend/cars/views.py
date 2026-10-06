from django.db.models import Sum, Q
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from .models import Car, Booking
from .serializers import CarSerializer, BookingSerializer
from .permissions import IsRenterOrReadOnly


class CarViewSet(viewsets.ModelViewSet):
    serializer_class = CarSerializer
    permission_classes = [IsRenterOrReadOnly]

    def get_queryset(self):
        qs = Car.objects.select_related("owner")
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
        serializer.save(owner=self.request.user)

    @action(detail=False, permission_classes=[permissions.IsAuthenticated])
    def mine(self, request):
        cars = Car.objects.filter(owner=request.user)
        return Response(CarSerializer(cars, many=True).data)


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
            return Response({
                "role": "renter",
                "total_cars": Car.objects.filter(owner=u).count(),
                "pending_requests": bookings.filter(status="pending").count(),
                "confirmed_bookings": bookings.filter(status="confirmed").count(),
                "revenue": revenue,
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
