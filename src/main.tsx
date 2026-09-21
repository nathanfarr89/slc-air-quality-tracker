import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ChakraProvider } from '@chakra-ui/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ColorModeProvider } from './theme/colorMode';
import { system } from './theme/system';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ChakraProvider value={system}>
        {/* Last line of defense: keeps a crash from leaving a blank page. */}
        <ErrorBoundary variant="page">
          <ColorModeProvider>
            <App />
          </ColorModeProvider>
        </ErrorBoundary>
      </ChakraProvider>
    </QueryClientProvider>
  </StrictMode>,
);
