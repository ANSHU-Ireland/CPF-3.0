# V2 Controlled Rollout Record (S20)

**Status: NOT STARTED — gated on S19 pilot passing its pre-registered gates.**
This record is the template that must be completed and signed before stage 1.

## Rollout stages (each needs two clean monitoring windows before advancing)

1. Internal demo tenants, synthetic candidates (harness + staff).
2. One design partner, one pack, supervised decisions, mandatory second review.
3. 5% of new eligible invitations for approved tenants.
4. 25%, then 50%.
5. V2 default for validated packs/tenants.
6. V1 retirement proposal — separate plan and PRs, never this record.

## Controls in place today (verified by tests)

- Tenant/pack targeting via `org_feature_flags` (platform-admin only, audited).
- New invitations only: `experience_version` immutable after issue (ADR-001).
- Kill switches without deploy: DB flag flip; env `V2_KILL_*` as emergency.
- Rollback: disable new V2 invitations; active V2 sessions remain supported
  to receipt/review/appeal; V2 evidence is never deleted on rollback.

## Stop conditions (any one stops the rollout immediately)

- Cross-tenant or unauthorised media/evidence access.
- Lost/ambiguous submissions above zero-tolerance threshold.
- Material accessibility exclusion without an equivalent route.
- Reviewer reliability below the approved floor.
- Unexplained subgroup disparity or integrity false positives above threshold.
- Model/prompt/plugin/policy change without evaluation + versioning.
- Notice/retention/rights behaviour diverging from policy.
- Employer misuse of dimensions or integrity evidence (terms breach).
- Regulator, DPO, security or conformity blocker.

## Sign-off block (complete before stage 1)

| Role | Name | Date | Evidence reviewed |
|---|---|---|---|
| Release owner | — | — | S18 hardening + S19 pilot report |
| DPO | — | — | DPIA + notices + retention proofs |
| Security | — | — | Pen test + ASVS/AISVS mapping |
| Accessibility | — | — | AT UAT report |
| I-O psychology | — | — | Reliability + calibration analysis |

Post-market monitoring: monthly during pilot, quarterly after stability,
immediate review after any serious incident or material change.
Business metrics reported per plan §Step 20 — never "hiring cost saved"
without subtracting reviewer/proctor/model/plugin/support/validation/
compliance operations; no quality-of-hire claims without prospective evidence.
