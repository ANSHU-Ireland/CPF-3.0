# Route ↔ contract matrix

Purpose: inventory every request `project/src/**` (and V2 clients) make, and map to
the real backend route. Populated during M04. M01 records the confirmed mismatches.

| Frontend call | Backend reality | Status | Fix module |
|---|---|---|---|
| `GET /v1/auth/session` | `GET /v1/auth/me` | MISMATCH | M04 |
| `GET /v1/platform/orgs` | `GET /v1/platform/organisations` | MISMATCH | M04 |
| UI role `employer_admin` | persisted `org_admin` / `hiring_manager` | MISMATCH | M04 |
| login expects `{token, session}` | API returns `{token, expiresAt, user, memberships}` | MISMATCH | M04 |

Remaining `project/src/**` calls to be inventoried exhaustively in M04.
