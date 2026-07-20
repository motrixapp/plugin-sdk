import { hooks, log, notify } from 'motrix:plugin-api'

hooks.afterComplete(async (ctx) => {
  log.info('completed', { task: ctx.task.id })
  if (notify.available) {
    await notify.show({ title: '%name%', body: `Done: ${ctx.filePath}` })
  }
})
