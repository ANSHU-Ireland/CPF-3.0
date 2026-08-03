$ErrorActionPreference = 'Stop'

$seedJson = node "c:\Users\adikr\Desktop\cpf2.0\CPF-2.0\scripts\seed-candidate-link.mjs"
$seed = $seedJson | ConvertFrom-Json
$token = $seed.token
$empty = '{}'

Invoke-RestMethod -Uri "http://127.0.0.1:4000/v1/candidate/$token" -Method Get | Out-Null
$accept = Invoke-RestMethod -Uri "http://127.0.0.1:4000/v1/candidate/$token/accept" -Method Post -ContentType "application/json" -Body $empty
$sessionId = $accept.sessionId

Invoke-RestMethod -Uri "http://127.0.0.1:4000/v1/candidate/$token/disclosure/acknowledge" -Method Post -ContentType "application/json" -Body $empty | Out-Null
Invoke-RestMethod -Uri "http://127.0.0.1:4000/v1/candidate/$token/start" -Method Post -ContentType "application/json" -Body $empty | Out-Null

$headers = @{ "x-cpf-candidate-token" = $token }
$now = (Get-Date).ToUniversalTime()
$heartbeatBody = @{
  deviceSessionId = "desktop-session-uat-01"
  companionVersion = "0.2.0"
  helperState = "ok"
  cameraState = "on"
  focusState = "focused"
  internalClipboardState = "contains_data"
  clientOccurredAt = $now.AddMilliseconds(-750).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
  networkRttMs = 42
  hashChainHead = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
  meta = @{ channel = "uat"; monitor = "desktop" }
} | ConvertTo-Json -Depth 6

$heartbeat = Invoke-RestMethod -Uri "http://127.0.0.1:4000/v2/sessions/$sessionId/heartbeat" -Method Post -Headers $headers -ContentType "application/json" -Body $heartbeatBody

$eventsBody = @{
  deviceSessionId = "desktop-session-uat-01"
  batchId = "batch-uat-01"
  events = @(
    @{
      sequenceNo = 1
      eventId = "evt-uat-0001"
      eventType = "focus_lost"
      category = "focus"
      severity = "warning"
      source = "companion"
      clientOccurredAt = $now.AddMilliseconds(-500).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
      payload = @{ reason = "window_blur" }
      payloadRedacted = $false
      hash = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    },
    @{
      sequenceNo = 2
      eventId = "evt-uat-0002"
      eventType = "external_clipboard_blocked"
      category = "clipboard"
      severity = "info"
      source = "companion"
      clientOccurredAt = $now.AddMilliseconds(-350).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
      payload = @{ source = "os_clipboard" }
      payloadRedacted = $false
      hash = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
      previousHash = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    },
    @{
      sequenceNo = 3
      eventId = "evt-uat-0003"
      eventType = "tool_execute_failed"
      category = "tool"
      severity = "high"
      source = "web_runtime"
      clientOccurredAt = $now.AddMilliseconds(-200).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
      payload = @{ tool = "ga4lab.queryReport"; error = "timeout" }
      payloadRedacted = $true
      redactionReason = "contains_partial_prompt"
      hash = "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
      previousHash = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    }
  )
} | ConvertTo-Json -Depth 8

$batch = Invoke-RestMethod -Uri "http://127.0.0.1:4000/v2/sessions/$sessionId/events:batch" -Method Post -Headers $headers -ContentType "application/json" -Body $eventsBody
$logs = Invoke-RestMethod -Uri "http://127.0.0.1:4000/v2/sessions/$sessionId/logs?limit=20" -Method Get -Headers $headers

[pscustomobject]@{
  token = $token
  sessionId = $sessionId
  heartbeatSkewMs = $heartbeat.computedClockSkewMs
  acceptedEventCount = $batch.acceptedCount
  summary = $logs.summary
  firstEvent = $logs.events[0]
} | ConvertTo-Json -Depth 8
