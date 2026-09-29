import { downloadMediaMessage } from '@whiskeysockets/baileys';
import Jimp from 'jimp';
import sharp from 'sharp';

/**
 * Memproses gambar + teks overlay memakai Jimp, lalu dikonversi ke stiker WebP via Sharp
 */
async function createStickerWithJimp(imageBuffer, textArgs) {
    const stickerSize = 512;

    // 1. Baca gambar dengan Jimp & resize secara proporsional ke 512x512
    const image = await Jimp.read(imageBuffer);
    image.contain(stickerSize, stickerSize);

    // 2. Olah Teks & Watermark
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

        // Font bawaan Jimp
        const fontLarge = await Jimp.loadFont(Jimp.FONT_SANS_32_WHITE);
        const fontSmall = await Jimp.loadFont(Jimp.FONT_SANS_16_WHITE);

        // Cetak Teks Atas
        if (topText) {
            image.print(
                fontLarge,
                0,
                20,
                {
                    text: topText.toUpperCase(),
                    alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER,
                    alignmentY: Jimp.VERTICAL_ALIGN_TOP
                },
                stickerSize,
                stickerSize
            );
        }

        // Cetak Teks Bawah
        if (bottomText) {
            image.print(
                fontLarge,
                0,
                stickerSize - 80,
                {
                    text: bottomText.toUpperCase(),
                    alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER,
                    alignmentY: Jimp.VERTICAL_ALIGN_TOP
                },
                stickerSize,
                stickerSize
            );
        }

        // Watermark Pembuat
        image.print(
            fontSmall,
            0,
            stickerSize - 25,
            {
                text: 'By: ATRI Bot',
                alignmentX: Jimp.HORIZONTAL_ALIGN_RIGHT,
                alignmentY: Jimp.VERTICAL_ALIGN_TOP
            },
            stickerSize - 10,
            stickerSize
        );
    } else {
        // Watermark default jika tanpa teks
        const fontSmall = await Jimp.loadFont(Jimp.FONT_SANS_16_WHITE);
        image.print(
            fontSmall,
            0,
            stickerSize - 25,
            {
                text: 'By: ATRI Bot',
                alignmentX: Jimp.HORIZONTAL_ALIGN_RIGHT,
                alignmentY: Jimp.VERTICAL_ALIGN_TOP
            },
            stickerSize - 10,
            stickerSize
        );
    }

    // 3. Konversi buffer Jimp (PNG) ke format Stiker WebP via Sharp
    const pngBuffer = await image.getBufferAsync(Jimp.MIME_PNG);
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