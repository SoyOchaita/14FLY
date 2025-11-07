# ✈️ 14FLY Airline Reservation Platform

A full-stack airline seat reservation and reporting system consisting of:
- Angular 17+ standalone front-end (web/) with seat selection (manual & random), reservation management, profile & admin dashboards.
- Node.js + Express API (api/) with PostgreSQL persistence, activity logging, XML import/export, VIP pricing & email notifications.
- PostgreSQL database with structured seat map, passengers, reservations and activity events.

This README explains what the platform does, how to download, install, configure and use it (development workflow), plus deployment notes and troubleshooting.

---
## 📚 Table of Contents
1. Overview & Features
2. Architecture
3. Technology Stack
4. Project Structure
5. Installation & Setup
6. Environment Configuration (.env)
7. Database Schema Summary
8. Running (API + Web)
9. Core Flows (How to Use)
10. Admin Dashboard & Reporting
11. XML Import / Export
12. Activity Logging & VIP Logic
13. Backfill Historical Activity
14. Emails & Notifications
15. Development Scripts
16. Deployment Notes (Optional Docker)
17. Troubleshooting & FAQs
18. Security & Roles
19. Future Enhancements
20. Author & License

---
## 1. Overview & Features
14FLY simulates airline seat reservation with pricing, VIP discounts, seat occupancy visualization and admin analytics.

Key features:
- User registration & secure login (hashed passwords, domain validation, CUI validation for Guatemala format).
- Manual seat batch reservation (select specific seats) and random seat allocation by class.
- Pricing engine: Business vs Economy base price + VIP discount (10%) + modification fee (10% per seat change, accumulative).
- Seat map rendering & occupancy coloring.
- Modify reservation (seat within same class, passenger data, luggage flag) with email confirmation.
- Cancel reservation (single, by CUI+seat, or batch). Emails sent on creation, modification, cancellation and VIP upgrade.
- XML export of all reservations; resilient XML import with per-row validation, partial success and structured error reporting.
- Admin Dashboard: totals, seat usage per class, manual vs random selections, modifications & cancellations, per-user activity breakdown.
- Activity logging table (`reservation_activity`) for created / modified / cancelled events with selection mode.
- User profile: VIP status, global counts (created manual/random, modified, cancelled).
- Backfill endpoint to reconstruct historical activity for existing reservations.

---
## 2. Architecture
```
Browser (Angular SPA)
        | REST (JWT Bearer)
        v
Express API (Node.js) ── PostgreSQL
  | controllers (users, reservations, seats, reports)
  | services (plane seat generation, validators, mail)
  | utils (email templates, responses)
```
Separation of concerns:
- Front-end consumes only REST endpoints; no server-side rendered views.
- API handles validation, pricing, logging, email dispatch and XML transforms.
- Database enforces referential integrity (FKs) and indexing for activity queries.

---
## 3. Technology Stack
| Layer          | Tech                                      |
| -------------- | ----------------------------------------- |
| Front-end      | Angular 17 (standalone components), TypeScript, Tailwind/utility classes (neo-card style) |
| API            | Node.js 20+, Express, pg (node-postgres), nodemon (dev) |
| Database       | PostgreSQL (seats, users, passengers, reservations, activity) |
| Auth           | JWT (Bearer)                              |
| Email          | SMTP (configurable via ENV)               |
| Import/Export  | Custom XML (flightReservation schema)     |
| Formatting     | Intl (currency, date)                     |

---
## 4. Project Structure
```
14FLY/
├── api/
│   ├── src/
│   │   ├── controllers/            # Express route handlers
│   │   │   ├── reservations.controller.js
│   │   │   ├── seats.controller.js
│   │   │   ├── users.controller.js
│   │   │   └── reports.controller.js
│   │   ├── db/                     # Pool & tooling
│   │   │   ├── pool.js
│   │   │   ├── migrate.js (optional future use)
│   │   │   └── inspect.js (optional future use)
│   │   ├── middleware/             # auth, admin, error handler
│   │   ├── services/               # plane seat generator, validators
│   │   ├── utils/                  # mailer, response helpers
│   │   ├── routes/                 # route registration modules
│   │   └── index.js                # Server bootstrap
│   ├── package.json
│   └── .env.example                # Example environment variables (create manually)
├── web/
│   ├── src/app/
│   │   ├── auth/                   # login, register, guards
│   │   ├── reservas/               # crear, mis-reservas components
│   │   ├── admin/                  # admin-report component
│   │   ├── me/                     # profile component
│   │   ├── app.routes.ts           # Angular route definitions
│   │   └── app.component.*         # Shell & navbar
│   ├── package.json
│   └── README.md (Angular CLI default)
└── README.md (You are here)
```

---
## 5. Installation & Setup
### Prerequisites
- Node.js >= 18 (prefer latest LTS)
- PostgreSQL >= 13
- npm (bundled with Node) or yarn/pnpm (optional)
- SMTP account (Mailtrap or similar) for email tests (optional)

### Clone Repository
```bash
git clone https://github.com/SoyOchaita/14FLY.git
cd 14FLY
```

### Install Dependencies
API:
```bash
cd api
npm install
```
Web:
```bash
cd ../web
npm install
```

Return to project root as needed:
```bash
cd ..
```

---
## 6. Environment Configuration (.env)
Create `api/.env` (or base .env reachable by loader) with:
```
PORT=4000
HOST=0.0.0.0
DB_HOST=localhost
DB_PORT=5432
DB_NAME=flydb
DB_USER=flyuser
DB_PASSWORD=flypass
JWT_SECRET=your-jwt-secret
BUSINESS_PRICE=1500
ECONOMY_PRICE=500
ADMIN_EMAILS=admin1@example.com,admin2@example.com
SMTP_HOST=sandbox.smtp.mailtrap.io
SMTP_PORT=587
SMTP_USER=xxxxxxxx
SMTP_PASS=yyyyyyyy
MAIL_FROM="14FLY <no-reply@14fly.local>"
WEB_URL=http://localhost:4200
```
Adjust credentials to match your local PostgreSQL and SMTP.

### Database Setup
Create database & user (example):
```sql
CREATE DATABASE flydb;
CREATE USER flyuser WITH PASSWORD 'flypass';
GRANT ALL PRIVILEGES ON DATABASE flydb TO flyuser;
```
The application seeds seats lazily (via `seedSeatsIfNeeded`) if table is empty; ensure your schema includes required tables (users, seats, passengers, reservations). Activity table auto-creates on server start.

---
## 7. Database Schema Summary (Core Tables)
- users(user_id PK, full_name, email UNIQUE, password_hash, cui UNIQUE, created_at default now())
- seats(seat_id PK, seat_number UNIQUE, seat_class ENUM['Negocios','Económica'], is_occupied boolean)
- passengers(passenger_id PK, full_name, cui UNIQUE)
- reservations(reservation_id PK, user_id FK, seat_id FK, passenger_id FK, has_luggage, price_base, discount, modification_fee, total_price, reservation_date default now(), batch_id UUID)
- reservation_activity(activity_id PK, user_id FK, reservation_id FK nullable, type TEXT CHECK ('created','modified','cancelled'), selection_mode TEXT nullable ('manual','random'), created_at default now())
Indexes: activity by (user_id, type, created_at) for reporting.

---
## 8. Running (Development)
API (from /api):
```bash
npm run dev
```
Starts Express with nodemon at `http://localhost:4000`.

Web (from /web):
```bash
npm start
```
Angular dev server at `http://localhost:4200` proxying `/api/*` calls (ensure proxy config if needed).

Access health:
- `GET /health` → uptime
- `GET /health/email` → SMTP readiness
- `GET /api/reports/admin-dashboard` (admin JWT required)

---
## 9. Core Flows (How to Use)
### Register & Login
1. Register with valid email domain & CUI format.
2. Login, receive JWT stored by front-end (localStorage).

### Create Reservations
- Manual: select seats & passenger data; API applies VIP discount if eligible (≥5 existing reservations before batch).
- Random: provide seat class + quantity + passenger array; system picks free seats atomically.

### Modify Reservation
- Change seat within same class (10% fee each seat change, cumulative).
- Update passenger name/CUI (with validation).
- Discount applied once if user becomes VIP.

### Cancel Reservation
- Single by reservation ID.
- By CUI + seat.
- Batch by batch_id (all seats created together).
Seat freed after cancellation; activity logged.

### Profile (`/me`)
Shows: name, email, CUI, created_at, role (admin/user), VIP status, activity summary (modified, cancelled, manual/random created).

### Admin Dashboard (`/admin/reportes`)
Cards: totals (users, reservations, modified, cancelled, manual, random). Seat occupancy panels render seat map grid with color-coded availability. User table aggregates per-user stats.

---
## 10. Admin Dashboard & Reporting
Endpoint: `GET /api/reports/admin-dashboard` (requires JWT + admin email in `ADMIN_EMAILS`). Performs parallel queries for counts; returns JSON:
```json
{
  "users_total": 42,
  "reservations_total": 128,
  "seats": { "business": { "occupied": 10, "free": 6 }, "economy": { "occupied": 60, "free": 22 } },
  "selections": { "manual": 70, "random": 58 },
  "modified": 14, "cancelled": 9,
  "per_user": [ { "user_id": 7, "full_name": "Jane Doe", "email": "jane@example.com", "reservations_total": 8, "modified": 2, "cancelled": 1, "created_manual": 5, "created_random": 3 } ]
}
```

---
## 11. XML Import / Export
Export: `GET /api/reports/reservations.xml` (admin). Generates `<flightReservation>` root with seat, passenger, user, luggage flag and timestamp.

Import: `POST /api/reports/reservations.xml/upload` (admin). Accepts original export format; validates row-by-row:
- Ensures user exists.
- Seat exists & free.
- Upserts passenger by CUI.
- Applies VIP discount (pre-lot count ≥5).
Returns success list + structured error array; partial success allowed.

---
## 12. Activity Logging & VIP Logic
Each reservation creation inserts activity rows with `type='created'` and `selection_mode='manual'|'random'`.
Modifications and cancellations insert `type='modified'` / `type='cancelled'`.
VIP discount: once user has ≥5 reservations before a creation batch, 10% applied to each seat in new batch.
Modifications: Each seat change adds 10% of base price to `modification_fee` cumulatively.

---
## 13. Backfill Historical Activity
Endpoint: `POST /api/reports/activity/backfill` (admin). Reconstructs missing entries:
- Adds `created` for reservations lacking it.
- Adds `modified` where `modification_fee > 0` and no activity.
- Cannot recreate past cancellations (reservations already deleted).
Safe to run multiple times (idempotent for existing rows).

---
## 14. Emails & Notifications
Triggered (best-effort, non-blocking):
- Welcome (registration).
- Reservation created (batch summary + VIP status note).
- Reservation modified (changes + cost breakdown + VIP discount lines).
- Reservation cancelled (single / batch).
- VIP status attained (separate congratulations email).
Templates use inline styles and optional logo attachment (configure `MAIL_LOGO_PATH`).

---
## 15. Development Scripts
API `package.json` (typical):
- `npm run dev` → nodemon server
Web Angular CLI defaults:
- `npm start` → `ng serve`
- `npm run build` → production build

---
## 16. Deployment Notes (Optional Docker)
Suggested (not included yet):
- Multi-stage build for Angular dist served by Nginx.
- Node API container with environment secrets.
- PostgreSQL container with volume for persistence.
Add a `docker-compose.yml` with services: web, api, db, smtp (Mailhog/Mailtrap fallback).

---
## 17. Troubleshooting & FAQs
| Issue | Cause | Fix |
| ----- | ----- | --- |
| 500 on admin-dashboard | Using LOWER() on enum | Fixed (equality comparison) |
| Activity counts zero | Logged before table existed | Run backfill endpoint |
| VIP not applied | User had <5 reservations before batch | Make more reservations first |
| Random seat failure | No free seats in requested class | Reduce quantity or free seats |
| Email not sent | SMTP misconfigured | Check `/health/email` response |

Logs show warnings but proceed if email sending fails.

---
## 18. Security & Roles
- Auth via JWT (4h expiration) using `Authorization: Bearer <token>`.
- Admin determined by email inclusion in `ADMIN_EMAILS` list (case-insensitive).
- Guards on front-end restrict `/admin/reportes` route; server also validates.
- All mutation endpoints require authentication.

---
## 19. Future Enhancements
- Date range filters for dashboard metrics.
- CSV/Excel export of admin metrics and per-user table.
- Real-time seat updates via WebSocket / Server-Sent Events.
- Soft-delete reservations to preserve cancellation history details.
- Rate limiting / brute-force protection on login.
- Dedicated migration system (Knex / Prisma) & seed scripts.
- Caching layer (Redis) for heavy aggregate queries.

---
## 20. Author & License
**Author:** Alfonso Enrique Ochaita Moreno  
**University:** Universidad Mesoamericana de Guatemala  
**Course:** Programación Web (VI Semester, 2025)  
**GitHub:** https://github.com/SoyOchaita

License: Educational / academic use only. Fork permitted for non-commercial purposes.

---
### Quick Start Recap
```bash
# API
cd api
cp .env.example .env   # create and edit values
npm install
npm run dev

# Web
cd ../web
npm install
npm start
```
Open: http://localhost:4200  (Web) and http://localhost:4000/health (API)

Enjoy building with 14FLY! ✈️
