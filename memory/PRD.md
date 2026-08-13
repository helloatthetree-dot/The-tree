# Café Komorebi — Table Reservation System (PRD)

## Original Problem Statement
Mobile-first, premium, calm web app to reserve tables at Café Komorebi. Roles: Customer, Admin, Super Admin (Owner). Operating hours: Sat/Sun 12:30–22:00 continuous; Tue–Fri 12:30–15:00 & 18:00–22:00; Monday closed. Weekly booking window opens Tuesday 11:30 AM. Fee ₹300/person via Razorpay; 50% refund on cancel. Groups >6 or any special occasion → manual admin approval. Full slot → waitlist. Policies acceptance before payment. Auto table assignment. Out of scope: CRM/loyalty, POS, inventory, kitchen, QR ordering.

## User Choices
- Auth: JWT email/password
- Razorpay: MOCKED (real keys to be added later)
- Email confirmations: none in v1 (on-screen only)
- Scope: full build (customer + admin + super admin)
- Design: agent-decided ("Organic & Earthy" Komorebi theme)

## Architecture
- Backend: FastAPI + MongoDB (motor), JWT (bcrypt) auth, role gating (customer/admin/super_admin). All routes under /api.
- Frontend: React + react-router + framer-motion + Tailwind + shadcn/ui + recharts. Token in localStorage.
- Payments: mocked order + mock pay endpoint.

## Personas
- Customer: browses availability, books, pays, cancels, joins waitlist.
- Admin: today's/pending/waitlist/all reservations, approve/reject, live table status, block dates/slots/tables.
- Super Admin: all admin + tables CRUD, reservation rules/settings, holidays, users/staff & roles, analytics.

## Implemented (2026-08-13)
- JWT auth (register/login/me), seeded owner/admin/guest accounts.
- Availability engine: operating hours, 30-min slots, 90-min hold, blocked dates/slots/tables, holidays, Tuesday 11:30 weekly window.
- Booking flow: party size, date strip (Mondays disabled), slots, form (name/phone/occasion), embedded policies acceptance, mock payment, on-screen confirmation, auto table assignment.
- Approval routing (groups >6 or special occasions), waitlist on full slot, self-cancel with 50% refund.
- Admin dashboard (overview/analytics, today, pending approve/reject, waitlist, all reservations, tables + live status, blocks).
- Super Admin: settings (fee/refund/threshold/hold/occasion-approval), holidays, tables CRUD, users & role management, charts.
- Tested: 28/28 backend pytest pass; frontend critical flows 100%.

## Backlog (P1/P2)
- P1: Real Razorpay keys + real refund flow; email confirmations (Resend).
- P2: Cafe timezone (IST) for booking window; reservations date/status indexes; protect seeded accounts from deletion; parallel/real-time table map on admin.

## Next Tasks
- Await user review; wire real Razorpay when keys available.
