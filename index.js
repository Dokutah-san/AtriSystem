import 'dotenv/config'; // <--- Tambahkan di baris paling atas index.js
import { makeWASocket, useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import pino from 'pino';
import readline from 'readline';
import fs from 'fs';
import path from 'path';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const question = (text) => new Promise((resolve) => rl.question(text, resolve));

// Map untuk menyimpan daftar perintah/fitur secara dinamis
const commands = new Map();

// Fungsi untuk memuat semua fitur di folder commands/
async function loadCommands() {
    commands.clear();
    const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));
    
    for (const file of commandFiles) {
        const command = await import(`./commands/${file}?update=${Date.now()}`); // Cache busting agar reload aman
        if (command.default?.name) {
            commands.set(command.default.name.toLowerCase(), command.default);
        }
    }
    console.log(`[SYSTEM] ${commands.size} perintah berhasil dimuat!`);
}

// Variabel Global untuk menyimpan status online Master
global.masterStatus = {
    isOnline: false,
    lastSeen: Date.now()
};

async function startBot() {
    await loadCommands();

    const { state, saveCreds } = await useMultiFileAuthState('auth_info');

    const sock = makeWASocket({
        logger: pino({ level: 'silent' }),
        auth: state,
        emitOwnEvents: true,
        browser: ['Ubuntu', 'Chrome', '20.0.04']
    });

    if (!sock.authState.creds.registered) {
        const phoneNumber = await question('Masukkan nomor HP Bot (Contoh: 628123456789): ');
        setTimeout(async () => {
            const code = await sock.requestPairingCode(phoneNumber.trim());
            console.log(`\nKode Pairing WhatsApp Anda: \x1b[32m${code}\x1b[0m\n`);
            console.log('Buka WA > Perangkat Tertaut > Tautkan dengan nomor telepon saja');
        }, 3000);
    }

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startBot();
        } else if (connection === 'open') {
            console.log('AtriSystem Berhasil Terhubung!');

            // Subscribe status presensi nomor Master saat bot terhubung
            const envMaster = process.env.MASTER_NUMBER ? process.env.MASTER_NUMBER.trim() : '';
            if (envMaster) {
                const masterJid = `${envMaster}@s.whatsapp.net`;
                sock.presenceSubscribe(masterJid).catch(err => 
                    console.error('[PRESENCE ERROR] Gagal subscribe status Master:', err)
                );
            }
        }
    });

    sock.ev.on('creds.update', saveCreds);

    // Event Listener untuk Memantau Status Online/Offline Master
    sock.ev.on('presence.update', (json) => {
        const envMaster = process.env.MASTER_NUMBER ? process.env.MASTER_NUMBER.trim() : '';
        if (!envMaster) return;

        const masterJid = `${envMaster}@s.whatsapp.net`;
        
        if (json.id === masterJid) {
            const presences = json.presences[masterJid];
            if (presences) {
                const lastPresence = presences.lastKnownPresence; // 'available', 'unavailable', atau 'composing'
                
                if (lastPresence === 'available' || lastPresence === 'composing') {
                    global.masterStatus.isOnline = true;
                    global.masterStatus.lastSeen = Date.now();
                } else if (lastPresence === 'unavailable') {
                    global.masterStatus.isOnline = false;
                    global.masterStatus.lastSeen = Date.now();
                }
            }
        }
    });

    // Handler Pesan
    sock.ev.on('messages.upsert', async (m) => {
        try {
            const msg = m.messages[0];
            if (!msg || !msg.message) return;

            // --- FILTER PESAN REALTIME ---
            // Mengambil timestamp pesan (dalam detik)
            const messageTimestamp = Number(msg.messageTimestamp || 0);
            const currentTimestamp = Math.floor(Date.now() / 1000);

            // Jika selisih waktu pengiriman pesan dengan waktu bot saat ini > 30 detik, abaikan (pesan offline)
            if (currentTimestamp - messageTimestamp > 30) {
                return;
            }

            const from = msg.key.remoteJid;
            const text = msg.message.conversation ||
                         msg.message.extendedTextMessage?.text ||
                         msg.message.imageMessage?.caption || '';

            const trimmedText = text.trim();

            // Strict Filter: Harus diawali '_atri'
            if (!trimmedText.toLowerCase().startsWith('_atri')) return;

            const args = trimmedText.slice(5).trim().split(/ +/);
            
            // Jika user hanya ketik '_atri', commandName akan menjadi '' (string kosong).
            // Kita tentukan default-nya ke 'help' jika commandName kosong.
            const commandName = args.shift()?.toLowerCase() || 'help';

            // Eksekusi Fitur jika ada di folder commands/
            if (commands.has(commandName)) {
                const cmd = commands.get(commandName);
                await cmd.execute(sock, from, msg, args, commands);
            }
        } catch (err) {
            console.error('Error pada handler pesan:', err);
        }
    });

// Event Listener untuk Panggilan Masuk (Call) dengan Proteksi Anti-Spam
    sock.ev.on('call', async (callEvents) => {
        for (const call of callEvents) {
            const callerJid = call.chatId || call.from;

            // 1. Ambil Waktu Panggilan (dalam detik)
            // Mengakomodasi call.date (Date/number) atau waktu saat ini sebagai fallback
            let rawTime = call.date || call.time || Date.now();
            if (rawTime instanceof Date) rawTime = rawTime.getTime();
            
            // Jika nilai milidetik, ubah ke detik
            const callTimestamp = rawTime > 10000000000 ? Math.floor(rawTime / 1000) : rawTime;
            const currentTimestamp = Math.floor(Date.now() / 1000);

            // Filter Anti-Spam Offline (> 30 detik)
            if (currentTimestamp - callTimestamp > 30) {
                console.log(`[CALL IGNORED] Membuang riwayat panggilan lama/offline dari ${callerJid}`);
                continue;
            }

            // 2. Tanggapi panggilan yang baru selesai saat bot ONLINE
            if (call.status === 'timeout' || call.status === 'reject') {
                console.log(`[MISSED CALL REALTIME] Panggilan tidak terangkat dari: ${callerJid}`);

                try {
                    const autoReplyText = 
                        `⚠️ *Pesan Otomatis AtriAssisten*\n\n` +
                        `Mohon maaf, Master belum sempat mengangkat teleponnya.\n` +
                        `Silakan tinggalkan pesan melalui chat ini ya, terima kasih! ✨`;

                    await sock.sendMessage(callerJid, { text: autoReplyText });
                    console.log(`[CALL AUTO-REPLY] Pesan otomatis berhasil dikirim ke ${callerJid}`);

                } catch (error) {
                    console.error('[CALL ERROR] Gagal mengirim pesan balasan missed call:', error);
                }
            }
        }
    });
}

startBot();
