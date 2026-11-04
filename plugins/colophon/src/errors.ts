/**
 * The HTTP status behind a failed request, when there was one.
 *
 * Read structurally rather than with `instanceof ResponseError`: the error
 * crosses a promise boundary and may come from a test stub or a different copy
 * of `@backstage/errors`, where `instanceof` quietly answers false and every
 * 404 would be presented as a server failure.
 */
export function httpStatus(error: unknown): number | undefined {
  const status = (error as { response?: { status?: unknown } } | undefined)
    ?.response?.status;
  return typeof status === 'number' ? status : undefined;
}
