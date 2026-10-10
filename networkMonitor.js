import { exec } from 'child_process';
import fs from 'fs';

// Fungsi untuk mengecek koneksi IP lokal via Ping
async function checkPhoneOnLocalNetwork(targetIp) {
    return new Promise((resolve) => {
        exec(`ping -c 1 -W 2 ${targetIp}`, (error) => {
            resolve(!error);
        });
    });
}

export function startLocalNetworkMonitor(sock) {
    // SEVEN_DAYS_MS (Ganti ke 7 * 24 * 60 * 60 * 1000 untuk produksi, atau 10 * 1000 untuk testing)
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000; // 7 hari
    const statusFilePath = './network_status.json';
    const configFilePath = './config.json';

    const runCheck = async () => {
        try {
            console.log('[NETWORK MONITOR] Memulai pengecekan status jaringan lokal...');

            if (!fs.existsSync(configFilePath)) {
                console.error('[MONITOR ERROR] File config.json tidak ditemukan!');
                return;
            }

            const config = JSON.parse(fs.readFileSync(configFilePath, 'utf8'));
            const TARGET_HP_IP = config.target_hp_ip;
            const EMERGENCY_NUMBERS = config.emergency_numbers || [];

            const isAtHome = await checkPhoneOnLocalNetwork(TARGET_HP_IP);
            const now = Date.now();

            // Inisialisasi/Baca file status
            let data = {
                lastState: isAtHome,
                lastStateChangeTimestamp: now,
                emergencySent: false
            };

            if (fs.existsSync(statusFilePath)) {
                data = JSON.parse(fs.readFileSync(statusFilePath, 'utf8'));
            } else {
                fs.writeFileSync(statusFilePath, JSON.stringify(data, null, 2));
            }

            // 1. CEK APAKAH TERJADI PERUBAHAN STATUS (SAFE REFRESH)
            if (isAtHome !== data.lastState) {
                console.log(`[NETWORK MONITOR] Terjadi perubahan status! Dari ${data.lastState ? 'Di Rumah' : 'Luar Rumah'} menjadi ${isAtHome ? 'Di Rumah' : 'Luar Rumah'}. Status: SAFE.`);
                data.lastState = isAtHome;
                data.lastStateChangeTimestamp = now;
                data.emergencySent = false; // Reset status darurat karena ada aktivitas variasi
                fs.writeFileSync(statusFilePath, JSON.stringify(data, null, 2));
                return;
            }

            // 2. JIKA STATUS STAGNAN (SAMA DENGAN SEBELUMNYA)
            const stagnanceDuration = now - data.lastStateChangeTimestamp;
            const statusLabel = isAtHome ? 'SELALU DI RUMAH (ONLINE)' : 'SELALU DILUAR RUMAH (OFFLINE)';

            console.log(`[NETWORK MONITOR] Status: ${statusLabel}. Durasi stagnan: ${Math.floor(stagnanceDuration / 1000)} detik.`);

            // 3. JIKA SUDAH STAGNAN SELAMA 7 HARI PENUH
            if (stagnanceDuration >= SEVEN_DAYS_MS && !data.emergencySent) {
                console.log(`[EMERGENCY] Peringatan! HP Master berada dalam kondisi "${statusLabel}" secara terus-menerus selama 7 hari tanpa perubahan!`);
                data.emergencySent = true;
                fs.writeFileSync(statusFilePath, JSON.stringify(data, null, 2));

                const emergencyReason = isAtHome 
                    ? 'terhubung ke jaringan rumah terus-menerus tanpa pernah terputus/keluar rumah'
                    : 'tidak terdeteksi di jaringan rumah secara terus-menerus';

                const emergencyMessage = 
                    `⚠️ *DARURAT - ATRI SYSTEM ALERT* ⚠️\n\n` +
                    `Sistem mendeteksi HP Pengguna (Reggy Feraldin) ${emergencyReason} selama *7 hari penuh* tanpa adanya variasi aktivitas.\n\n` +
                    `Mohon segera lakukan pengecekan keselamatan atau konfirmasi keadaan Pengguna!`;

                for (const targetJid of EMERGENCY_NUMBERS) {
                    try {
                        await sock.sendMessage(targetJid, { text: emergencyMessage });
                        console.log(`[EMERGENCY] Pesan darurat sukses terkirim ke ${targetJid}`);
                    } catch (err) {
                        console.error(`[EMERGENCY ERROR] Gagal kirim ke ${targetJid}:`, err);
                    }
                }
            }
        } catch (err) {
            console.error('[MONITOR ERROR] Terjadi kesalahan pada pengecekan jaringan:', err);
        }
    };

    // Pengecekan pertama saat start
    setTimeout(runCheck, 3000);

    // Interval pengecekan (Ubah ke 60 * 60 * 1000 untuk 1 jam di produksi)
    setInterval(runCheck, 60 * 60 * 1000); // Setiap 1 jam
}