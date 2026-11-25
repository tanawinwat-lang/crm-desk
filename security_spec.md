# CRM Desk Firestore Security Specification (Phase 0)

## 1. Data Invariants
1. **Verified Identity & Admin Gate**: Only users with `request.auth != null && request.auth.token.email_verified == true` may access application resources. Administrative privileges are strictly verified via `/admins/$(request.auth.uid)` or the verified bootstrap admin email (`tanawin.wat@gmail.com`).
2. **No Self-Assigned Roles**: Users creating their own `/users/{userId}` document cannot assign themselves `admin` or `tl` roles unless backed by a verified `/staff_directory/{staffId}` record matching their verified email or the bootstrapped admin email.
3. **PII Isolation**: Staff email addresses reside exclusively in `/staff_directory/{staffId}` (readable only by Admins or the matching verified email owner via single-doc `get`) and `/users/{userId}/private/{docId}` (readable only by the owner or Admin). Operational `/users/{userId}` profiles contain no PII.
4. **Team Scoping for Agents**: Agents may only create, read, and update cases belonging to their assigned `team_id`, and cannot transfer a case to another team or reassign ownership across teams.
5. **Per-User SLA Acknowledgments**: Each user's SLA acknowledgment state in `/users/{userId}/case_acks/{ackId}` is strictly scoped to `userId == request.auth.uid`.
6. **Temporal Integrity & Strict Schema Keys**: Every write validates required/allowed keys (`hasAll` + `hasOnly`), string lengths, regex IDs, and server-side timestamps (`request.time`) for `created_at`/`updated_at`/`ack_at`.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Unverified Email Admin Spoof**: Sign in with `email: "tanawin.wat@gmail.com"`, `email_verified: false` -> attempt to write `/teams/hack` -> MUST return `PERMISSION_DENIED`.
2. **Self-Role Escalation on User Profile**: Non-admin user attempts `create` on `/users/{uid}` with `role: "admin"` without a matching `/staff_directory` record -> MUST return `PERMISSION_DENIED`.
3. **Shadow / Ghost Field Injection (Create)**: Authenticated user creates `/cases/case_1` with an extra field `isAdminApproved: true` -> MUST return `PERMISSION_DENIED`.
4. **Shadow / Ghost Field Injection (Update)**: Authenticated user updates `/cases/case_1` with `{ status: "done", hiddenFlag: true }` -> MUST return `PERMISSION_DENIED`.
5. **Cross-Team Case Creation (Agent)**: Agent belonging to `team_id: "line_oa"` attempts to create `/cases/case_2` with `team_id: "call"` -> MUST return `PERMISSION_DENIED`.
6. **Cross-Team Case Update (Agent)**: Agent belonging to `team_id: "line_oa"` attempts to update `/cases/case_call_1` (`team_id: "call"`) -> MUST return `PERMISSION_DENIED`.
7. **Unauthorized Team Reassignment (Agent)**: Agent attempts to update `team_id` or `assignee_id` on an existing case -> MUST return `PERMISSION_DENIED`.
8. **PII Scraping on `staff_directory` List**: Non-admin authenticated user attempts `list` on `/staff_directory` -> MUST return `PERMISSION_DENIED`.
9. **PII Cross-User Read on `private`**: Non-admin user attempts `get` on `/users/other_uid/private/info` -> MUST return `PERMISSION_DENIED`.
10. **ID Poisoning**: Authenticated user attempts `create` on `/cases/invalid@id!#` or a 200-char ID -> MUST return `PERMISSION_DENIED`.
11. **Timestamp Tampering**: Authenticated user attempts `create` on `/cases/case_3` with a backdated `created_at` != `request.time` -> MUST return `PERMISSION_DENIED`.
12. **Terminal State / Cross-User Ack Tampering**: Authenticated user A attempts to write `/users/user_b/case_acks/case_1_pre_30m` to silence user B's SLA popup -> MUST return `PERMISSION_DENIED`.
