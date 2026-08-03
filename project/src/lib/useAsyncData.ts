import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, isApiError } from './api';

export interface AsyncDataResult<T> {
  status: 'idle' | 'loading' | 'success' | 'error';
  data: T;
  error: ApiError;
  refetch: () => void;
}

interface UseAsyncDataOptions {
  deps: ReadonlyArray<unknown>;
  enabled?: boolean;
}

/**
 * Async data hook with abort, skeleton loading, error states, and retry.
 * Separates server state from transient UI state.
 *
 * Always check `status` before accessing `data` or `error`:
 *   if (result.status === 'error') return <ErrorState error={result.error} />
 *   if (result.status === 'success') { const data = result.data; ... }
 */
export function useAsyncData<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  opts: UseAsyncDataOptions,
): AsyncDataResult<T> {
  const [state, setState] = useState<{
    status: 'idle' | 'loading' | 'success' | 'error';
    data: T;
    error: ApiError;
  }>({ status: 'loading', data: undefined as T, error: undefined as unknown as ApiError });
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const enabled = opts.enabled ?? true;
  const [refetchKey, setRefetchKey] = useState(0);

  const refetch = useCallback(() => setRefetchKey((k) => k + 1), []);

  useEffect(() => {
    if (!enabled) {
      setState({ status: 'idle', data: undefined as T, error: undefined as unknown as ApiError });
      return;
    }
    const controller = new AbortController();
    setState({ status: 'loading', data: undefined as T, error: undefined as unknown as ApiError });
    fetcherRef
      .current(controller.signal)
      .then((data: T) => {
        if (!controller.signal.aborted) {
          setState({ status: 'success', data, error: undefined as unknown as ApiError });
        }
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        if (isApiError(err)) {
          setState({ status: 'error', data: undefined as T, error: err });
        } else {
          setState({
            status: 'error',
            data: undefined as T,
            error: new ApiError(0, {
              code: 'NETWORK_ERROR',
              message: 'An unexpected error occurred.',
              requestId: 'n/a',
              retryable: true,
            }),
          });
        }
      });
    return () => controller.abort();
  }, [...opts.deps, refetchKey, enabled]);

  return { ...state, refetch };
}
