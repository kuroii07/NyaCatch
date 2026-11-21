# Third-party components in NyaCatch 0.25.0

NyaCatch is based on MediaGo 3.5.0 (MIT), retaining upstream copyright. The application license does not replace component licenses.

- FFmpeg 6.0 essentials, source commit ea3d24bbe3, supplied by eugeneware/ffmpeg-static b6.0 from gyan.dev (GPLv3+). Original Windows build README and full configuration are attached.
- ffprobe n6.1.2-9-g4571c80b40-20241023, supplied by descriptinc/ffmpeg-ffprobe-static b6.1.2-rc.1 (GPLv3+), FFmpeg source commit 4571c80b40.
- aria2c 1.36.0 (GPLv2+); original COPYING is attached.
- yt-dlp 2026.10.21; upstream license and third-party notices are attached, including applicable bundled-runtime conditions.
- N_m3u8DL-RE 0.3.0-beta, BBDown 1.6.3 and legacy mediago-core 0.2.1: upstream notices apply; see the supplied license files and component inventory.
- Electron/Chromium notices are at the application root: LICENSE.electron.txt and LICENSES.chromium.html. The Ghostery preload license is attached.

The release separately provides NyaCatch-0.25.0-third-party-sources.zip alongside executable downloads at https://github.com/kuroii07/NyaCatch/releases/tag/v0.25.0 . Its source manifest records repository refs, source URLs and SHA256 values. NyaCatch application source is available from that tag, with build instructions in docs/nyacatch/development.md.

GPL components are separate executable programs. Their GPL terms and source distribution requirements remain applicable; no additional license restriction is imposed on those components. Configuration and upstream source/build records accompany the source asset.

NPM dependency metadata is in npm-dependencies.json, with notices under npm/. Compiled Go module metadata is in go-modules.json, with notices under go/. MPL package preferred-source snapshots are pinned to published gitHead commits in source-manifest.json and included in the source asset. The MIT option is used for jszip.
