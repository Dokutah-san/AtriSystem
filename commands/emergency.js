import fs from 'fs';

export default {
    name: 'emergency',
    description: 'Mengecek status keberadaan/keaktifan Master saat situasi darurat',
    execute: async (sock, from, msg, args) => {
        const configFilePath = './config.json';
        const statusFilePath = './network_status.json';

        try {
            // 1. Baca data konfigurasi & nomor darurat
            let config = {};
            if (fs.existsSync(configFilePath)) {
                config = JSON.parse(fs.readFileSync(configFilePath, 'utf8'));
            }

            const emergencyNumbers = config.emergency_numbers || [];
            const senderJid = msg.key.remoteJid;

            // 2. Baca status jaringan lokal dari network_status.json
            let networkStatusText = 'Belum ada data pemantauan jaringan.';
            let lastChangeText = 'Tidak diketahui';
            let isAtHome = false;

            if (fs.existsSync(statusFilePath)) {
                const statusData = JSON.parse(fs.readFileSync(statusFilePath, 'utf8'));
                isAtHome = statusData.lastState;
                
                const lastChange = new Date(statusData.lastStateChangeTimestamp);
                lastChangeText = lastChange.toLocaleString('id-ID', { 
                    timeZone: 'Asia/Jakarta',
                    dateStyle: 'full',
                    timeStyle: 'medium'
                });

                const stagnanceDuration = Math.floor((Date.now() - statusData.lastStateChangeTimestamp) / 1000);
                const hours = Math.floor(stagnanceDuration / 3600);
                const minutes = Math.floor((stagnanceDuration % 3600) / 60);

                networkStatusText = isAtHome
                    ? `🟢 *Terdeteksi di Rumah (WiFi Lokal)*\n⏱️ Durasi menetap: ${hours} jam ${minutes} menit`
                    : `🔴 *Terputus dari WiFi Rumah (Di Luar/Offline)*\n⏱️ Durasi terputus: ${hours} jam ${minutes} menit`;
            }

            // 3. Cek Status Online/Presence Terakhir Master (dari global.masterStatus di index.js)
            let lastSeenText = 'Tidak terdeteksi presensi aktif';
            if (global.masterStatus) {
                if (global.masterStatus.isOnline) {
                    lastSeenText = '🟢 *Sedang Online/Composing di WhatsApp*';
                } else if (global.masterStatus.lastSeen) {
                    const lastSeenDate = new Date(global.masterStatus.lastSeen);
                    lastSeenText = `🔴 *Terakhir Terlihat:* ${lastSeenDate.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}`;
                }
            }

            // 4. Susun Pesan Laporan Darurat
            const emergencyReport = 
                `🚨 *Laporan Status Darurat AtriSystem* 🚨\n\n` +
                `📌 *Status Jaringan Lokal Rumah:* \n${networkStatusText}\n\n` +
                `📱 *Aktivitas WhatsApp Master:* \n${lastSeenText}\n\n` +
                `🕒 *Perubahan Status Terakhir:* \n${lastChangeText}\n\n` +
                `───────────────\n` +
                `_Pesan otomatis dikirim oleh AtriAssisten untuk situasi darurat._`;

            // 5. Kirimkan Laporan ke Pemohon
            await sock.sendMessage(from, { text: emergencyReport }, { quoted: msg });

            // 6. (Opsional) Notifikasi Otomatis ke Nomor-Nomor Darurat Lain di config.json
            // Jika yang memicu perintah ini adalah salah satu nomor darurat, kirim notifikasi broadcast
            if (emergencyNumbers.includes(senderJid)) {
                const alertBroadcast = 
                    `⚠️ *Pemberitahuan Pemicu Emergency* ⚠️\n\n` +
                    `Nomor darurat (${senderJid.split('@')[0]}) baru saja memicu perintah *_atri emergency*.\n` +
                    `Sistem telah mengirimkan laporan keberadaan Master.`;

                for (const targetJid of emergencyNumbers) {
                    if (targetJid !== senderJid) { // Jangan kirim ke pemohon lagi
                        try {
                            await sock.sendMessage(targetJid, { text: alertBroadcast });
                        } catch (err) {
                            console.error(`Gagal broadcast emergency ke ${targetJid}:`, err);
                        }
                    }
                }
            }

        } catch (error) {
            console.error('Gagal mengeksekusi perintah emergency:', error);
            await sock.sendMessage(from, { text: '❌ Terjadi kesalahan saat mengambil status darurat Master.' }, { quoted: msg });
        }
    }
};