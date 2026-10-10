export default {
    name: 'status_master',
    description: 'Mengecek status ketersediaan (online/offline) Master(Pemilik Nomor)',
    execute: async (sock, from, msg, args) => {
        try {
            await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } });

            // Ambil data dari variabel global masterStatus
            const status = global.masterStatus || { isOnline: false, lastSeen: Date.now() };
            const isOnline = status.isOnline;

            // Format waktu terakhir terlihat
            const lastSeenDate = new Date(status.lastSeen).toLocaleString('id-ID', {
                timeZone: 'Asia/Jakarta',
                dateStyle: 'medium',
                timeStyle: 'medium'
            });

            let statusText = '';
            if (isOnline) {
                statusText = `🟢 *ONLINE*\nMaster sedang aktif / online di perangkatnya saat ini! ✨`;
            } else {
                statusText = `🔴 *OFFLINE*\nMaster sedang tidak aktif atau offline.\n🕒 *Terakhir Terlihat:* ${lastSeenDate}`;
            }

            const responseMessage = 
                `*[ ATRI SYSTEM - MASTER STATUS ]*\n\n` +
                `${statusText}\n\n` +
                `_Ada pesan atau hal penting yang ingin disampaikan ke Master? Silakan ketik di sini ya!_`;

            await sock.sendMessage(from, { text: responseMessage }, { quoted: msg });
            await sock.sendMessage(from, { react: { text: '✨', key: msg.key } });

        } catch (error) {
            console.error('Error command status_master:', error);
            await sock.sendMessage(from, { 
                text: '❌ *Atri:* Maaf, terjadi kesalahan saat mengecek status Master...' 
            }, { quoted: msg });
        }
    }
};