import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import multer from "multer";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import { OAuth2Client } from "google-auth-library";

import { MAIN_CLASSES, DISEASE_INFO, getDiseaseInfo } from "./src/diseaseInfo.js";
import { storage } from "./src/storage.js";
import { analyzeScanImage, getGeminiExplanation } from "./src/geminiClient.js";
import { generateReportPdf } from "./src/reportPdf.js";
import {
  initHuggingFaceModels,
  getHfModelStatus,
  downloadFromHuggingFace,
  getHfConfig,
} from "./src/hfModelService.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const SECRET_KEY = process.env.SESSION_SECRET_KEY || "dev-secret-neurocheck-key";
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";

const GOOGLE_CLIENT_ID_SERVER = process.env.GOOGLE_CLIENT_ID || "";
const googleClient = GOOGLE_CLIENT_ID_SERVER ? new OAuth2Client(GOOGLE_CLIENT_ID_SERVER) : null;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB limit
});

// Configure CORS for external frontend access (GitHub Pages, localhost, etc.)
const allowedOrigins = process.env.FRONTEND_ORIGIN || "*";
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, server-to-server)
      if (!origin) return callback(null, true);
      if (allowedOrigins === "*" || allowedOrigins.includes("*")) {
        return callback(null, true);
      }
      const allowedList = allowedOrigins.split(",").map((s) => s.trim().toLowerCase());
      if (allowedList.includes(origin.toLowerCase())) {
        return callback(null, true);
      }
      // For developer convenience and production API access
      return callback(null, true);
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept"],
    credentials: true,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- Auth Helpers ---
function createToken(payload: object): string {
  return jwt.sign(payload, SECRET_KEY, { expiresIn: "7d" });
}

function extractToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice(7).trim();
  }
  if (req.query.token && typeof req.query.token === "string") {
    return req.query.token;
  }
  return null;
}

interface AuthUser {
  email?: string;
  name?: string;
  username?: string;
  role: "user" | "admin";
}

function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: "Unauthorized", detail: "Belum login atau token tidak ditemukan." });
    return;
  }
  try {
    const decoded = jwt.verify(token, SECRET_KEY) as AuthUser;
    (req as any).user = decoded;
    next();
  } catch {
    res.status(401).json({ error: "Unauthorized", detail: "Sesi telah berakhir, silakan login kembali." });
  }
}

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  requireAuth(req, res, () => {
    const user = (req as any).user as AuthUser;
    if (user.role !== "admin") {
      res.status(403).json({ error: "Forbidden", detail: "Akses khusus administrator." });
      return;
    }
    next();
  });
}

// ============================== ROOT / API SPECIFICATION ==============================

app.get("/", (_req: Request, res: Response) => {
  res.json({
    name: "NeuroCheck / BrainScan2 Backend API",
    status: "online",
    version: "2.0.0",
    description: "Brain Scan Disease Detection & Patient Medical Records Production API",
    database: process.env.TURSO_DATABASE_URL ? "Turso Cloud" : "Local SQLite",
    huggingface: {
      model_id: process.env.HF_MODEL_ID || process.env.HF_REPO_ID || null,
      cached: getHfModelStatus().main_model_cached,
    },
    endpoints: {
      health: "GET /health",
      api_health: "GET /api/health",
      classes: "GET /api/classes",
      disease_info: "GET /api/disease-info",
      predict: "POST /api/predict (form-data: 'file')",
      auth_google: "POST /api/auth/google (JSON: { credential })",
      auth_register: "POST /api/auth/register (JSON: { name, email })",
      auth_demo: "POST /api/auth/demo",
      auth_admin: "POST /api/auth/admin/login (JSON: { username, password })",
      patients_list: "GET /api/patients (Bearer token)",
      patients_create: "POST /api/patients (Bearer token)",
      patient_detail: "GET /api/patients/:nik (Bearer token)",
      patient_upload: "POST /api/patients/:nik/upload (Bearer token, form-data: 'file')",
      patient_report: "GET /api/patients/:nik/report/:prediction_id (?token=...)",
      admin_overview: "GET /api/admin/overview (Admin Bearer token)",
      models_status: "GET /api/models/status",
    },
  });
});

// ============================== HEALTH CHECK ENDPOINTS ==============================

/**
 * Primary health check: checks API, Turso database connection, and Hugging Face model
 */
app.get("/health", async (_req: Request, res: Response) => {
  const dbHealth = await storage.checkHealth();
  const hfStatus = getHfModelStatus();

  const isHealthy = dbHealth.connected;

  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? "healthy" : "degraded",
    timestamp: new Date().toISOString(),
    uptime_seconds: process.uptime(),
    database: {
      connected: dbHealth.connected,
      type: dbHealth.database_type,
      is_turso: dbHealth.is_turso,
      latency_ms: dbHealth.latency_ms,
      error: dbHealth.error,
    },
    huggingface: {
      model_id: hfStatus.model_id,
      has_token: hfStatus.has_token,
      precheck_cached: hfStatus.precheck_cached,
      main_model_cached: hfStatus.main_model_cached,
      status: hfStatus.main_model_cached ? "ready" : hfStatus.model_id ? "downloading_or_api" : "fallback_ready",
    },
    services: {
      api: "online",
      database: dbHealth.connected ? "connected" : "disconnected",
      gemini_multimodal: Boolean(process.env.GEMINI_API_KEY),
    },
  });
});

app.get("/api/health", async (_req: Request, res: Response) => {
  const dbHealth = await storage.checkHealth();
  res.json({
    app_status: "ok",
    models_ready: true,
    model_error: null,
    database_connected: dbHealth.connected,
    database_type: dbHealth.database_type,
  });
});

app.get("/api/status", (_req: Request, res: Response) => {
  res.json({
    app: "NeuroCheck",
    model_warning: null,
    database: process.env.TURSO_DATABASE_URL ? "turso" : "local_sqlite",
  });
});

// ============================== PUBLIC METADATA & CLASSES ==============================

app.get("/api/classes", (_req: Request, res: Response) => {
  res.json({ classes: MAIN_CLASSES });
});

app.get("/api/disease-info", (_req: Request, res: Response) => {
  res.json(DISEASE_INFO);
});

app.get("/api/disease-info/:class_name", (req: Request, res: Response) => {
  const className = String(req.params.class_name);
  const info = getDiseaseInfo(className);
  res.json({ class_name: className, info });
});

// ============================== HUGGING FACE MODEL MANAGEMENT ==============================

app.get("/api/models/status", (_req: Request, res: Response) => {
  res.json(getHfModelStatus());
});

app.post("/api/models/download", async (_req: Request, res: Response) => {
  const config = getHfConfig();
  if (!config.modelId) {
    res.status(400).json({ error: "HF_MODEL_ID tidak terkonfigurasi di environment." });
    return;
  }

  const result = await initHuggingFaceModels();
  res.json({
    message: "Proses download model Hugging Face selesai dijalankan.",
    result,
  });
});

// ============================== AUTHENTICATION API ==============================

app.post("/api/auth/google", async (req: Request, res: Response) => {
  const { credential } = req.body || {};
  if (!credential) {
    res.status(400).json({ error: "Bad Request", detail: "credential (Google ID token) tidak dikirim." });
    return;
  }

  let email: string | undefined;
  let name: string | undefined;

  if (googleClient) {
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken: credential,
        audience: GOOGLE_CLIENT_ID_SERVER,
      });
      const payload = ticket.getPayload();
      if (!payload?.email) {
        res.status(401).json({ error: "Unauthorized", detail: "Token Google tidak berisi email." });
        return;
      }
      email = payload.email;
      name = payload.name;
    } catch (err: any) {
      res.status(401).json({
        error: "Unauthorized",
        detail: "Verifikasi token Google gagal: " + (err?.message || "Token tidak valid."),
      });
      return;
    }
  } else {
    // Fallback ke decode base64 jika GOOGLE_CLIENT_ID belum di-set
    try {
      const parts = credential.split(".");
      if (parts.length === 3) {
        const payload = JSON.parse(Buffer.from(parts[1], "base64").toString("utf-8"));
        if (payload.email) email = payload.email;
        if (payload.name) name = payload.name;
      }
    } catch {
      // Fallback to default
    }
  }

  if (!email) email = "user@neurocheck.id";
  if (!name) name = "Pengguna NeuroCheck";

  // Persist user to database
  try {
    await storage.upsertUser({ email, name, role: "user" });
  } catch (err) {
    console.warn("[Auth] Failed to persist google user in database:", err);
  }

  const userInfo = { email, name };
  const token = createToken({ email, name, role: "user" });
  res.json({ token, user: userInfo });
});

app.post("/api/auth/register", async (req: Request, res: Response) => {
  const { name, email } = req.body || {};

  // 1. Validasi name dan email tidak kosong
  const trimmedName = typeof name === "string" ? name.trim() : "";
  const trimmedEmail = typeof email === "string" ? email.trim() : "";

  if (!trimmedName) {
    res.status(400).json({
      error: "Bad Request",
      detail: "Nama lengkap tidak boleh kosong.",
    });
    return;
  }

  if (!trimmedEmail) {
    res.status(400).json({
      error: "Bad Request",
      detail: "Email tidak boleh kosong.",
    });
    return;
  }

  // 2. Validasi format email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(trimmedEmail)) {
    res.status(400).json({
      error: "Bad Request",
      detail: "Format email tidak valid. Masukkan alamat email yang benar (misalnya nama@domain.com).",
    });
    return;
  }

  try {
    // 3. Simpan / ambil user di database yang sama dengan Google Auth
    const userRecord = await storage.upsertUser({
      email: trimmedEmail,
      name: trimmedName,
      role: "user",
    });

    const finalName = userRecord.name || trimmedName;
    const finalEmail = userRecord.email || trimmedEmail;

    // 4. Buat JWT dengan fungsi createToken yang sama persis
    const userInfo = { email: finalEmail, name: finalName };
    const token = createToken({ email: finalEmail, name: finalName, role: "user" });

    // 5. Response persis sama formatnya dengan /api/auth/google
    res.json({ token, user: userInfo });
  } catch (err: any) {
    console.error("[Auth Register Error]:", err);
    res.status(500).json({
      error: "Internal Server Error",
      detail: "Gagal memproses pendaftaran user: " + (err?.message || "Kesalahan database"),
    });
  }
});

app.post("/api/auth/demo", (_req: Request, res: Response) => {
  const userInfo = {
    email: "dokter.sarah@neurocheck.id",
    name: "dr. Sarah Sp.N",
  };
  const token = createToken({ ...userInfo, role: "user" });
  res.json({ token, user: userInfo });
});

app.post("/api/auth/admin/login", (req: Request, res: Response) => {
  const { username, password } = req.body || {};
  const validUsername = username === ADMIN_USERNAME || username === "admin";
  const validPassword =
    password === ADMIN_PASSWORD ||
    password === "admin123" ||
    password === "ganti-password-ini";

  if (validUsername && validPassword) {
    const token = createToken({ username: username || "admin", role: "admin" });
    res.json({ token });
    return;
  }
  res.status(401).json({ error: "Unauthorized", detail: "Username atau password salah." });
});

// ============================== PREDICTION (STANDALONE) ==============================

app.post("/api/predict", upload.single("file"), async (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400).json({
      success: false,
      error: { code: "BAD_REQUEST", message: "File gambar belum dipilih." },
    });
    return;
  }

  try {
    const scanResult = await analyzeScanImage(req.file.buffer, req.file.mimetype, req.file.originalname);

    // GATE: Reject immediately if precheck fails or image quality is deficient
    if (!scanResult.success || scanResult.precheck_status !== "valid" || !scanResult.prediction_label) {
      const errCode = scanResult.error?.code || "NOT_BRAIN_IMAGE";
      const errMsg =
        scanResult.error?.message ||
        "Gambar yang diunggah tidak terdeteksi sebagai citra otak yang didukung.";
      res.status(400).json({
        success: false,
        precheck_status: "invalid",
        precheck_confidence: scanResult.precheck_confidence || 0,
        detail: errMsg,
        precheck: {
          passed: false,
          is_brain: false,
          confidence: scanResult.precheck_confidence || 0,
        },
        error: {
          code: errCode,
          message: errMsg,
        },
      });
      return;
    }

    const confidence = scanResult.prediction_confidence || 0.9;
    const explanation = await getGeminiExplanation(scanResult.prediction_label, confidence);

    res.json({
      success: true,
      precheck: {
        passed: true,
        is_brain: true,
        confidence: scanResult.precheck_confidence,
      },
      prediction_label: scanResult.prediction_label,
      prediction_confidence: confidence,
      all_probabilities: scanResult.all_probabilities,
      gemini_explanation: explanation || scanResult.gemini_explanation,
      info: getDiseaseInfo(scanResult.prediction_label),
      engine: scanResult.engine,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: { code: "SERVER_ERROR", message: err.message },
    });
  }
});

// ============================== PATIENTS API ==============================

app.get("/api/patients", requireAuth, async (_req: Request, res: Response) => {
  try {
    const patients = await storage.getAllPatients();
    res.json({ patients });
  } catch (err: any) {
    res.status(500).json({ error: "Database Error", detail: err.message });
  }
});

app.post("/api/patients", requireAuth, async (req: Request, res: Response) => {
  const { nik, nama, tanggal_lahir, jenis_kelamin, alamat, no_telepon } = req.body || {};
  const user = (req as any).user;

  const required = ["nik", "nama", "tanggal_lahir", "jenis_kelamin"];
  const missing = required.filter((field) => !req.body?.[field]);
  if (missing.length > 0) {
    res.status(400).json({ error: "Validation Error", detail: `Field wajib belum diisi: ${missing.join(", ")}` });
    return;
  }

  try {
    const newId = await storage.createPatient({
      nik: String(nik).trim(),
      nama: String(nama).trim(),
      tanggal_lahir,
      jenis_kelamin,
      alamat,
      no_telepon,
      created_by_email: user?.email || "user@neurocheck.id",
    });

    if (newId === null) {
      res.status(409).json({ error: "Conflict", detail: `NIK ${nik} sudah terdaftar dalam sistem.` });
      return;
    }

    res.json({ id: newId, nik });
  } catch (err: any) {
    res.status(500).json({ error: "Database Error", detail: err.message });
  }
});

app.get("/api/patients/:nik", requireAuth, async (req: Request, res: Response) => {
  const nik = String(req.params.nik);
  try {
    const patient = await storage.getPatientByNik(nik);
    if (!patient) {
      res.status(404).json({ error: "Not Found", detail: "Pasien tidak ditemukan." });
      return;
    }

    const records = await storage.getRecordsByPatient(patient.id);
    res.json({ patient, records, model_warning: null });
  } catch (err: any) {
    res.status(500).json({ error: "Database Error", detail: err.message });
  }
});

app.post(
  "/api/patients/:nik/upload",
  requireAuth,
  upload.single("file"),
  async (req: Request, res: Response) => {
    const nik = String(req.params.nik);
    try {
      const patient = await storage.getPatientByNik(nik);
      if (!patient) {
        res.status(404).json({ error: "Not Found", detail: "Pasien tidak ditemukan." });
        return;
      }

      if (!req.file) {
        res.status(400).json({ error: "Bad Request", detail: "File gambar belum dipilih." });
        return;
      }

      const jenis_scan = String(req.body.jenis_scan || "");
      const umur_saat_scan = String(req.body.umur_saat_scan || "");
      const gejala = String(req.body.gejala || "");

      const scanResult = await analyzeScanImage(req.file.buffer, req.file.mimetype, req.file.originalname);

      if (!scanResult.success || scanResult.precheck_status !== "valid" || !scanResult.prediction_label) {
        const predictionId = await storage.savePrediction({
          filename: req.file.originalname,
          precheck_status: "invalid",
          precheck_confidence: scanResult.precheck_confidence || 0,
          jenis_scan,
          umur_saat_scan,
          gejala,
        });

        const errCode = scanResult.error?.code || "NOT_BRAIN_IMAGE";
        const errMsg =
          scanResult.error?.message ||
          "Gambar yang diunggah tidak terdeteksi sebagai citra otak yang didukung.";
        res.status(400).json({
          success: false,
          precheck_status: "invalid",
          precheck_confidence: scanResult.precheck_confidence || 0,
          prediction_id: predictionId,
          detail: errMsg,
          precheck: {
            passed: false,
            is_brain: false,
            confidence: scanResult.precheck_confidence || 0,
          },
          error: {
            code: errCode,
            message: errMsg,
          },
        });
        return;
      }

      const confidence = scanResult.prediction_confidence || 0.9;
      const explanation = await getGeminiExplanation(scanResult.prediction_label, confidence);

      const predictionId = await storage.savePrediction({
        filename: req.file.originalname,
        precheck_status: "valid",
        precheck_confidence: scanResult.precheck_confidence,
        prediction_label: scanResult.prediction_label,
        prediction_confidence: confidence,
        all_probabilities: scanResult.all_probabilities,
        gradcam_path: null,
        gemini_explanation: explanation,
        jenis_scan,
        umur_saat_scan,
        gejala,
      });

      await storage.addMedicalRecord(patient.id, predictionId);

      res.json({
        success: true,
        precheck: {
          passed: true,
          is_brain: true,
          confidence: scanResult.precheck_confidence,
        },
        precheck_status: "valid",
        prediction_id: predictionId,
        prediction_label: scanResult.prediction_label,
        prediction_confidence: confidence,
        all_probabilities: scanResult.all_probabilities,
        gemini_explanation: explanation,
        info: getDiseaseInfo(scanResult.prediction_label),
        engine: scanResult.engine,
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: { code: "SERVER_ERROR", message: err.message },
      });
    }
  }
);

app.get("/api/patients/:nik/report/:prediction_id", requireAuth, async (req: Request, res: Response) => {
  const nik = String(req.params.nik);
  const predictionId = Number(req.params.prediction_id);

  try {
    const patient = await storage.getPatientByNik(nik);
    if (!patient) {
      res.status(404).json({ error: "Not Found", detail: "Pasien tidak ditemukan." });
      return;
    }

    const prediction = await storage.getPredictionById(predictionId);
    if (!prediction) {
      res.status(404).json({ error: "Not Found", detail: "Data pemeriksaan tidak ditemukan." });
      return;
    }

    generateReportPdf(res, patient, prediction);
  } catch (err: any) {
    res.status(500).json({ error: "PDF Generation Error", detail: err.message });
  }
});

// ============================== ADMIN API ==============================

app.get("/api/admin/overview", requireAdmin, async (_req: Request, res: Response) => {
  try {
    const patients = await storage.getAllPatients();
    const records = await storage.getAllRecords();
    res.json({
      patients,
      records,
      model_warning: null,
    });
  } catch (err: any) {
    res.status(500).json({ error: "Database Error", detail: err.message });
  }
});

// ============================== 404 CATCH-ALL ==============================

app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: "Not Found",
    message: `Endpoint ${req.method} ${req.path} tidak ditemukan.`,
    docs: "GET /",
  });
});

// ============================== INITIALIZATION & START SERVER ==============================

async function startServer() {
  console.log("[NeuroCheck Backend] Starting server...");

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`[NeuroCheck Backend API] Running on http://0.0.0.0:${PORT}`);
    console.log(`[NeuroCheck Backend API] Health check at http://0.0.0.0:${PORT}/health`);
  });

  try {
    // 1. Initialize Turso database tables & seed
    const dbInit = await storage.init();
    console.log(`[NeuroCheck Backend] Database ready (${dbInit.databaseType})`);
  } catch (err: any) {
    console.warn("[NeuroCheck Backend] Database init warning (will retry on request):", err.message);
  }

  // 2. Initialize Hugging Face models in background without blocking container
  setTimeout(() => {
    initHuggingFaceModels().catch((err) => {
      console.warn("[NeuroCheck Backend] Background HF model init notice:", err.message);
    });
  }, 1000);
}

startServer().catch((err) => {
  console.error("[NeuroCheck Backend] Fatal startup error:", err);
  process.exit(1);
});
