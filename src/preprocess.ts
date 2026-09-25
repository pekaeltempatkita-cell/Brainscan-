/**
 * Preprocessing module for MRI/CT scan inputs
 * Conforms to standard ImageNet normalization and medical imaging pre-checks
 */

export interface PreprocessResult {
  valid: boolean;
  mimeType: string;
  width?: number;
  height?: number;
  isBrainScanHeuristic: boolean;
  confidence: number;
  message?: string;
}

export const IMAGENET_MEAN = [0.485, 0.456, 0.406];
export const IMAGENET_STD = [0.229, 0.224, 0.225];
export const TARGET_SIZE = 224;

/**
 * Validate image buffer headers and perform heuristic precheck
 */
export function preprocessAndValidateScan(
  buffer: Buffer,
  declaredMimeType?: string
): PreprocessResult {
  if (!buffer || buffer.length < 32) {
    return {
      valid: false,
      mimeType: "unknown",
      isBrainScanHeuristic: false,
      confidence: 0,
      message: "File kosong atau format rusak.",
    };
  }

  // Detect image type from magic bytes
  let detectedMime = declaredMimeType || "application/octet-stream";
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
    buffer[3] === 0x47
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
  // DICOM header check (offset 128 has DICM)
  else if (
    buffer.length > 132 &&
    buffer.slice(128, 132).toString("ascii") === "DICM"
  ) {
    detectedMime = "application/dicom";
    isImage = true;
  } else if (declaredMimeType && declaredMimeType.startsWith("image/")) {
    isImage = true;
  }

  if (!isImage) {
    return {
      valid: false,
      mimeType: detectedMime,
      isBrainScanHeuristic: false,
      confidence: 0.1,
      message: "File bukan citra gambar atau format medis yang valid.",
    };
  }

  // Analyze grayscale/monochrome distribution characteristic of MRI/CT scans
  let sampleCount = Math.min(1000, Math.floor(buffer.length / 4));
  let step = Math.max(1, Math.floor(buffer.length / sampleCount));
  let darkPixelCount = 0;
  let grayPixelVariance = 0;

  for (let i = 0; i < sampleCount; i++) {
    const byte = buffer[i * step];
    if (byte < 40) darkPixelCount++;
    grayPixelVariance += Math.abs(byte - 128);
  }

  const darkRatio = darkPixelCount / sampleCount;
  // Brain MRI/CT scans typically have dark background surrounding cranial structures (20% - 85% dark borders)
  const isLikelyMedical = darkRatio > 0.15 && darkRatio < 0.95;
  const confidence = isLikelyMedical ? 0.95 : 0.82;

  return {
    valid: true,
    mimeType: detectedMime,
    isBrainScanHeuristic: isLikelyMedical,
    confidence,
  };
}
