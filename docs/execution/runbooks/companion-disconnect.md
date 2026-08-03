# Runbook — companion disconnect

**Detection:** heartbeat loss beyond policy window for an `active` V2 session.

1. Do **not** auto-invalidate the candidate (plan rule 1.1.10). Session transitions to `paused_tech` per policy.
2. Check `candidate_session_heartbeats_v2` last-seen and network state; distinguish network drop vs process exit vs crash.
3. Candidate reconnect path: companion revalidates manifest, resumes session, hash chain continues; gap is recorded as an integrity event with reliability grading — not a verdict.
4. If the candidate cannot reconnect: technical incident + reschedule/time-credit per policy; work is preserved (artifact versions are server-side).
5. Repeated/patterned disconnects: flag for integrity review by the integrity role only. Reviewers of performance never see this.
6. Crash during submission: follow submission-recovery runbook — receipt or bounded recovery bundle decides, never a guess.
