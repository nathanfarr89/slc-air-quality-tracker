import { lazy, Suspense, useState } from 'react';
import {
  Badge,
  Box,
  Container,
  Flex,
  Heading,
  HStack,
  IconButton,
  Link,
  Skeleton,
  Tabs,
  Text,
} from '@chakra-ui/react';
import { provider } from './api';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useColorMode } from './theme/colorMode';
import AboutView from './features/about/AboutView';
import OverviewView from './features/overview/OverviewView';
import TrendsView from './features/trends/TrendsView';

// Plotly is heavy: keep it out of the initial bundle.
const HistoryView = lazy(() => import('./features/history/HistoryView'));

const VIEWS = ['overview', 'trends', 'history', 'about'] as const;
type View = (typeof VIEWS)[number];
const LABELS: Record<View, string> = {
  overview: 'Overview',
  trends: 'Trends',
  history: 'History',
  about: 'About / Data',
};

const fromHash = (): View => {
  const h = window.location.hash.slice(1);
  return (VIEWS as readonly string[]).includes(h) ? (h as View) : 'overview';
};

function ColorModeButton() {
  const { mode, toggle } = useColorMode();
  const next = mode === 'dark' ? 'light' : 'dark';
  return (
    <IconButton variant="outline" size="sm" onClick={toggle} aria-label={`Switch to ${next} mode`}>
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        aria-hidden="true"
      >
        {mode === 'dark' ? (
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </>
        ) : (
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        )}
      </svg>
    </IconButton>
  );
}

export default function App() {
  const [view, setView] = useState<View>(fromHash);
  const change = (v: View) => {
    setView(v);
    window.history.replaceState(null, '', `#${v}`);
  };

  return (
    <Box minH="100dvh">
      <Link
        href="#main"
        position="absolute"
        left="2"
        top="-100px"
        zIndex="popover"
        bg="bg.panel"
        px="3"
        py="2"
        rounded="md"
        _focus={{ top: '2' }}
      >
        Skip to content
      </Link>

      <Box as="header" borderBottomWidth="1px" bg="bg.panel">
        <Container maxW="8xl" py="3">
          <Flex align="center" justify="space-between" gap="3" wrap="wrap">
            <Box>
              <Heading as="h1" size={{ base: 'md', md: 'lg' }}>
                Salt Lake Valley Air Quality
              </Heading>
              <Text color="fg.muted" fontSize="sm">
                PM2.5 and winter inversion tracker
              </Text>
            </Box>
            <HStack>
              {provider.id === 'mock' && <Badge colorPalette="orange">Demo data</Badge>}
              <ColorModeButton />
            </HStack>
          </Flex>
        </Container>
      </Box>

      <Container as="main" id="main" tabIndex={-1} maxW="8xl" py="4" outline="none">
        <Tabs.Root value={view} onValueChange={(e) => change(e.value as View)} variant="line">
          <Tabs.List overflowX="auto" mb="4">
            {VIEWS.map((v) => (
              <Tabs.Trigger key={v} value={v} flexShrink={0}>
                {LABELS[v]}
              </Tabs.Trigger>
            ))}
          </Tabs.List>
          {/* Only the active panel is rendered, so inactive views don't poll or hold charts. */}
          <Tabs.Content value={view} p="0">
            {/* Resets when the tab changes, so a crashed view never traps the user. */}
            <ErrorBoundary resetKeys={[view]} title="This view couldn’t be displayed">
              <Suspense fallback={<Skeleton h="600px" rounded="md" aria-label="Loading view" />}>
                {view === 'overview' && <OverviewView />}
                {view === 'trends' && <TrendsView />}
                {view === 'history' && <HistoryView />}
                {view === 'about' && <AboutView />}
              </Suspense>
            </ErrorBoundary>
          </Tabs.Content>
        </Tabs.Root>
      </Container>
    </Box>
  );
}
