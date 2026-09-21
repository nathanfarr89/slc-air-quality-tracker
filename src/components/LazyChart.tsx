import { lazy, Suspense, type ComponentProps } from 'react';
import { Skeleton } from '@chakra-ui/react';
import type ReactApexChart from 'react-apexcharts';

// ApexCharts is ~500 kB unminified-equivalent JS. Loading it lazily keeps it out of the entry bundle,
// so the app shell and KPI numbers can paint (and become interactive) before any chart code is parsed.
const Chart = lazy(() => import('react-apexcharts'));

type Props = ComponentProps<typeof ReactApexChart>;

/** react-apexcharts loaded on demand, with a same-height skeleton so nothing shifts when it arrives. */
export function ApexChart(props: Props) {
  return (
    <Suspense fallback={<Skeleton height={props.height ?? 200} width="100%" rounded="md" />}>
      <Chart {...props} />
    </Suspense>
  );
}
