import {
  type UserRecord as User,
  type PatientRecord as Patient,
  type PredictionRecord as Prediction,
  type MedicalRecordEntry as MedicalRecord,
  type MedicalRecordDetail,
  initDatabase,
  checkDbHealth,
  dbGetUserByEmail,
  dbUpsertUser,
  dbGetAllPatients,
  dbGetPatientByNik,
  dbGetPatientById,
  dbCreatePatient,
  dbSavePrediction,
  dbGetPredictionById,
  dbAddMedicalRecord,
  dbGetRecordsByPatient,
  dbGetAllRecords,
} from "./tursoDb.js";

export { User, Patient, Prediction, MedicalRecord, MedicalRecordDetail };

class StorageService {
  async init() {
    return await initDatabase();
  }

  async checkHealth() {
    return await checkDbHealth();
  }

  async getUserByEmail(email: string): Promise<User | null> {
    return await dbGetUserByEmail(email);
  }

  async upsertUser(data: { email: string; name?: string; role?: string }): Promise<User> {
    return await dbUpsertUser(data);
  }

  async getAllPatients(): Promise<Patient[]> {
    return await dbGetAllPatients();
  }

  async getPatientByNik(nik: string): Promise<Patient | null> {
    return await dbGetPatientByNik(nik);
  }

  async getPatientById(id: number): Promise<Patient | null> {
    return await dbGetPatientById(id);
  }

  async createPatient(data: {
    nik: string;
    nama: string;
    tanggal_lahir: string;
    jenis_kelamin: string;
    alamat?: string;
    no_telepon?: string;
    created_by_email?: string;
  }): Promise<number | null> {
    return await dbCreatePatient(data);
  }

  async savePrediction(data: Omit<Prediction, "id" | "upload_time">): Promise<number> {
    return await dbSavePrediction(data);
  }

  async getPredictionById(id: number): Promise<Prediction | null> {
    return await dbGetPredictionById(id);
  }

  async addMedicalRecord(patientId: number, predictionId: number, catatan?: string): Promise<number> {
    return await dbAddMedicalRecord(patientId, predictionId, catatan);
  }

  async getRecordsByPatient(patientId: number): Promise<MedicalRecordDetail[]> {
    return await dbGetRecordsByPatient(patientId);
  }

  async getAllRecords(): Promise<MedicalRecordDetail[]> {
    return await dbGetAllRecords();
  }
}

export const storage = new StorageService();
