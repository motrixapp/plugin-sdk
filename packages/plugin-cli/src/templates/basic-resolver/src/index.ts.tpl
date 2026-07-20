import { hooks, log } from 'motrix:plugin-api'

hooks.beforeCreate(async (ctx) => {
  log.info('resolving', { uri: ctx.uris[0] })
  // TODO: rewrite ctx via ctx.update(...)
  return ctx
})
