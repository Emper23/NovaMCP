# NovaMCP 7.0.4

## What changed

- In-app updates now install silently without showing the NSIS installer progress window.
- NovaMCP closes, applies the downloaded update in the background, and starts again automatically.
- Manual Setup installers keep the normal UI for first-time installation.
- About & Changelog now includes the 7.0.4 release.

## Upgrade note

The upgrade from 7.0.3 to 7.0.4 may still show the installer once because 7.0.3 contains the older non-silent updater call. Updates started from 7.0.4 and newer use silent installation.
