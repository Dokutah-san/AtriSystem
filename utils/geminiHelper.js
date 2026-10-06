import { GoogleGenAI, Type } from '@google/genai';
import fs from 'fs';
import path from 'path';

// Path file memori jangka panjang (JSON)
const MEMORY_FILE = path.join(process.cwd(), 'memory.json');

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
 * Fungsi Utama untuk Memproses Generasi Konten Gemini API
 */
export async function generateGeminiResponse({ apiKey, fallbackModels, contents, systemInstruction, isMaster }) {
    const ai = new GoogleGenAI({ apiKey });
    let replyText = null;
    let lastError = null;

    const uniqueModels = [...new Set(fallbackModels)];

    for (const modelName of uniqueModels) {
        try {
            const config = {
                systemInstruction,
                // Function Calling Tool hanya diaktifkan jika pengirim adalah Master
                tools: isMaster ? [{ functionDeclarations: [saveFactTool] }] : []
            };

            const response = await ai.models.generateContent({
                model: modelName,
                contents,
                config
            });

            // Cek apakah Gemini memanggil Tool/Function Call
            const functionCalls = response.functionCalls;
            if (functionCalls && functionCalls.length > 0) {
                for (const call of functionCalls) {
                    if (call.name === 'save_master_fact') {
                        const newFact = call.args?.fact;
                        if (newFact) {
                            saveFactToMemory(newFact);
                            replyText = `✨ *Atri:* Atri sudah mencatat fakta baru tentang Master ke dalam memori Atri: _"${newFact}"_!`;
                        }
                    }
                }
            } else {
                replyText = response.text?.trim();
            }

            if (replyText) break;
        } catch (error) {
            lastError = error;
            console.warn(`[GEMINI WARN] Model ${modelName} gagal: ${error.message}`);
        }
    }

    if (!replyText) {
        throw lastError || new Error('Gagal mendapatkan respon dari Gemini API.');
    }

    return replyText;
}