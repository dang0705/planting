# Cloud sync

Cloud sync runs automatically once the workspace is authenticated. `query` and
`record` start the background sync on demand; if sync isn't configured,
ByteRover runs local-only and every command still works.

## Authentication

A user can connect cloud sync from the desktop app, OR you (the agent) can
authenticate this workspace directly — no secret is pasted into the chat:

```bash
node scripts/auth.mjs
```

This returns immediately with a URL and a short one-time code (`{"ok":true,
"pending":true,...}`) while a background process waits for the approval. Relay
the URL + code to the user, tell them to come back and say "approved" after
approving in the browser, and END YOUR TURN. When they return, confirm with
`node scripts/auth.mjs status` (`{"state":"approved"}` → connected). The full
choreography, including the other status outcomes, is in
[SKILL.md → Authenticate with ByteRover](SKILL.md#authenticate-with-byterover).
To sign out:

```bash
node scripts/logout.mjs
```

For non-interactive / CI environments an API key can be supplied by file
(never inline in the conversation): `node scripts/auth.mjs --key-file <path>`.

## How it works

- The daemon polls periodically, pushing local edits and pulling remote
  updates.
- It auto-starts on the next `query` or `record` call when the workspace is
  configured for sync.
- Conflicts are resolved via last-writer-wins (newer timestamp wins; remote
  wins on tie).
- Push/pull errors retry automatically on the next poll cycle.

## Checking status (agent-readable)

If sync seems stuck or a user reports cloud issues:

```bash
node scripts/sync.mjs status
```

This prints the daemon's current state. If status reports `auth-expired`,
re-authenticate with `node scripts/auth.mjs` (the device flow above) or have the
user reconnect in the desktop. For non-empty `conflicts`, **surface that to the
user**. Never edit the environment or hard-code keys to work around auth.

For full troubleshooting, see [troubleshooting.md](troubleshooting.md).
