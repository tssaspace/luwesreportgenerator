# PM Report Generator

Website statis (tanpa server) untuk membuat laporan Preventive Maintenance (.docx) dari form.
Semua proses terjadi di browser; foto tidak pernah dikirim ke mana pun.

## Pakai
Buka `index.html` di browser (klik dua kali). Isi form, upload foto, klik **Generate Dokumen**.
Teks form diingat di browser; foto tidak, jadi jangan tutup tab sebelum generate.

## Struktur
- `index.html`, `static/` — UI (palet tssa.space, gaya sama dengan expense generator)
- `docgen.js` — pembuat dokumen (isi placeholder, tabel dokumentasi, halaman foto ceklis)
- `template.js` — template Word (halaman 1, header, footer) hasil `tools/build_template.py`
- `source/pm-template.docx` — template Word asli; ubah ini lalu jalankan `python3 tools/build_template.py`
- `tests/gen.test.js` — `node tests/gen.test.js` (butuh Pillow untuk gambar uji)
- `vendor/jszip.min.js` — satu-satunya dependensi

## Deploy
Salin seluruh folder (kecuali `tests/`, `tools/`, `source/`) ke tssa.space, mis. `/pmreport/`.
