# S15 evidence — proctor companion (2026-08-03)

- Protocol package @cpf/proctor-protocol: closed typed bridge (no shell/fs/biometric/process-list messages exist — schema-rejected), verified self-termination sequence (receipt verification strictly before token revocation/data clearing; out-of-order steps throw), heartbeat hash-chain helpers with gap/tamper detection, proportionate watcher-rule catalogue (rule id + state only). Tests 4/4 PASS.
- Server side already live: /v2/sessions/:id/heartbeat + events:batch + logs with hash chain + sequence-conflict rejection (0026, proctor-runtime tests).
- Scaffold apps/proctor-desktop/README.md records the hard constraints and the EXTERNAL gates: Tauri build, signing/notarisation, pen test, DPIA telemetry approval (risk register R2). Status: in_progress until those gates close.
