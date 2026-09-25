import PDFDocument from "pdfkit";
import { type Response } from "express";
import { type Patient, type Prediction } from "./storage.js";
import { getDiseaseInfo } from "./diseaseInfo.js";

export function generateReportPdf(
  res: Response,
  patient: Patient,
  prediction: Prediction
): void {
  const doc = new PDFDocument({
    size: "A4",
    margin: 40,
    info: {
      Title: `Laporan Pemeriksaan Otak - ${patient.nama}`,
      Author: "NeuroCheck AI System",
      Subject: "Clinical Brain Scan AI Screening Report",
    },
  });

  res.setHeader("Content-Type", "application/pdf");
  const filename = `Laporan_${patient.nama.replace(/\s+/g, "_")}_${prediction.id}.pdf`;
  res.setHeader("Content-Disposition", `inline; filename="${filename}"`);

  doc.pipe(res);

  const isValid = prediction.precheck_status === "valid" && prediction.prediction_label;
  const info = isValid && prediction.prediction_label ? getDiseaseInfo(prediction.prediction_label) : null;

  // Header
  doc
    .font("Helvetica-Bold")
    .fontSize(16)
    .fillColor("#0b1c3f")
    .text("NeuroCheck", { align: "center" });

  doc
    .font("Helvetica")
    .fontSize(10)
    .fillColor("#5b6b85")
    .text("Laporan Hasil Pemeriksaan Skrining Otak Berbasis AI (Opini Sekunder)", {
      align: "center",
    });

  doc.moveDown(0.5);
  doc.strokeColor("#e2e8f5").lineWidth(1).moveTo(40, doc.y).lineTo(555, doc.y).stroke();
  doc.moveDown(0.8);

  // Patient Info Box
  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .fillColor("#0b1c3f")
    .text("DATA PASIEN & PEMERIKSAAN");
  doc.moveDown(0.3);

  const startY = doc.y;
  doc
    .strokeColor("#d0d7e5")
    .lineWidth(0.8)
    .rect(40, startY, 515, 76)
    .fillAndStroke("#f8fafc", "#e2e8f5");

  doc.fillColor("#1e293b").font("Helvetica").fontSize(9);
  const col1 = 52;
  const col2 = 300;
  let textY = startY + 8;

  doc.font("Helvetica-Bold").text("NIK:", col1, textY, { continued: true });
  doc.font("Helvetica").text(` ${patient.nik}`);
  doc.font("Helvetica-Bold").text("Tgl Pemeriksaan:", col2, textY, { continued: true });
  doc.font("Helvetica").text(` ${prediction.upload_time}`);

  textY += 15;
  doc.font("Helvetica-Bold").text("Nama Lengkap:", col1, textY, { continued: true });
  doc.font("Helvetica").text(` ${patient.nama}`);
  doc.font("Helvetica-Bold").text("Jenis Scan:", col2, textY, { continued: true });
  doc.font("Helvetica").text(` ${prediction.jenis_scan || "-"}`);

  textY += 15;
  doc.font("Helvetica-Bold").text("Tgl Lahir / Usia:", col1, textY, { continued: true });
  doc.font("Helvetica").text(` ${patient.tanggal_lahir || "-"} (${prediction.umur_saat_scan || "-"} thn)`);
  doc.font("Helvetica-Bold").text("Gejala Klinis:", col2, textY, { continued: true });
  doc.font("Helvetica").text(` ${prediction.gejala || "-"}`);

  textY += 15;
  doc.font("Helvetica-Bold").text("Jenis Kelamin:", col1, textY, { continued: true });
  doc.font("Helvetica").text(` ${patient.jenis_kelamin || "-"}`);
  doc.font("Helvetica-Bold").text("Nama Berkas:", col2, textY, { continued: true });
  doc.font("Helvetica").text(` ${prediction.filename}`);

  doc.y = startY + 86;
  doc.moveDown(0.6);

  // Result Section
  if (isValid && info) {
    doc
      .font("Helvetica-Bold")
      .fontSize(11)
      .fillColor("#0b1c3f")
      .text("HASIL KLASIFIKASI & ANALISIS CITRA");
    doc.moveDown(0.3);

    const resBoxY = doc.y;
    doc
      .rect(40, resBoxY, 515, 52)
      .fillAndStroke("#f0fdf4", "#bbf7d0");

    doc
      .font("Helvetica-Bold")
      .fontSize(13)
      .fillColor("#15803d")
      .text(info.nama_tampilan, 52, resBoxY + 10);

    const confText = prediction.prediction_confidence
      ? `Tingkat Keyakinan: ${(prediction.prediction_confidence * 100).toFixed(1)}%`
      : "";

    doc
      .font("Helvetica")
      .fontSize(9.5)
      .fillColor("#374151")
      .text(`Urgensi: ${info.urgensi}  |  ${confText}`, 52, resBoxY + 30);

    doc.y = resBoxY + 60;
    doc.moveDown(0.5);

    // Temuan
    doc
      .font("Helvetica-Bold")
      .fontSize(10)
      .fillColor("#0b1c3f")
      .text("Ringkasan Temuan Radiologis:");
    doc.moveDown(0.2);
    info.temuan.forEach((item) => {
      doc
        .font("Helvetica")
        .fontSize(9)
        .fillColor("#334155")
        .text(`•  ${item}`, { indent: 12 });
      doc.moveDown(0.15);
    });

    // Analisis
    doc.moveDown(0.4);
    doc
      .font("Helvetica-Bold")
      .fontSize(10)
      .fillColor("#0b1c3f")
      .text("Analisis Klinis:");
    doc.moveDown(0.2);
    info.analisis.forEach((item) => {
      doc
        .font("Helvetica")
        .fontSize(9)
        .fillColor("#334155")
        .text(`•  ${item}`, { indent: 12 });
      doc.moveDown(0.15);
    });

    // Rekomendasi
    doc.moveDown(0.4);
    doc
      .font("Helvetica-Bold")
      .fontSize(10)
      .fillColor("#0b1c3f")
      .text("Rekomendasi & Tindak Lanjut:");
    doc.moveDown(0.2);
    info.rekomendasi.forEach((item) => {
      doc
        .font("Helvetica")
        .fontSize(9)
        .fillColor("#334155")
        .text(`•  ${item}`, { indent: 12 });
      doc.moveDown(0.15);
    });

    // Spesialis
    doc.moveDown(0.4);
    doc
      .font("Helvetica-Bold")
      .fontSize(9.5)
      .fillColor("#0b1c3f")
      .text("Rujukan Spesialis Terkait: ", { continued: true });
    doc
      .font("Helvetica")
      .fontSize(9.5)
      .fillColor("#1e40af")
      .text(info.spesialis);

    // Gemini Explanation if available
    if (prediction.gemini_explanation) {
      doc.moveDown(0.6);
      doc
        .font("Helvetica-Bold")
        .fontSize(10)
        .fillColor("#0b1c3f")
        .text("Catatan Edukasi & Penjelasan Terperinci:");
      doc.moveDown(0.2);
      const cleanExp = prediction.gemini_explanation.replace(/\*\*/g, "");
      doc
        .font("Helvetica")
        .fontSize(8.5)
        .fillColor("#475569")
        .text(cleanExp, { lineGap: 2 });
    }
  } else {
    // Non-brain or invalid
    doc
      .font("Helvetica-Bold")
      .fontSize(12)
      .fillColor("#b91c1c")
      .text("HASIL: Citra Tidak Terindikasi Sebagai MRI/CT Otak");
    doc.moveDown(0.3);
    doc
      .font("Helvetica")
      .fontSize(9.5)
      .fillColor("#475569")
      .text(
        "Sistem NeuroCheck mendeteksi bahwa berkas yang diunggah tidak memiliki karakteristik visual penampang MRI atau CT-Scan kepala yang valid. Disarankan mengunggah ulang citra scan yang sesuai."
      );
  }

  // Footer / Disclaimer
  doc.moveDown(1);
  doc.strokeColor("#e2e8f5").lineWidth(0.8).moveTo(40, doc.y).lineTo(555, doc.y).stroke();
  doc.moveDown(0.5);

  doc
    .font("Helvetica-Bold")
    .fontSize(7.5)
    .fillColor("#64748b")
    .text("DISCLAIMER MEDIS PENTING:");
  doc
    .font("Helvetica")
    .fontSize(7.5)
    .fillColor("#64748b")
    .text(
      "Laporan ini dihasilkan secara komputasi oleh sistem kecerdasan buatan NeuroCheck semata-mata sebagai instrumen bantuan penunjang (clinical decision support / second opinion). Dokumen ini BUKAN pengganti diagnosis medis formal. Seluruh interpretasi klinis dan keputusan tindakan kedokteran wajib dievaluasi oleh Dokter Spesialis Neurologi atau Dokter Spesialis Radiologi yang memiliki Surat Izin Praktik resmi.",
      { align: "justify", lineGap: 1.5 }
    );

  doc.end();
}
