import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const execPromise = promisify(exec);

/**
 * Mengonversi buffer WebP (Stiker) menjadi JPG menggunakan FFmpeg
 */
async function convertWebpToJpg(webpBuffer) {
    const tmpDir = path.join(process.cwd(), 'tmp');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

    const inputPath = path.join(tmpDir, `sticker_${Date.now()}.webp`);
    const outputPath = path.join(tmpDir, `image_${Date.now()}.jpg`);

    try {
        fs.writeFileSync(inputPath, webpBuffer);
        
        // Konversi WebP ke JPG dengan FFmpeg
        await execPromise(`ffmpeg -i "${inputPath}" "${outputPath}"`);
        
        return fs.readFileSync(outputPath);
    } finally {
        if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    }
}

export default {
    name: 'toimg',
    description: 'Mengubah stiker (reply) menjadi gambar biasa',
    execute: async (sock, from, msg, args) => {
        const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        const isQuotedSticker = quotedMsg?.stickerMessage;
        const isDirectSticker = msg.message?.stickerMessage;

        if (!isQuotedSticker && !isDirectSticker) {
            await sock.sendMessage(from, { 
                text: '⚠️ Balas/reply sebuah stiker dengan perintah `_atri toimg` untuk mengubahnya menjadi gambar!' 
            }, { quoted: msg });
            return;
        }

        let targetMsg = msg;
        if (isQuotedSticker) {
            targetMsg = { message: quotedMsg };
        }

        try {
            // 1. Download buffer stiker
            const stickerBuffer = await downloadMediaMessage(targetMsg, 'buffer', {});

            // 2. Konversi WebP ke JPG
            const imageBuffer = await convertWebpToJpg(stickerBuffer);

            // 3. Kirim sebagai gambar biasa
            await sock.sendMessage(from, { 
                image: imageBuffer,
                caption: '✅ Berhasil mengubah stiker menjadi gambar!'
            }, { quoted: msg });

        } catch (error) {
            console.error('Gagal mengonversi stiker ke gambar:', error);
            await sock.sendMessage(from, { 
                text: '❌ Terjadi kesalahan saat mengonversi stiker ke gambar.' 
            }, { quoted: msg });
        }
    }
};