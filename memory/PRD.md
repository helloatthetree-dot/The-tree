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

## Implemented (2026-09-15, part 2 — polish)
- Fixed booking-confirmation "30 minutes" note layout (was `flex` on a paragraph, splitting the text into columns).
- Events page (/events) now splits **Upcoming** vs **Past Events** (past shown grayscale with gallery thumbnails) and no longer labels past events as upcoming; also fixed subtitle "Café Komorebi" → "The Tree".
- Fixed event cards being invisible on load (removed unreliable `whileInView` entrance).
- Removed the long/noisy category label from homepage menu cards.
- Cleaned remaining "Komorebi" strings (AuthPage image alt, ProtectedRoute loader) → "The Tree".

## Implemented (2026-09-15)
- **Fixed refund bug**: unpaid ("Payment pending") bookings now show "₹X fee · not paid" and cancel with a "nothing to refund — it will simply be released" dialog + ₹0 (backend already refunded 0; the frontend was hardcoding 50%). Paid bookings still promise the configured refund %.
- **Featured homepage dishes**: menu items have a `featured` flag; Owner Dashboard Menu has a "Show on homepage (up to 3)" toggle + per-dish photo upload; homepage shows featured dishes (falls back to first 3).
- **Menu category headings** restyled as filled green highlight bands.
- **Slightly larger site font**: root `html { font-size: 17px }`.
- **Razorpay keys updated** to rzp_test_TcC8ye2twizUpg (test mode) — order creation + signature verify confirmed.
- Tested iteration_15: backend 2/2 + all frontend flows pass, no issues.

## Implemented (2026-09-14, part 2)
- **Tables "map" redesign**: homepage `#tables` is now a premium floor-plan — a single dotted-background container with a legend and two dashed zone regions ("Indoor" green, "Garden · Outdoor" clay), each table shown as a pod with seat dots + name + seats. No photos.
- **Editable tables text (super admin)**: `tables_label`, `tables_heading`, `tables_intro` added to settings + Owner Dashboard SettingsManager; consumed on the homepage.
- **Event photo galleries**: events gained a `gallery: [str]`; Owner event dialog has a multi-file photo uploader (with remove); past-dated events show a thumbnail strip in the "Past events" memories section with a full-screen lightbox.
- Tested iteration_14: all 4 features 100% (desktop + mobile, no overflow), no issues.

## Implemented (2026-09-14)
- **Phone OR email login**: `POST /api/auth/login` now takes `{identifier, password}` and matches by email or normalized phone (last 10 digits; country code/spaces ignored). Register stores `phone_normalized`; existing users backfilled at startup. Login page shows an "Email or phone" field.
- **Dynamic fee/refund**: booking page fee-info, policy-accept checkbox, cancellation note and summary now read `fee_per_person`/`refund_percent` from settings (no hardcoded ₹300/50%).
- **Homepage "Our tables"** section (id=tables): indoor/outdoor zone cards listing table names + seats, no photos.
- **Homepage Past vs Upcoming events**: events split by date — upcoming (id=events) and a new grayscale "Past events" section (id=past-events).
- **Booking pass**: confirmation dialog prompts to screenshot + a "Download booking pass" button (canvas PNG, no deps).
- Brand cleanup: AuthPage + Menu page + hero intro now say "The Tree".
- Tested iteration_13: 9/9 backend + all frontend flows pass, no issues. (Actual PNG download click not automatable due to Razorpay checkout.)

## Implemented (2026-09-08)
- **Veg / Non-veg / Egg badges** on menu items (FSSAI-style square+dot): green=veg, red=non-veg, amber=egg. Shown on the Menu page and homepage dish cards (`components/VegBadge.jsx`, `veg_type` field on menu items).
- **Smarter menu upload parser** (`POST /api/admin/menu/upload`): auto-detects the header row (skips title rows), reads `name`/`dish`, `category`, `price`, `description`, `image_url`, and a `veg / non veg` column (Veg/Non veg/Egg). Carries category forward across blank rows; treats a blank-dish row with a star ingredient as a veg/non-veg variant of the dish above ("Popeye's sub (Chicken ham)"). Backward-compatible with the simple template.
- Imported the owner's real Excel menu (29 items: 19 veg / 7 non-veg / 3 egg) across 5 categories.
- Fixed Menu cards being invisible until scroll (switched `whileInView` → mount animation); fixed stale "Café Komorebi" label → "The Tree" on Menu page.
- Updated `public/menu-template.csv` to include a `veg` column.
- Note: a few dishes imported at ₹0 because those price cells were blank in the source file — owner to fill in.

## Implemented (2026-09-03)
- **Razorpay LIVE integration (TEST MODE)** — replaces the previous mock:
  - Booking creates a real Razorpay order (`POST /api/reservations` returns `order_id`/`amount`/`key_id`); frontend opens Razorpay Checkout.
  - `POST /api/reservations/{id}/pay` verifies the HMAC signature server-side before confirming + assigning a table (invalid signature → 400).
  - **Auto-refunds via Razorpay API**: customer cancel = 50%, admin reject = 100%. Refund failures no longer block — booking still cancels/rejects and refund is marked `refund_status: pending` for manual retry (returns 200, avoids ingress 502).
  - Keys in `backend/.env` (`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`).
- "Table held for **30 minutes** after reserved time" notice on booking summary + confirmation dialog.
- Backend verified 100% (iteration_12): real order, 400 on bad signature, valid-sig confirms, cancel/reject hit real refund API. Frontend checkout opens correctly in test mode; full card-entry happy-path needs **manual UAT** (Razorpay anti-bot blocks headless automation).

## Implemented (2026-08-27)
- App renamed to "The Tree"; split Users/Staff vs Customers admin lists; occasion approval only when "extra service" checked.
- **Website Content CMS**: hero copy, gallery CTA, footer note, Contact & WhatsApp (heading/number/phone/email/address), Opening hours cards, Reservation policies (intro + cards) — all editable from Owner Dashboard, rendered on Landing/Policies/booking.
- **WhatsApp QR**: footer "Chat with us" button + scannable QR (editable number, default 919148271005).
- Admin rejection issues full refund; My Reservations surfaces refund amount/status.

## Next Tasks (backlog)
- **Manual UAT**: complete a real Razorpay test-card checkout (4111 1111 1111 1111) → confirm booking + real `rfnd_` refund on cancel/reject.
- P0: Tuesday 9 AM reminder if weekly menu not uploaded (scheduled task).
- P1: Table photo preview on booking confirmation.
- P1: Featured "chef's pick" dish spotlight.
- P2: Editable section headers ("Our tables", "Menu").
- Go live: swap in Razorpay LIVE keys when ready.
- Cleanup: remove leftover TEST/test_user reservations & accounts.
- Refactor: split server.py (~1175 lines) into routers.
