import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

// Daftar teks deskripsi (caption)
const CAPTIONS = [
    "⚠️Status Berkala di Upload by AtriSystem"
];

function pilihAcak(array) {
    return array[Math.floor(Math.random() * array.length)];
}

function getKontakStatus(sock) {
    let daftar = [];
    if (fs.existsSync('./contacts.json')) {
        try {
            const parsed = JSON.parse(fs.readFileSync('./contacts.json', 'utf-8'));
            if (Array.isArray(parsed)) daftar = parsed;
        } catch {
            daftar = [];
        }
    }

    // Pastikan nomor bot sendiri juga masuk jika tersedia
    const botJid = sock?.user?.id ? `${sock.user.id.split(':')[0]}@s.whatsapp.net` : null;
    if (botJid && !daftar.includes(botJid)) {
        daftar.push(botJid);
    }

    return daftar;
}

function ambilMetadataVideo(videoPath) {
    let seconds = 15;
    let jpegThumbnail = undefined;

    try {
        // Ambil durasi video via ffprobe (jika tersedia)
        const durRaw = execSync(
            `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`,
            { stdio: ['pipe', 'pipe', 'ignore'] }
        ).toString().trim();
        const parsedDur = Math.round(parseFloat(durRaw));
        if (!Number.isNaN(parsedDur) && parsedDur > 0) {
            seconds = Math.min(parsedDur, 90);
        }
    } catch {
        // Abaikan jika ffprobe tidak ada, pakai fallback 15 detik
    }

    try {
        // Buat thumbnail JPEG kecil untuk preview status
        const thumbPath = path.resolve('./status_media/temp_thumb.jpg');
        execSync(
            `ffmpeg -y -ss 00:00:01 -i "${videoPath}" -vframes 1 -vf "scale=160:-2" -q:v 5 "${thumbPath}"`,
            { stdio: ['pipe', 'pipe', 'ignore'] }
        );
        if (fs.existsSync(thumbPath)) {
            jpegThumbnail = fs.readFileSync(thumbPath);
            fs.unlinkSync(thumbPath);
        }
    } catch {
        // Abaikan jika ffmpeg tidak ada
    }

    return { seconds, jpegThumbnail };
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

        const targetContacts = getKontakStatus(sock);
        if (targetContacts.length === 0) {
            console.log('[AUTO STATUS] Peringatan: targetContacts kosong.');
        }

        const videoTerpilih = path.join(videoDir, pilihAcak(daftarVideo));
        const teksDeskripsi = pilihAcak(CAPTIONS);
        const { seconds, jpegThumbnail } = ambilMetadataVideo(videoTerpilih);

        console.log(`[AUTO STATUS] Mengupload status video: ${path.basename(videoTerpilih)} (${seconds}s) ke ${targetContacts.length} kontak...`);

        const payload = {
            video: fs.readFileSync(videoTerpilih),
            caption: teksDeskripsi,
            mimetype: 'video/mp4',
            seconds
        };

        if (jpegThumbnail) {
            payload.jpegThumbnail = jpegThumbnail;
        }

        await sock.sendMessage(
            'status@broadcast',
            payload,
            {
                backgroundColor: '#000000',
                statusJidList: targetContacts
            }
        );

        console.log('[AUTO STATUS] Berhasil mengupload status WhatsApp!');

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
        if (jam === 0 && menit === 0 && sudahUploadTanggalIni !== tanggalHariIni) {
            sudahUploadTanggalIni = tanggalHariIni;
            await uploadStatusSekarang(sock);
        }
    }, 30000);
}