# Planting compiled-asset E2E adapter

`run.mjs` passes the compiled artifact, suite, and adapter explicitly to
`miniprogram-e2e`. The artifact sidecar is copied by `artifact-provider.mjs`
before validation, then is preserved in the final artifact directory.

`verify-migration.mjs` compares the current 22 legacy catalog IDs, scripts,
and data modes to the bridge suite. At present the bridge contains 16
`live_real` leaves and 6 `fixture_diagnostic` leaves. The latter remain
diagnostic evidence and must not be counted as real-data acceptance.

The app-session provider is intentionally a migration bridge around the
existing isolated DevTools runner. It refuses an arbitrary artifact directory
instead of opening the old configured artifact and claiming success. Replacing
that bridge with the package-native explicit DevTools launcher, migrating the
six diagnostic fixture paths to real-data fixtures, and deleting the old
runner remain cutover work; none of those conditions is represented as passed.
