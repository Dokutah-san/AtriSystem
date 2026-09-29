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
        const command = await import(`./commands/${file}`);
        if (command.default?.name) {
            commands.set(command.default.name.toLowerCase(), command.default);
        }
    }
    console.log(`[SYSTEM] ${commands.size} perintah berhasil dimuat!`);
}

async function startBot() {
    await loadCommands();

    const { state, saveCreds } = await useMultiFileAuthState('auth_info');

    const sock = makeWASocket({
        logger: pino({ level: 'silent' }),
        auth: state,
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
        }
    });

    sock.ev.on('creds.update', saveCreds);

    // Handler Pesan
    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message) return;

        const from = msg.key.remoteJid;
        const text = msg.message.conversation ||
                     msg.message.extendedTextMessage?.text ||
                     msg.message.imageMessage?.caption || '';

        const trimmedText = text.trim();

        // Strict Filter: Harus diawali '_atri'
        if (!trimmedText.toLowerCase().startsWith('_atri')) return;

        const args = trimmedText.slice(5).trim().split(/ +/);
        const commandName = args.shift()?.toLowerCase();

        // Eksekusi Fitur jika ada di folder commands/
        if (commands.has(commandName)) {
            const cmd = commands.get(commandName);
            try {
                await cmd.execute(sock, from, msg, args, commands);
            } catch (err) {
                console.error(`Error pada perintah ${commandName}:`, err);
                await sock.sendMessage(from, { text: '❌ Terjadi kesalahan saat menjalankan perintah.' }, { quoted: msg });
            }
        }
    });
}

startBot();