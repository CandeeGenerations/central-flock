export const nurseryKeys = {
  workers: ['nursery-workers'] as const,
  serviceConfig: ['nursery-service-config'] as const,
  settings: ['nursery-settings'] as const,
  schedules: ['nursery-schedules'] as const,
  schedule: (id: number) => ['nursery-schedule', id] as const,
}
