declare module 'motrix:plugin-api' {
  export type JsonValue =
    | null
    | boolean
    | number
    | string
    | JsonValue[]
    | { [k: string]: JsonValue }

  export interface HookCtxBase {
    readonly schemaVersion: 1
    readonly invocationId: string
    readonly taskId: string
    readonly sourceUrl: string
    readonly createdBy: 'user' | 'protocol' | 'api'
    readonly requestedAt: number
    readonly signal: AbortSignal
    readonly metadata: PluginMetadata | ReadonlyPluginMetadata
  }

  export interface BeforeCreateHttpContext extends HookCtxBase {
    readonly type: 'http'
    readonly uris: ReadonlyArray<string>
    readonly saveDir: string
    readonly filename?: string
    readonly connections?: number
    readonly headers: ReadonlyArray<{ name: string; value: string }>
    readonly proxy?: string
    update(
      patch: Partial<{
        uris: string[]
        filename: string
        connections: number
        headers: Array<{ name: string; value: string }>
        proxy: string
      }>
    ): void
  }

  export interface BeforeFinalizeContext extends HookCtxBase {
    readonly task: PluginTaskSnapshotV1
    readonly inputFilePath: string
    readonly filePath: string
    readonly targetFilePath: string
    update(patch: Partial<{ filePath: string }>): void
  }

  export interface ErrorDescriptorV1 {
    readonly code: string
    readonly message: string
    readonly detailKey: string | null
    readonly detailParams: Readonly<Record<string, string>> | null
  }

  export interface PluginTaskSnapshotV1 {
    readonly schemaVersion: 1
    readonly id: string
    readonly name: string
    readonly type: 'http' | 'ftp' | 'bt' | 'magnet' | 'metalink'
    readonly kind: 'direct' | 'bt' | 'hls' | 'mux'
    readonly status:
      | 'queued'
      | 'fetching_metadata'
      | 'metadata_ready'
      | 'downloading'
      | 'finalizing'
      | 'seeding'
      | 'paused'
      | 'completed'
      | 'error'
      | 'removed'
    readonly filePath: string
    readonly saveDir: string
    readonly filename: string
    readonly progress: number
    readonly totalBytes: number
    readonly downloadedBytes: number
    readonly uploadedBytes: number
    readonly sizeWhenDone: number
    readonly fileCount: number
    readonly createdAt: number
    readonly updatedAt: number
    readonly finishedAt: number | null
    readonly category: string | null
    readonly infoHash: string | null
    readonly error: ErrorDescriptorV1 | null
  }

  export interface DeliveryEnvelopeV1 {
    readonly schemaVersion: 1
    /** Stable across retries of the same plugin delivery. */
    readonly id: string
    /** Identifies the task occurrence that created this delivery. */
    readonly occurrenceId: string
    /** Unix timestamp in milliseconds for the source occurrence. */
    readonly occurredAt: number
  }

  export interface PostHookContextBase {
    readonly schemaVersion: 1
    /** Fresh for every delivery attempt. */
    readonly invocationId: string
    readonly taskId: string
    readonly task: PluginTaskSnapshotV1
    readonly filePath: string
    readonly delivery: DeliveryEnvelopeV1
    readonly metadata: ReadonlyPluginMetadata
    readonly signal: AbortSignal
  }

  export interface AfterCompleteContext extends PostHookContextBase {}

  export interface OnErrorContext extends PostHookContextBase {
    readonly error: ErrorDescriptorV1
  }

  export interface PluginMetadata {
    get<T extends JsonValue>(key: string): T | undefined
    has(key: string): boolean
    getAll(): Record<string, JsonValue>
    keys(): ReadonlyArray<string>
    set(key: string, value: JsonValue): void
    delete(key: string): void
  }
  export type ReadonlyPluginMetadata = Omit<PluginMetadata, 'set' | 'delete'>

  export const hooks: {
    beforeCreate(
      fn: (ctx: BeforeCreateHttpContext) => Promise<BeforeCreateHttpContext>
    ): void
    beforeFinalize(
      fn: (ctx: BeforeFinalizeContext) => Promise<BeforeFinalizeContext>
    ): void
    afterComplete(fn: (ctx: AfterCompleteContext) => Promise<void>): void
    onError(fn: (ctx: OnErrorContext) => Promise<void>): void
  }

  export const commands: {
    // biome-ignore lint/suspicious/noConfusingVoidType: void is intentional — handlers may return void
    register<TArgs extends JsonValue, TResult extends JsonValue | void>(
      id: string,
      handler: (args: TArgs) => Promise<TResult> | TResult
    ): { dispose(): void }
    // biome-ignore lint/suspicious/noConfusingVoidType: void is intentional — result may be void
    execute<TResult extends JsonValue | void = JsonValue | void>(
      id: string,
      args?: JsonValue
    ): Promise<TResult>
  }

  export const lifecycle: {
    readonly available: boolean
    onDeactivate(handler: () => Promise<void> | void): { dispose(): void }
    onActivate(handler: () => Promise<void> | void): { dispose(): void }
  }

  export const log: {
    trace(msg: string, fields?: Record<string, unknown>): void
    debug(msg: string, fields?: Record<string, unknown>): void
    info(msg: string, fields?: Record<string, unknown>): void
    warn(msg: string, fields?: Record<string, unknown>): void
    error(msg: string, fields?: Record<string, unknown>): void
    fatal(msg: string, fields?: Record<string, unknown>): void
  }

  export const i18n: {
    readonly language: string
    readonly dir: 'ltr' | 'rtl'
    t(key: string, params?: Record<string, unknown>): string
    on(event: 'change', handler: (lang: string) => void): () => void
  }

  export const config: {
    readonly available: boolean
    get<T extends JsonValue>(key: string): Promise<T | undefined>
    getRaw<T extends JsonValue>(key: string): Promise<T | undefined>
    getAll(): Promise<Record<string, JsonValue>>
    onChange(
      handler: (
        changes: Array<{
          key: string
          oldValue: JsonValue | undefined
          newValue: JsonValue | undefined
        }>
      ) => void
    ): () => void
  }

  export const app: {
    readonly available: true
    readonly version: string
    readonly platform: 'darwin' | 'win32' | 'linux'
    readonly runtime: 'electron' | 'server'
    readonly locale: string
    readonly arch: 'x64' | 'arm64'
  }

  export const crypto: {
    readonly available: true
    hash(
      algo: 'md5' | 'sha1' | 'sha256' | 'sha512',
      data: Uint8Array | string
    ): Promise<Uint8Array>
    hmac(
      algo: 'sha1' | 'sha256' | 'sha512',
      key: Uint8Array | string,
      data: Uint8Array | string
    ): Promise<Uint8Array>
    randomBytes(n: number): Uint8Array
    aes(opts: {
      mode: 'cbc' | 'gcm'
      op: 'encrypt' | 'decrypt'
      key: Uint8Array
      iv: Uint8Array
      aad?: Uint8Array
      data: Uint8Array
    }): Promise<Uint8Array>
  }

  export const http: HttpCapability
  export interface HttpCapability {
    readonly available: boolean
    request<R extends 'text' | 'json' | 'bytes'>(opts: {
      method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'HEAD' | 'PATCH'
      url: string
      headers?: ReadonlyArray<{ name: string; value: string }>
      body?: string | Uint8Array | { type: 'json'; data: JsonValue }
      responseType: R
      timeoutMs?: number
      maxBodyBytes?: number
      redirect?: 'follow' | 'manual' | 'error'
      cookies?: 'jar' | 'none'
      range?: { start: number; end: number }
      proxy?: string
      signal?: AbortSignal
    }): Promise<{
      status: number
      headers: ReadonlyArray<{ name: string; value: string }>
      body: R extends 'text'
        ? string
        : R extends 'json'
          ? JsonValue
          : Uint8Array
      finalUrl: string
      redirected: boolean
    }>
    get(
      url: string,
      opts?: Omit<
        Parameters<HttpCapability['request']>[0],
        'method' | 'url' | 'responseType'
      >
    ): ReturnType<HttpCapability['request']>
    post(
      url: string,
      body: Parameters<HttpCapability['request']>[0]['body'],
      opts?: Omit<
        Parameters<HttpCapability['request']>[0],
        'method' | 'url' | 'body' | 'responseType'
      >
    ): ReturnType<HttpCapability['request']>
  }

  export const fs: {
    readonly task: {
      readonly available: boolean
      stat(): Promise<{ size: number; mtime: number }>
      exists(): Promise<boolean>
      openReader(opts?: {
        offset?: number
        length?: number
        signal?: AbortSignal
      }): Promise<{
        read(maxChunkSize: number): Promise<Uint8Array | null>
        close(): Promise<void>
      }>
      computeHash(algo: 'sha1' | 'sha256' | 'sha512'): Promise<string>
      rename(newFilename: string): Promise<void>
    }
    readonly storage: {
      readonly available: boolean
      read(path: string): Promise<Uint8Array>
      write(
        path: string,
        data: Uint8Array | string,
        opts?: { overwrite?: boolean }
      ): Promise<void>
      delete(path: string): Promise<void>
      rename(
        oldPath: string,
        newPath: string,
        opts?: { overwrite?: boolean }
      ): Promise<void>
      exists(path: string): Promise<boolean>
      stat(path: string): Promise<{ size: number; mtime: number }>
      mkdir(path: string, opts?: { recursive?: boolean }): Promise<void>
    }
  }

  export const storage: {
    readonly available: boolean
    get<T extends JsonValue>(
      key: string
    ): Promise<{ value: T | undefined; version: number }>
    set(key: string, value: JsonValue): Promise<{ version: number }>
    compareAndSet<T extends JsonValue>(
      key: string,
      expectedVersion: number,
      nextValue: T
    ): Promise<{ value: T; version: number }>
    delete(key: string): Promise<void>
    keys(prefix?: string): Promise<string[]>
  }

  export const notify: {
    readonly available: boolean
    show(opts: {
      id?: string
      title: string
      body: string
      icon?: 'info' | 'success' | 'error'
      urgency?: 'low' | 'normal' | 'critical'
    }): Promise<void>
  }

  export const ffmpeg: {
    readonly available: boolean
    readonly version?: string
    probe(input: { path: string }): Promise<unknown>
    transcode(opts: unknown): {
      id: string
      result: Promise<unknown>
      progress: AsyncIterable<unknown>
      abort(): void
    }
    extractAudio(opts: unknown): {
      id: string
      result: Promise<unknown>
      progress: AsyncIterable<unknown>
      abort(): void
    }
    mergeStreams(opts: unknown): {
      id: string
      result: Promise<unknown>
      progress: AsyncIterable<unknown>
      abort(): void
    }
    generateThumbnail(opts: unknown): {
      id: string
      result: Promise<unknown>
      progress: AsyncIterable<unknown>
      abort(): void
    }
  }
}
