import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import sharp from 'sharp';

/**
 * Fungsi untuk menggambar teks di atas gambar menggunakan Canvas
 */
async function createStickerWithCanvas(imageBuffer, textArgs) {
    const canvasSize = 512;
    const canvas = createCanvas(canvasSize, canvasSize);
    const ctx = canvas.getContext('2d');

    // 1. Load Gambar Utama
    const img = await loadImage(imageBuffer);
    
    // Hitung posisi gambar agar proporsional (contain) di canvas 512x512
    const hRatio = canvasSize / img.width;
    const vRatio = canvasSize / img.height;
    const ratio = Math.min(hRatio, vRatio);
    
    const centerShift_x = (canvasSize - img.width * ratio) / 2;
    const centerShift_y = (canvasSize - img.height * ratio) / 2;

    // Gambar background transparan & gambar utama
    ctx.clearRect(0, 0, canvasSize, canvasSize);
    ctx.drawImage(
        img,
        0, 0, img.width, img.height,
        centerShift_x, centerShift_y, img.width * ratio, img.height * ratio
    );

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

        // Pengaturan Gaya Teks (Meme Style: Impact/Bold Font dengan Stroke Hitam)
        ctx.fillStyle = 'white';
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 4;
        ctx.textAlign = 'center';

        // Tulis Teks Atas
        if (topText) {
            const fontSize = Math.max(24, Math.floor(40 - topText.length / 2));
            ctx.font = `bold ${fontSize}px sans-serif`;
            ctx.strokeText(topText.toUpperCase(), canvasSize / 2, 50);
            ctx.fillText(topText.toUpperCase(), canvasSize / 2, 50);
        }

        // Tulis Teks Bawah
        if (bottomText) {
            const fontSize = Math.max(24, Math.floor(40 - bottomText.length / 2));
            ctx.font = `bold ${fontSize}px sans-serif`;
            ctx.strokeText(bottomText.toUpperCase(), canvasSize / 2, canvasSize - 35);
            ctx.fillText(bottomText.toUpperCase(), canvasSize / 2, canvasSize - 35);
        }
    }

    // 3. Tambahkan Watermark Pembuat di Pojok Kanan Bawah (Kecil)
    ctx.font = 'bold 12px sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.lineWidth = 2;
    ctx.textAlign = 'right';
    ctx.strokeText('By: ATRI Bot', canvasSize - 10, canvasSize - 10);
    ctx.fillText('By: ATRI Bot', canvasSize - 10, canvasSize - 10);

    // 4. Konversi Canvas Buffer ke Stiker WebP via Sharp
    const pngBuffer = canvas.toBuffer('image/png');
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
            const stickerBuffer = await createStickerWithCanvas(buffer, args);

            await sock.sendMessage(from, { sticker: stickerBuffer }, { quoted: msg });
        } catch (error) {
            console.error('Gagal membuat stiker teks:', error);
            await sock.sendMessage(from, { text: '❌ Terjadi kesalahan saat memproses stiker teks.' }, { quoted: msg });
        }
    }
};