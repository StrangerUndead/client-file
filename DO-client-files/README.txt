Daedric Online client files - copied 2026-11-17 from this PC's install
(game folder C:\Games\Skyrim-1.6.1170, launcher %LOCALAPPDATA%\Programs\Daedric Online)

Daedric Online's Terms (section 12) forbid redistributing these files and reverse-engineering
the launcher/client except where law or an open-source licence allows. Keep this folder private.
The Terms say source code for the distributed versions is available on request from the team.

WHAT'S WHERE
------------
Client bundle (game side)
  Data\Platform\Plugins\skymp5-client.js
      Only a 166-byte stub on disk ("requires its native client update"). The launcher keeps the
      real client bundle off disk outside a play session; it was not captured here.
  Data\Platform\UI\build.js + index.html + assets
      The in-game UI bundle (~10 MB) loaded by Skyrim Platform's browser.
  Data\Platform\PluginsNoLoad\
      Logging plugins shipped but not loaded.
  Data\Platform\Plugins\skymp5-client-settings.REDACTED.txt
      Client settings with sessionToken and voice controlToken removed.

Data\Platform\Distribution\
  Skyrim Platform runtime: CEF browser (libcef.dll etc.), SkyrimPlatformImpl.dll, libnode.dll.

Data\SKSE\Plugins\ (native client)
  MpClientPlugin.dll, SkyrimPlatform.dll/.ini  - SkyMP native client (built from skymp sources)
  Daedric*.dll (+ .json / NOTICES)              - Daedric Online's own native plugins
  The other ~430 files in the real folder are third-party mods from the Nexus collection and were
  left out.

Voice client / service (runs inside the launcher, not the game)
  launcher\app-extracted\dist\voice.html, voice.js, voicePreload.js
  launcher\app-extracted\dist\captureWorklet.js, playbackWorklet.js, tapWorklet.js
  The game talks to it on local control port 7780 (see settings file).

Portrait sharing
  Data\Platform\Plugins\rp-portrait.js            - game-side portrait plugin
  launcher\app-extracted\dist\main.js              - contains src/main/portraitCapture.ts
                                                     (captures + crops a portrait from the game)
  No portraits were cached in Data\Platform\UI\portraits at copy time.

Launcher (everything else)
  launcher\app.asar           - original packed bundle
  launcher\app-extracted\     - unpacked: dist\main.js (main process, obfuscated), renderer.js,
                                preload.js, data\modlist.json, node_modules
