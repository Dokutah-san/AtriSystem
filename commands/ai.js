import fetch from 'node-fetch';

export default {
    name: 'ai',
    description: 'Tanya AI Qwen 2.5 3B Lokal via Ollama',
    execute: async (sock, from, msg, args) => {
        const prompt = args.join(' ');

        if (!prompt) {
            await sock.sendMessage(from, { 
                text: '⚠️ Silakan masukkan pertanyaan!\nContoh: `_atri ai Apa itu Rekayasa Perangkat Lunak?`' 
            }, { quoted: msg });
            return;
        }

        // Ambil konfigurasi dari .env atau gunakan fallback default
        const ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434/api/generate';
        const ollamaModel = process.env.OLLAMA_MODEL || 'qwen2.5:3b';

        // Reaksi bot sedang berpikir
        await sock.sendMessage(from, { react: { text: '🧠', key: msg.key } });

        try {
            const response = await fetch(ollamaUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: ollamaModel,
                    prompt: prompt,
                    stream: false
                })
            });

            if (!response.ok) {
                throw new Error(`Server Ollama Error: ${response.statusText}`);
            }

            const data = await response.json();
            const replyText = data.response.trim();

            await sock.sendMessage(from, { text: replyText }, { quoted: msg });
            await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });

        } catch (error) {
            console.error('Error Ollama AI:', error);
            await sock.sendMessage(from, { 
                text: '❌ Gagal menghubungkan ke AI.' 
            }, { quoted: msg });
            await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
        }
    }
};