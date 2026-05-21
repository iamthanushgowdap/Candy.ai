import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { curateFeedbackDataset } from "./feedbackLoop";
import { getActiveModelId, registerNewModel } from "./modelRegistry";
import { runModelEvaluation, SuiteReport } from "./evaluator";
import {
  enqueueJob,
  getQueue,
  saveQueue,
  acquireTrainingLock,
  releaseTrainingLock,
  isTrainingLocked,
  reconcileQueue,
  TrainingJob
} from "./trainingQueue";

export interface AutoTrainReport {
  success: boolean;
  curationReport?: any;
  trainingTriggered: boolean;
  trainedVersion?: string;
  compiledOllamaModel?: boolean;
  evalReport?: SuiteReport;
  actionTaken: "none" | "rejected" | "deployed" | "error" | "queued";
  details: string[];
}

/**
 * Scans training/outputs to determine the next dynamic adapter version number.
 */
function getNextVersionName(): string {
  const outputsDir = path.join(process.cwd(), "training", "outputs");
  if (!fs.existsSync(outputsDir)) {
    fs.mkdirSync(outputsDir, { recursive: true });
  }

  const subdirs = fs.readdirSync(outputsDir).filter(f => {
    try {
      const fullPath = path.join(outputsDir, f);
      return f.startsWith("antgravity-v") && fs.statSync(fullPath).isDirectory();
    } catch {
      return false;
    }
  });

  if (subdirs.length === 0) {
    return "antgravity-v1";
  }

  const versions: number[] = [];
  for (const dir of subdirs) {
    const vStr = dir.replace("antgravity-v", "");
    const vNum = parseInt(vStr, 10);
    if (!isNaN(vNum)) {
      versions.push(vNum);
    }
  }

  const nextV = versions.length > 0 ? Math.max(...versions) + 1 : 1;
  return `antgravity-v${nextV}`;
}

/**
 * Promisified training child process execution with resume capability.
 */
async function runTrainingScript(smokeTest: boolean, resume: boolean, details: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    const args = ["training/train.py"];
    if (smokeTest) {
      args.push("--smoke-test");
    }
    if (resume) {
      args.push("--resume");
      details.push("Resuming fine-tuning from latest checkpoints");
      console.log(`[AutoTrainer] Resuming from checkpoint...`);
    }

    console.log(`[AutoTrainer] Spawning training script: python ${args.join(" ")}`);
    details.push(`Spawning training script: python ${args.join(" ")}`);

    const child = spawn("python", args, {
      cwd: process.cwd(),
      env: { ...process.env, PYTHONUNBUFFERED: "1", PYTHONIOENCODING: "utf-8" }
    });

    let logBuffer = "";

    child.stdout.on("data", (data) => {
      const chunk = data.toString();
      logBuffer += chunk;
      console.log(`[Train Output] ${chunk.trim()}`);
    });

    child.stderr.on("data", (data) => {
      const chunk = data.toString();
      console.error(`[Train Stderr] ${chunk.trim()}`);
    });

    child.on("close", (code) => {
      console.log(`[AutoTrainer] Training process exited with code ${code}`);
      details.push(`Training process exited with code ${code}`);

      if (code === 0) {
        resolve(true);
      } else {
        details.push(`Training script failed with exit code ${code}. Check logs for details.`);
        resolve(false);
      }
    });
  });
}

/**
 * Dynamic Ollama Modelfile Compiler and Model Creator (Phase 1 & Phase A fix)
 */
async function compileOllamaAdapterModel(versionName: string, details: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const outputsDir = path.join(process.cwd(), "training", "outputs");
      const versionDir = path.join(outputsDir, versionName);
      
      // Verify LoRA weights adapter files exist in output directory
      const configJsonPath = path.join(versionDir, "adapter_config.json");
      if (!fs.existsSync(configJsonPath)) {
        details.push(`Adapter configuration not found at expected path: ${configJsonPath}`);
        return resolve(false);
      }

      // Compile the dynamic Modelfile inside the version folder using ADAPTER .
      const modelfileContent = `FROM qwen2.5:0.5b
ADAPTER .

PARAMETER temperature 0.72
PARAMETER top_p 0.9
PARAMETER repeat_penalty 1.1
PARAMETER num_ctx 4096
PARAMETER num_predict 512
PARAMETER stop "<|im_end|>"
PARAMETER stop "<|im_start|>"

SYSTEM """
You are Antgravity, a premium conversational AI assistant built on a specialized fine-tuned intelligence layer.
You are direct, thoughtful, technically capable, and conversationally natural.
You maintain context across long conversations, recall prior details, and always deliver high-quality responses.
You excel at code generation, reasoning, creative writing, and deep technical analysis.
Never add unnecessary caveats or filler phrases. Be precise and genuinely helpful.
"""
`;

      const modelfilePath = path.join(versionDir, "Modelfile");
      fs.writeFileSync(modelfilePath, modelfileContent, "utf8");
      details.push(`Compiled Ollama Modelfile for ${versionName} at: ${modelfilePath}`);
      console.log(`[AutoTrainer] Modelfile compiled at: ${modelfilePath}`);

      // Call Ollama create inside the versionDir to prevent path resolution crashes
      console.log(`[AutoTrainer] Registering dynamic adapter model in Ollama: ${versionName}...`);
      const ocli = spawn("ollama", ["create", versionName, "-f", "Modelfile"], {
        cwd: versionDir
      });

      ocli.stdout.on("data", (data) => {
        console.log(`[Ollama Output] ${data.toString().trim()}`);
      });

      ocli.stderr.on("data", (data) => {
        console.log(`[Ollama Status] ${data.toString().trim()}`);
      });

      ocli.on("close", (code) => {
        if (code === 0) {
          details.push(`Ollama successfully created and registered model: "${versionName}"`);
          resolve(true);
        } else {
          details.push(`Ollama create exited with failure code ${code}`);
          resolve(false);
        }
      });
    } catch (e: any) {
      console.error("[AutoTrainer] Ollama compilation exception:", e);
      details.push(`Ollama compile exception: ${e.message || e}`);
      resolve(false);
    }
  });
}

/**
 * Autonomous Learning Loop Coordinator (Phase A integration)
 * Orchestrates queue checks, locks, feedback curation, auto-training, evaluation, and swapping.
 */
export async function runAutoTrainingCycle(options: {
  smokeTest?: boolean;
  forceTrain?: boolean;
  minSamples?: number;
  minQuality?: number;
} = {}): Promise<AutoTrainReport> {
  const report: AutoTrainReport = {
    success: false,
    trainingTriggered: false,
    actionTaken: "none",
    details: []
  };

  const smokeTest = options.smokeTest ?? false;
  const forceTrain = options.forceTrain ?? false;
  const minSamples = options.minSamples ?? 5; // Default threshold of 5 samples for fast feedback in development
  const minQuality = options.minQuality ?? 0.75; // Default quality threshold

  try {
    console.log(`[AutoTrainer] Reconciling queue state...`);
    reconcileQueue();

    // 1. Run feedback collection dataset curation to determine sample status
    console.log(`[AutoTrainer] Curating feedback dataset...`);
    const curation = await curateFeedbackDataset();
    report.curationReport = curation.report;
    report.details.push(`Curated ${curation.report.total_samples_deduplicated} unique feedback samples with avg quality: ${curation.report.average_quality_score}`);

    // Check if learning activation threshold is met
    const hasEnoughSamples = curation.report.total_samples_deduplicated >= minSamples;
    const isQualityHigh = curation.report.average_quality_score >= minQuality;
    const triggerAllowed = forceTrain || (hasEnoughSamples && isQualityHigh);

    if (!triggerAllowed) {
      report.details.push(`Training threshold not met (Samples: ${curation.report.total_samples_deduplicated}/${minSamples}, Quality: ${curation.report.average_quality_score}/${minQuality}). Skipping train cycle.`);
      report.success = true;
      return report;
    }

    // Determine next version string
    const version = getNextVersionName();
    report.trainedVersion = version;

    // Enqueue the training job
    const job = enqueueJob(version, {
      smokeTest,
      forceTrain,
      minSamples,
      minQuality,
      maxRetries: 3
    });

    report.details.push(`Job ${job.id} enqueued for version "${version}"`);

    // Verify if training lock is held by another process
    if (isTrainingLocked()) {
      console.log(`[AutoTrainer] Lock is currently held. Job ${job.id} queued successfully.`);
      report.details.push(`Another training job is currently running. Job ${job.id} has been safely queued.`);
      report.actionTaken = "queued";
      report.success = true;
      return report;
    }

    // Attempt to acquire training lock for this job
    if (!acquireTrainingLock(job.id)) {
      console.log(`[AutoTrainer] Failed to acquire lock. Job ${job.id} queued.`);
      report.details.push(`Failed to acquire execution lock. Job ${job.id} will execute in the next sweep.`);
      report.actionTaken = "queued";
      report.success = true;
      return report;
    }

    // Now start the training process for this job
    report.trainingTriggered = true;
    report.details.push(`Acquired lock. Starting training job ${job.id}...`);
    
    // Update job status to running in queue
    const queue = getQueue();
    const activeJob = queue.find(j => j.id === job.id);
    if (activeJob) {
      activeJob.status = "running";
      activeJob.startedAt = new Date().toISOString();
      activeJob.resumeFromCheckpoint = job.resumeFromCheckpoint;
    }
    saveQueue(queue);

    // 4. Run python PyTorch QLoRA training
    const resume = job.resumeFromCheckpoint ?? false;
    const trainSuccess = await runTrainingScript(smokeTest, resume, report.details);
    
    const finalQueue = getQueue();
    const finalJob = finalQueue.find(j => j.id === job.id);

    if (!trainSuccess) {
      if (finalJob) {
        finalJob.status = "failed";
        finalJob.completedAt = new Date().toISOString();
        finalJob.error = "Python training script returned error exit code";
        
        // Handle auto-retry within queue manager
        if (finalJob.retries < finalJob.maxRetries) {
          finalJob.retries += 1;
          finalJob.status = "pending";
          finalJob.resumeFromCheckpoint = true;
          report.details.push(`Job ${job.id} failed. Automatically queued for retry ${finalJob.retries}/${finalJob.maxRetries} with --resume enabled.`);
        }
      }
      saveQueue(finalQueue);
      releaseTrainingLock();

      report.actionTaken = "error";
      report.details.push("Training process encountered a critical error. Halting loop.");
      return report;
    }

    if (finalJob) {
      finalJob.status = "completed";
      finalJob.completedAt = new Date().toISOString();
    }
    saveQueue(finalQueue);

    // 5. Compile dynamic adapter and register in local Ollama instance
    const compileSuccess = await compileOllamaAdapterModel(version, report.details);
    if (!compileSuccess) {
      releaseTrainingLock();
      report.actionTaken = "error";
      report.details.push("Failed to compile dynamic adapter and register model in Ollama. Halting loop.");
      return report;
    }
    report.compiledOllamaModel = true;

    // 6. Side-by-Side Evaluation Gate (Phase 2 & Phase D)
    const oldActiveModel = getActiveModelId();
    report.details.push(`Triggering side-by-side evaluation gate: Old: "${oldActiveModel}" vs New: "${version}"`);
    console.log(`[AutoTrainer] Executing evaluation suite...`);

    const evalReport = await runModelEvaluation(oldActiveModel, version, "qwen2.5:0.5b");
    report.evalReport = evalReport;

    // Release the VRAM / lock now that execution completes
    releaseTrainingLock();

    if (!evalReport.success) {
      report.actionTaken = "error";
      report.details.push("Evaluation suite run failed. Active model remain unchanged.");
      return report;
    }

    // 7. Dynamic Swapping Gate Decision (Phase D)
    if (evalReport.gatePassed) {
      console.log(`[AutoTrainer] Evaluation gate PASSED! Deploying model: ${version}`);
      report.details.push(`Evaluation passed target! Hot-swapping active production model to: "${version}"`);

      registerNewModel(
        version,
        `Antgravity Custom ${version.toUpperCase()}`,
        version,
        {
          accuracy: evalReport.avgScoreNew,
          quality: evalReport.avgScoreNew,
          reasoning: evalReport.avgScoreNew,
          latency_ms: 600
        },
        "deployed" // Hot-swap triggers here
      );

      report.actionTaken = "deployed";
      report.success = true;
    } else {
      console.log(`[AutoTrainer] Evaluation gate REJECTED. New model did not show +5% improvement.`);
      report.details.push(`Evaluation gate rejected. New model score: ${evalReport.avgScoreNew.toFixed(2)}, Old score: ${evalReport.avgScoreOld.toFixed(2)}. Failed to meet the strict +5% improvement bar.`);

      registerNewModel(
        version,
        `Antgravity Custom ${version.toUpperCase()}`,
        version,
        {
          accuracy: evalReport.avgScoreNew,
          quality: evalReport.avgScoreNew,
          reasoning: evalReport.avgScoreNew,
          latency_ms: 600
        },
        "rejected" // Kept ready, but rejected from active deployment
      );

      report.actionTaken = "rejected";
      report.success = true;
    }

  } catch (err: any) {
    console.error("[AutoTrainer] Fatal exception in auto training coordinator:", err);
    report.details.push(`Fatal training error exception: ${err.message || err}`);
    report.actionTaken = "error";
    report.success = false;
    releaseTrainingLock();
  }

  return report;
}
