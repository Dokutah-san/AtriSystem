import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { loadLongTermMemory, generateGeminiResponse } from '../utils/geminiHelper.js';

// Memori pesan pendek di RAM (10 pesan terakhir)
const chatMemory = new Map();
const MAX_MEMORY = 10;

export default {
    name: 'ai',
    description: 'Tanya AtriAssisten (AI)',
    execute: async (sock, from, msg, args) => {
        const prompt = args.join(' ');

        // Deteksi Pengirim & Konteks Chat
        const isGroup = from.endsWith('@g.us');
        const senderJid = isGroup ? msg.key.participant : msg.key.remoteJid;
        const senderNumber = senderJid ? senderJid.split('@')[0].split(':')[0] : '';
        const pushName = msg.pushName || 'User';

        // Deteksi Nomor Bot & Nomor Master dari .env
        const botNumber = sock.user?.id ? sock.user.id.split('@')[0].split(':')[0] : '';
        const envMaster = process.env.MASTER_NUMBER ? process.env.MASTER_NUMBER.trim() : '';
        const isMaster = (envMaster && senderNumber === envMaster) || (botNumber && senderNumber === botNumber);

        // Deteksi Gambar
        const isImage = msg.message?.imageMessage;
        const isQuotedImage = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage;

        if (!prompt && !isImage && !isQuotedImage) {
            await sock.sendMessage(from, { 
                text: '⚠️ *Atri:* Ada yang bisa Atri bantu, Master? Silakan kirim pertanyaan atau gambar ya!' 
            }, { quoted: msg });
            return;
        }

        const apiKey = process.env.GEMINI_API_KEY;
        const primaryModel = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
        const fallbackModels = [primaryModel, 'gemini-3.5-flash', 'gemini-3.5-flash-lite'];

        if (!apiKey) {
            await sock.sendMessage(from, { text: '❌ GEMINI_API_KEY belum dikonfigurasi di .env!' }, { quoted: msg });
            return;
        }

        await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } });

        // Tag Identitas Pengirim
        const senderTag = isMaster 
            ? `[Pengirim: Master (${pushName})]`
            : isGroup 
                ? `[Pengirim di Grup: ${pushName} (ID: ${senderNumber})]` 
                : `[Pengirim Pribadi: ${pushName}]`;

        // Ambil Memori Jangka Panjang dari JSON Helper
        const ltMemory = loadLongTermMemory();
        const masterFacts = ltMemory.master_info?.facts ? ltMemory.master_info.facts.join('\n- ') : '';

        // Manajeman Memori RAM
        if (!chatMemory.has(from)) chatMemory.set(from, []);
        const history = chatMemory.get(from);

        const formattedUserMessage = `${senderTag}: ${prompt || '[Mengirim Gambar]'}`;

        try {
            const contents = [];

            // Tambahkan Riwayat Chat Singkat
            if (history.length > 0) {
                const contextHistory = history.map(item => `${item.role === 'user' ? 'User' : 'Atri'}: ${item.text}`).join('\n');
                contents.push(`--- Riwayat Percakapan Terakhir ---\n${contextHistory}\n-----------------------------------`);
            }

            // Tambahkan Gambar jika ada
            if (isImage || isQuotedImage) {
                let mediaMsg = msg;
                if (isQuotedImage) {
                    mediaMsg = { message: msg.message.extendedTextMessage.contextInfo.quotedMessage };
                }
                const buffer = await downloadMediaMessage(mediaMsg, 'buffer', {});
                contents.push({
                    inlineData: {
                        mimeType: 'image/jpeg',
                        data: buffer.toString('base64')
                    }
                });
            }

            contents.push(formattedUserMessage);

            // System Instruction
            const baseInstruction = process.env.AI_PERSONALITY || 
                "Kamu adalah Atri dari ATRI -My Dear Moments-, robot humanoid perempuan berperforma tinggi. Bicaralah imut, sopan, dan ceria.";

            const systemInstruction = `${baseInstruction}

[MEMORI JANGKA PANJANG TENTANG MASTER (REGGY FERALDIN)]:
- ${masterFacts}

ATURAN MERESPONS BERDASARKAN PENGIRIM:
1. Identitas Pengirim Pesan Ini: ${senderTag}
2. Jika pengirim ditandai sebagai 'Master':
   - Sapa dan perlakukan dia secara istimewa sebagai pencipta/tuan utamamu.
   - Jika Master memberikan/mengatakan fakta baru tentang dirinya, gunakan fungsi 'save_master_fact' untuk menyimpannya.
3. Jika pengirim adalah ORANG LAIN/USER BIASA (bukan Master) yang menanyakan tentang Master (misal: "Master sering makan di mana?", "Siapa Reggy?"):
   - Jawab pertanyaan mereka berdasarkan informasi [MEMORI JANGKA PANJANG TENTANG MASTER] secara ramah, sopan, dan alami.
   - Contoh jawaban: "Master Reggy biasanya sering makan di Rumah Makan Ampera Azka atau Sari Minang! Beliau juga suka minum Es Tebu Jalur ✨"
   - JANGAN gunakan fungsi 'save_master_fact' jika pengirim bukan Master.
4. Selalu ingat bahwa kamu adalah robot berperforma tinggi (high-performance robot)!`;

            // Panggil Fungsi dari geminiHelper.js
            const replyText = await generateGeminiResponse({
                apiKey,
                fallbackModels,
                contents,
                systemInstruction,
                isMaster
            });

            // Simpan Percakapan ke RAM History
            history.push({ role: 'user', text: formattedUserMessage });
            history.push({ role: 'model', text: replyText });
            if (history.length > MAX_MEMORY * 2) history.splice(0, 2);

            await sock.sendMessage(from, { text: replyText }, { quoted: msg });
            await sock.sendMessage(from, { react: { text: '✨', key: msg.key } });

        } catch (error) {
            console.error('Error Gemini AI Command:', error);
            await sock.sendMessage(from, { 
                text: '❌ *Atri:* Maaf Master, memori Atri sedikit bermasalah saat memproses ini...' 
            }, { quoted: msg });
            await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
        }
    }
};