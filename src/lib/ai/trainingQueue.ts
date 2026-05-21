import fs from "fs";
import path from "path";

export interface TrainingJob {
  id: string;
  versionName: string;
  status: "pending" | "running" | "completed" | "failed";
  smokeTest: boolean;
  forceTrain: boolean;
  minSamples?: number;
  minQuality?: number;
  retries: number;
  maxRetries: number;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  resumeFromCheckpoint?: boolean;
}

const DATASETS_DIR = path.join(process.cwd(), "training", "datasets");
const QUEUE_FILE = path.join(DATASETS_DIR, "queue.json");
const LOCK_FILE = path.join(process.cwd(), "training", "training.lock");

/**
 * Ensures that the training datasets directory exists.
 */
function ensureDirectories() {
  const trainingDir = path.join(process.cwd(), "training");
  if (!fs.existsSync(trainingDir)) {
    fs.mkdirSync(trainingDir, { recursive: true });
  }
  if (!fs.existsSync(DATASETS_DIR)) {
    fs.mkdirSync(DATASETS_DIR, { recursive: true });
  }
}

/**
 * Loads the training job queue from disk.
 */
export function getQueue(): TrainingJob[] {
  ensureDirectories();
  try {
    if (fs.existsSync(QUEUE_FILE)) {
      const data = fs.readFileSync(QUEUE_FILE, "utf8");
      return JSON.parse(data) as TrainingJob[];
    }
  } catch (e) {
    console.error("[TrainingQueue] Failed to read queue.json:", e);
  }
  return [];
}

/**
 * Saves the training job queue to disk.
 */
export function saveQueue(queue: TrainingJob[]): void {
  ensureDirectories();
  try {
    fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2), "utf8");
  } catch (e) {
    console.error("[TrainingQueue] Failed to write queue.json:", e);
  }
}

/**
 * Enqueues a new training job.
 */
export function enqueueJob(
  versionName: string,
  options: {
    smokeTest?: boolean;
    forceTrain?: boolean;
    minSamples?: number;
    minQuality?: number;
    maxRetries?: number;
  } = {}
): TrainingJob {
  const queue = getQueue();
  
  // Check if there's already a pending or running job for this version to avoid duplicates
  const existingJob = queue.find(
    (j) => j.versionName === versionName && (j.status === "pending" || j.status === "running")
  );
  if (existingJob) {
    return existingJob;
  }

  const newJob: TrainingJob = {
    id: `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    versionName,
    status: "pending",
    smokeTest: options.smokeTest ?? false,
    forceTrain: options.forceTrain ?? false,
    minSamples: options.minSamples,
    minQuality: options.minQuality,
    retries: 0,
    maxRetries: options.maxRetries ?? 3,
    createdAt: new Date().toISOString(),
    resumeFromCheckpoint: false,
  };

  queue.push(newJob);
  saveQueue(queue);
  console.log(`[TrainingQueue] Enqueued job ${newJob.id} for version ${versionName}`);
  return newJob;
}

/**
 * Attempts to acquire the training lock.
 * Returns true if lock was acquired, false if already locked.
 */
export function acquireTrainingLock(jobId: string): boolean {
  ensureDirectories();
  if (fs.existsSync(LOCK_FILE)) {
    try {
      const lockData = JSON.parse(fs.readFileSync(LOCK_FILE, "utf8"));
      // Verify if the process holding the lock is still running
      if (lockData.pid) {
        try {
          process.kill(lockData.pid, 0); // throws if process is dead
          console.warn(`[TrainingQueue] Cannot acquire lock. Job ${lockData.jobId} is currently running on PID ${lockData.pid}.`);
          return false; // Still running
        } catch (err: any) {
          if (err.code === "ESRCH") {
            console.warn(`[TrainingQueue] Found stale lock file for PID ${lockData.pid}. Overwriting lock.`);
          } else {
            // Permission error or other error means the process exists
            return false;
          }
        }
      }
    } catch (e) {
      console.error("[TrainingQueue] Error reading stale lock file, overwriting:", e);
    }
  }

  try {
    const lockPayload = {
      jobId,
      pid: process.pid,
      acquiredAt: new Date().toISOString(),
    };
    fs.writeFileSync(LOCK_FILE, JSON.stringify(lockPayload, null, 2), "utf8");
    console.log(`[TrainingQueue] Acquired training lock for job ${jobId} (PID: ${process.pid})`);
    return true;
  } catch (e) {
    console.error("[TrainingQueue] Failed to write lock file:", e);
    return false;
  }
}

/**
 * Releases the training lock.
 */
export function releaseTrainingLock(): void {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      fs.unlinkSync(LOCK_FILE);
      console.log("[TrainingQueue] Released training lock.");
    }
  } catch (e) {
    console.error("[TrainingQueue] Failed to release training lock:", e);
  }
}

/**
 * Checks if a training job is currently active or locked.
 */
export function isTrainingLocked(): boolean {
  if (!fs.existsSync(LOCK_FILE)) {
    return false;
  }
  try {
    const lockData = JSON.parse(fs.readFileSync(LOCK_FILE, "utf8"));
    if (lockData.pid) {
      try {
        process.kill(lockData.pid, 0);
        return true; // Lock is held by a live process
      } catch (err: any) {
        if (err.code === "ESRCH") {
          return false; // Process is dead, stale lock
        }
        return true; // Live process but no permission
      }
    }
  } catch (e) {
    // Bad JSON or lock file error
  }
  return false;
}

/**
 * Reconciles the queue state, recovering from unexpected server or process crashes.
 * Marks dead "running" jobs as "failed" and prepares retry/resume policies.
 */
export function reconcileQueue(): void {
  const queue = getQueue();
  let modified = false;

  for (const job of queue) {
    if (job.status === "running") {
      let isAlive = false;
      
      // Check if lock file actually matches this job and is alive
      if (fs.existsSync(LOCK_FILE)) {
        try {
          const lockData = JSON.parse(fs.readFileSync(LOCK_FILE, "utf8"));
          if (lockData.jobId === job.id && lockData.pid) {
            try {
              process.kill(lockData.pid, 0);
              isAlive = true;
            } catch (err: any) {
              // Process is dead
            }
          }
        } catch (e) {
          // Stale/corrupt lock file
        }
      }

      if (!isAlive) {
        console.warn(`[TrainingQueue] Crash recovery triggered: running job ${job.id} detected dead. Recovering...`);
        job.status = "failed";
        job.error = "Process died unexpectedly (crash recovery triggered)";
        job.completedAt = new Date().toISOString();
        
        // Handle retries
        if (job.retries < job.maxRetries) {
          job.retries += 1;
          job.status = "pending"; // Put back in queue
          job.resumeFromCheckpoint = true; // Enable resume checkpoint flag for next run!
          console.log(`[TrainingQueue] Job ${job.id} marked pending for retry ${job.retries}/${job.maxRetries} with --resume enabled.`);
        } else {
          console.error(`[TrainingQueue] Job ${job.id} has exceeded max retries (${job.maxRetries}). Halting retry.`);
        }
        
        modified = true;
      }
    }
  }

  if (modified) {
    saveQueue(queue);
    // Release lock since the process is confirmed dead
    if (!isTrainingLocked()) {
      releaseTrainingLock();
    }
  }
}
