import type { ServiceType } from './applescript.js';

export interface SendJob {
  id: string;
  messageId: number;
  serviceType: ServiceType;
  batchSize: number;
  batchDelayMs: number;
  status: 'pending' | 'processing' | 'completed' | 'cancelled';
  cancelled: boolean;
}

const activeJobs = new Map<number, SendJob>();
let jobCounter = 0;

export function createJob(
  messageId: number,
  serviceType: ServiceType,
  batchSize: number,
  batchDelayMs: number
): SendJob {
  const job: SendJob = {
    id: `job_${++jobCounter}`,
    messageId,
    serviceType,
    batchSize,
    batchDelayMs,
    status: 'pending',
    cancelled: false,
  };
  activeJobs.set(messageId, job);
  return job;
}

export function getJob(messageId: number): SendJob | undefined {
  return activeJobs.get(messageId);
}

export function cancelJob(messageId: number): void {
  const job = activeJobs.get(messageId);
  if (job) {
    job.cancelled = true;
    job.status = 'cancelled';
  }
}
