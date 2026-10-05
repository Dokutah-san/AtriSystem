import { GoogleGenAI } from '@google/genai';

export default {
    name: 'ai',
    description: 'Tanya AI menggunakan Google Gemini API',
    execute: async (sock, from, msg, args) => {
        const prompt = args.join(' ');

        if (!prompt) {
            await sock.sendMessage(from, { 
                text: '⚠️ Silakan masukkan pertanyaan!\nContoh: `_atri ai Apa itu Rekayasa Perangkat Lunak?`' 
            }, { quoted: msg });
            return;
        }

        const apiKey = process.env.GEMINI_API_KEY;
        const modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

        if (!apiKey) {
            await sock.sendMessage(from, { 
                text: '❌ GEMINI_API_KEY belum dikonfigurasi di file .env!' 
            }, { quoted: msg });
            return;
        }

        // Reaksi bot sedang berpikir
        await sock.sendMessage(from, { react: { text: '🧠', key: msg.key } });

        try {
            // Inisialisasi Google Gen AI Client
            const ai = new GoogleGenAI({ apiKey });

            // Panggil API Gemini
            const response = await ai.models.generateContent({
                model: modelName,
                contents: prompt,
            });

            const replyText = response.text.trim();

            await sock.sendMessage(from, { text: replyText }, { quoted: msg });
            await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });

        } catch (error) {
            console.error('Error Gemini AI:', error);
            await sock.sendMessage(from, { 
                text: '❌ Terjadi kesalahan saat memproses permintaan AI.' 
            }, { quoted: msg });
            await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
        }
    }
};