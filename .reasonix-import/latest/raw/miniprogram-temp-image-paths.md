# VERY IMPORTANT: Mini Program Temporary Image Paths Must Never Be Treated As Remote URLs

Date: 2026-03-29
Project: `E:\workspace\planting`

## Rule

In WeChat mini programs, temporary image paths may look like local paths or pseudo-URLs, including but not limited to:

- `wxfile://...`
- `http://tmp/...`
- `https://tmp/...`
- `/tmp/...`
- `tmp/...`

These are **not** normal remote/public image URLs and must never be passed through as if they were downloadable internet images.

## Mandatory handling rule

For AI image diagnosis flows:

1. Mini program image input must be normalized before request dispatch.
2. Temp runtime paths or temp pseudo-URLs must never be sent directly to diagnosis or identify APIs.
3. Diagnosis images must first be uploaded through an HTTP cloud function, and the final diagnosis payload must use the returned cloud temporary URL / file reference.
4. Base64 may be used only as an intermediate transport format to the upload HTTP function when needed; it is not the final diagnosis payload format anymore.
5. Do not use a broad `http(s)` allow-pass rule for temp runtime paths. Only real cloud temp URLs returned by the upload flow are allowed through.

## What went wrong before

A previous implementation incorrectly treated `http://tmp/...jpg` as a normal remote URL because it matched `/^https?:\/\//`.

That caused diagnose requests to send temp runtime image references directly to Hunyuan, producing backend errors like:

- `image download failed, url:http://tmp/...`

## Permanent constraint

Never again assume that a mini program image string beginning with `http://` is necessarily a real remote image.

When working on mini program image upload / diagnose / identify flows, always explicitly distinguish:

- temp runtime path / pseudo-URL
- real public remote URL
- upload-intermediate base64 data URL
- cloud temporary URL returned by upload HTTP function

If there is any uncertainty, upload through the HTTP function first and only send the returned cloud URL onward.
