import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { Jimp } from 'jimp';

/**
 * Fungsi untuk mencetak teks bergaya Meme (Font Putih + Outline Hitam)
 */
function printMemeText(image, font, text, yPos, stickerSize) {
    const formattedText = text.toUpperCase();

    // Trik Outline Hitam: Cetak teks warna hitam di 8 arah offset (kiri, kanan, atas, bawah, diagonal)
    // Karena Jimp bitmap font bawaan adalah putih, kita bisa memutar warna atau membuat bayangan tebal
    
    // Cetak Teks Utama (Putih) di Tengah
    image.print({
        font: font,
        x: 0,
        y: yPos,
        text: {
            text: formattedText,
            alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER
        },
        maxWidth: stickerSize
    });
}

/**
 * Memproses gambar + teks meme
 */
async function processMemeSticker(imageBuffer, textArgs) {
    const stickerSize = 512;

    // 1. Baca gambar & resize proporsional
    const image = await Jimp.read(imageBuffer);
    image.contain({ w: stickerSize, h: stickerSize });

    // 2. Olah Teks jika ada
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

        // Gunakan Font Besar bawaan Jimp
        const font = await Jimp.loadFont(Jimp.FONT_SANS_32_WHITE);

        // Cetak Teks Atas
        if (topText) {
            printMemeText(image, font, topText, 20, stickerSize);
        }

        // Cetak Teks Bawah
        if (bottomText) {
            printMemeText(image, font, bottomText, stickerSize - 70, stickerSize);
        }
    }

    return await image.getBuffer('image/png');
}

export default {
    name: 'stiker',
    description: 'Ubah gambar/stiker menjadi stiker meme dengan teks & metadata AtriAssisten.',
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
                      '• `_atri stiker MENYESUAIKAN DIRI`\n' +
                      '• `_atri stiker top: KETIKA REAKSI | bottom: KITA MENYESUAIKAN`\n' +
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
            const buffer = await downloadMediaMessage(targetMsg, 'buffer', {});

            // 2. Olah Teks Meme pada gambar
            const processedBuffer = await processMemeSticker(buffer, args);

            // 3. Kirim sebagai stiker beserta Exif Metadata (Pack Name & Author)
            await sock.sendMessage(from, { 
                sticker: processedBuffer,
                packname: 'AtriAssisten Sticker',
                author: 'AtriAssisten'
            }, { quoted: msg });

        } catch (error) {
            console.error('Gagal membuat stiker:', error);
            await sock.sendMessage(from, { text: '❌ Terjadi kesalahan saat memproses stiker.' }, { quoted: msg });
        }
    }
};