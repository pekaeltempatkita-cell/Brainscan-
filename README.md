# NeuroCheck — Sistem Skrining Penyakit Otak Berbasis AI

Arsitektur final: **3 layanan terpisah**, masing-masing di-deploy sendiri-sendiri:

```
[GitHub Pages]  --fetch()-->  [Hugging Face Spaces: Docker]  --startup-->  [Hugging Face Hub]
   docs/                           backend (FastAPI + onnxruntime)          file .onnx model
   (statis, HTML/JS)                       |
                                            v
                                      [Turso] (database)
```

## 1. Struktur Folder

```
Brain_Ai_Project/
├── docs/                          # <-- DEPLOY TERPISAH ke GitHub Pages (nama HARUS "docs", limitasi GitHub Pages)
│   ├── index.html                 # Beranda + login Google
│   ├── dashboard.html             # daftar/cari pasien
│   ├── patient.html               # upload scan + hasil + riwayat
│   ├── admin.html                 # login admin + panel admin
│   ├── informasi.html
│   ├── css/style.css
│   └── js/{config,api,auth}.js
├── data/
│   └── brainscan.db               # SQLite lokal (dev only). Produksi pakai Turso.
├── onnx_models/                   # hasil export ONNX ditaruh sini (lokal, di Colab)
├── outputs/
│   ├── checkpoints/                # opsional: taruh .onnx di sini buat testing lokal
│   └── reports/                    # PDF laporan otomatis tersimpan di sini
├── scripts/
│   ├── export_to_onnx.py          # convert .pth -> .onnx (jalankan di Colab, butuh torch)
│   └── upload_to_hf.py            # upload .onnx ke Hugging Face Hub
├── src/                            # <-- DEPLOY TERPISAH ke Hugging Face Spaces (Docker)
│   ├── app.py                     # entry point FastAPI -- API MURNI (JSON), bukan render HTML
│   ├── auth.py                    # JWT auth (verifikasi Google ID token + login admin)
│   ├── api.py                     # endpoint JSON /api/health, /api/classes, /api/predict
│   ├── config.py                  # semua path & konstanta (kelas, ukuran gambar, dll)
│   ├── database.py                # akses data -- Turso ATAU SQLite lokal (auto-detect)
│   ├── inference.py               # load model ONNX (dari HF Hub) & jalankan prediksi
│   ├── explainability.py          # Grad-CAM versi TORCH LAMA (nonaktif di versi ONNX)
│   ├── preprocess.py              # ubah gambar upload -> numpy array siap model (tanpa torch)
│   ├── gemini_client.py           # penjelasan medis (Gemini, ada fallback offline)
│   ├── prompts.py                 # template prompt buat Gemini
│   ├── disease_info.py            # konten klinis per kelas (dipakai laporan PDF & /api/disease-info)
│   ├── report_generator.py        # generate laporan PDF
│   └── models/                    # arsitektur PyTorch (dipakai scripts/export_to_onnx.py SAJA)
├── Dockerfile                      # buat build image HF Space
├── .dockerignore
├── README_HF_SPACE.md              # README KHUSUS buat ditaruh di repo HF Space (ada YAML metadata)
├── requirements.txt                 # deps BACKEND PRODUKSI (ringan, tanpa torch)
└── requirements-export.txt          # deps buat scripts/export_to_onnx.py (ada torch, dipakai di Colab)
```

## 2. Alur Aplikasi

1. **Beranda** (`docs/index.html`) — landing page, tombol "Sign in with Google"
   (Google Identity Services, LANGSUNG di browser, bukan redirect ke backend).
2. Frontend kirim ID token Google itu ke `POST /api/auth/google` → backend verifikasi
   → backend balikin **JWT sendiri** → frontend simpan JWT itu di `localStorage`.
3. Semua request selanjutnya ke backend nyisipin header `Authorization: Bearer <jwt>`.
4. **Dashboard** (`dashboard.html`) — daftarkan pasien baru / cari pasien yang sudah ada.
5. **Halaman Pasien** (`patient.html?nik=...`) — upload scan (+ jenis scan/umur/gejala) →
   `POST /api/patients/{nik}/upload` → precheck model (cek: ini citra otak?) → kalau
   valid, model utama klasifikasi ke salah satu dari 10 kelas → penjelasan dari Gemini
   (atau fallback offline) → semua tersimpan ke database → hasil balik sebagai JSON,
   dirender oleh JS di frontend.
6. Tombol **Unduh Laporan (PDF)** manggil `GET /api/patients/{nik}/report/{id}` dengan
   token di query string (`?token=...`), karena link yang diklik langsung di browser
   gak bisa nyisipin header custom.
7. **Panel Admin** (`admin.html`) — login username/password terpisah → `GET
   /api/admin/overview` → lihat SEMUA pasien & riwayat pemeriksaan.

## 3. Cara Menjalankan LOKAL (development, backend + docs/ di komputer sendiri)

```bash
# ---- BACKEND ----
cd Brain_Ai_Project
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
# edit .env: isi SESSION_SECRET_KEY, GOOGLE_CLIENT_ID, ADMIN_USERNAME/PASSWORD, dst.

# Siapkan model (2 opsi):
#  A) Testing cepat: taruh file .onnx (hasil export_to_onnx.py) di outputs/checkpoints/
#  B) Upload ke Hugging Face Hub dulu, isi HF_REPO_ID di .env (lihat bagian 5)

cd src
uvicorn app:app --reload
# backend jalan di http://localhost:8000
```

```bash
# ---- FRONTEND (di terminal LAIN) ----
cd Brain_Ai_Project/docs
# edit js/config.js -> API_BASE_URL = "http://localhost:8000", isi GOOGLE_CLIENT_ID
python -m http.server 5500
# buka http://localhost:5500 di browser
```

> Kalau file `.onnx` belum ada, backend **tetap bisa jalan** (gak crash) --
> semua endpoint lain tetap bisa dites, tapi upload gambar buat dianalisis akan
> balikin error 503 dengan pesan yang jelas.

## 4. Deploy PRODUKSI

### A) Model → export ONNX di Google Colab, lalu upload ke Hugging Face Hub

Di **Google Colab** (bukan di backend produksi):
```python
!git clone <url-repo-github-kamu>
%cd nama-repo
!pip install -r requirements-export.txt
!python scripts/export_to_onnx.py
```
Ini bikin folder `onnx_models/` isi `precheck_brain_gate.onnx` dan
`hybrid_vit_efficientnet_brain.onnx`, sekaligus otomatis cek angka
keluarannya sama persis dengan versi PyTorch aslinya.

Upload ke Hugging Face Hub (masih di Colab, atau di komputer sendiri):
```bash
huggingface-cli login
# edit HF_REPO_ID di scripts/upload_to_hf.py dulu
python scripts/upload_to_hf.py
```

### B) Database → Turso

Kamu sudah bikin database `brainscan` (grup `brain-project`) di Turso Cloud.
Ambil URL & token-nya:
```bash
turso db show brainscan --url
turso db tokens create brainscan
```
Simpan hasilnya, dipakai di secrets HF Space (langkah C).

### C) Backend → Hugging Face Spaces (Docker)

1. Buat Space baru di https://huggingface.co/new-space, pilih **SDK: Docker**.
2. Push isi project ini (minimal: `Dockerfile`, `requirements.txt`, `src/`) ke
   repo Space itu (repo Git terpisah dari GitHub kamu):
   ```bash
   git remote add space https://huggingface.co/spaces/<username>/<nama-space>
   git push space main
   ```
3. Ganti nama `README_HF_SPACE.md` jadi `README.md` KHUSUS di repo Space itu
   (HF Spaces WAJIB baca metadata YAML dari `README.md` di root repo Space).
4. Di halaman Space → **Settings → Variables and secrets**, isi semua secret
   yang didaftar di `README_HF_SPACE.md` (SESSION_SECRET_KEY, GOOGLE_CLIENT_ID,
   ADMIN_USERNAME/PASSWORD, FRONTEND_ORIGIN, HF_REPO_ID, TURSO_DATABASE_URL,
   TURSO_AUTH_TOKEN, dst).
5. Space otomatis build & jalan. Cek `https://<username>-<nama-space>.hf.space/api/health`.

### D) Frontend → GitHub Pages

1. Edit `docs/js/config.js`:
   ```js
   const API_BASE_URL = "https://<username>-<nama-space>.hf.space";
   const GOOGLE_CLIENT_ID = "...apps.googleusercontent.com";
   ```
2. Push seluruh project (termasuk folder `docs/`) ke repo GitHub kamu.
3. Repo → Settings → Pages → Source: "Deploy from a branch" → Branch: `main`, folder: **`/docs`**
   (GitHub Pages CUMA punya pilihan `/ (root)` atau `/docs` di dropdown -- makanya foldernya dinamain `docs`, bukan `frontend`).
4. Di Google Cloud Console (OAuth Client ID kamu) → **Authorized JavaScript
   origins** → tambahkan URL GitHub Pages kamu (`https://username.github.io`).
5. Balik lagi ke secret `FRONTEND_ORIGIN` di HF Space (langkah C.4), isi persis
   URL GitHub Pages ini biar CORS-nya diizinkan backend.

## 5. Hal Penting yang Perlu Diperhatikan

### a) Daftar 10 kelas

`config.py` (`MAIN_CLASSES`) HARUS persis sama urutannya dengan waktu training:
*Alzheimer Mild, Alzheimer Moderate, Alzheimer Very Mild, Intracranial
Hemorrhage, Multiple Sclerosis, Normal, Stroke Iskemik, Tumor Glioma, Tumor
Meningioma, Tumor Pituitary.* Kalau beda urutan dari saat training, hasil
prediksi akan salah label walau angkanya tetap "kelihatan masuk akal".

### b) Data pasien = data pribadi & medis sensitif (NIK, dsb)

- Jangan commit `data/brainscan.db` ke Git (`.gitignore` sudah nge-cover ini).
- Turso di produksi jauh lebih aman daripada file SQLite polos.
- Batasi siapa saja yang punya kredensial `ADMIN_USERNAME`/`ADMIN_PASSWORD`.
- `SESSION_SECRET_KEY` dipakai buat sign JWT -- kalau bocor, orang bisa bikin
  token palsu. Simpan sebagai secret, jangan pernah di-commit.

### c) `IMG_SIZE` dan preprocessing

Pastikan `IMG_SIZE`, `IMAGENET_MEAN`/`STD`, dan pipeline CLAHE di
`preprocess.py` **persis sama** dengan yang dipakai waktu training model.

### d) Grad-CAM (heatmap) nonaktif sementara

Grad-CAM versi lama butuh gradient/backward pass yang gak tersedia di
`onnxruntime` biasa. Alternatif kalau mau tetap ada heatmap: Score-CAM
(gradient-free, tapi lebih berat compute-nya) -- bisa dikerjakan terpisah
kalau dibutuhkan.

### e) CORS & keamanan tambahan

- `FRONTEND_ORIGIN=*` (default di `.env.example`) itu buat development. Di
  produksi, WAJIB diganti ke URL GitHub Pages kamu yang spesifik.
- Endpoint laporan PDF nerima token lewat `?token=` di URL (selain header
  `Authorization`) khusus karena link diklik langsung oleh browser. Efeknya:
  URL laporan itu sendiri jadi "rahasia" (siapa pun yang pegang link + token
  yang belum expired bisa buka), sama seperti kebanyakan link "shareable"
  berbasis token pada umumnya. Token expired otomatis dalam 7 hari.
