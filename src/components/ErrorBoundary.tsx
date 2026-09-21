import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Alert, Box, Button, Code, Heading, Stack, Text } from '@chakra-ui/react';
import { isChunkLoadError } from './chunkError';

export type BoundaryVariant = 'page' | 'inline';

interface Props {
  children: ReactNode;
  /** `page`: full-screen fallback for the whole app. `inline`: compact alert in place of the failed section. */
  variant?: BoundaryVariant;
  /** Headline for the fallback. */
  title?: string;
  /** Replaces the default explanation, e.g. to point at what still works. */
  description?: string;
  /** When any of these change (e.g. the active tab), the boundary clears its error and re-renders its children. */
  resetKeys?: readonly unknown[];
  /** Hook for error reporting (Sentry etc.). Called after the error is logged. */
  onError?: (error: Error, info: ErrorInfo) => void;
}

interface State {
  error: Error | null;
}

const sameKeys = (a: readonly unknown[] = [], b: readonly unknown[] = []) =>
  a.length === b.length && a.every((v, i) => Object.is(v, b[i]));

/**
 * Catches render-time errors below it so one broken view doesn't blank the app.
 * (Error boundaries must be classes; they don't catch event-handler or async errors.)
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, info.componentStack);
    this.props.onError?.(error, info);
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && !sameKeys(prev.resetKeys, this.props.resetKeys)) {
      this.reset();
    }
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <ErrorFallback
        error={error}
        variant={this.props.variant ?? 'inline'}
        title={this.props.title}
        description={this.props.description}
        onRetry={this.reset}
      />
    );
  }
}

interface FallbackProps {
  error: Error;
  variant: BoundaryVariant;
  title?: string;
  description?: string;
  onRetry: () => void;
}

export function ErrorFallback({ error, variant, title, description, onRetry }: FallbackProps) {
  const stale = isChunkLoadError(error);
  const headline = stale ? 'A new version is available' : (title ?? 'Something went wrong');
  const detail = stale
    ? 'Part of the app couldn’t be downloaded, most likely because it was just updated. Reload to get the latest version.'
    : (description ??
      'An unexpected error stopped this part of the page from displaying. You can try again, or reload the page.');
  const action = stale ? (
    <Button size="sm" onClick={() => window.location.reload()}>
      Reload page
    </Button>
  ) : (
    <>
      <Button size="sm" onClick={onRetry}>
        Try again
      </Button>
      {variant === 'page' && (
        <Button size="sm" variant="outline" onClick={() => window.location.reload()}>
          Reload page
        </Button>
      )}
    </>
  );
  // Raw error text can leak internals and means little to users; show it in development only.
  const technical = import.meta.env.DEV ? (
    <Code display="block" whiteSpace="pre-wrap" p="2" fontSize="xs">
      {error.message}
    </Code>
  ) : null;

  if (variant === 'inline') {
    return (
      <Alert.Root status={stale ? 'info' : 'error'} role="alert" alignItems="flex-start">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>{headline}</Alert.Title>
          <Alert.Description>
            <Stack gap="2">
              <Text>{detail}</Text>
              {technical}
              <Box display="flex" gap="2">
                {action}
              </Box>
            </Stack>
          </Alert.Description>
        </Alert.Content>
      </Alert.Root>
    );
  }

  return (
    <Box role="alert" minH="100dvh" display="grid" placeItems="center" p="6" bg="bg" color="fg">
      <Stack gap="4" maxW="lg">
        <Heading as="h1" size="lg">
          {headline}
        </Heading>
        <Text>{detail}</Text>
        {technical}
        <Box display="flex" gap="2" flexWrap="wrap">
          {action}
        </Box>
      </Stack>
    </Box>
  );
}
