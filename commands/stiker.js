import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { Jimp } from 'jimp';
import { loadFont } from '@jimp/plugin-print';
import { SANS_32_WHITE, SANS_16_WHITE } from '@jimp/plugin-print/fonts';
import sharp from 'sharp';

/**
 * Memproses gambar + teks overlay memakai Jimp v1.x, dikonversi ke stiker WebP via Sharp
 */
async function createStickerWithJimp(imageBuffer, textArgs) {
    const stickerSize = 512;

    // 1. Baca gambar & resize proporsional (contain)
    const image = await Jimp.read(imageBuffer);
    image.contain({ w: stickerSize, h: stickerSize });

    // 2. Olah Teks & Watermark Pembuat
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

        // Ambil Font langsung via fungsi loadFont resmi
        const fontLarge = await loadFont(SANS_32_WHITE);
        const fontSmall = await loadFont(SANS_16_WHITE);

        // Cetak Teks Atas
        if (topText) {
            image.print({
                font: fontLarge,
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
                font: fontLarge,
                x: 0,
                y: stickerSize - 80,
                text: {
                    text: bottomText.toUpperCase(),
                    alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER
                },
                maxWidth: stickerSize
            });
        }

        // Watermark Pembuat
        image.print({
            font: fontSmall,
            x: 0,
            y: stickerSize - 25,
            text: {
                text: 'By: ATRI Bot',
                alignmentX: Jimp.HORIZONTAL_ALIGN_RIGHT
            },
            maxWidth: stickerSize - 10
        });
    } else {
        // Watermark Default jika tanpa argumen teks
        const fontSmall = await loadFont(SANS_16_WHITE);
        image.print({
            font: fontSmall,
            x: 0,
            y: stickerSize - 25,
            text: {
                text: 'By: ATRI Bot',
                alignmentX: Jimp.HORIZONTAL_ALIGN_RIGHT
            },
            maxWidth: stickerSize - 10
        });
    }

    // 3. Konversi buffer Jimp (PNG) ke format Stiker WebP via Sharp
    const pngBuffer = await image.getBuffer('image/png');
    return await sharp(pngBuffer).webp().toBuffer();
}

export default {
    name: 'stiker',
    description: 'Ubah gambar/stiker menjadi stiker WA dengan teks & watermark pembuat.',
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
                      '*Contoh:*\n' +
                      '• `_atri stiker Teks Bawah`\n' +
                      '• `_atri stiker top: Teks Atas`\n' +
                      '• `_atri stiker top: Halo | bottom: Dunia`'
            }, { quoted: msg });
            return;
        }

        await sock.sendMessage(from, { text: '⏳ Sedang memproses stiker dengan teks...' }, { quoted: msg });

        let targetMsg = msg;
        if (isQuotedImage || isQuotedSticker) {
            targetMsg = { message: quotedMsg };
        }

        try {
            const buffer = await downloadMediaMessage(targetMsg, 'buffer', {});
            const stickerBuffer = await createStickerWithJimp(buffer, args);

            await sock.sendMessage(from, { sticker: stickerBuffer }, { quoted: msg });
        } catch (error) {
            console.error('Gagal membuat stiker teks:', error);
            await sock.sendMessage(from, { text: '❌ Terjadi kesalahan saat memproses stiker teks.' }, { quoted: msg });
        }
    }
};