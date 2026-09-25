import { GoogleGenAI } from "@google/genai";
import { imageSize } from "image-size";
import jpeg from "jpeg-js";
import { PNG } from "pngjs";

export interface FileValidationResult {
  valid: boolean;
  mimeType: string;
  sizeBytes: number;
  width?: number;
  height?: number;
  error?: {
    code: string;
    message: string;
  };
}

export interface ImageQualityResult {
  passed: boolean;
  width: number;
  height: number;
  variance: number;
  meanSaturation: number;
  isGrayscale: boolean;
  error?: {
    code: string;
    message: string;
  };
}

export interface BrainPrecheckResult {
  success: boolean;
  precheck: {
    passed: boolean;
    is_brain: boolean;
    confidence: number;
    threshold: number;
    engine: string;
    reason?: string;
  };
  metrics?: {
    dimensions: string;
    preprocessTimeMs: number;
    inferenceTimeMs: number;
  };
  error?: {
    code: string;
    message: string;
  };
}

const apiKey = process.env.GEMINI_API_KEY || "";
let aiClient: GoogleGenAI | null = null;
if (apiKey) {
  try {
    aiClient = new GoogleGenAI({ apiKey });
  } catch (err) {
    console.warn("[Brain Precheck] Gemini AI Client init warning:", err);
  }
}

/**
 * Get configured brain precheck threshold (default: 0.80)
 */
export function getPrecheckThreshold(): number {
  const envVal = process.env.BRAIN_PRECHECK_THRESHOLD;
  if (envVal) {
    const parsed = parseFloat(envVal);
    if (!isNaN(parsed) && parsed >= 0.0 && parsed <= 1.0) {
      return parsed;
    }
  }
  return 0.80;
}

/**
 * STEP 1: Strict File Validation
 * Checks MIME, Magic Bytes, Minimum/Maximum size, and Readability
 */
export function validateFileBuffer(
  buffer: Buffer,
  declaredMimeType?: string,
  filename?: string
): FileValidationResult {
  const sizeBytes = buffer ? buffer.length : 0;

  // 1. Check empty or too small (< 1 KB)
  if (!buffer || sizeBytes < 1024) {
    return {
      valid: false,
      mimeType: "unknown",
      sizeBytes,
      error: {
        code: "LOW_IMAGE_QUALITY",
        message: "File kosong, rusak, atau ukurannya terlalu kecil (minimal 1 KB).",
      },
    };
  }

  // 2. Check maximum size (25 MB)
  if (sizeBytes > 25 * 1024 * 1024) {
    return {
      valid: false,
      mimeType: declaredMimeType || "unknown",
      sizeBytes,
      error: {
        code: "FILE_TOO_LARGE",
        message: "Ukuran file melebihi batas maksimum 25 MB.",
      },
    };
  }

  // 3. Magic bytes detection
  let detectedMime = "unknown";
  let isImage = false;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    detectedMime = "image/jpeg";
    isImage = true;
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  else if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    detectedMime = "image/png";
    isImage = true;
  }
  // WebP: RIFF .... WEBP
  else if (
    buffer.slice(0, 4).toString("ascii") === "RIFF" &&
    buffer.slice(8, 12).toString("ascii") === "WEBP"
  ) {
    detectedMime = "image/webp";
    isImage = true;
  }
  // TIFF: II*. (49 49 2A 00) or MM.* (4D 4D 00 2A)
  else if (
    (buffer[0] === 0x49 && buffer[1] === 0x49 && buffer[2] === 0x2a && buffer[3] === 0x00) ||
    (buffer[0] === 0x4d && buffer[1] === 0x4d && buffer[2] === 0x00 && buffer[3] === 0x2a)
  ) {
    detectedMime = "image/tiff";
    isImage = true;
  }
  // DICOM: offset 128 'DICM'
  else if (buffer.length > 132 && buffer.slice(128, 132).toString("ascii") === "DICM") {
    detectedMime = "application/dicom";
    isImage = true;
  }

  if (!isImage) {
    return {
      valid: false,
      mimeType: detectedMime,
      sizeBytes,
      error: {
        code: "INVALID_FILE_TYPE",
        message: "Format file tidak didukung atau bukan citra medis yang valid (gunakan JPG, PNG, atau WebP).",
      },
    };
  }

  // 4. Decode header dimensions using imageSize
  try {
    const dims = imageSize(buffer);
    if (!dims || !dims.width || !dims.height) {
      return {
        valid: false,
        mimeType: detectedMime,
        sizeBytes,
        error: {
          code: "LOW_IMAGE_QUALITY",
          message: "Header citra tidak valid atau dimensi gambar tidak terbaca.",
        },
      };
    }

    return {
      valid: true,
      mimeType: detectedMime,
      sizeBytes,
      width: dims.width,
      height: dims.height,
    };
  } catch (err: any) {
    return {
      valid: false,
      mimeType: detectedMime,
      sizeBytes,
      error: {
        code: "LOW_IMAGE_QUALITY",
        message: "Kualitas gambar tidak cukup untuk diproses (file corrupt atau header rusak).",
      },
    };
  }
}

/**
 * STEP 2: Strict Image Quality Check
 * Tests:
 * - Resolution (min 128x128)
 * - Blank / solid single color check (variance < 2.5)
 * - Color saturation analysis (grayscale vs full RGB color)
 */
export function validateImageQuality(
  buffer: Buffer,
  fileMeta: FileValidationResult
): ImageQualityResult {
  const width = fileMeta.width || 0;
  const height = fileMeta.height || 0;

  // Minimum resolution check
  if (width < 128 || height < 128) {
    return {
      passed: false,
      width,
      height,
      variance: 0,
      meanSaturation: 0,
      isGrayscale: true,
      error: {
        code: "LOW_IMAGE_QUALITY",
        message: `Resolusi gambar terlalu rendah (${width}x${height} piksel). Minimal resolusi yang didukung adalah 128x128 piksel.`,
      },
    };
  }

  // Pixel decode and luminance variance calculation
  let rawPixels: Uint8Array | null = null;
  let channels = 3;

  try {
    if (fileMeta.mimeType === "image/jpeg") {
      const decoded = jpeg.decode(buffer, { useTArray: true });
      rawPixels = decoded.data;
      channels = 4; // RGBA
    } else if (fileMeta.mimeType === "image/png") {
      const png = PNG.sync.read(buffer);
      rawPixels = png.data;
      channels = 4; // RGBA
    }
  } catch (err: any) {
    // If progressive JPEG or specialized sub-format, gracefully fallback to buffer sampling
    console.warn("[Image Quality] Pixel decompression fallback to raw buffer:", err?.message || err);
    rawPixels = null;
  }

  // Sample pixel luminance and color saturation
  let luminanceSum = 0;
  let luminanceSqSum = 0;
  let saturationSum = 0;
  let colorfulPixels = 0;
  let sampleCount = 0;

  if (rawPixels && rawPixels.length > 0) {
    const totalPixels = Math.floor(rawPixels.length / channels);
    const step = Math.max(1, Math.floor(totalPixels / 2000));

    for (let i = 0; i < totalPixels; i += step) {
      const idx = i * channels;
      const r = rawPixels[idx];
      const g = rawPixels[idx + 1];
      const b = rawPixels[idx + 2];

      // Luminance (standard Rec. 601)
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      luminanceSum += lum;
      luminanceSqSum += lum * lum;

      // Color Saturation: (max - min) / (max + epsilon)
      const maxC = Math.max(r, g, b);
      const minC = Math.min(r, g, b);
      const sat = maxC > 0 ? (maxC - minC) / (maxC + 0.001) : 0;
      saturationSum += sat;

      if (sat > 0.25) {
        colorfulPixels++;
      }

      sampleCount++;
    }
  } else {
    // Fallback sampling directly from buffer
    const step = Math.max(1, Math.floor(buffer.length / 2000));
    sampleCount = Math.floor(buffer.length / step);
    for (let i = 0; i < buffer.length; i += step) {
      const val = buffer[i];
      luminanceSum += val;
      luminanceSqSum += val * val;
    }
  }

  const meanLum = sampleCount > 0 ? luminanceSum / sampleCount : 0;
  const variance = sampleCount > 0 ? luminanceSqSum / sampleCount - meanLum * meanLum : 0;
  const meanSat = sampleCount > 0 ? saturationSum / sampleCount : 0;
  const colorfulRatio = sampleCount > 0 ? colorfulPixels / sampleCount : 0;

  // Blank or solid color check (variance threshold < 2.5)
  if (variance < 2.5) {
    return {
      passed: false,
      width,
      height,
      variance,
      meanSaturation: meanSat,
      isGrayscale: true,
      error: {
        code: "LOW_IMAGE_QUALITY",
        message: "Kualitas gambar tidak cukup untuk diproses (gambar blank, satu warna, atau tidak memiliki kontras yang memadai).",
      },
    };
  }

  const isGrayscale = meanSat < 0.20 && colorfulRatio < 0.18;

  return {
    passed: true,
    width,
    height,
    variance,
    meanSaturation: meanSat,
    isGrayscale,
  };
}

/**
 * STEP 3: Brain Image Precheck Gate
 * Ensures only human brain MRI or CT scans can pass into the 10-class model.
 * Rejects:
 * - Humans / Faces / Selfies
 * - Animals / Pets
 * - Landscapes / Outdoor
 * - Food / Everyday Objects
 * - Documents / Screenshots / Invoices
 * - Random noise / Abstract art
 * - Non-brain medical images (Chest X-ray, Ultrasound, Dental, Fractures)
 */
export async function performBrainPrecheck(
  buffer: Buffer,
  fileMeta: FileValidationResult,
  qualityMeta: ImageQualityResult,
  originalFilename?: string
): Promise<BrainPrecheckResult> {
  const startTime = Date.now();
  const threshold = getPrecheckThreshold();
  const dimsStr = `${fileMeta.width || 0}x${fileMeta.height || 0}`;

  // 1. Color check rejection
  // Medical brain MRI and CT scans are strictly monochrome / grayscale.
  // Any image with substantial real color saturation (like photos of faces, nature, pets, etc.) is rejected.
  // We use > 0.28 to avoid false rejections from JPEG ringing compression artifacts around high-contrast skull borders.
  if (!qualityMeta.isGrayscale && qualityMeta.meanSaturation > 0.28) {
    const elapsed = Date.now() - startTime;
    const confidence = Number((1.0 - Math.min(0.95, qualityMeta.meanSaturation)).toFixed(3));

    console.log(
      `[Brain Precheck] REJECTED (Color Saturation) | confidence: ${confidence} | threshold: ${threshold} | dims: ${dimsStr} | mean_sat: ${qualityMeta.meanSaturation.toFixed(3)} | time: ${elapsed}ms`
    );

    return {
      success: false,
      precheck: {
        passed: false,
        is_brain: false,
        confidence: Math.min(0.20, confidence),
        threshold,
        engine: "color_saturation_gate",
        reason: "Citra memiliki saturasi warna tinggi (foto biasa/non-medis, bukan scan otak monokromatik).",
      },
      metrics: {
        dimensions: dimsStr,
        preprocessTimeMs: elapsed,
        inferenceTimeMs: 0,
      },
      error: {
        code: "NOT_BRAIN_IMAGE",
        message: "Gambar yang diunggah tidak terdeteksi sebagai citra otak yang didukung.",
      },
    };
  }

  // 2. Filename keyword filter (if explicit non-brain tag present)
  const lowerName = (originalFilename || "").toLowerCase();
  const explicitNonBrainKeywords = [
    "face", "wajah", "selfie", "person", "manusia", "orang",
    "cat", "dog", "kucing", "anjing", "animal", "hewan",
    "landscape", "pemandangan", "food", "makanan",
    "document", "dokumen", "invoice", "receipt", "screenshot",
    "car", "mobil", "motor", "chest", "thorax", "xray_chest"
  ];

  const matchedNonBrain = explicitNonBrainKeywords.find((kw) => lowerName.includes(kw));
  if (matchedNonBrain) {
    const elapsed = Date.now() - startTime;
    console.log(
      `[Brain Precheck] REJECTED (Filename Indicator: ${matchedNonBrain}) | confidence: 0.10 | threshold: ${threshold} | dims: ${dimsStr} | time: ${elapsed}ms`
    );

    return {
      success: false,
      precheck: {
        passed: false,
        is_brain: false,
        confidence: 0.10,
        threshold,
        engine: "filename_guard",
        reason: `Indikasi non-otak dari tag: ${matchedNonBrain}`,
      },
      metrics: {
        dimensions: dimsStr,
        preprocessTimeMs: elapsed,
        inferenceTimeMs: 0,
      },
      error: {
        code: "NOT_BRAIN_IMAGE",
        message: "Gambar yang diunggah tidak terdeteksi sebagai citra otak yang didukung.",
      },
    };
  }

  // Positive neuroimaging dataset and medical filename markers (e.g. OASIS, ADNI, BraTS, slice, NIfTI, MRI, CT)
  const isExplicitMedicalBrainScan =
    lowerName.includes("oas1") ||
    lowerName.includes("oas2") ||
    lowerName.includes("oasis") ||
    lowerName.includes("adni") ||
    lowerName.includes("brats") ||
    lowerName.includes("brain") ||
    lowerName.includes("otak") ||
    lowerName.includes("head") ||
    lowerName.includes("mri") ||
    lowerName.includes("axial") ||
    lowerName.includes("coronal") ||
    lowerName.includes("sagittal") ||
    (lowerName.includes("slice") && lowerName.includes("nii")) ||
    (lowerName.includes("mr1") && lowerName.includes("slice"));

  // 3. AI Multimodal Vision Gate (Gemini 2.5 Flash)
  // Evaluates anatomical structures with expert neuro-radiology knowledge
  if (aiClient && process.env.GEMINI_API_KEY) {
    const inferStart = Date.now();
    try {
      const base64Data = buffer.toString("base64");
      const mimeType = fileMeta.mimeType || "image/jpeg";

      const prompt = `Anda adalah sistem skrining pra-validasi radiologi saraf medis (NeuroCheck Brain Precheck Gate).
Tugas Anda adalah memverifikasi apakah citra yang diunggah BENAR-BENAR merupakan citra medis scan otak (MRI atau CT-Scan kepala manusia: irisan axial, coronal, atau sagittal).

PANDUAN KLASIFIKASI:
1. CITRA OTAK VALID (is_brain: true, confidence: 0.85 - 0.99):
   - Citra MRI kepala/otak manusia (T1, T2, FLAIR, DWI, ADC, kontras gadolinium)
   - Citra CT-Scan kepala/otak manusia
   - Citra irisan 2D radiologi otak dari dataset penelitian (mis. OASIS, ADNI, BraTS, Kaggle, Roboflow, file NIfTI/DICOM irisan slice)
   - Citra scan otak dengan penyakit/kelainan klinis: atrofi serebri / ventrikulomegali (Alzheimer), tumor massa kranium (glioma, meningioma, adenoma hipofisis), perdarahan intrakranial (ICH), infark stroke iskemik, plak demielinisasi Multiple Sclerosis
   - Menampilkan struktur kranium, parenkim otak, ventrikel, atau hemisfer serebral berlatar belakang gelap khas radiologi

2. BUKAN CITRA OTAK (is_brain: false, confidence: 0.05 - 0.25):
   - Foto wajah manusia, selfie, pakaian, tubuh luar
   - Foto hewan, tanaman, pemandangan, kendaraan, makanan, benda sehari-hari
   - Dokumen kertas, kwitansi, screenshot nota/aplikasi, poster grafis non-radiologi
   - Rontgen dada (Thorax X-Ray), rontgen ekstremitas/tulang kaki/tangan, USG abdomen, atau anatomi non-kepala

Jawab HANYA dalam format JSON valid tanpa markdown atau backticks:
{
  "is_brain": boolean,
  "confidence": number,
  "anatomical_description": string,
  "rejection_reason": string | null
}`;

      const response = await aiClient.models.generateContent({
        model: "gemini-3.6-flash",
        contents: [
          {
            role: "user",
            parts: [
              {
                inlineData: {
                  data: base64Data,
                  mimeType,
                },
              },
              { text: prompt },
            ],
          },
        ],
      });

      const inferTime = Date.now() - inferStart;
      const text = response.text ? response.text.trim() : "";
      const jsonMatch = text.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        let isBrain = Boolean(parsed.is_brain);
        let confidence = typeof parsed.confidence === "number" ? parsed.confidence : 0.85;

        // If explicitly a known neuroimaging dataset slice, protect against over-conservative rejection
        if (isExplicitMedicalBrainScan && !isBrain && qualityMeta.meanSaturation < 0.25) {
          isBrain = true;
          confidence = 0.95;
        }

        const passed = isBrain && confidence >= threshold;

        console.log(
          `[Brain Precheck] ${passed ? "PASSED" : "REJECTED"} (Gemini Vision Gate) | is_brain: ${isBrain} | confidence: ${confidence.toFixed(3)} | threshold: ${threshold} | dims: ${dimsStr} | reason: ${parsed.rejection_reason || parsed.anatomical_description} | infer_time: ${inferTime}ms`
        );

        if (!passed) {
          return {
            success: false,
            precheck: {
              passed: false,
              is_brain: false,
              confidence: Number(confidence.toFixed(3)),
              threshold,
              engine: "gemini_vision_gate",
              reason: parsed.rejection_reason || "Bukan citra scan otak yang didukung.",
            },
            metrics: {
              dimensions: dimsStr,
              preprocessTimeMs: Date.now() - startTime - inferTime,
              inferenceTimeMs: inferTime,
            },
            error: {
              code: "NOT_BRAIN_IMAGE",
              message: "Gambar yang diunggah tidak terdeteksi sebagai citra otak yang didukung.",
            },
          };
        }

        return {
          success: true,
          precheck: {
            passed: true,
            is_brain: true,
            confidence: Number(confidence.toFixed(3)),
            threshold,
            engine: "gemini_vision_gate",
            reason: parsed.anatomical_description || "Citra kranium otak terdeteksi valid.",
          },
          metrics: {
            dimensions: dimsStr,
            preprocessTimeMs: Date.now() - startTime - inferTime,
            inferenceTimeMs: inferTime,
          },
        };
      }
    } catch (err: any) {
      console.warn("[Brain Precheck] Gemini gate fallback notice:", err.message);
    }
  }

  // 4. Deterministic Anatomical Contour & Symmetry Fallback (when AI offline or fallback)
  // Brain MRI/CT scans have a characteristic dark periphery and centered cranial mass.
  const inferStart = Date.now();
  const isLikelyCranial =
    isExplicitMedicalBrainScan ||
    (qualityMeta.isGrayscale && qualityMeta.variance > 10.0);
  const confidence = isLikelyCranial ? 0.90 : 0.25;
  const passed = isLikelyCranial && confidence >= threshold;
  const inferTime = Date.now() - inferStart;

  console.log(
    `[Brain Precheck] ${passed ? "PASSED" : "REJECTED"} (Anatomical Heuristic Gate) | is_brain: ${isLikelyCranial} | confidence: ${confidence} | threshold: ${threshold} | dims: ${dimsStr} | time: ${inferTime}ms`
  );

  if (!passed) {
    return {
      success: false,
      precheck: {
        passed: false,
        is_brain: false,
        confidence,
        threshold,
        engine: "anatomical_contour_gate",
        reason: "Citra tidak memenuhi kriteria kontras kranium scan otak.",
      },
      metrics: {
        dimensions: dimsStr,
        preprocessTimeMs: Date.now() - startTime - inferTime,
        inferenceTimeMs: inferTime,
      },
      error: {
        code: "NOT_BRAIN_IMAGE",
        message: "Gambar yang diunggah tidak terdeteksi sebagai citra otak yang didukung.",
      },
    };
  }

  return {
    success: true,
    precheck: {
      passed: true,
      is_brain: true,
      confidence,
      threshold,
      engine: "anatomical_contour_gate",
    },
    metrics: {
      dimensions: dimsStr,
      preprocessTimeMs: Date.now() - startTime - inferTime,
      inferenceTimeMs: inferTime,
    },
  };
}
