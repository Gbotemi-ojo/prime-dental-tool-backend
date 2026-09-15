# Prime Dental Clinic EMR API

A robust Node.js and Express backend for the Prime Dental Clinic Electronic Medical Record (EMR) system. This API handles clinic operations, patient data, inventory tracking, and automated communications.

## Key Features

*   **Patient Management:** Securely manage patient profiles, family groupings, and comprehensive dental records.
*   **Automated Communications:** Integrated cron jobs automatically send birthday wishes, appointment reminders, and post-procedure follow-ups via email.
*   **Billing & Accounting:** Generate, track, and email invoices and receipts, with automatic synchronization to Google Sheets for revenue tracking.
*   **Inventory Tracking:** Monitor clinic supplies, record stock transactions, and automatically flag low-stock items.
*   **X-Ray Management:** Securely upload and manage patient X-ray images using Cloudinary.
*   **Role-Based Access Control:** Granular permission settings for Owners, Doctors, Nurses, and Staff.

## Tech Stack

*   **Core:** Node.js, Express.js, TypeScript
*   **Database & ORM:** MySQL, Drizzle ORM
*   **Caching:** Redis
*   **Authentication:** JWT (JSON Web Tokens), bcrypt
*   **Integrations:** 
    *   Google Sheets API (Data export)
    *   Cloudinary (Image hosting)
    *   Nodemailer & Handlebars (Email templating and delivery)
    *   Node-Cron (Task scheduling)

## Prerequisites

Before running this project, ensure you have the following installed:
*   Node.js (v18+ recommended)
*   MySQL Server
*   Redis Server

## Environment Variables

Create a `.env` file in the root directory and configure the following variables:

```env
# Server
PORT=5000
API_PREFIX=/api
CORS_ORIGIN=*

# Database
DB_HOST=localhost
DB_PORT=3306
DB_USER=your_db_user
DB_PASSWORD=your_db_password
DB_DATABASE=your_db_name

# Auth
JWT_SECRET=your_jwt_secret

# Redis
REDIS_URL=redis://localhost:6379

# Email / SMTP
SMTP_HOST=your_smtp_host
SMTP_PORT=587
SMTP_USER=your_smtp_user
SMTP_PASS=your_smtp_password
EMAIL_FROM=info@yourclinic.com
OWNER_EMAIL=owner@yourclinic.com

# Google Sheets API
GOOGLE_CLIENT_EMAIL=your_service_account_email
GOOGLE_PRIVATE_KEY="your_private_key"
GOOGLE_SPREADSHEET_ID=your_spreadsheet_id

# Cloudinary
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
