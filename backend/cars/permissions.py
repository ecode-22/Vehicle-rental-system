from rest_framework.permissions import BasePermission, SAFE_METHODS


class IsRenterOrReadOnly(BasePermission):
    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return True
        return request.user.is_authenticated and request.user.role == "renter"

    def has_object_permission(self, request, view, obj):
        return request.method in SAFE_METHODS or obj.owner_id == request.user.id
