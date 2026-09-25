import { createClient, type Client } from "@libsql/client";
import path from "path";
import fs from "fs";
import { MAIN_CLASSES, DISEASE_INFO } from "./diseaseInfo.js";

export interface UserRecord {
  id: number;
  email: string;
  name?: string;
  username?: string;
  role: string;
  created_at: string;
}

export interface PatientRecord {
  id: number;
  nik: string;
  nama: string;
  tanggal_lahir: string;
  jenis_kelamin: string;
  alamat?: string;
  no_telepon?: string;
  created_at: string;
  created_by_email?: string;
}

export interface PredictionRecord {
  id: number;
  filename: string;
  upload_time: string;
  precheck_status: "valid" | "invalid";
  precheck_confidence: number;
  prediction_label?: string | null;
  prediction_confidence?: number | null;
  all_probabilities?: Record<string, number> | null;
  gradcam_path?: string | null;
  gemini_explanation?: string | null;
  jenis_scan?: string;
  umur_saat_scan?: string;
  gejala?: string;
}

export interface MedicalRecordEntry {
  id: number;
  patient_id: number;
  prediction_id: number;
  catatan_dokter?: string | null;
  created_at: string;
}

export interface MedicalRecordDetail extends MedicalRecordEntry {
  filename?: string;
  prediction_label?: string | null;
  prediction_confidence?: number | null;
  gemini_explanation?: string | null;
  gradcam_path?: string | null;
  precheck_status?: string;
  jenis_scan?: string;
  umur_saat_scan?: string;
  gejala?: string;
  nik?: string;
  nama_pasien?: string;
}

// Database client configuration
const tursoUrl = process.env.TURSO_DATABASE_URL?.trim();
const tursoAuthToken = process.env.TURSO_AUTH_TOKEN?.trim();

// Ensure local data dir exists if fallback is used
const localDataDir = path.resolve(process.cwd(), "data");
if (!fs.existsSync(localDataDir)) {
  try {
    fs.mkdirSync(localDataDir, { recursive: true });
  } catch {}
}

const dbUrl = tursoUrl || "file:data/brainscan.db";
const isTurso = Boolean(tursoUrl && tursoUrl.startsWith("libsql:"));

// Persistent reusable client instance
export const db: Client = createClient({
  url: dbUrl,
  authToken: isTurso ? tursoAuthToken : undefined,
});

let dbInitialized = false;

/**
 * Initialize and migrate Turso database tables if they do not exist
 */
export async function initDatabase(): Promise<{
  success: boolean;
  databaseType: "turso" | "local_sqlite";
  tablesCreated: string[];
  error?: string;
}> {
  if (dbInitialized) {
    return {
      success: true,
      databaseType: isTurso ? "turso" : "local_sqlite",
      tablesCreated: ["patients", "predictions", "medical_records", "users", "disease_info"],
    };
  }

  try {
    // 1. Table: patients
    await db.execute(`
      CREATE TABLE IF NOT EXISTS patients (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nik TEXT UNIQUE NOT NULL,
        nama TEXT NOT NULL,
        tanggal_lahir TEXT NOT NULL,
        jenis_kelamin TEXT NOT NULL,
        alamat TEXT,
        no_telepon TEXT,
        created_at TEXT NOT NULL,
        created_by_email TEXT
      );
    `);

    // 2. Table: predictions
    await db.execute(`
      CREATE TABLE IF NOT EXISTS predictions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename TEXT NOT NULL,
        upload_time TEXT NOT NULL,
        precheck_status TEXT NOT NULL,
        precheck_confidence REAL NOT NULL,
        prediction_label TEXT,
        prediction_confidence REAL,
        all_probabilities TEXT,
        gradcam_path TEXT,
        gemini_explanation TEXT,
        jenis_scan TEXT,
        umur_saat_scan TEXT,
        gejala TEXT
      );
    `);

    // 3. Table: medical_records
    await db.execute(`
      CREATE TABLE IF NOT EXISTS medical_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        patient_id INTEGER NOT NULL,
        prediction_id INTEGER NOT NULL,
        catatan_dokter TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (patient_id) REFERENCES patients(id),
        FOREIGN KEY (prediction_id) REFERENCES predictions(id)
      );
    `);

    // 4. Table: users
    await db.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE,
        username TEXT UNIQUE,
        password_hash TEXT,
        name TEXT,
        role TEXT NOT NULL DEFAULT 'user',
        created_at TEXT NOT NULL
      );
    `);

    // 5. Table: disease_info
    await db.execute(`
      CREATE TABLE IF NOT EXISTS disease_info (
        class_key TEXT PRIMARY KEY,
        nama_tampilan TEXT NOT NULL,
        urgensi TEXT NOT NULL,
        temuan TEXT NOT NULL,
        analisis TEXT NOT NULL,
        rekomendasi TEXT NOT NULL,
        spesialis TEXT NOT NULL
      );
    `);

    // Seed disease info if table is empty
    const diseaseCheck = await db.execute("SELECT COUNT(*) as count FROM disease_info");
    const diseaseCount = Number(diseaseCheck.rows[0]?.count || 0);
    if (diseaseCount === 0) {
      for (const [classKey, info] of Object.entries(DISEASE_INFO)) {
        await db.execute({
          sql: `
            INSERT OR IGNORE INTO disease_info (class_key, nama_tampilan, urgensi, temuan, analisis, rekomendasi, spesialis)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `,
          args: [
            classKey,
            info.nama_tampilan,
            info.urgensi,
            JSON.stringify(info.temuan),
            JSON.stringify(info.analisis),
            JSON.stringify(info.rekomendasi),
            info.spesialis,
          ],
        });
      }
    }

    // Seed initial demo patient & prediction if table is empty
    const patientCheck = await db.execute("SELECT COUNT(*) as count FROM patients");
    const patientCount = Number(patientCheck.rows[0]?.count || 0);

    if (patientCount === 0) {
      // Check if store.json exists to migrate existing data
      const storeFile = path.resolve(process.cwd(), "data", "store.json");
      if (fs.existsSync(storeFile)) {
        try {
          const raw = fs.readFileSync(storeFile, "utf-8");
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed.patients)) {
            for (const p of parsed.patients) {
              await db.execute({
                sql: `
                  INSERT OR IGNORE INTO patients (id, nik, nama, tanggal_lahir, jenis_kelamin, alamat, no_telepon, created_at, created_by_email)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                `,
                args: [
                  p.id,
                  p.nik,
                  p.nama,
                  p.tanggal_lahir,
                  p.jenis_kelamin,
                  p.alamat || "",
                  p.no_telepon || "",
                  p.created_at,
                  p.created_by_email || "",
                ],
              });
            }
          }
          if (Array.isArray(parsed.predictions)) {
            for (const pr of parsed.predictions) {
              await db.execute({
                sql: `
                  INSERT OR IGNORE INTO predictions (id, filename, upload_time, precheck_status, precheck_confidence, prediction_label, prediction_confidence, all_probabilities, gradcam_path, gemini_explanation, jenis_scan, umur_saat_scan, gejala)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `,
                args: [
                  pr.id,
                  pr.filename,
                  pr.upload_time,
                  pr.precheck_status,
                  pr.precheck_confidence,
                  pr.prediction_label || null,
                  pr.prediction_confidence || null,
                  pr.all_probabilities ? JSON.stringify(pr.all_probabilities) : null,
                  pr.gradcam_path || null,
                  pr.gemini_explanation || null,
                  pr.jenis_scan || "",
                  pr.umur_saat_scan || "",
                  pr.gejala || "",
                ],
              });
            }
          }
          if (Array.isArray(parsed.records)) {
            for (const r of parsed.records) {
              await db.execute({
                sql: `
                  INSERT OR IGNORE INTO medical_records (id, patient_id, prediction_id, catatan_dokter, created_at)
                  VALUES (?, ?, ?, ?, ?)
                `,
                args: [r.id, r.patient_id, r.prediction_id, r.catatan_dokter || null, r.created_at],
              });
            }
          }
        } catch (e) {
          console.warn("[Turso DB] Could not migrate store.json:", e);
        }
      }
    }

    dbInitialized = true;
    console.log(`[Turso DB] Initialized successfully with target: ${isTurso ? "Turso Cloud" : "Local SQLite"}`);
    return {
      success: true,
      databaseType: isTurso ? "turso" : "local_sqlite",
      tablesCreated: ["patients", "predictions", "medical_records", "users", "disease_info"],
    };
  } catch (err: any) {
    console.error("[Turso DB] Initialization error:", err);
    return {
      success: false,
      databaseType: isTurso ? "turso" : "local_sqlite",
      tablesCreated: [],
      error: err.message,
    };
  }
}

/**
 * Health check verification for database connectivity
 */
export async function checkDbHealth(): Promise<{
  connected: boolean;
  database_type: "turso" | "local_sqlite";
  is_turso: boolean;
  latency_ms: number;
  error: string | null;
}> {
  const start = Date.now();
  try {
    await db.execute("SELECT 1 as ping");
    return {
      connected: true,
      database_type: isTurso ? "turso" : "local_sqlite",
      is_turso: isTurso,
      latency_ms: Date.now() - start,
      error: null,
    };
  } catch (err: any) {
    return {
      connected: false,
      database_type: isTurso ? "turso" : "local_sqlite",
      is_turso: isTurso,
      latency_ms: Date.now() - start,
      error: err.message || "Failed to query database",
    };
  }
}

// ============================== DATABASE OPERATIONS ==============================

export async function dbGetUserByEmail(email: string): Promise<UserRecord | null> {
  await initDatabase();
  const normalizedEmail = email.trim().toLowerCase();
  const result = await db.execute({
    sql: "SELECT * FROM users WHERE LOWER(email) = ? LIMIT 1",
    args: [normalizedEmail],
  });
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return {
    id: Number(row.id),
    email: String(row.email),
    name: row.name ? String(row.name) : undefined,
    username: row.username ? String(row.username) : undefined,
    role: String(row.role || "user"),
    created_at: String(row.created_at),
  };
}

export async function dbUpsertUser(data: {
  email: string;
  name?: string;
  role?: string;
}): Promise<UserRecord> {
  await initDatabase();
  const normalizedEmail = data.email.trim().toLowerCase();
  const displayName = data.name?.trim() || "";
  const role = data.role || "user";
  const now = new Date().toISOString().slice(0, 19).replace("T", " ");

  const existing = await dbGetUserByEmail(normalizedEmail);
  if (existing) {
    if (displayName && (!existing.name || existing.name === "Pengguna NeuroCheck")) {
      await db.execute({
        sql: "UPDATE users SET name = ? WHERE id = ?",
        args: [displayName, existing.id],
      });
      existing.name = displayName;
    }
    return existing;
  }

  const result = await db.execute({
    sql: `
      INSERT INTO users (email, name, role, created_at)
      VALUES (?, ?, ?, ?)
    `,
    args: [normalizedEmail, displayName, role, now],
  });

  return {
    id: Number(result.lastInsertRowid),
    email: normalizedEmail,
    name: displayName,
    role,
    created_at: now,
  };
}

export async function dbGetAllPatients(): Promise<PatientRecord[]> {
  await initDatabase();
  const result = await db.execute("SELECT * FROM patients ORDER BY id DESC");
  return result.rows.map((row) => ({
    id: Number(row.id),
    nik: String(row.nik),
    nama: String(row.nama),
    tanggal_lahir: String(row.tanggal_lahir),
    jenis_kelamin: String(row.jenis_kelamin),
    alamat: row.alamat ? String(row.alamat) : "",
    no_telepon: row.no_telepon ? String(row.no_telepon) : "",
    created_at: String(row.created_at),
    created_by_email: row.created_by_email ? String(row.created_by_email) : "",
  }));
}

export async function dbGetPatientByNik(nik: string): Promise<PatientRecord | null> {
  await initDatabase();
  const result = await db.execute({
    sql: "SELECT * FROM patients WHERE nik = ? LIMIT 1",
    args: [nik],
  });
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return {
    id: Number(row.id),
    nik: String(row.nik),
    nama: String(row.nama),
    tanggal_lahir: String(row.tanggal_lahir),
    jenis_kelamin: String(row.jenis_kelamin),
    alamat: row.alamat ? String(row.alamat) : "",
    no_telepon: row.no_telepon ? String(row.no_telepon) : "",
    created_at: String(row.created_at),
    created_by_email: row.created_by_email ? String(row.created_by_email) : "",
  };
}

export async function dbGetPatientById(id: number): Promise<PatientRecord | null> {
  await initDatabase();
  const result = await db.execute({
    sql: "SELECT * FROM patients WHERE id = ? LIMIT 1",
    args: [id],
  });
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return {
    id: Number(row.id),
    nik: String(row.nik),
    nama: String(row.nama),
    tanggal_lahir: String(row.tanggal_lahir),
    jenis_kelamin: String(row.jenis_kelamin),
    alamat: row.alamat ? String(row.alamat) : "",
    no_telepon: row.no_telepon ? String(row.no_telepon) : "",
    created_at: String(row.created_at),
    created_by_email: row.created_by_email ? String(row.created_by_email) : "",
  };
}

export async function dbCreatePatient(data: {
  nik: string;
  nama: string;
  tanggal_lahir: string;
  jenis_kelamin: string;
  alamat?: string;
  no_telepon?: string;
  created_by_email?: string;
}): Promise<number | null> {
  await initDatabase();

  // Check duplicate NIK
  const existing = await dbGetPatientByNik(data.nik);
  if (existing) {
    return null; // Duplicate
  }

  const now = new Date().toISOString().slice(0, 19).replace("T", " ");
  const result = await db.execute({
    sql: `
      INSERT INTO patients (nik, nama, tanggal_lahir, jenis_kelamin, alamat, no_telepon, created_at, created_by_email)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    args: [
      data.nik,
      data.nama,
      data.tanggal_lahir,
      data.jenis_kelamin,
      data.alamat || "",
      data.no_telepon || "",
      now,
      data.created_by_email || "",
    ],
  });

  return Number(result.lastInsertRowid);
}

export async function dbSavePrediction(data: {
  filename: string;
  precheck_status: "valid" | "invalid";
  precheck_confidence: number;
  prediction_label?: string | null;
  prediction_confidence?: number | null;
  all_probabilities?: Record<string, number> | null;
  gradcam_path?: string | null;
  gemini_explanation?: string | null;
  jenis_scan?: string;
  umur_saat_scan?: string;
  gejala?: string;
}): Promise<number> {
  await initDatabase();
  const now = new Date().toISOString().slice(0, 19).replace("T", " ");
  const probsStr = data.all_probabilities ? JSON.stringify(data.all_probabilities) : null;

  const result = await db.execute({
    sql: `
      INSERT INTO predictions (
        filename, upload_time, precheck_status, precheck_confidence,
        prediction_label, prediction_confidence, all_probabilities,
        gradcam_path, gemini_explanation, jenis_scan, umur_saat_scan, gejala
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    args: [
      data.filename,
      now,
      data.precheck_status,
      data.precheck_confidence,
      data.prediction_label || null,
      data.prediction_confidence || null,
      probsStr,
      data.gradcam_path || null,
      data.gemini_explanation || null,
      data.jenis_scan || "",
      data.umur_saat_scan || "",
      data.gejala || "",
    ],
  });

  return Number(result.lastInsertRowid);
}

export async function dbGetPredictionById(id: number): Promise<PredictionRecord | null> {
  await initDatabase();
  const result = await db.execute({
    sql: "SELECT * FROM predictions WHERE id = ? LIMIT 1",
    args: [id],
  });
  if (result.rows.length === 0) return null;
  const row = result.rows[0];

  let parsedProbs: Record<string, number> | null = null;
  if (row.all_probabilities && typeof row.all_probabilities === "string") {
    try {
      parsedProbs = JSON.parse(row.all_probabilities);
    } catch {}
  }

  return {
    id: Number(row.id),
    filename: String(row.filename),
    upload_time: String(row.upload_time),
    precheck_status: (row.precheck_status as "valid" | "invalid") || "valid",
    precheck_confidence: Number(row.precheck_confidence),
    prediction_label: row.prediction_label ? String(row.prediction_label) : null,
    prediction_confidence: row.prediction_confidence !== null ? Number(row.prediction_confidence) : null,
    all_probabilities: parsedProbs,
    gradcam_path: row.gradcam_path ? String(row.gradcam_path) : null,
    gemini_explanation: row.gemini_explanation ? String(row.gemini_explanation) : null,
    jenis_scan: row.jenis_scan ? String(row.jenis_scan) : "",
    umur_saat_scan: row.umur_saat_scan ? String(row.umur_saat_scan) : "",
    gejala: row.gejala ? String(row.gejala) : "",
  };
}

export async function dbAddMedicalRecord(
  patientId: number,
  predictionId: number,
  catatan?: string
): Promise<number> {
  await initDatabase();
  const now = new Date().toISOString().slice(0, 19).replace("T", " ");
  const result = await db.execute({
    sql: `
      INSERT INTO medical_records (patient_id, prediction_id, catatan_dokter, created_at)
      VALUES (?, ?, ?, ?)
    `,
    args: [patientId, predictionId, catatan || null, now],
  });
  return Number(result.lastInsertRowid);
}

export async function dbGetRecordsByPatient(patientId: number): Promise<MedicalRecordDetail[]> {
  await initDatabase();
  const result = await db.execute({
    sql: `
      SELECT 
        m.id, m.patient_id, m.prediction_id, m.catatan_dokter, m.created_at,
        p.filename, p.prediction_label, p.prediction_confidence, p.gemini_explanation,
        p.gradcam_path, p.precheck_status, p.jenis_scan, p.umur_saat_scan, p.gejala
      FROM medical_records m
      LEFT JOIN predictions p ON m.prediction_id = p.id
      WHERE m.patient_id = ?
      ORDER BY m.id DESC
    `,
    args: [patientId],
  });

  return result.rows.map((row) => ({
    id: Number(row.id),
    patient_id: Number(row.patient_id),
    prediction_id: Number(row.prediction_id),
    catatan_dokter: row.catatan_dokter ? String(row.catatan_dokter) : null,
    created_at: String(row.created_at),
    filename: row.filename ? String(row.filename) : undefined,
    prediction_label: row.prediction_label ? String(row.prediction_label) : null,
    prediction_confidence: row.prediction_confidence !== null ? Number(row.prediction_confidence) : null,
    gemini_explanation: row.gemini_explanation ? String(row.gemini_explanation) : null,
    gradcam_path: row.gradcam_path ? String(row.gradcam_path) : null,
    precheck_status: row.precheck_status ? String(row.precheck_status) : undefined,
    jenis_scan: row.jenis_scan ? String(row.jenis_scan) : undefined,
    umur_saat_scan: row.umur_saat_scan ? String(row.umur_saat_scan) : undefined,
    gejala: row.gejala ? String(row.gejala) : undefined,
  }));
}

export async function dbGetAllRecords(): Promise<MedicalRecordDetail[]> {
  await initDatabase();
  const result = await db.execute(`
    SELECT 
      m.id, m.patient_id, m.prediction_id, m.catatan_dokter, m.created_at,
      pt.nik, pt.nama as nama_pasien,
      p.filename, p.prediction_label, p.prediction_confidence, p.gemini_explanation,
      p.gradcam_path, p.precheck_status
    FROM medical_records m
    LEFT JOIN patients pt ON m.patient_id = pt.id
    LEFT JOIN predictions p ON m.prediction_id = p.id
    ORDER BY m.id DESC
  `);

  return result.rows.map((row) => ({
    id: Number(row.id),
    patient_id: Number(row.patient_id),
    prediction_id: Number(row.prediction_id),
    catatan_dokter: row.catatan_dokter ? String(row.catatan_dokter) : null,
    created_at: String(row.created_at),
    nik: row.nik ? String(row.nik) : undefined,
    nama_pasien: row.nama_pasien ? String(row.nama_pasien) : undefined,
    filename: row.filename ? String(row.filename) : undefined,
    prediction_label: row.prediction_label ? String(row.prediction_label) : null,
    prediction_confidence: row.prediction_confidence !== null ? Number(row.prediction_confidence) : null,
    gemini_explanation: row.gemini_explanation ? String(row.gemini_explanation) : null,
    gradcam_path: row.gradcam_path ? String(row.gradcam_path) : null,
    precheck_status: row.precheck_status ? String(row.precheck_status) : undefined,
  }));
}
