import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChakraProvider } from '@chakra-ui/react';
import { system } from '../theme/system';
import { isChunkLoadError } from './chunkError';
import { ErrorBoundary } from './ErrorBoundary';

function Bomb({ explode, message = 'kaboom' }: { explode: boolean; message?: string }) {
  if (explode) throw new Error(message);
  return <p>all good</p>;
}

const wrap = (ui: React.ReactElement) => <ChakraProvider value={system}>{ui}</ChakraProvider>;

// React logs caught errors and jsdom reports them as uncaught; keep test output readable.
const swallow = (e: ErrorEvent) => e.preventDefault();
beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  window.addEventListener('error', swallow);
});
afterEach(() => {
  window.removeEventListener('error', swallow);
  vi.restoreAllMocks();
});

describe('ErrorBoundary', () => {
  it('renders children when nothing throws', () => {
    render(
      wrap(
        <ErrorBoundary>
          <Bomb explode={false} />
        </ErrorBoundary>,
      ),
    );
    expect(screen.getByText('all good')).toBeInTheDocument();
  });

  it('shows an accessible fallback instead of crashing, and leaves siblings alone', () => {
    render(
      wrap(
        <>
          <p>sibling</p>
          <ErrorBoundary title="This view couldn’t be displayed">
            <Bomb explode />
          </ErrorBoundary>
        </>,
      ),
    );
    expect(screen.getByRole('alert')).toHaveTextContent('This view couldn’t be displayed');
    expect(screen.getByText('sibling')).toBeInTheDocument();
    expect(screen.queryByText('all good')).not.toBeInTheDocument();
  });

  it('lets the user try again once the cause is gone', async () => {
    let explode = true;
    const Flaky = () => <Bomb explode={explode} />;
    render(
      wrap(
        <ErrorBoundary>
          <Flaky />
        </ErrorBoundary>,
      ),
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    explode = false;
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.getByText('all good')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows the fallback again if the retry fails too', async () => {
    render(
      wrap(
        <ErrorBoundary>
          <Bomb explode />
        </ErrorBoundary>,
      ),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('resets automatically when resetKeys change (e.g. switching tabs)', () => {
    const tree = (view: string) =>
      wrap(
        <ErrorBoundary resetKeys={[view]}>
          <Bomb explode={view === 'trends'} />
        </ErrorBoundary>,
      );
    const { rerender } = render(tree('trends'));
    expect(screen.getByRole('alert')).toBeInTheDocument();
    rerender(tree('overview'));
    expect(screen.getByText('all good')).toBeInTheDocument();
  });

  it('reports the error through onError', () => {
    const onError = vi.fn();
    render(
      wrap(
        <ErrorBoundary onError={onError}>
          <Bomb explode message="reported" />
        </ErrorBoundary>,
      ),
    );
    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0]?.[0]).toMatchObject({ message: 'reported' });
  });

  it('uses a custom description to say what still works', () => {
    render(
      wrap(
        <ErrorBoundary description="The table below still works.">
          <Bomb explode />
        </ErrorBoundary>,
      ),
    );
    expect(screen.getByText('The table below still works.')).toBeInTheDocument();
  });

  it('asks for a reload, not a retry, when a lazy chunk fails to load', () => {
    render(
      wrap(
        <ErrorBoundary>
          <Bomb explode message="Failed to fetch dynamically imported module: /assets/History.js" />
        </ErrorBoundary>,
      ),
    );
    expect(screen.getByText('A new version is available')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload page' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });

  it('renders a full-page heading for the page variant', () => {
    render(
      wrap(
        <ErrorBoundary variant="page">
          <Bomb explode />
        </ErrorBoundary>,
      ),
    );
    expect(
      screen.getByRole('heading', { level: 1, name: 'Something went wrong' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload page' })).toBeInTheDocument();
  });
});

describe('isChunkLoadError', () => {
  it.each([
    ['Failed to fetch dynamically imported module: x', true],
    ['Importing a module script failed.', true],
    ['error loading dynamically imported module', true],
    ['Cannot read properties of undefined', false],
  ])('%s → %s', (message, expected) => {
    expect(isChunkLoadError(new Error(message))).toBe(expected);
  });
});
