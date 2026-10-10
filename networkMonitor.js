import { exec } from 'child_process';
import fs from 'fs';

// Fungsi untuk mengecek apakah HP Utama terhubung ke WiFi rumah via Ping IP Lokal
async function checkPhoneOnLocalNetwork(targetIp) {
    return new Promise((resolve) => {
        // Untuk testing, ubah sementara ke true/false sesuai kebutuhan uji coba
        exec(`ping -c 1 -W 2 ${targetIp}`, (error) => {
            if (error) {
                resolve(false); // Gagal ping = offline / di luar rumah
            } else {
                resolve(true);  // Berhasil = terkoneksi ke WiFi rumah
            }
        });
    });
}

// Fungsi utama pemantau jaringan
export function startLocalNetworkMonitor(sock) {
    const SEVEN_DAYS_MS = 10 * 1000; // DIUBAH JADI 10 DETIK SEMENTARA UNTUK TESTING! (Nanti kembalikan ke 7 * 24 * 60 * 60 * 1000)
    const statusFilePath = './network_status.json';
    const configFilePath = './config.json';

    // Inisialisasi file status jika belum ada
    if (!fs.existsSync(statusFilePath)) {
        fs.writeFileSync(statusFilePath, JSON.stringify({
            disconnectStartTime: null,
            emergencySent: false
        }, null, 2));
    }

    // Fungsi logic pengecekan
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

            let data = JSON.parse(fs.readFileSync(statusFilePath, 'utf8'));
            
            // ---> CATATAN TESTING: Ubah baris bawah ini menjadi `const isAtHome = false;` jika ingin memaksa simulasi terputus tanpa ping asli
            const isAtHome = await checkPhoneOnLocalNetwork(TARGET_HP_IP);
            
            const now = Date.now();

            if (isAtHome) {
                console.log('[NETWORK MONITOR] HP Master terdeteksi di rumah (SAFE).');
                if (data.disconnectStartTime !== null) {
                    data.disconnectStartTime = null;
                    data.emergencySent = false;
                    fs.writeFileSync(statusFilePath, JSON.stringify(data, null, 2));
                }
            } else {
                console.log('[NETWORK MONITOR] HP Master TIDAK terdeteksi di jaringan (Keluar rumah/Offline).');
                
                if (data.disconnectStartTime === null) {
                    data.disconnectStartTime = now;
                    console.log('[NETWORK MONITOR] Memulai timer perhitungan terputus...');
                    fs.writeFileSync(statusFilePath, JSON.stringify(data, null, 2));
                } else if (!data.emergencySent) {
                    const offlineDuration = now - data.disconnectStartTime;
                    console.log(`[NETWORK MONITOR] Durasi offline: ${Math.floor(offlineDuration / 1000)} detik.`);

                    if (offlineDuration >= SEVEN_DAYS_MS) {
                        console.log('[EMERGENCY] Batas waktu terputus tercapai! Mengirim pesan darurat...');
                        data.emergencySent = true;
                        fs.writeFileSync(statusFilePath, JSON.stringify(data, null, 2));

                        const emergencyMessage = 
                            `🚨 *DARURAT - ATRI SYSTEM ALERT* 🚨\n\n` +
                            `Sistem mendeteksi HP Master (Reggy Feraldin) tidak terdeteksi di jaringan WiFi rumah secara terus-menerus.\n` +
                            `Mohon segera lakukan pengecekan keselamatan!`;

                        for (const targetJid of EMERGENCY_NUMBERS) {
                            try {
                                await sock.sendMessage(targetJid, { text: emergencyMessage });
                                console.log(`[EMERGENCY] Pesan darurat sukses terkirim ke ${targetJid}`);
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
    };

    // 1. Jalankan SEKALI LANGSUNG saat bot baru menyala (agar tidak perlu menunggu lama)
    setTimeout(runCheck, 3000);

    // 2. Jalankan secara berkala (misal setiap 10 detik untuk testing, atau 1 jam untuk production)
    setInterval(runCheck, 10 * 1000); 
}