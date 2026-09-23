# Piano Studio

Piano Studio is a responsive browser-based piano workspace that turns a sheet-music image into a playable sequence. It combines a polished virtual piano interface, real acoustic piano samples, local file handling and an optional Optical Music Recognition (OMR) pipeline.

> The application is written as a client-side React and TypeScript project. The local fallback works without an account. High-quality score recognition requires a Flat OMR token.

## Features

- Responsive piano keyboard for desktop and mobile browsers.
- Mouse, touch and computer-keyboard input.
- Multi-sampled Salamander Grand Piano sound through `@tonejs/piano`.
- Tempo and volume controls.
- Sequence playback with progress feedback.
- PNG, JPG and JPEG score upload.
- Local image analysis fallback for a no-account demo mode.
- Optional Flat/Tutteo OMR integration that uploads a score, monitors processing progress, downloads MusicXML and converts recognised notes into a playable sequence.
- English interface and OMR locale configuration.

## Requirements

- Node.js 18 or newer.
- pnpm 8 or newer.
- A modern browser with Web Audio support.
- An optional Flat account and Personal Access Token with the `omr` scope for real OMR recognition.

## Getting started

Open the local URL printed by Vite. The production build can be checked with:

```bash
pnpm check
pnpm build
```

The `build` command creates the Vite client bundle and the static-compatible server bundle.

## Using the OMR engine

The local fallback is enabled by default. It is useful for demonstrations, but it is not a full music-notation recognition system. For real recognition:

1. Create an app at [flat.io/developers/apps][1].
2. Open **REST API → Personal tokens** in the app dashboard.
3. Create a token with the **`omr`** scope.
4. Open Piano Studio settings and select **Real OMR**.
5. Paste the token into the Flat OMR token field.
6. Upload a clear PNG, JPG or JPEG image of the score.

The integration uses the Flat OMR jobs endpoint. It submits the image as a base64 payload, waits for the job to finish and downloads the resulting MusicXML file. The application then extracts pitches and note durations from the MusicXML document.

Flat OMR jobs consume credits per page. An HTTP `402` response generally means that the account has insufficient OMR credits, has reached a quota, or does not have access to the required processing plan. The uploaded image itself may still be valid.

## Security note

This project is intentionally client-side, so a Personal Access Token entered in the settings panel is stored in the browser's local storage and is sent directly to the Flat API. That approach is suitable for a personal prototype or local testing, but it is not recommended for a public production deployment.

For production, move the OMR request to a server-side proxy. The proxy should keep the token in an environment variable, validate file type and size, rate-limit requests and avoid exposing the token to the browser.

## Audio implementation

The piano uses `@tonejs/piano` and the Salamander Grand Piano sample set. Samples are loaded on the first user interaction so that the browser's audio autoplay policy is respected. The first note may take longer to play while the samples are loading; later notes use the already loaded instrument.

A network connection is required the first time the instrument samples are downloaded unless the browser already has them cached.

## Project structure

```text
client/
  index.html
  src/
    App.tsx
    index.css
    pages/Home.tsx
server/
  index.ts
shared/
  const.ts
```

The main experience lives in `client/src/pages/Home.tsx`. Global visual tokens and responsive styling live in `client/src/index.css`. The project does not require a database or authentication service.

## Supported input

The upload control accepts `.png`, `.jpg` and `.jpeg` images. Clear, straight-on scans with good contrast produce the best OMR results. Cropped pages are preferable to screenshots that include browser chrome, large margins or perspective distortion.

## Limitations

The local fallback is intentionally lightweight and should not be used as a substitute for professional OMR. Complex scores may contain multiple voices, chords, tuplets, ornaments, repeats, key changes and dynamics that require a complete notation engine.

The current MusicXML conversion focuses on pitched single-note events and basic note-type durations. Rests, chords and detailed notation metadata are not yet rendered as full playback semantics.

## Licence and attribution

The application source is provided for the repository owner's use. Check the terms of any future public distribution before publishing a licence for the complete project. The acoustic piano samples are provided through the Salamander Grand Piano material used by `@tonejs/piano`; review the upstream licence and attribution requirements before redistribution.

## References

- https://flat.io/developers/docs/api/authentication "Flat API Authentication"
- https://flat.io/developers/docs/api/omr/ "Flat Optical Music Recognition API"
- https://github.com/tambien/Piano "@tonejs/piano and Salamander Grand Piano samples"
- https://tonejs.github.io/docs/14.7.77/Sampler "Tone.js Sampler documentation"
