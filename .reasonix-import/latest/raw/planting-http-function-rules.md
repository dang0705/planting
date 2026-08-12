# Planting Project HTTP Function Routing Rules

Date: 2026-03-29
Project: `E:\workspace\planting`

## Hard rules

1. All requests must go through HTTP cloud functions unless the capability is WeChat-only by nature.
2. If a required capability does not yet have a matching HTTP cloud function, create one instead of calling SDK APIs directly from the client.
3. New client-side data flows should prefer the existing `requestHttpFunction` / HTTP-function client layer for consistency across platforms.

## Concrete implication

- Cloud storage uploads for general business flows should not call `wx.cloud.uploadFile` directly from shared client logic.
- Build a core composable that is cloud-agnostic, then wrap it with a CloudBase HTTP-function uploader composable.
- Diagnosis and similar AI flows should upload first, then pass cloud-hosted URLs or file references to downstream diagnosis APIs.
