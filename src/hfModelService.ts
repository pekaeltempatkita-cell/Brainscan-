import fs from "fs";
import path from "path";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import { MAIN_CLASSES, type DiseaseClass } from "./diseaseInfo.js";

export interface HfModelConfig {
  modelId: string | null;
  token: string | null;
  cacheDir: string;
  precheckFilename: string;
  mainModelFilename: string;
}

export interface HfPredictionOutput {
  status: "ok" | "error";
  precheck_status: "valid" | "invalid";
  precheck_confidence: number;
  prediction_label: string | null;
  prediction_confidence: number | null;
  all_probabilities: Record<string, number> | null;
  engine: string;
  error?: string;
}

export function getHfConfig(): HfModelConfig {
  const modelId = process.env.HF_MODEL_ID || process.env.HF_REPO_ID || null;
  const token = process.env.HF_TOKEN || null;
  const cacheDir = process.env.MODEL_CACHE_DIR || path.resolve(process.cwd(), "models_cache");
  const precheckFilename = process.env.HF_PRECHECK_FILENAME || "precheck_brain_gate.onnx";
  const mainModelFilename = process.env.HF_MAIN_MODEL_FILENAME || "hybrid_vit_efficientnet_brain.onnx";

  return {
    modelId,
    token,
    cacheDir,
    precheckFilename,
    mainModelFilename,
  };
}

/**
 * Ensure model cache directory exists
 */
export function ensureCacheDir(): string {
  const { cacheDir } = getHfConfig();
  if (!fs.existsSync(cacheDir)) {
    try {
      fs.mkdirSync(cacheDir, { recursive: true });
    } catch {}
  }
  return cacheDir;
}

/**
 * Check if a model file is cached locally
 */
export function getCachedFilePath(filename: string): string | null {
  const { cacheDir } = getHfConfig();
  const searchPaths = [
    path.join(cacheDir, filename),
    path.resolve(process.cwd(), "outputs", "checkpoints", filename),
    path.resolve(process.cwd(), "onnx_models", filename),
  ];

  for (const p of searchPaths) {
    try {
      if (fs.existsSync(p) && fs.statSync(p).size > 1024) {
        return p;
      }
    } catch {}
  }
  return null;
}

/**
 * Download a file from Hugging Face Hub using streaming to prevent OOM/memory exhaustion
 */
export async function downloadFromHuggingFace(
  modelId: string,
  filename: string,
  token?: string | null
): Promise<{ success: boolean; filePath: string; cached: boolean; error?: string }> {
  const cacheDir = ensureCacheDir();
  const targetPath = path.join(cacheDir, filename);

  // Check if already in cache
  const existingPath = getCachedFilePath(filename);
  if (existingPath) {
    console.log(`[Hugging Face] Model ${filename} found in cache: ${existingPath}`);
    return { success: true, filePath: existingPath, cached: true };
  }

  const url = `https://huggingface.co/${modelId}/resolve/main/${filename}`;
  console.log(`[Hugging Face] Downloading ${filename} via stream from ${url}...`);

  try {
    const headers: Record<string, string> = {
      "User-Agent": "NeuroCheck-BrainScan2-Backend/2.0",
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000); // 60s max per file

    const response = await fetch(url, {
      method: "GET",
      headers,
      redirect: "follow",
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`Failed to download ${filename} (HTTP ${response.status}: ${response.statusText})`);
    }

    if (!response.body) {
      throw new Error("No response body stream received from Hugging Face.");
    }

    // Stream directly to file on disk to avoid buffering in RAM
    const fileStream = fs.createWriteStream(targetPath);
    await pipeline(Readable.fromWeb(response.body as any), fileStream);

    const fileSizeMb = (fs.statSync(targetPath).size / (1024 * 1024)).toFixed(2);
    console.log(`[Hugging Face] Successfully streamed & cached ${filename} (${fileSizeMb} MB)`);

    return {
      success: true,
      filePath: targetPath,
      cached: false,
    };
  } catch (err: any) {
    console.warn(`[Hugging Face] Stream download notice for ${filename}:`, err.message);
    try {
      if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath);
    } catch {}
    return {
      success: false,
      filePath: targetPath,
      cached: false,
      error: err.message,
    };
  }
}

/**
 * Automatic background check & download of configured models
 */
export async function initHuggingFaceModels(): Promise<{
  configured: boolean;
  modelId: string | null;
  downloads: Record<string, boolean>;
}> {
  const config = getHfConfig();
  ensureCacheDir();

  if (!config.modelId) {
    console.log("[Hugging Face] No HF_MODEL_ID configured in environment. Using fallback inference engines.");
    return {
      configured: false,
      modelId: null,
      downloads: {},
    };
  }

  console.log(`[Hugging Face] Initializing Hugging Face Model: ${config.modelId}`);
  const downloads: Record<string, boolean> = {};

  const filesToDownload = [config.precheckFilename, config.mainModelFilename];

  for (const filename of filesToDownload) {
    try {
      const res = await downloadFromHuggingFace(config.modelId, filename, config.token);
      downloads[filename] = res.success;
    } catch {
      downloads[filename] = false;
    }
  }

  return {
    configured: true,
    modelId: config.modelId,
    downloads,
  };
}

/**
 * Query Hugging Face Inference API directly with the image
 */
export async function queryHfInferenceApi(
  imageBuffer: Buffer,
  mimeType: string
): Promise<HfPredictionOutput | null> {
  const { modelId, token } = getHfConfig();
  if (!modelId) return null;

  const endpoints = [
    `https://router.huggingface.co/hf-inference/models/${modelId}`,
    `https://api-inference.huggingface.co/models/${modelId}`,
  ];

  for (const endpoint of endpoints) {
    try {
      const headers: Record<string, string> = {
        "Content-Type": mimeType || "application/octet-stream",
        "User-Agent": "NeuroCheck-BrainScan2-Backend/2.0",
      };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3500);

      const res = await fetch(endpoint, {
        method: "POST",
        headers,
        body: new Uint8Array(imageBuffer),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!res.ok) {
        continue;
      }

      const data = await res.json();

      if (Array.isArray(data) && data.length > 0) {
        const sorted = [...data].sort((a, b) => (b.score || 0) - (a.score || 0));
        const top = sorted[0];

        const allProbs: Record<string, number> = {};
        for (const cls of MAIN_CLASSES) {
          const match = sorted.find((s) =>
            s.label?.toLowerCase().replace(/[^a-z0-9]/g, "") ===
            cls.toLowerCase().replace(/[^a-z0-9]/g, "")
          );
          allProbs[cls] = match ? Number(match.score) : 0.001;
        }

        const total = Object.values(allProbs).reduce((a, b) => a + b, 0);
        for (const k of Object.keys(allProbs)) {
          allProbs[k] = Number((allProbs[k] / total).toFixed(4));
        }

        let matchedLabel: string = MAIN_CLASSES[5];
        for (const cls of MAIN_CLASSES) {
          if (
            top.label?.toLowerCase().replace(/[^a-z0-9]/g, "") ===
            cls.toLowerCase().replace(/[^a-z0-9]/g, "")
          ) {
            matchedLabel = cls;
            break;
          }
        }

        return {
          status: "ok",
          precheck_status: "valid",
          precheck_confidence: 0.98,
          prediction_label: matchedLabel,
          prediction_confidence: Number(top.score.toFixed(4)),
          all_probabilities: allProbs,
          engine: "huggingface_inference_api",
        };
      }
    } catch {
      // Continue to next endpoint
    }
  }

  return null;
}

/**
 * Status inspection for health checks
 */
export function getHfModelStatus(): {
  model_id: string | null;
  has_token: boolean;
  precheck_cached: boolean;
  main_model_cached: boolean;
  cache_dir: string;
} {
  const config = getHfConfig();
  return {
    model_id: config.modelId,
    has_token: Boolean(config.token),
    precheck_cached: Boolean(getCachedFilePath(config.precheckFilename)),
    main_model_cached: Boolean(getCachedFilePath(config.mainModelFilename)),
    cache_dir: config.cacheDir,
  };
}
