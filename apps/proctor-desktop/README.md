# CPF Proctor Companion (S15) — scaffold

Tauri 2 desktop companion enforcing the proportionate assessment boundary.
**Status: scaffold.** Building, signing/notarising and penetration testing the
native app are external gates recorded in `docs/execution/risk-register.md`
(R2) — they cannot be completed inside this repository's CI alone.

## What is already real (this repo)

- Protocol: `@cpf/proctor-protocol` — the complete, closed bridge message set,
  the verified self-termination sequence, heartbeat hash-chain helpers and the
  proportionate watcher-rule catalogue (rule id + state only, never process
  lists). Tested.
- Server side: heartbeat + behaviour-event batch + logs endpoints
  (`/v2/sessions/:id/heartbeat`, `events:batch`, `logs`) with hash-chain
  storage and sequence-conflict rejection (migration 0026 + runtime tests).
- Manifest: signed, version-pinned, `companion` policy block (S08).

## Hard constraints carried into the native implementation

1. Narrow typed bridge only — `BridgeCommand`/`BridgeEvent` from
   `@cpf/proctor-protocol`. No arbitrary shell, no filesystem API.
2. CPF endpoint allowlist; new windows/protocols/downloads/devtools blocked.
3. Internal clipboard during live stages; OS↔shell paste/copy blocked with the
   accommodation policy override.
4. No admin/root requirement, no persistent privileged service, no DNS/hosts
   modification, no security-software interference, no unrelated file scans.
5. Visible recording indicator IF camera mode is ever DPIA-approved — the
   pilot ships `cameraRequired: false` and no camera code path exists.
6. Self-termination follows `SHUTDOWN_SEQUENCE` exactly; the app exits after
   a verified receipt but never self-uninstalls.

## Build (when the native gate opens)

```text
apps/proctor-desktop/
  src-tauri/        Rust host: manifest deep-link, watchers, signing
  src/              webview UI: preflight mirror, status strip, receipts
  tests/            bridge conformance against @cpf/proctor-protocol
```

Toolchain: Tauri 2 + Rust stable; WebView2 (Windows), WKWebView (macOS);
signed installers + signed updates + SBOM; minimum supported OS list in the
release record. CRA obligations assessment before public distribution.
