import { GoogleGenAI } from '@google/genai';
import { downloadMediaMessage } from '@whiskeysockets/baileys';

export default {
    name: 'ai',
    description: 'Tanya AtriAssisten(AI)',
    execute: async (sock, from, msg, args) => {
        const prompt = args.join(' ');

        const isImage = msg.message?.imageMessage;
        const isQuotedImage = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage;

        if (!prompt && !isImage && !isQuotedImage) {
            await sock.sendMessage(from, { 
                text: '⚠️ *Atri:* Ada yang bisa Atri bantu, Silakan ketik pertanyaan atau kirim gambar ya!' 
            }, { quoted: msg });
            return;
        }

        const apiKey = process.env.GEMINI_API_KEY;
        const primaryModel = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
        const fallbackModels = [primaryModel, 'gemini-3.5-flash', 'gemini-3.0-flash'];

        // Ambil kepribadian Atri dari .env
        const systemInstruction = process.env.AI_PERSONALITY || 
            "Kamu adalah Atri dari ATRI -My Dear Moments-. Kamu adalah robot humanoid perempuan berperforma tinggi (high-performance robot). Bicaralah dengan ramah, imut, sedikit ceroboh'.";

        if (!apiKey) {
            await sock.sendMessage(from, { 
                text: '❌ GEMINI_API_KEY belum dikonfigurasi di file .env!' 
            }, { quoted: msg });
            return;
        }

        await sock.sendMessage(from, { react: { text: '🤖', key: msg.key } });

        try {
            const contents = [];

            if (isImage || isQuotedImage) {
                let mediaMsg = msg;
                if (isQuotedImage) {
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

            contents.push(prompt || 'Jelaskan gambar ini secara detail.');

            const ai = new GoogleGenAI({ apiKey });
            let replyText = null;
            let lastError = null;

            const uniqueModels = [...new Set(fallbackModels)];

            for (const modelName of uniqueModels) {
                try {
                    const response = await ai.models.generateContent({
                        model: modelName,
                        contents: contents,
                        config: {
                            systemInstruction: systemInstruction,
                        }
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
                await sock.sendMessage(from, { react: { text: '✨', key: msg.key } });
            } else {
                throw lastError;
            }

        } catch (error) {
            console.error('Error Gemini AI Atri:', error);
            await sock.sendMessage(from, { 
                text: '❌ *Atri:* memori Atri sedikit bermasalah saat memproses ini...' 
            }, { quoted: msg });
            await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
        }
    }
};