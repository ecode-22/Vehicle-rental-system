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


### Connect Django to Supabase PostgreSQL

The project is configured to use PostgreSQL when `DATABASE_URL` is set in `backend/.env`; otherwise it uses the local SQLite database. The Supabase project URL and publishable key are not PostgreSQL credentials and should not be used as `DATABASE_URL`.

1. Since the database password was added to this README, reset it in Supabase before connecting. Do not commit or share the replacement password.
2. In the Supabase dashboard, open the project and choose **Connect**. Copy a PostgreSQL connection URI (use the Session Pooler if a direct database connection is not available on your network).
3. In a terminal, create the local environment file:
	```bash
	cd backend
	cp .env.example .env
	```
4. Edit `backend/.env` and set `DATABASE_URL` to the PostgreSQL URI from Supabase. Replace its password placeholder with the newly reset password. Keep this file private; it is excluded by `.gitignore`.
5. From `backend/`, activate the virtual environment and apply the schema:
	```bash
	source .venv/bin/activate
	pip install -r requirements.txt
	python manage.py migrate
	python manage.py seed
	python manage.py runserver
	```

`migrate` creates the tables in Supabase. `seed` optionally inserts demo users and cars; it does not copy existing data from SQLite. The Supabase connection URI is only used by Django on the backend, so do not put it in the frontend environment or browser code.

Renter car photos are saved under `backend/media/cars/` during local development. For deployment, configure persistent object storage (for example, a Supabase Storage bucket); local filesystem uploads can be lost when a hosted server is rebuilt.