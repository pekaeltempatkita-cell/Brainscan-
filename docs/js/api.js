// api.js — wrapper fetch() kecil: otomatis nempelin Authorization header,
// otomatis parse JSON, dan lempar Error dengan pesan yang enak dibaca kalau gagal.

async function apiFetch(path, { method = "GET", body = null, isFormData = false } = {}) {
    const headers = {
        // Header ini WAJIB kalau backend di-tunnel lewat ngrok free tier -- tanpa ini,
        // ngrok nampilin halaman peringatan HTML (bukan JSON) buat request pertama.
        // Aman dibiarkan walau backend-nya gak pakai ngrok (diabaikan platform lain).
        "ngrok-skip-browser-warning": "true",
    };
    const token = getToken();
    if (token) headers["Authorization"] = "Bearer " + token;
    if (body && !isFormData) headers["Content-Type"] = "application/json";

    const response = await fetch(API_BASE_URL + path, {
        method,
        headers,
        body: body ? (isFormData ? body : JSON.stringify(body)) : undefined,
    });

    // Endpoint laporan PDF balikin file, bukan JSON -- biarin caller yang urus.
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
        if (!response.ok) throw new Error("Gagal memuat data dari server.");
        return response;
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data.detail || data.message || data.error?.message || "Terjadi kesalahan pada server.");
    }
    return data;
}

function apiGet(path) {
    return apiFetch(path, { method: "GET" });
}

function apiPostJSON(path, body) {
    return apiFetch(path, { method: "POST", body });
}

function apiUpload(path, formData) {
    return apiFetch(path, { method: "POST", body: formData, isFormData: true });
}
