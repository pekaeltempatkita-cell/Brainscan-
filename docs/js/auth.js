// auth.js — simpan/ambil token JWT di localStorage, dan helper login/logout.
// TIDAK ADA cookie session di sini -- token disimpan di browser, dikirim manual
// lewat header Authorization tiap manggil api.js.

const TOKEN_KEY = "neurocheck_token";
const USER_KEY = "neurocheck_user";
const ROLE_KEY = "neurocheck_role";

function saveSession(token, user, role) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user || {}));
    localStorage.setItem(ROLE_KEY, role);
}

function getToken() {
    return localStorage.getItem(TOKEN_KEY);
}

function getUser() {
    try {
        return JSON.parse(localStorage.getItem(USER_KEY) || "{}");
    } catch {
        return {};
    }
}

function getRole() {
    return localStorage.getItem(ROLE_KEY) || "";
}

function isLoggedIn() {
    return !!getToken();
}

function logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(ROLE_KEY);
    window.location.href = "index.html";
}

// Panggil di awal halaman yang WAJIB login sebagai user biasa (dashboard.html, patient.html).
function requireUserLogin() {
    if (!isLoggedIn() || getRole() !== "user") {
        window.location.href = "index.html";
    }
}

// Panggil di awal halaman admin (admin.html) setelah login admin sukses.
function requireAdminLogin() {
    if (!isLoggedIn() || getRole() !== "admin") {
        // biarin di halaman yang sama -- admin.html nampilin form login kalau belum login
        return false;
    }
    return true;
}

// Callback ini dipanggil OTOMATIS oleh script Google Identity Services setelah
// orang klik tombol "Sign in with Google" dan berhasil (lihat data-callback di index.html).
async function handleGoogleCredentialResponse(response) {
    const statusEl = document.getElementById("login-status");
    try {
        if (statusEl) statusEl.textContent = "Memverifikasi login...";
        const result = await apiPostJSON("/api/auth/google", { credential: response.credential });
        saveSession(result.token, result.user, "user");
        window.location.href = "dashboard.html";
    } catch (err) {
        if (statusEl) statusEl.textContent = "Login gagal: " + err.message;
    }
}
