---
title: NeuroCheck Backend
emoji: 🧠
colorFrom: blue
colorTo: indigo
sdk: docker
app_port: 7860
pinned: false
---

# NeuroCheck Backend (API)

Backend API untuk NeuroCheck — sistem skrining penyakit otak berbasis AI.
Ini **bukan** halaman yang bisa dibuka langsung di browser (gak ada
tampilan HTML) -- ini murni JSON API yang dipanggil oleh frontend statis
(di-deploy terpisah ke GitHub Pages).

Cek endpoint kesehatan: `GET /api/health`

Dokumentasi otomatis (Swagger UI) tersedia di `/docs`.

---

## PENTING sebelum dipakai

Space ini butuh Repository Secrets berikut diisi (Settings → Variables and
secrets di halaman Space kamu):

| Nama Secret | Wajib? | Keterangan |
|---|---|---|
| `SESSION_SECRET_KEY` | Wajib | String acak panjang buat sign JWT |
| `GOOGLE_CLIENT_ID` | Wajib | Buat verifikasi login Google dari frontend |
| `ADMIN_USERNAME` | Wajib | Username login admin |
| `ADMIN_PASSWORD` | Wajib | Password login admin |
| `FRONTEND_ORIGIN` | Wajib | URL GitHub Pages kamu, contoh: `https://username.github.io` |
| `HF_REPO_ID` | Wajib | Repo Hugging Face tempat file `.onnx` model disimpan |
| `HF_PRECHECK_FILENAME` | Wajib | Default: `precheck_brain_gate.onnx` |
| `HF_MAIN_MODEL_FILENAME` | Wajib | Default: `hybrid_vit_efficientnet_brain.onnx` |
| `HF_TOKEN` | Opsional | Isi kalau repo model-nya PRIVATE |
| `TURSO_DATABASE_URL` | Wajib (produksi) | Dari `turso db show brainscan --url` |
| `TURSO_AUTH_TOKEN` | Wajib (produksi) | Dari `turso db tokens create brainscan` |
| `GEMINI_API_KEY` | Opsional | Kosongkan = otomatis pakai penjelasan offline |

> Catatan file ini: file `README_HF_SPACE.md` ini isinya KHUSUS buat
> ditaruh sebagai `README.md` di repo Hugging Face Space kamu (repo Git yang
> TERPISAH dari repo GitHub untuk frontend). Jangan timpa `README.md` utama
> project ini dengan isi file ini.
