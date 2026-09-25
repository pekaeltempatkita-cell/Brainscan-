export interface DiseaseDetail {
  nama_tampilan: string;
  urgensi: string;
  temuan: string[];
  analisis: string[];
  rekomendasi: string[];
  spesialis: string;
}

export const MAIN_CLASSES = [
  "Alzheimer_Mild",
  "Alzheimer_Moderate",
  "Alzheimer_Very_Mild",
  "Intracranial_Hemorrhage",
  "Multiple_Sclerosis",
  "Normal_Healthy",
  "Stroke_Iskemik",
  "Tumor_Glioma",
  "Tumor_Meningioma",
  "Tumor_Pituitary",
] as const;

export type DiseaseClass = typeof MAIN_CLASSES[number];

export const DISEASE_INFO: Record<string, DiseaseDetail> = {
  Alzheimer_Mild: {
    nama_tampilan: "Alzheimer - Tahap Ringan",
    urgensi: "Rutin (Non-Emergensi)",
    temuan: [
      "Pola citra menunjukkan indikasi atrofi (penyusutan) ringan pada struktur otak, terutama area yang berkaitan dengan memori seperti hipokampus.",
      "Perubahan struktural pada tahap ini umumnya masih minimal dan bisa jadi belum terlalu tampak tanpa perbandingan dengan citra sebelumnya.",
    ],
    analisis: [
      "Gambaran ini konsisten dengan kemungkinan tahap awal proses neurodegeneratif tipe Alzheimer.",
      "Pada tahap ringan, gejala klinis yang menyertai biasanya berupa gangguan memori jangka pendek yang ringan dan belum banyak mengganggu aktivitas sehari-hari.",
    ],
    rekomendasi: [
      "Konsultasi ke Spesialis Neurologi (Sp.N) untuk pemeriksaan kognitif lanjutan (mis. MMSE/MoCA).",
      "Pertimbangkan pemeriksaan pencitraan lanjutan (MRI volumetrik) untuk konfirmasi.",
      "Evaluasi berkala tiap 6-12 bulan untuk memantau perkembangan kondisi.",
    ],
    spesialis: "Spesialis Neurologi (Sp.N) / Spesialis Kedokteran Jiwa (Sp.KJ) - Geriatri",
  },
  Alzheimer_Moderate: {
    nama_tampilan: "Alzheimer - Tahap Sedang",
    urgensi: "Sedang",
    temuan: [
      "Tampak atrofi kortikal dan pelebaran ventrikel yang lebih jelas dibanding tahap ringan, terutama pada lobus temporal medial.",
      "Pola atrofi cenderung lebih simetris dan meluas dibanding tahap awal.",
    ],
    analisis: [
      "Gambaran ini mengarah pada proses neurodegeneratif tipe Alzheimer tahap sedang.",
      "Pada tahap ini gejala klinis (gangguan memori, orientasi, dan fungsi eksekutif) biasanya sudah lebih tampak dan mulai mengganggu aktivitas sehari-hari.",
    ],
    rekomendasi: [
      "Konsultasi CITO ke Spesialis Neurologi (Sp.N) untuk evaluasi dan tata laksana lebih lanjut.",
      "Pertimbangkan terapi farmakologis (sesuai indikasi dokter) untuk memperlambat progresivitas gejala.",
      "Libatkan keluarga/caregiver untuk dukungan aktivitas harian pasien.",
    ],
    spesialis: "Spesialis Neurologi (Sp.N) / Spesialis Kedokteran Jiwa (Sp.KJ) - Geriatri",
  },
  Alzheimer_Very_Mild: {
    nama_tampilan: "Alzheimer - Tahap Sangat Ringan",
    urgensi: "Rutin (Non-Emergensi)",
    temuan: [
      "Tampak perubahan struktural yang sangat halus, mendekati batas normal untuk usia pasien.",
      "Diperlukan perbandingan dengan citra follow-up untuk menilai progresivitas.",
    ],
    analisis: [
      "Pola ini dapat mengindikasikan tahap sangat awal proses neurodegeneratif, namun juga bisa tumpang tindih dengan perubahan struktural terkait usia yang normal.",
    ],
    rekomendasi: [
      "Konsultasi ke Spesialis Neurologi (Sp.N) untuk skrining kognitif dasar.",
      "Pemeriksaan ulang (follow-up) disarankan dalam 6-12 bulan untuk melihat perubahan dari waktu ke waktu.",
    ],
    spesialis: "Spesialis Neurologi (Sp.N)",
  },
  Intracranial_Hemorrhage: {
    nama_tampilan: "Pendarahan Intrakranial (Intracranial Hemorrhage)",
    urgensi: "TINGGI - Kegawatdaruratan Neurologis",
    temuan: [
      "Tampak lesi hiperdensitas akut yang konsisten dengan fokus pendarahan aktif pada parenkim otak.",
      "Terdapat kemungkinan efek massa (mass effect) berupa penekanan pada struktur sekitar dan potensi pergeseran garis tengah (midline shift).",
    ],
    analisis: [
      "Gambaran ini sangat mengarah pada kondisi pendarahan intrakranial (Intracranial Hemorrhage / ICH), sebuah kegawatdaruratan neurologis.",
      "Adanya efek massa meningkatkan risiko peningkatan tekanan intrakranial (TIK) yang berpotensi menyebabkan penurunan kesadaran dan defisit neurologis fokal.",
    ],
    rekomendasi: [
      "SEGERA (CITO) rujuk ke Spesialis Bedah Saraf (Sp.BS) dan Spesialis Neurologi (Sp.N).",
      "Pertimbangkan CT Angiography (CTA) kepala CITO bila dicurigai etiologi vaskular.",
      "Pemantauan ketat status neurologis (GCS) dan tanda vital di unit perawatan intensif.",
      "Evaluasi CT-Scan kontrol dalam 6-24 jam untuk memantau perubahan volume pendarahan.",
    ],
    spesialis: "Spesialis Bedah Saraf (Sp.BS) - SEGERA/CITO",
  },
  Multiple_Sclerosis: {
    nama_tampilan: "Multiple Sclerosis (MS)",
    urgensi: "Sedang",
    temuan: [
      "Tampak lesi hiperintens multipel yang tersebar, dengan pola distribusi yang khas pada substansia alba (white matter) periventrikular.",
      "Bentuk dan distribusi lesi perlu dinilai lebih lanjut terhadap kriteria diseminasi ruang dan waktu.",
    ],
    analisis: [
      "Pola lesi ini konsisten dengan kemungkinan proses demielinisasi seperti Multiple Sclerosis.",
      "Kondisi ini dapat berhubungan dengan gejala neurologis episodik seperti gangguan penglihatan, kelemahan anggota gerak, atau gangguan sensorik.",
    ],
    rekomendasi: [
      "Konsultasi ke Spesialis Neurologi (Sp.N) untuk evaluasi klinis dan pemeriksaan penunjang lanjutan (MRI dengan kontras, pungsi lumbal bila diperlukan).",
      "Pertimbangkan pemeriksaan evoked potential sesuai indikasi.",
    ],
    spesialis: "Spesialis Neurologi (Sp.N)",
  },
  Normal_Healthy: {
    nama_tampilan: "Normal / Tidak Ditemukan Kelainan Signifikan",
    urgensi: "Rutin",
    temuan: [
      "Struktur parenkim otak, ventrikel, dan garis tengah tampak dalam batas normal.",
      "Tidak tampak lesi fokal, efek massa, maupun tanda pendarahan akut pada citra ini.",
    ],
    analisis: [
      "Gambaran citra tidak menunjukkan kelainan struktural signifikan yang mengarah ke 10 kategori yang dipelajari sistem ini.",
      "Hasil ini bukan jaminan bebas dari seluruh kondisi medis lain; klasifikasi hanya mencakup kategori yang tersedia pada sistem.",
    ],
    rekomendasi: [
      "Tidak diperlukan tindak lanjut segera bila tidak ada gejala klinis yang menyertai.",
      "Tetap konsultasikan ke dokter apabila terdapat keluhan neurologis yang dirasakan pasien walau hasil scan tampak normal.",
    ],
    spesialis: "Dokter Umum / Spesialis Neurologi (Sp.N) bila ada keluhan",
  },
  Stroke_Iskemik: {
    nama_tampilan: "Stroke Iskemik",
    urgensi: "TINGGI - Kegawatdaruratan Neurologis",
    temuan: [
      "Tampak area hipodensitas/perubahan intensitas yang konsisten dengan area infark/iskemia pada jaringan otak.",
      "Lokasi dan luas area terdampak perlu dikorelasikan dengan wilayah vaskularisasi arteri otak tertentu.",
    ],
    analisis: [
      "Gambaran ini mengarah pada kemungkinan stroke iskemik (penyumbatan aliran darah ke jaringan otak).",
      "Stroke iskemik merupakan kegawatdaruratan yang sangat bergantung waktu ('time is brain') untuk meminimalkan kerusakan jaringan permanen.",
    ],
    rekomendasi: [
      "SEGERA (CITO) rujuk ke unit gawat darurat / Spesialis Neurologi (Sp.N) untuk evaluasi kandidat terapi reperfusi (trombolisis/trombektomi) sesuai jendela waktu.",
      "Pertimbangkan CT/MR Angiography untuk menilai lokasi sumbatan pembuluh darah.",
      "Pemantauan tanda vital dan status neurologis secara ketat.",
    ],
    spesialis: "Spesialis Neurologi (Sp.N) - SEGERA/CITO",
  },
  Tumor_Glioma: {
    nama_tampilan: "Tumor Glioma",
    urgensi: "Tinggi",
    temuan: [
      "Tampak lesi massa intra-aksial dengan karakteristik yang konsisten dengan tumor glial (glioma).",
      "Perlu dinilai batas lesi, edema perifokal, dan kemungkinan efek massa terhadap struktur sekitarnya.",
    ],
    analisis: [
      "Gambaran ini mengarah pada kemungkinan tumor primer otak jenis glioma.",
      "Derajat keganasan (grading) tidak dapat ditentukan hanya dari klasifikasi citra ini dan memerlukan pemeriksaan lanjutan termasuk kemungkinan biopsi.",
    ],
    rekomendasi: [
      "Rujuk SEGERA ke Spesialis Bedah Saraf (Sp.BS) dan Spesialis Onkologi Radiasi.",
      "Pertimbangkan MRI kepala dengan kontras untuk karakterisasi lesi lebih detail.",
      "Diskusikan rencana biopsi/reseksi dan tata laksana multidisiplin.",
    ],
    spesialis: "Spesialis Bedah Saraf (Sp.BS)",
  },
  Tumor_Meningioma: {
    nama_tampilan: "Tumor Meningioma",
    urgensi: "Sedang - Tinggi",
    temuan: [
      "Tampak lesi massa ekstra-aksial dengan karakteristik yang konsisten dengan tumor meningioma (berasal dari meningen).",
      "Perlu dinilai ukuran, lokasi, dan efek desak ruang terhadap jaringan otak sekitarnya.",
    ],
    analisis: [
      "Meningioma umumnya bersifat jinak (benign) dan tumbuh lambat, namun tetap dapat menimbulkan gejala akibat penekanan pada jaringan sekitar tergantung lokasi dan ukurannya.",
    ],
    rekomendasi: [
      "Konsultasi ke Spesialis Bedah Saraf (Sp.BS) untuk evaluasi kebutuhan tindakan (observasi berkala vs operasi).",
      "Pertimbangkan MRI dengan kontras untuk karakterisasi dan perencanaan tindakan lebih lanjut.",
    ],
    spesialis: "Spesialis Bedah Saraf (Sp.BS)",
  },
  Tumor_Pituitary: {
    nama_tampilan: "Tumor Kelenjar Pituitari",
    urgensi: "Sedang",
    temuan: [
      "Tampak lesi massa pada region sella tursika/kelenjar pituitari.",
      "Perlu dinilai ukuran lesi (mikro vs makroadenoma) serta kemungkinan perluasan ke struktur sekitar seperti chiasma optikum.",
    ],
    analisis: [
      "Gambaran ini mengarah pada kemungkinan tumor kelenjar pituitari (adenoma hipofisis).",
      "Tumor ini dapat memengaruhi fungsi hormonal tubuh serta, bila cukup besar, dapat menekan saraf optik dan mengganggu penglihatan.",
    ],
    rekomendasi: [
      "Konsultasi ke Spesialis Bedah Saraf (Sp.BS) dan Spesialis Endokrinologi.",
      "Pertimbangkan pemeriksaan hormon hipofisis lengkap dan pemeriksaan lapang pandang mata.",
      "MRI sella dengan kontras untuk karakterisasi lebih lanjut.",
    ],
    spesialis: "Spesialis Bedah Saraf (Sp.BS) / Spesialis Endokrinologi",
  },
};

export function getDiseaseInfo(label: string): DiseaseDetail {
  return (
    DISEASE_INFO[label] || {
      nama_tampilan: label || "Tidak diketahui",
      urgensi: "Perlu evaluasi manual",
      temuan: ["Detail temuan tidak tersedia untuk kelas ini."],
      analisis: ["Silakan konfirmasi manual oleh tenaga medis."],
      rekomendasi: ["Konsultasikan hasil ini ke dokter spesialis terkait."],
      spesialis: "Dokter Spesialis terkait",
    }
  );
}
