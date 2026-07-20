{
  "$schema": "https://motrix.app/schemas/plugin/v1.json",
  "manifestVersion": 1,
  "id": "{{PLUGIN_ID}}",
  "name": "%name%",
  "version": "0.1.0",
  "description": "%description%",
  "categories": ["site-resolver"],
  "engines": { "motrix": ">=2.0.0 <3.0.0" },
  "main": "dist/plugin.js",
  "permissions": ["http"],
  "hostPermissions": ["https://example.com/*"],
  "activationEvents": ["onTaskType:http"],
  "contributes": {
    "hooks": { "beforeCreate": { "role": "resolve" } }
  },
  "l10n": "locales"
}
