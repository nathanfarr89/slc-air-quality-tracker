import type { ReactNode } from 'react';
import { Alert, Box, Button, Skeleton, VStack } from '@chakra-ui/react';
import { formatMtDateTime } from '../lib/format';

interface Props {
  isLoading: boolean;
  error: unknown;
  isEmpty: boolean;
  /** Timestamp (ms) of the newest data point; drives the stale banner. */
  latest?: number;
  isStale?: boolean;
  onRetry: () => void;
  /** Height reserved for the skeleton so layout doesn't jump. */
  minH?: string | number;
  emptyMessage?: string;
  children: ReactNode;
}

const message = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.');

/**
 * One place for the four non-happy states every view needs:
 * loading, error, empty and stale (plus "refresh failed, showing cached data").
 */
export function DataState({
  isLoading,
  error,
  isEmpty,
  latest,
  isStale,
  onRetry,
  minH = '240px',
  emptyMessage = 'No readings are available for this selection.',
  children,
}: Props) {
  if (isLoading) {
    return (
      <Box role="status" aria-live="polite" aria-busy="true" minH={minH}>
        <Skeleton height="100%" minH={minH} borderRadius="md" />
        <Box srOnly>Loading air quality data…</Box>
      </Box>
    );
  }

  if (error && isEmpty) {
    return (
      <Alert.Root status="error" role="alert" alignItems="center">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>Couldn’t load air quality data</Alert.Title>
          <Alert.Description>{message(error)}</Alert.Description>
        </Alert.Content>
        <Button size="sm" variant="outline" onClick={onRetry}>
          Retry
        </Button>
      </Alert.Root>
    );
  }

  if (isEmpty) {
    return (
      <Alert.Root status="info" role="status">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>No data</Alert.Title>
          <Alert.Description>{emptyMessage}</Alert.Description>
        </Alert.Content>
      </Alert.Root>
    );
  }

  return (
    <VStack align="stretch" gap="3">
      {error ? (
        <Alert.Root status="warning" role="status" alignItems="center">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Showing the last data we have</Alert.Title>
            <Alert.Description>Refresh failed: {message(error)}</Alert.Description>
          </Alert.Content>
          <Button size="sm" variant="outline" onClick={onRetry}>
            Retry
          </Button>
        </Alert.Root>
      ) : (
        isStale &&
        latest !== undefined && (
          <Alert.Root status="warning" role="status">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>Data may be out of date</Alert.Title>
              <Alert.Description>
                The newest reading is from {formatMtDateTime(latest)}.
              </Alert.Description>
            </Alert.Content>
          </Alert.Root>
        )
      )}
      {children}
    </VStack>
  );
}
