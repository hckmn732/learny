// Hosting regions declared by the application (BR-PLA-04: data hosted in the EU).
export const EU_REGIONS = [
  'fra1',
  'cdg1',
  'arn1',
  'dub1',
  'eu-central-1',
  'eu-west-1',
  'eu-west-2',
  'eu-west-3',
  'eu-north-1',
  'eu-south-1',
  'eu',
] as const;

export const HOSTING_REGIONS = {
  vercel: 'fra1',
  supabase: 'eu-central-1',
  inngest: 'eu',
} as const;

export type HostingService = keyof typeof HOSTING_REGIONS;

export function isEuRegion(region: string): boolean {
  return (EU_REGIONS as readonly string[]).includes(region);
}
