import { GoogleGenAI } from '@google/genai';
import { downloadMediaMessage } from '@whiskeysockets/baileys';

// Memori percakapan di RAM (per chat ID)
const chatMemory = new Map();
const MAX_MEMORY = 10;

export default {
    name: 'ai',
    description: 'Tanya AI Gemini dengan Memori Konteks & Master dari .env',
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

        // Cek apakah pengirim adalah Master (dari .env ATAU nomor bot itu sendiri)
        const isMaster = (envMaster && senderNumber === envMaster) || (botNumber && senderNumber === botNumber);

        // Deteksi Media Gambar
        const isImage = msg.message?.imageMessage;
        const isQuotedImage = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage;

        if (!prompt && !isImage && !isQuotedImage) {
            await sock.sendMessage(from, { 
                text: '⚠️ *Atri:* Ada yang bisa Atri bantu, Master? Kirim pertanyaan atau gambar ya!' 
            }, { quoted: msg });
            return;
        }

        const apiKey = process.env.GEMINI_API_KEY;
        const primaryModel = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
        const fallbackModels = [primaryModel, 'gemini-3.5-flash', 'gemini-3.0-flash'];

        if (!apiKey) {
            await sock.sendMessage(from, { text: '❌ GEMINI_API_KEY belum dikonfigurasi!' }, { quoted: msg });
            return;
        }

        await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } });

        // Format Tag Identitas Pengirim
        let senderTag = '';
        if (isMaster) {
            senderTag = `[Pengirim: Master (${pushName})]`;
        } else if (isGroup) {
            senderTag = `[Pengirim di Grup: ${pushName} (ID: ${senderNumber})]`;
        } else {
            senderTag = `[Pengirim Pribadi: ${pushName}]`;
        }

        // Manajemen Memori Chat
        if (!chatMemory.has(from)) {
            chatMemory.set(from, []);
        }
        const history = chatMemory.get(from);

        const formattedUserMessage = `${senderTag}: ${prompt || '[Mengirim Gambar]'}`;

        try {
            const contents = [];

            // Masukkan riwayat percakapan sebelumnya
            if (history.length > 0) {
                const contextHistory = history.map(item => `${item.role === 'user' ? 'User' : 'Atri'}: ${item.text}`).join('\n');
                contents.push(`--- Riwayat Percakapan Sebelumnya ---\n${contextHistory}\n-----------------------------------`);
            }

            // Jika ada gambar
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

            const baseInstruction = process.env.AI_PERSONALITY || 
                "Kamu adalah Atri dari ATRI -My Dear Moments-, robot humanoid perempuan berperforma tinggi. Bicaralah imut, sopan, dan ceria.";
            
            const systemInstruction = `${baseInstruction}
Aturan Tambahan:
1. Jika pengirim ditandai sebagai 'Master', perlakukan dia sebagai pencipta/tuan utamamu dengan sangat istimewa.
2. Jika berada di grup, perhatikan tag nama pengirim agar kamu tahu siapa yang sedang bicara kepadamu.`;

            const ai = new GoogleGenAI({ apiKey });
            let replyText = null;
            let lastError = null;

            const uniqueModels = [...new Set(fallbackModels)];

            for (const modelName of uniqueModels) {
                try {
                    const response = await ai.models.generateContent({
                        model: modelName,
                        contents: contents,
                        config: { systemInstruction }
                    });

                    replyText = response.text?.trim();
                    if (replyText) break;
                } catch (error) {
                    lastError = error;
                    console.warn(`[GEMINI WARN] Model ${modelName} gagal: ${error.message}`);
                }
            }

            if (replyText) {
                history.push({ role: 'user', text: formattedUserMessage });
                history.push({ role: 'model', text: replyText });

                if (history.length > MAX_MEMORY * 2) {
                    history.splice(0, 2);
                }

                await sock.sendMessage(from, { text: replyText }, { quoted: msg });
                await sock.sendMessage(from, { react: { text: '✨', key: msg.key } });
            } else {
                throw lastError;
            }

        } catch (error) {
            console.error('Error Gemini AI Memory:', error);
            await sock.sendMessage(from, { 
                text: '❌ *Atri:* Maaf Master, memori Atri sedikit bermasalah saat memproses ini...' 
            }, { quoted: msg });
            await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
        }
    }
};