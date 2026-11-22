// `/_dev/sdd/SPEC-3001` — route of the demonstration page (SPEC-3001 EF-2).
// It only wires the configuration, the clock, the platform and the health query into the
// presentational page (`src/features/sdd/SddSpecPage`), which is what the Jest tests render.
import { useQuery } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { checkApiHealth, UNREACHABLE_CODE, type HealthCheck } from '../../../src/api/health';
import { configResult } from '../../../src/config';
import { SddSpecPage, type HealthDisplay } from '../../../src/features/sdd/SddSpecPage';
import { clock, formatClockTime } from '../../../src/lib/clock';

const CLOCK_REFRESH_MS = 30_000;

function appVersion(): string {
  const version = Constants.expoConfig?.version;
  return typeof version === 'string' && version !== '' ? version : '0.0.0';
}

function runtimeVersion(): string {
  const runtime = Constants.expoConfig?.runtimeVersion;
  return typeof runtime === 'string' && runtime !== '' ? runtime : 'embedded';
}

function platformLabel(): string {
  const name = Platform.OS === 'android' ? 'Android' : Platform.OS === 'ios' ? 'iOS' : Platform.OS;
  return `${name} ${String(Platform.Version)}`;
}

export default function Spec3001Route() {
  const config = configResult.ok ? configResult.config : null;
  const apiUrl = config?.apiUrl ?? '';

  const [clockLabel, setClockLabel] = useState(() => formatClockTime(clock.now()));

  useEffect(() => {
    const timer = setInterval(() => {
      setClockLabel(formatClockTime(clock.now()));
    }, CLOCK_REFRESH_MS);
    return () => {
      clearInterval(timer);
    };
  }, []);

  const health = useQuery<HealthCheck>({
    queryKey: ['sdd', 'health', apiUrl],
    queryFn: () => checkApiHealth(apiUrl),
    enabled: apiUrl !== '',
    staleTime: 30_000,
    retry: 0,
  });

  const display: HealthDisplay =
    health.data ??
    (health.isPending ? { status: 'checking' } : { status: 'unreachable', code: UNREACHABLE_CODE });

  return (
    <SddSpecPage
      appVersion={appVersion()}
      runtimeVersion={runtimeVersion()}
      apiUrl={apiUrl}
      clockLabel={clockLabel}
      platform={platformLabel()}
      health={display}
    />
  );
}
