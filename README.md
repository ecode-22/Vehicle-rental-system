## Requirements

 1. User Interface: The application should have an intuitive and user-friendly interface that allows users    
to easily search for, book, and manage their rental cars.  
 2. Search Functionality: The application should have a search functionality that allows users to find cars    
based on their location, date, rental period, and other criteria.  
 3. Booking System: The application should have a booking system that allows users to make reservations for    
cars, including payment information and delivery options.  
 4. Payment Gateway: The application should have a secure payment gateway that allows users to make payments    
for their rentals.  
 5. Management Tools: The application should have management tools for car owners and car rental companies,    
including tools for managing inventory, setting rental rates, and reviewing customer feedback.  
 6. Customer Support: The application should have a customer support system that allows users to contact    
customer support for assistance with their rentals.  
 7. Integration with Payment and Booking Platforms: The application should be integrated with popular    
payment and booking platforms to allow users to easily make payments and book rentals.  
 8. Security and Privacy: The application should have robust security and privacy measures in place to    
protect user data and ensure the confidentiality of the rental process.

## Entities:  
  
 1. Users: Represents the renters and car owners.  
 2. Cars: Represents the available cars for rent.  
 3. Rentals: Represents the rentals made by users.  
 4. Payment Methods: Represents the payment methods that can be used to make payments for rentals.  
  
Attributes:  
  
 1. Users: User ID (Primary Key), Name, Email, Password, Phone Number, Location, Type (Renter or Owner)  
 2. Cars: Car ID (Primary Key), Make, Model, Year, Color, Mileage, Condition, Rental Price, Availability  
 3. Rentals: Rental ID (Primary Key), User ID (Foreign Key), Car ID (Foreign Key), Rental Date, Return Date,    
Status, Total Price  
 4. Payment Methods: Payment Method ID (Primary Key), Payment Method Name, Payment Method Description,    
Payment Method Type (Credit Card, PayPal, etc.)  
  
## Relationships:  
  
 1. Users: One-to-many relationship with Rentals.  
 2. Cars: One-to-many relationship with Rentals.  
 3. Rentals: Many-to-one relationship with Cars.  
 4. Rentals: One-to-one relationship with Payment Methods.  
  
## Cardinality:  
  
 1. Users: 1:N (one user can have multiple rentals)  
 2. Cars: 1:N (one car can have multiple rentals)  
 3. Rentals: N:1 (one rental can have one car)  
 4. Rentals: 1:1 (one rental has one payment method)  
  
## Data Types:  
  
 1. Users: Integer (User ID), String (Name), String (Email), String (Password), String (Phone Number),    
String (Location), String (Type)  
 2. Cars: Integer (Car ID), String (Make), String (Model), Integer (Year), String (Color), Integer    
(Mileage), String (Condition), Float (Rental Price), Boolean (Availability)  
 3. Rentals: Integer (Rental ID), Integer (User ID), Integer (Car ID), Date (Rental Date), Date (Return    
Date), String (Status), Float (Total Price)  
 4. Payment Methods: Integer (Payment Method ID), String (Payment Method Name), String (Payment Method    
Description), String (Payment Method Type)  
  
## Constraints:  
  
 1. Users: Primary Key (User ID), Unique (Email)  
 2. Cars: Primary Key (Car ID), Unique (Make, Model, Year)  
 3. Rentals: Primary Key (Rental ID), Foreign Key (User ID), Foreign Key (Car ID)  
 4. Rentals: Unique (Rental Date, Return Date)  
 5. Payment Methods: Primary Key (Payment Method ID)  
  
For frontend, you can use a framework like React or Angular. For backend, you can use a framework like    
Node.js or Django.

# DriveEasy – Car Rental Web App

- **backend/** – Django + Django REST Framework + JWT (SimpleJWT)
- **frontend/** – React + Vite

Two roles: **customer** (browse & book cars) and **renter** (list cars, approve/reject bookings, dashboard).

## 1. Backend (terminal 1)
```bash
cd backend
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python manage.py migrate
python manage.py seed            # optional demo data
python manage.py runserver       # http://127.0.0.1:8000
```
Demo logins after `seed`: `renter1` and `customer1`, password `demo12345`.
Admin panel: `python manage.py createsuperuser`, then open `/admin/`.

## 2. Frontend (terminal 2)
```bash
cd frontend
npm install
npm run dev                      # http://localhost:5173
```
Backend URL defaults to `http://127.0.0.1:8000/api`. To change it, copy `.env.example` to `.env`.

## API summary
| Endpoint | Purpose |
|---|---|
| POST /api/auth/register/ , /login/ , /refresh/ ; GET /me/ | Auth (JWT) |
| GET /api/cars/ (?search, max_price, transmission, fuel) | Browse cars |
| POST/PATCH/DELETE /api/cars/ , GET /api/cars/mine/ | Renter fleet management |
| POST /api/bookings/ ; /{id}/confirm, reject, cancel | Booking flow |
| GET /api/dashboard/ | Role-specific stats |

## Before going live
Set `DEBUG=False`, a real `SECRET_KEY`, restrict `CORS_ALLOW_ALL_ORIGINS`, and switch SQLite to PostgreSQL.
