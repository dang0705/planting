---
confidence: 0.85
sources: [architecture/_index.md, architecture/_index.md]
synthesized_at: '2026-07-01T13:06:40.544Z'
type: synthesis
title: Location-Priority Weather Integration
summary: Weather context for diagnosis follows a fixed location priority (Plant > CareLocation > Cache) and strict temporal windowing rules.
tags: [weather, diagnosis, location]
related: []
keywords: [weather, location, priority, qweather, cache, diagnosis, window]
createdAt: '2026-07-01T13:06:40.544Z'
updatedAt: '2026-07-01T13:06:40.544Z'
---

# Location-Priority Weather Integration

Environmental evidence for diagnosis is strictly coupled to the plant's care location and valid only within a 48-hour window (diagnosisDate or diagnosisDate-1).

## Evidence

- **architecture**: Location resolution follows a fixed priority chain: plant -> careLocationId -> locationKey -> weather-cache.
- **architecture**: Evidence is valid only if it matches the diagnosisDate or diagnosisDate-1 window; prioritizes plant's care location over user's current location.
