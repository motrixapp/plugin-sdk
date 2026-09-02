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
    "@motrix/plugin-api": "^2.1.0",
    "@motrix/plugin-cli": "^2.1.1",
    "esbuild": "^0.28.2",
    "typescript": "^7.0.2"
  }
}
