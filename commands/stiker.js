import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { Jimp, loadFont } from 'jimp';
import { SANS_32_WHITE } from '@jimp/plugin-print/fonts';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const execPromise = promisify(exec);

/**
 * Memproses gambar + overlay teks meme menggunakan Jimp
 */
async function processMemeImage(imageBuffer, textArgs) {
    const stickerSize = 512;

    // 1. Baca gambar & resize proporsional
    const image = await Jimp.read(imageBuffer);
    image.contain({ w: stickerSize, h: stickerSize });

    // 2. Olah Teks jika ada argumen
    if (textArgs && textArgs.length > 0) {
        const textStr = textArgs.join(' ');
        let topText = '';
        let bottomText = '';

        if (textStr.includes('|') && (textStr.includes('top:') || textStr.includes('bottom:'))) {
            const parts = textStr.split('|');
            for (const part of parts) {
                const trimmed = part.trim();
                if (trimmed.startsWith('top:')) topText = trimmed.substring(4).trim();
                if (trimmed.startsWith('bottom:')) bottomText = trimmed.substring(7).trim();
            }
        } else {
            bottomText = textStr; // Default: Teks Bawah
        }

        // Muat font bitmap Jimp
        const font = await loadFont(SANS_32_WHITE);

        // Cetak Teks Atas
        if (topText) {
            image.print({
                font: font,
                x: 0,
                y: 20,
                text: {
                    text: topText.toUpperCase(),
                    alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER
                },
                maxWidth: stickerSize
            });
        }

        // Cetak Teks Bawah
        if (bottomText) {
            image.print({
                font: font,
                x: 0,
                y: stickerSize - 70,
                text: {
                    text: bottomText.toUpperCase(),
                    alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER
                },
                maxWidth: stickerSize
            });
        }
    }

    return await image.getBuffer('image/png');
}

/**
 * Mengonversi buffer PNG ke WebP menggunakan FFmpeg sistem
 */
async function convertToWebp(inputBuffer) {
    const tmpDir = path.join(process.cwd(), 'tmp');
    if (!fs.existsSync(tmpDir)) {
        fs.mkdirSync(tmpDir, { recursive: true });
    }

    const inputPath = path.join(tmpDir, `input_${Date.now()}.png`);
    const outputPath = path.join(tmpDir, `output_${Date.now()}.webp`);

    try {
        // Tulis buffer ke file sementara
        fs.writeFileSync(inputPath, inputBuffer);

        // Konversi ke WebP menggunakan FFmpeg
        await execPromise(`ffmpeg -i "${inputPath}" -vf "scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000" -vcodec libwebp -preset default -loop 0 -vsync 0 -ptree 0 "${outputPath}"`);

        const webpBuffer = fs.readFileSync(outputPath);
        return webpBuffer;
    } finally {
        // Hapus file sementara
        if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    }
}

export default {
    name: 'stiker',
    description: 'Ubah gambar/stiker menjadi stiker WA dengan teks meme & metadata AtriAssisten.',
    execute: async (sock, from, msg, args) => {
        const isImage = msg.message?.imageMessage;
        const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        const isQuotedImage = quotedMsg?.imageMessage;
        const isSticker = msg.message?.stickerMessage;
        const isQuotedSticker = quotedMsg?.stickerMessage;

        const hasMedia = isImage || isQuotedImage || isSticker || isQuotedSticker;

        if (!hasMedia) {
            await sock.sendMessage(from, { 
                text: '⚠️ Kirim/reply gambar atau stiker dengan perintah *_atri stiker*!\n\n' +
                      '*Contoh penggunaan teks meme:*\n' +
                      '• `_atri stiker REAKSI KITA`\n' +
                      '• `_atri stiker top: TEKS ATAS | bottom: TEKS BAWAH`'
            }, { quoted: msg });
            return;
        }

        let targetMsg = msg;
        if (isQuotedImage || isQuotedSticker) {
            targetMsg = { message: quotedMsg };
        }

        try {
            // 1. Download media
            const rawBuffer = await downloadMediaMessage(targetMsg, 'buffer', {});

            // 2. Olah gambar & teks dengan Jimp
            const pngBuffer = await processMemeImage(rawBuffer, args);

            // 3. Konversi PNG ke WebP menggunakan FFmpeg
            const webpStickerBuffer = await convertToWebp(pngBuffer);

            // 4. Kirim stiker dengan Exif Metadata Baileys
            await sock.sendMessage(from, { 
                sticker: webpStickerBuffer,
                packname: 'AtriAssisten Sticker',
                author: 'AtriAssisten'
            }, { quoted: msg });

        } catch (error) {
            console.error('Gagal membuat stiker:', error);
            await sock.sendMessage(from, { text: '❌ Terjadi kesalahan saat memproses stiker.' }, { quoted: msg });
        }
    }
};