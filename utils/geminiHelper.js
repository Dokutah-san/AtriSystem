import { GoogleGenAI, Type } from '@google/genai';
import fs from 'fs';
import path from 'path';

// Path file memori jangka panjang (JSON)
const MEMORY_FILE = path.join(process.cwd(), 'memory.json');

// Helper delay untuk Auto-Retry
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Membaca data dari memory.json
 */
export function loadLongTermMemory() {
    try {
        if (fs.existsSync(MEMORY_FILE)) {
            const data = fs.readFileSync(MEMORY_FILE, 'utf-8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error('[MEMORY ERROR] Gagal membaca memory.json:', error);
    }
    return { master_info: { facts: [] }, notes: [] };
}

/**
 * Menyimpan fakta baru tentang Master ke memory.json
 */
export function saveFactToMemory(newFact) {
    try {
        const memoryData = loadLongTermMemory();
        if (!memoryData.master_info) {
            memoryData.master_info = { facts: [] };
        }
        
        if (!memoryData.master_info.facts.includes(newFact)) {
            memoryData.master_info.facts.push(newFact);
            fs.writeFileSync(MEMORY_FILE, JSON.stringify(memoryData, null, 2), 'utf-8');
            console.log(`[MEMORY UPDATE] Facts baru disimpan via Tool Gemini: ${newFact}`);
            return true;
        }
        return false;
    } catch (error) {
        console.error('[MEMORY ERROR] Gagal memperbarui memory.json:', error);
        return false;
    }
}

/**
 * Deklarasi Tool Function Calling khusus Gemini
 */
const saveFactTool = {
    name: 'save_master_fact',
    description: 'Menyimpan fakta atau informasi penting baru tentang Master ke memori jangka panjang.',
    parameters: {
        type: Type.OBJECT,
        properties: {
            fact: {
                type: Type.STRING,
                description: 'Fakta spesifik tentang Master yang perlu diingat.'
            }
        },
        required: ['fact']
    }
};

/**
 * Fungsi Utama untuk Memproses Generasi Konten Gemini API dengan Auto-Retry
 */
export async function generateGeminiResponse({ apiKey, fallbackModels, contents, systemInstruction, isMaster }) {
    const ai = new GoogleGenAI({ apiKey });
    let replyText = null;
    let lastError = null;

    // Gunakan fallback default jika daftar model dari luar kosong
    const rawModels = (fallbackModels && fallbackModels.length > 0) 
        ? fallbackModels 
        : ['gemini-3.5-flash', 'gemini-3.8-flash', 'gemini-3.5-flash-lite'];

    const uniqueModels = [...new Set(rawModels)];

    // Perulangan untuk setiap Model Cadangan (Fallback Models)
    for (const modelName of uniqueModels) {
        const maxRetries = 3; // Coba ulang maksimal 3 kali jika server busy (503/429)

        // Perulangan untuk Auto-Retry
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const config = {
                    systemInstruction,
                    tools: isMaster ? [{ functionDeclarations: [saveFactTool] }] : []
                };

                const response = await ai.models.generateContent({
                    model: modelName,
                    contents,
                    config
                });

                // Cek Function Calling
                const functionCalls = response.functionCalls;
                if (functionCalls && functionCalls.length > 0) {
                    for (const call of functionCalls) {
                        if (call.name === 'save_master_fact') {
                            const newFact = call.args?.fact;
                            if (newFact) {
                                saveFactToMemory(newFact);
                                replyText = `✨ *Atri:* Atri sudah mencatat info baru tentang Master ke dalam memori Atri: _"${newFact}"_!`;
                            }
                        }
                    }
                } else {
                    replyText = response.text?.trim();
                }

                if (replyText) break; // Berhasil, keluar dari loop retry

            } catch (error) {
                lastError = error;
                const status = error?.status || error?.error?.code;

                // Jika error 503 (Server Busy) atau 429 (Rate Limit), coba retry dengan jeda
                if ((status === 503 || status === 429) && attempt < maxRetries) {
                    const waitTime = attempt * 1500; // Jeda 1.5 detik, lalu 3 detik
                    console.warn(`[GEMINI WARN] Model ${modelName} sibuk (${status}). Retry percobaan ke-${attempt} dalam ${waitTime}ms...`);
                    await delay(waitTime);
                } else {
                    // Jika error lain (misal 404 Model Not Found) atau retry sudah habis, pindah ke model berikutnya
                    console.warn(`[GEMINI WARN] Model ${modelName} gagal: ${error.message}`);
                    break;
                }
            }
        }

        if (replyText) break; // Berhasil, keluar dari loop fallback model
    }

    if (!replyText) {
        throw lastError || new Error('Gagal mendapatkan respon dari Gemini API.');
    }

    return replyText;
}