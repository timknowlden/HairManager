# HairManager - Appointment Management System

A web-based appointment management system built with React and SQLite, designed to replace the Google Sheets workflow for managing hair and nail appointments.

## Features

- **Batch Appointment Entry**: Quickly enter multiple appointments for the same location and date
- **Service Lookup**: Automatic service type and price lookup from the services database
- **Distance Tracking**: Automatically records distance traveled (only on first appointment per batch)
- **Payment Tracking**: Mark appointments as paid/unpaid with automatic timestamp recording
- **Appointment Viewing**: View all appointments in a sortable table format
- **Location Management**: Manage multiple work locations with distance tracking

## Tech Stack

- **Frontend**: React 19 with Vite
- **Backend**: Node.js with Express
- **Database**: SQLite3
- **API**: RESTful API endpoints

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- npm

### Installation

1. Install dependencies:
```bash
npm install
```

2. Start the backend server:
```bash
npm run server
```

The server will run on `http://localhost:3001` and automatically initialize the database with default services and locations.

3. In a new terminal, start the frontend development server:
```bash
npm run dev
```

The frontend will run on `http://localhost:5173` (or another port if 5173 is busy).

**Note:** In development, you have two servers:
- **Frontend (Vite)**: Port 5173 - serves the React app with hot reload
- **Backend (Express)**: Port 3001 - serves the API and handles database operations

In production (Docker), the frontend is built and served by Express on port 3001, so everything runs on a single port.

### Default Data

The database is automatically initialized with:

**Services:**
- Cut & Blow Dry (£25.00)
- Blow Dry (£15.00)
- Shampoo & Set (£14.00)
- Dry Cut (£14.00)
- Cut & Set (£24.00)
- Gents Dry Cut (£14.50)
- Beard Trim (£6.00)
- Clipper Cuts (£6.00)
- Restyling (£28.00)
- Manicure (£18.00)
- Pedicure (£20.00)
- Gel Polish (£20.00)
- Other (£15.00)

**Locations:**
- Sydney House (32.9 mi)
- The Lawns (46.4 mi)

## Usage

### Creating Appointments

1. Navigate to the "New Entry" tab
2. Select a location from the dropdown
3. Select the date for all appointments
4. Add client names and their services (one per row)
5. Click "Create Appointments" to save

The system will:
- Look up service type and price automatically
- Record distance only on the first appointment
- Mark all appointments as unpaid initially

### Viewing Appointments

1. Navigate to the "View Appointments" tab
2. See all appointments sorted by date (newest first)
3. Click the payment button to toggle paid/unpaid status
4. Payment date is automatically recorded when marked as paid

## Database Schema

### appointments
- `id` (Primary Key)
- `client_name` (Text)
- `service` (Text)
- `type` (Text - Hair/Nails)
- `date` (Text - ISO date)
- `location` (Text - Foreign Key to address_data)
- `price` (Real)
- `paid` (Integer - 0 or 1)
- `distance` (Real - miles, only on first appointment)
- `payment_date` (Text - Timestamp, NULL if unpaid)
- `created_at` (Text - Timestamp)

### services
- `id` (Primary Key)
- `service_name` (Text, Unique)
- `type` (Text)
- `price` (Real)

### address_data
- `id` (Primary Key)
- `location_name` (Text, Unique)
- `distance` (Real - miles)
- `contact_details` (Text)
- `address` (Text)
- `phone` (Text)
- `notes` (Text)

## API Endpoints

### Appointments
- `GET /api/appointments` - Get all appointments
- `GET /api/appointments/:id` - Get appointment by ID
- `POST /api/appointments/batch` - Create multiple appointments
- `PATCH /api/appointments/:id/pay` - Mark appointment as paid
- `PATCH /api/appointments/:id/unpay` - Mark appointment as unpaid
- `DELETE /api/appointments/:id` - Delete appointment

### Services
- `GET /api/services` - Get all services
- `GET /api/services/:name` - Get service by name
- `POST /api/services` - Create new service
- `PUT /api/services/:id` - Update service
- `DELETE /api/services/:id` - Delete service

### Locations
- `GET /api/locations` - Get all locations
- `GET /api/locations/:name` - Get location by name
- `POST /api/locations` - Create new location
- `PUT /api/locations/:id` - Update location
- `DELETE /api/locations/:id` - Delete location

## Future Features

- Invoice generation and export
- Reporting and analytics
- Client management (addresses, contact info)
- Export to Excel/CSV
- Date range filtering

## Development

The database file (`hairmanager.db`) is created automatically on first run. To reset the database, delete the `.db` file and restart the server.

## License

Private project - HairManager application for appointment and financial management
