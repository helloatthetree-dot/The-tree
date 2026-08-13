# Emergent Google Auth — Testing Playbook (Café Komorebi)

This app ADDS Emergent-managed Google sign-in alongside existing JWT email/password auth.
After a successful Google session exchange, the backend mints the app's OWN JWT
(same as email/password login) and returns `{access_token, user}`. The frontend stores it
in localStorage as `komorebi_token`. There is NO separate session cookie system.

## Flow
1. Frontend "Continue with Google" → `https://auth.emergentagent.com/?redirect=<origin>/`
2. User returns to `<origin>/#session_id=...`
3. AppRoutes detects `session_id` in `useLocation().hash` → renders `AuthCallback`
4. AuthCallback calls `POST /api/auth/google/session { session_id }`
5. Backend calls `GET https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data`
   with header `X-Session-ID`, upserts the user into `users`, returns app JWT
6. Frontend stores token, redirects: staff → /admin, else → /book

## Role mapping
- If the Google email == SUPER_ADMIN_EMAIL (sabnamrajoria@gmail.com) → super_admin
- Otherwise new Google users are created as `customer`
- Existing users keep their current role (email is the identity key)

## Backend testing (mint a fake session is NOT possible; test the JWT path instead)
- Existing JWT still works: POST /api/auth/login with seeded accounts.
- The Google endpoint requires a real session_id from Emergent auth; cannot be curl-mocked.
  Verify it returns 401 for an invalid session_id:
  curl -s -X POST $URL/api/auth/google/session -H 'Content-Type: application/json' -d '{"session_id":"bad"}'
  => 401 Invalid or expired Google session

## Browser testing
- Click "Continue with Google" (data-testid="google-signin") → redirects to auth.emergentagent.com.
- Full round-trip requires a real Google login; verify the button redirects correctly and that
  the JWT email/password path is unaffected.
