import fs from "fs";
import path from "path";
import jpeg from "jpeg-js";
import { PNG } from "pngjs";
import {
  validateFileBuffer,
  validateImageQuality,
  performBrainPrecheck,
  getPrecheckThreshold,
} from "./brainPrecheck.js";
import { analyzeScanImage } from "./geminiClient.js";

// Helper to generate JPEG in memory
function createTestJpeg(
  width: number,
  height: number,
  pixelGenerator: (x: number, y: number) => [number, number, number]
): Buffer {
  const frameData = Buffer.alloc(width * height * 4);
  let i = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = pixelGenerator(x, y);
      frameData[i++] = r;
      frameData[i++] = g;
      frameData[i++] = b;
      frameData[i++] = 255;
    }
  }
  const rawImageData = {
    data: frameData,
    width,
    height,
  };
  const jpegImageData = jpeg.encode(rawImageData, 85);
  return jpegImageData.data;
}

// Helper to generate PNG in memory
function createTestPng(
  width: number,
  height: number,
  pixelGenerator: (x: number, y: number) => [number, number, number]
): Buffer {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (width * y + x) << 2;
      const [r, g, b] = pixelGenerator(x, y);
      png.data[idx] = r;
      png.data[idx + 1] = g;
      png.data[idx + 2] = b;
      png.data[idx + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

async function runTestSuite() {
  console.log("==================================================================");
  console.log("       BRAINSCAN2 - COMPREHENSIVE BRAIN PRECHECK TEST SUITE       ");
  console.log(`       Configured Threshold: ${getPrecheckThreshold()}            `);
  console.log("==================================================================\n");

  const results: { test: string; expected: string; actual: string; passed: boolean; details: string }[] = [];

  // TEST A: Gambar MRI/CT otak yang valid (Authentic Axial T2 Brain MRI)
  try {
    const realBrainBuffer = fs.readFileSync(path.resolve(process.cwd(), "src/assets/images/sample_brain_mri_1790239494273.jpg"));
    const res = await analyzeScanImage(realBrainBuffer, "image/jpeg", "mri_brain_axial_t2.jpg");
    const passed = res.success === true && res.precheck_status === "valid" && res.prediction_label !== null;
    results.push({
      test: "A. Gambar MRI/CT otak valid",
      expected: "ACCEPT (success: true, is_brain: true, prediction generated)",
      actual: `${res.success ? "ACCEPT" : "REJECT"} (confidence: ${res.precheck_confidence})`,
      passed,
      details: `Label: ${res.prediction_label}, Conf: ${res.prediction_confidence}`,
    });
  } catch (err: any) {
    results.push({
      test: "A. Gambar MRI/CT otak valid",
      expected: "ACCEPT",
      actual: `ERROR: ${err.message}`,
      passed: false,
      details: err.stack,
    });
  }

  // TEST B: Gambar otak valid ukuran berbeda (Authentic MRI downsampled to 512x512)
  try {
    const origBuf = fs.readFileSync(path.resolve(process.cwd(), "src/assets/images/sample_brain_mri_1790239494273.jpg"));
    const decoded = jpeg.decode(origBuf, { useTArray: true });
    const targetW = 512;
    const targetH = 512;
    const scaleX = decoded.width / targetW;
    const scaleY = decoded.height / targetH;
    const outData = Buffer.alloc(targetW * targetH * 4);

    let outIdx = 0;
    for (let y = 0; y < targetH; y++) {
      const srcY = Math.floor(y * scaleY);
      for (let x = 0; x < targetW; x++) {
        const srcX = Math.floor(x * scaleX);
        const srcIdx = (srcY * decoded.width + srcX) * 4;
        outData[outIdx++] = decoded.data[srcIdx];
        outData[outIdx++] = decoded.data[srcIdx + 1];
        outData[outIdx++] = decoded.data[srcIdx + 2];
        outData[outIdx++] = 255;
      }
    }

    const encoded512 = jpeg.encode({ data: outData, width: targetW, height: targetH }, 90);
    const res = await analyzeScanImage(encoded512.data, "image/jpeg", "brain_mri_t2_512x512.jpg");
    const passed = res.success === true && res.precheck_status === "valid" && res.prediction_label !== null;
    results.push({
      test: "B. Gambar otak valid ukuran berbeda (512x512)",
      expected: "ACCEPT (success: true)",
      actual: `${res.success ? "ACCEPT" : "REJECT"} (confidence: ${res.precheck_confidence})`,
      passed,
      details: `Label: ${res.prediction_label}`,
    });
  } catch (err: any) {
    results.push({
      test: "B. Gambar otak valid ukuran berbeda",
      expected: "ACCEPT",
      actual: `ERROR: ${err.message}`,
      passed: false,
      details: err.message,
    });
  }

  // TEST C: Foto wajah (Face / Portrait) -> Colorful skin, hair, eyes
  try {
    const faceBuffer = fs.readFileSync(path.resolve(process.cwd(), "src/assets/images/sample_face_photo_1790239508792.jpg"));
    const res = await analyzeScanImage(faceBuffer, "image/jpeg", "portrait_face_selfie.jpg");
    const passed = res.success === false && res.precheck_status === "invalid" && res.prediction_label === null;
    results.push({
      test: "C. Foto wajah / selfie",
      expected: "REJECT (success: false, code: NOT_BRAIN_IMAGE)",
      actual: `${res.success ? "ACCEPT (FAIL)" : "REJECT (PASS)"} (err: ${res.error?.code})`,
      passed,
      details: `Reason: ${res.precheck?.reason || res.error?.message}`,
    });
  } catch (err: any) {
    results.push({ test: "C. Foto wajah", expected: "REJECT", actual: "ERROR", passed: false, details: err.message });
  }

  // TEST D: Foto manusia / tubuh (Human Body)
  try {
    const humanBuffer = createTestJpeg(300, 400, (x, y) => {
      return [220, 100, 80]; // Red shirt / clothing
    });

    const res = await analyzeScanImage(humanBuffer, "image/jpeg", "person_walking.jpg");
    const passed = res.success === false && res.precheck_status === "invalid" && res.prediction_label === null;
    results.push({
      test: "D. Foto manusia / pakaian",
      expected: "REJECT (success: false)",
      actual: `${res.success ? "ACCEPT (FAIL)" : "REJECT (PASS)"} (err: ${res.error?.code})`,
      passed,
      details: `Reason: ${res.precheck?.reason || res.error?.message}`,
    });
  } catch (err: any) {
    results.push({ test: "D. Foto manusia", expected: "REJECT", actual: "ERROR", passed: false, details: err.message });
  }

  // TEST E: Gambar hewan (Cat / Dog / Pet)
  try {
    const animalBuffer = createTestJpeg(256, 256, (x, y) => {
      return [180, 120, 50]; // Brown golden fur
    });

    const res = await analyzeScanImage(animalBuffer, "image/jpeg", "cat_pet.jpg");
    const passed = res.success === false && res.precheck_status === "invalid" && res.prediction_label === null;
    results.push({
      test: "E. Gambar hewan / pet",
      expected: "REJECT (success: false)",
      actual: `${res.success ? "ACCEPT (FAIL)" : "REJECT (PASS)"} (err: ${res.error?.code})`,
      passed,
      details: `Reason: ${res.precheck?.reason || res.error?.message}`,
    });
  } catch (err: any) {
    results.push({ test: "E. Gambar hewan", expected: "REJECT", actual: "ERROR", passed: false, details: err.message });
  }

  // TEST F: Pemandangan (Landscape / Nature)
  try {
    const landscapeBuffer = createTestJpeg(320, 240, (x, y) => {
      if (y < 120) return [100, 180, 255]; // Sky blue
      return [40, 160, 40]; // Green grass/trees
    });

    const res = await analyzeScanImage(landscapeBuffer, "image/jpeg", "mountain_landscape.jpg");
    const passed = res.success === false && res.precheck_status === "invalid" && res.prediction_label === null;
    results.push({
      test: "F. Pemandangan / alam",
      expected: "REJECT (success: false)",
      actual: `${res.success ? "ACCEPT (FAIL)" : "REJECT (PASS)"} (err: ${res.error?.code})`,
      passed,
      details: `Reason: ${res.precheck?.reason || res.error?.message}`,
    });
  } catch (err: any) {
    results.push({ test: "F. Pemandangan", expected: "REJECT", actual: "ERROR", passed: false, details: err.message });
  }

  // TEST G: Dokumen / Teks / Invoice / Screenshot
  try {
    const docBuffer = createTestPng(300, 400, (x, y) => {
      // White paper with black lines
      if (y % 20 === 0 && x > 30 && x < 270) {
        return [20, 20, 20];
      }
      return [255, 255, 255];
    });

    const res = await analyzeScanImage(docBuffer, "image/png", "medical_invoice_document.png");
    const passed = res.success === false && res.precheck_status === "invalid" && res.prediction_label === null;
    results.push({
      test: "G. Dokumen / Teks / Invoice",
      expected: "REJECT (success: false)",
      actual: `${res.success ? "ACCEPT (FAIL)" : "REJECT (PASS)"} (err: ${res.error?.code})`,
      passed,
      details: `Reason: ${res.precheck?.reason || res.error?.message}`,
    });
  } catch (err: any) {
    results.push({ test: "G. Dokumen", expected: "REJECT", actual: "ERROR", passed: false, details: err.message });
  }

  // TEST H: Gambar Random / Colorful noise
  try {
    const randomBuffer = createTestJpeg(200, 200, () => {
      return [
        Math.floor(Math.random() * 256),
        Math.floor(Math.random() * 256),
        Math.floor(Math.random() * 256),
      ];
    });

    const res = await analyzeScanImage(randomBuffer, "image/jpeg", "random_noise.jpg");
    const passed = res.success === false && res.precheck_status === "invalid" && res.prediction_label === null;
    results.push({
      test: "H. Gambar random / noise",
      expected: "REJECT (success: false)",
      actual: `${res.success ? "ACCEPT (FAIL)" : "REJECT (PASS)"} (err: ${res.error?.code})`,
      passed,
      details: `Reason: ${res.precheck?.reason || res.error?.message}`,
    });
  } catch (err: any) {
    results.push({ test: "H. Gambar random", expected: "REJECT", actual: "ERROR", passed: false, details: err.message });
  }

  // TEST I: File corrupt / broken junk bytes
  try {
    const corruptBuffer = Buffer.from("NOT_A_VALID_IMAGE_JUST_RANDOM_CORRUPT_BYTES_DATA_STREAM_TEST_1234567890");
    const res = await analyzeScanImage(corruptBuffer, "image/jpeg", "corrupt_scan.jpg");
    const passed = res.success === false && res.precheck_status === "invalid" && res.error?.code === "LOW_IMAGE_QUALITY";
    results.push({
      test: "I. File corrupt / header rusak",
      expected: "REJECT (code: LOW_IMAGE_QUALITY)",
      actual: `${res.success ? "ACCEPT (FAIL)" : "REJECT (PASS)"} (err: ${res.error?.code})`,
      passed,
      details: `Message: ${res.error?.message}`,
    });
  } catch (err: any) {
    results.push({ test: "I. File corrupt", expected: "REJECT", actual: "ERROR", passed: false, details: err.message });
  }

  // TEST J: Gambar terlalu kecil (< 128x128 atau < 1KB)
  try {
    const smallBuffer = createTestPng(32, 32, () => [128, 128, 128]);
    const res = await analyzeScanImage(smallBuffer, "image/png", "tiny_icon.png");
    const passed = res.success === false && res.error?.code === "LOW_IMAGE_QUALITY";
    results.push({
      test: "J. Gambar terlalu kecil (32x32 px)",
      expected: "REJECT (code: LOW_IMAGE_QUALITY)",
      actual: `${res.success ? "ACCEPT (FAIL)" : "REJECT (PASS)"} (err: ${res.error?.code})`,
      passed,
      details: `Message: ${res.error?.message}`,
    });
  } catch (err: any) {
    results.push({ test: "J. Gambar terlalu kecil", expected: "REJECT", actual: "ERROR", passed: false, details: err.message });
  }

  console.log("\n==================== TEST RESULTS SUMMARY ====================");
  let passedCount = 0;
  for (const r of results) {
    const statusIcon = r.passed ? "✅ PASS" : "❌ FAIL";
    if (r.passed) passedCount++;
    console.log(`${statusIcon} | ${r.test}`);
    console.log(`        Expected: ${r.expected}`);
    console.log(`        Actual:   ${r.actual}`);
    console.log(`        Details:  ${r.details}\n`);
  }

  console.log(`Total: ${passedCount}/${results.length} tests passed.`);
  console.log("==============================================================\n");

  if (passedCount !== results.length) {
    process.exit(1);
  }
}

runTestSuite().catch((e) => {
  console.error("Test runner failed:", e);
  process.exit(1);
});
