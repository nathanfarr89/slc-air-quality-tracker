import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChakraProvider } from '@chakra-ui/react';
import { system } from '../theme/system';
import { DataState } from './DataState';

const base = { isLoading: false, error: null, isEmpty: false, onRetry: () => {} };
const ui = (props: Partial<Parameters<typeof DataState>[0]>) =>
  render(
    <ChakraProvider value={system}>
      <DataState {...base} {...props}>
        <p>content</p>
      </DataState>
    </ChakraProvider>,
  );

describe('DataState', () => {
  it('announces loading and hides content', () => {
    ui({ isLoading: true });
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByText('content')).not.toBeInTheDocument();
  });

  it('shows an error with a working retry when there is no data', async () => {
    const onRetry = vi.fn();
    ui({ error: new Error('boom'), isEmpty: true, onRetry });
    expect(screen.getByRole('alert')).toHaveTextContent('boom');
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('shows an empty state', () => {
    ui({ isEmpty: true });
    expect(screen.getByText('No data')).toBeInTheDocument();
  });

  it('warns when data is stale but still renders it', () => {
    ui({ isStale: true, latest: Date.parse('2026-01-01T00:00:00Z') });
    expect(screen.getByText('Data may be out of date')).toBeInTheDocument();
    expect(screen.getByText('content')).toBeInTheDocument();
  });

  it('keeps cached data visible when a refresh fails', () => {
    ui({ error: new Error('offline') });
    expect(screen.getByText('Showing the last data we have')).toBeInTheDocument();
    expect(screen.getByText('content')).toBeInTheDocument();
  });
});
