import fs from 'fs';
import path from 'path';

// Daftar teks deskripsi (caption)
const CAPTIONS = [
    "Hari baru dimulai. ✨",
    "00:00 — Selamat beristirahat.",
    "Catatan tengah malam. 🌙"
];

function pilihAcak(array) {
    return array[Math.floor(Math.random() * array.length)];
}

function getKontakStatus() {
    if (!fs.existsSync('./contacts.json')) return [];
    try {
        return JSON.parse(fs.readFileSync('./contacts.json', 'utf-8'));
    } catch {
        return [];
    }
}

export async function uploadStatusSekarang(sock) {
    try {
        const videoDir = path.resolve('./status_media/video');
        if (!fs.existsSync(videoDir)) {
            console.log('[AUTO STATUS] Batal: Folder status_media/video belum dibuat.');
            return;
        }

        const daftarVideo = fs.readdirSync(videoDir).filter(f => /\.mp4$/i.test(f));

        if (daftarVideo.length === 0) {
            console.log('[AUTO STATUS] Batal: Tidak ada file .mp4 di folder status_media/video.');
            return;
        }

        // Baca daftar kontak terbaru dari contacts.json tepat saat akan upload
        const targetContacts = getKontakStatus();

        if (targetContacts.length === 0) {
            console.log('[AUTO STATUS] Peringatan: contacts.json masih kosong, status tidak akan muncul di HP lain.');
        }

        const videoTerpilih = path.join(videoDir, pilihAcak(daftarVideo));
        const teksDeskripsi = pilihAcak(CAPTIONS);

        console.log(`[AUTO STATUS] Mengupload status video: ${path.basename(videoTerpilih)} ke ${targetContacts.length} kontak...`);

        await sock.sendMessage(
            'status@broadcast',
            {
                video: fs.readFileSync(videoTerpilih),
                caption: teksDeskripsi,
                mimetype: 'video/mp4'
            },
            {
                backgroundColor: '#000000',
                statusJidList: targetContacts
            }
        );

        console.log('[AUTO STATUS] Berhasil mengupload status WhatsApp pukul 00:00!');

    } catch (error) {
        console.error('[AUTO STATUS ERROR]', error);
    }
}

export function startAutoStatusScheduler(sock) {
    console.log('[AUTO STATUS] Penjadwal status video (00:00) aktif.');
    let sudahUploadTanggalIni = '';

    // Cek waktu setiap 30 detik
    setInterval(async () => {
        const sekarang = new Date();
        const jam = sekarang.getHours();
        const menit = sekarang.getMinutes();
        const tanggalHariIni = sekarang.toDateString();

        // Trigger tepat pada jam 00:00 dan pastikan hanya 1x per tanggal
        if (jam === 2 && menit === 58 && sudahUploadTanggalIni !== tanggalHariIni) {
            sudahUploadTanggalIni = tanggalHariIni;
            await uploadStatusSekarang(sock);
        }
    }, 30000);
}