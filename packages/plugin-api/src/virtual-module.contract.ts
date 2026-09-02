import type {
  AfterCompleteContext,
  DeliveryEnvelopeV1,
  OnErrorContext,
} from 'motrix:plugin-api'

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <
    Value,
  >() => Value extends Right ? 1 : 2
    ? true
    : false

type Assert<Condition extends true> = Condition

type AfterCompleteHandler = Parameters<
  typeof import('motrix:plugin-api').hooks.afterComplete
>[0]
type OnErrorHandler = Parameters<
  typeof import('motrix:plugin-api').hooks.onError
>[0]

type _AfterCompleteContext = Assert<
  Equal<Parameters<AfterCompleteHandler>[0], AfterCompleteContext>
>
type _OnErrorContext = Assert<
  Equal<Parameters<OnErrorHandler>[0], OnErrorContext>
>
type _StableDeliveryId = Assert<Equal<DeliveryEnvelopeV1['id'], string>>
type _NoRetryAttemptLeak = Assert<
  Equal<'attempt' extends keyof DeliveryEnvelopeV1 ? true : false, false>
>
