{
  "$schema": "https://motrix.app/schemas/plugin/v1.json",
  "manifestVersion": 1,
  "id": "{{PLUGIN_ID}}",
  "name": "%name%",
  "version": "0.1.0",
  "description": "%description%",
  "categories": ["post-action"],
  "engines": { "motrix": ">=2.0.0 <3.0.0" },
  "main": "dist/plugin.js",
  "permissions": ["notify"],
  "activationEvents": ["onStartup"],
  "contributes": {
    "hooks": { "afterComplete": { "role": "post-process" } }
  },
  "l10n": "locales"
}
