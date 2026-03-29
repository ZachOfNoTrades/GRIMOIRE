import { randomUUID } from "crypto";

export type JobStatus = "pending" | "completed" | "failed";

export interface GenerationJob {
  id: string;
  userId: string;
  endpoint: string;
  status: JobStatus;
  result?: unknown;
  error?: string;
  createdAt: number;
  completedAt?: number;
}

// Use globalThis to ensure the Map is shared across all Next.js route bundles
const globalStore = globalThis as typeof globalThis & {
  __generationJobs?: Map<string, GenerationJob>;
  __generationJobsCleanup?: ReturnType<typeof setInterval>;
};

if (!globalStore.__generationJobs) {
  globalStore.__generationJobs = new Map<string, GenerationJob>();
}
const jobs = globalStore.__generationJobs;

// Cleanup jobs older than 10 minutes every 5 minutes
const JOB_TTL_MS = 10 * 60 * 1000;
if (!globalStore.__generationJobsCleanup) {
  globalStore.__generationJobsCleanup = setInterval(() => {
    const now = Date.now();
    for (const [id, job] of jobs) {
      if (now - job.createdAt > JOB_TTL_MS) {
        jobs.delete(id);
      }
    }
  }, 5 * 60 * 1000);
}

export function createJob(userId: string, endpoint: string): GenerationJob {
  const job: GenerationJob = {
    id: randomUUID(),
    userId,
    endpoint,
    status: "pending",
    createdAt: Date.now(),
  };
  jobs.set(job.id, job);
  return job;
}

export function getJob(jobId: string, userId: string): GenerationJob | null {
  const job = jobs.get(jobId);
  if (!job || job.userId !== userId) return null;
  return job;
}

export function completeJob(jobId: string, result: unknown): void {
  const job = jobs.get(jobId);
  if (job) {
    job.status = "completed";
    job.result = result;
    job.completedAt = Date.now();
  }
}

export function failJob(jobId: string, error: string): void {
  const job = jobs.get(jobId);
  if (job) {
    job.status = "failed";
    job.error = error;
    job.completedAt = Date.now();
  }
}
