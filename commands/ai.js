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
        // Daftar model cadangan jika model utama sibuk (503)
        const primaryModel = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
        const fallbackModels = [primaryModel,'gemini-3.5-flash', 'gemini-2.0-flash', 'gemini-2.5-flash'];

        if (!apiKey) {
            await sock.sendMessage(from, { 
                text: '❌ GEMINI_API_KEY belum dikonfigurasi di file .env!' 
            }, { quoted: msg });
            return;
        }

        await sock.sendMessage(from, { react: { text: '🧠', key: msg.key } });

        const ai = new GoogleGenAI({ apiKey });
        let replyText = null;
        let lastError = null;

        // Coba kirim request ke model utama, jika 503 akan coba ke model cadangan
        for (const modelName of [...new Set(fallbackModels)]) {
            try {
                const response = await ai.models.generateContent({
                    model: modelName,
                    contents: prompt,
                });
                replyText = response.text.trim();
                if (replyText) break; // Berhasil dapat jawaban
            } catch (error) {
                lastError = error;
                console.warn(`[GEMINI WARN] Model ${modelName} gagal (${error.status || error.message}). Mencoba model lain...`);
            }
        }

        if (replyText) {
            await sock.sendMessage(from, { text: replyText }, { quoted: msg });
            await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });
        } else {
            console.error('Error Gemini AI Semua Model:', lastError);
            
            let messageText = '❌ Terjadi kesalahan saat memproses permintaan AI.';
            if (lastError?.status === 503 || lastError?.message?.includes('503')) {
                messageText = '⚠️️ Server Gemini sedang padat (503). Silakan coba lagi beberapa saat lagi!';
            }

            await sock.sendMessage(from, { text: messageText }, { quoted: msg });
            await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
        }
    }
};