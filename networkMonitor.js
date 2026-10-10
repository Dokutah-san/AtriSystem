import { exec } from 'child_process';
import fs from 'fs';

// Fungsi untuk mengecek apakah HP Utama terhubung ke WiFi rumah via Ping IP Lokal
async function checkPhoneOnLocalNetwork(targetIp) {
    return new Promise((resolve) => {
        exec(`ping -c 1 -W 2 ${targetIp}`, (error) => {
            if (error) {
                resolve(false); // Gagal ping berarti offline / di luar rumah
            } else {
                resolve(true);  // Berhasil berarti terkoneksi ke WiFi rumah
            }
        });
    });
}

// Fungsi utama pemantau jaringan
export function startLocalNetworkMonitor(sock) {
    const SEVEN_DAYS_MS = 10 * 1000; // 7 hari dalam milidetik
    const statusFilePath = './network_status.json';
    const configFilePath = './config.json';

    // Inisialisasi file status jika belum ada
    if (!fs.existsSync(statusFilePath)) {
        fs.writeFileSync(statusFilePath, JSON.stringify({
            disconnectStartTime: null,
            emergencySent: false
        }, null, 2));
    }

    // Jalankan pengecekan rutin setiap 1 jam sekali
    setInterval(async () => {
        try {
            // Baca konfigurasi terbaru dari config.json
            if (!fs.existsSync(configFilePath)) {
                console.error('[MONITOR ERROR] File config.json tidak ditemukan!');
                return;
            }
            const config = JSON.parse(fs.readFileSync(configFilePath, 'utf8'));
            const TARGET_HP_IP = config.target_hp_ip;
            const EMERGENCY_NUMBERS = config.emergency_numbers || [];

            let data = JSON.parse(fs.readFileSync(statusFilePath, 'utf8'));
            const isAtHome = await checkPhoneOnLocalNetwork(TARGET_HP_IP);
            const now = Date.now();

            if (isAtHome) {
                // KONDISI SAFE: HP terdeteksi kembali di jaringan WiFi rumah
                if (data.disconnectStartTime !== null) {
                    console.log('[NETWORK MONITOR] HP Master kembali terdeteksi di rumah. Status: SAFE.');
                    data.disconnectStartTime = null;
                    data.emergencySent = false;
                    fs.writeFileSync(statusFilePath, JSON.stringify(data, null, 2));
                }
            } else {
                // KONDISI KELUAR RUMAH / TERPUTUS
                if (data.disconnectStartTime === null) {
                    data.disconnectStartTime = now;
                    console.log('[NETWORK MONITOR] HP Master meninggalkan jangkauan WiFi rumah. Memulai timer...');
                    fs.writeFileSync(statusFilePath, JSON.stringify(data, null, 2));
                } else if (!data.emergencySent) {
                    const offlineDuration = now - data.disconnectStartTime;

                    if (offlineDuration >= SEVEN_DAYS_MS) {
                        console.log('[EMERGENCY] HP Master terputus dari jaringan rumah selama 7 hari terus-menerus!');
                        data.emergencySent = true;
                        fs.writeFileSync(statusFilePath, JSON.stringify(data, null, 2));

                        // Kirim pesan darurat ke daftar nomor dari config.json
                        const emergencyMessage = 
                            `🚨 *DARURAT - ATRI SYSTEM ALERT* 🚨\n\n` +
                            `Sistem mendeteksi HP pengguna (Reggy Feraldin) tidak terdeteksi di jaringan WiFi rumah secara terus-menerus selama *7 hari penuh*.\n` +
                            `Mohon segera lakukan pengecekan keselamatan!`;

                        for (const targetJid of EMERGENCY_NUMBERS) {
                            try {
                                await sock.sendMessage(targetJid, { text: emergencyMessage });
                                console.log(`[EMERGENCY] Pesan darurat terkirim ke ${targetJid}`);
                            } catch (err) {
                                console.error(`[EMERGENCY ERROR] Gagal kirim ke ${targetJid}:`, err);
                            }
                        }
                    }
                }
            }
        } catch (err) {
            console.error('[MONITOR ERROR] Terjadi kesalahan pada pengecekan jaringan:', err);
        }
    }, 60 * 60 * 1000); // Cek tiap 1 jam
}