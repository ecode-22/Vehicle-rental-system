from rest_framework.test import APITestCase


class RegistrationValidationTests(APITestCase):
	def test_common_numeric_password_is_rejected(self):
		response = self.client.post("/api/auth/register/", {
			"username": "weak_password_user",
			"password": "12345678",
			"role": "customer",
		}, format="json")
		self.assertEqual(response.status_code, 400)
		self.assertIn("password", response.data)
