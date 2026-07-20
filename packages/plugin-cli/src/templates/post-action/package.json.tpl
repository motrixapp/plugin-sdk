{
  "name": "{{PROJECT_NAME}}",
  "version": "0.1.0",
  "type": "module",
  "private": true,
  "scripts": {
    "build": "node esbuild.config.mjs",
    "pack": "motrix-plugin pack",
    "dev": "motrix-plugin dev"
  },
  "devDependencies": {
    "@motrix/plugin-api": "^2.0.0",
    "@motrix/plugin-cli": "^2.0.0",
    "esbuild": "^0.24",
    "typescript": "^5.6"
  }
}
