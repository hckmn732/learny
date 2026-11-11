// Types of the versioned mockup-scenario table (scenarios.mjs, SPEC-005 EF-2).
import type { Scenario, Viewport } from './manifest.mjs';

export const SCENARIOS: Scenario[];
export const VIEWPORTS: Record<'desktop' | 'mobile', Viewport>;
