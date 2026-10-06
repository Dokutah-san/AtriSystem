import { GoogleGenAI } from '@google/genai';
import { downloadMediaMessage } from '@whiskeysockets/baileys';

export default {
    name: 'ai',
    description: 'Tanya AI (Mendukung Teks dan Gambar)',
    execute: async (sock, from, msg, args) => {
        const prompt = args.join(' ');

        // Cek apakah ada media gambar di pesan langsung atau di pesan yang di-reply (quoted message)
        const isImage = msg.message?.imageMessage;
        const isQuotedImage = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage;

        if (!prompt && !isImage && !isQuotedImage) {
            await sock.sendMessage(from, { 
                text: '⚠️ Silakan masukkan pertanyaan atau sertakan gambar!\nContoh: `_atri ai ini gambar apa?`' 
            }, { quoted: msg });
            return;
        }

        const apiKey = process.env.GEMINI_API_KEY;
        const primaryModel = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
        const fallbackModels = [primaryModel, 'gemini-3.5-flash', 'gemini-3.0-flash'];

        if (!apiKey) {
            await sock.sendMessage(from, { 
                text: '❌ GEMINI_API_KEY belum dikonfigurasi di file .env!' 
            }, { quoted: msg });
            return;
        }

        await sock.sendMessage(from, { react: { text: '🧠', key: msg.key } });

        try {
            const contents = [];

            // 1. Jika ada gambar, unduh media dan ubah ke format Base64
            if (isImage || isQuotedImage) {
                let mediaMsg = msg;
                if (isQuotedImage) {
                    // Menyusun objek terstruktur untuk mendownload media yang di-reply
                    mediaMsg = {
                        message: msg.message.extendedTextMessage.contextInfo.quotedMessage
                    };
                }

                const buffer = await downloadMediaMessage(mediaMsg, 'buffer', {});
                const base64Image = buffer.toString('base64');

                contents.push({
                    inlineData: {
                        mimeType: 'image/jpeg',
                        data: base64Image
                    }
                });
            }

            // 2. Masukkan teks prompt jika ada (atau gunakan default jika user cuma ngirim gambar)
            contents.push(prompt || 'Jelaskan gambar ini secara detail.');

            // 3. Eksekusi ke Gemini API dengan mekanisme fallback
            const ai = new GoogleGenAI({ apiKey });
            let replyText = null;
            let lastError = null;

            const uniqueModels = [...new Set(fallbackModels)];

            for (const modelName of uniqueModels) {
                try {
                    const response = await ai.models.generateContent({
                        model: modelName,
                        contents: contents,
                    });
                    replyText = response.text?.trim();
                    if (replyText) break;
                } catch (error) {
                    lastError = error;
                    console.warn(`[GEMINI WARN] Model ${modelName} gagal (${error.status || error.message}). Mencoba model cadangan...`);
                }
            }

            if (replyText) {
                await sock.sendMessage(from, { text: replyText }, { quoted: msg });
                await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });
            } else {
                throw lastError;
            }

        } catch (error) {
            console.error('Error Gemini AI Vision:', error);
            await sock.sendMessage(from, { 
                text: '❌ Terjadi kesalahan saat memproses gambar/pesan ke AI.' 
            }, { quoted: msg });
            await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
        }
    }
};