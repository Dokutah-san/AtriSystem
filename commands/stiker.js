import { downloadMediaMessage } from '@whiskeysockets/baileys';
import sharp from 'sharp';

/**
 * Fungsi untuk membuat SVG teks sebagai overlay.
 * Teks SVG lebih fleksibel untuk sharp.
 */
function createTextSVG(text, width, height, position = 'bottom') {
    // Sanitasi teks untuk SVG
    const sanitizedText = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    
    // Hitung ukuran font secara dinamis berdasarkan panjang teks dan lebar stiker
    const baseFontSize = 40; // Ukuran font dasar
    const fontSize = Math.max(20, baseFontSize - Math.floor(sanitizedText.length / 5));
    
    // Tentukan posisi vertikal
    let yPosition;
    if (position === 'top') {
        yPosition = '10%'; // Sedikit di bawah atas
    } else {
        yPosition = '85%'; // Sedikit di atas bawah
    }

    // SVG Teks dengan Stroke (garis tepi) agar terbaca di semua background
    return Buffer.from(`
        <svg width="${width}" height="${height}">
            <style>
                .text {
                    fill: white;
                    font-size: ${fontSize}px;
                    font-weight: bold;
                    font-family: Arial, sans-serif;
                    text-anchor: middle;
                    dominant-baseline: middle;
                    stroke: black;
                    stroke-width: 2px;
                    paint-order: stroke;
                }
            </style>
            <text x="50%" y="${yPosition}" class="text">${sanitizedText}</text>
        </svg>
    `);
}

/**
 * Fungsi utama memproses stiker dengan teks.
 */
async function imageToStickerWithText(imageBuffer, textArgs) {
    const stickerSize = 512;
    const s = sharp(imageBuffer);
    
    // 1. Resize gambar utama agar fit dalam 512x512 dengan background transparan
    const baseImage = await s
        .resize(stickerSize, stickerSize, {
            fit: 'contain',
            background: { r: 0, g: 0, b: 0, alpha: 0 }
        })
        .png() // Ubah ke PNG sementara untuk overlay teks yang jernih
        .toBuffer();

    let finalSharp = sharp(baseImage);
    const composites = [];

    if (textArgs && textArgs.length > 0) {
        // Cek format canggih "top: teks atas | bottom: teks bawah"
        const textStr = textArgs.join(' ');
        
        if (textStr.includes('|') && (textStr.includes('top:') || textStr.includes('bottom:'))) {
            const parts = textStr.split('|');
            for (const part of parts) {
                const trimmedPart = part.trim();
                if (trimmedPart.startsWith('top:')) {
                    const topText = trimmedPart.substring(4).trim();
                    if (topText) {
                        composites.push({ 
                            input: createTextSVG(topText, stickerSize, stickerSize, 'top'), 
                            gravity: 'center' 
                        });
                    }
                } else if (trimmedPart.startsWith('bottom:')) {
                    const bottomText = trimmedPart.substring(7).trim();
                    if (bottomText) {
                        composites.push({ 
                            input: createTextSVG(bottomText, stickerSize, stickerSize, 'bottom'), 
                            gravity: 'center' 
                        });
                    }
                }
            }
        } else {
            // Format sederhana: "_atri stiker Teks Di Sini" (default teks bawah)
            composites.push({ 
                input: createTextSVG(textStr, stickerSize, stickerSize, 'bottom'), 
                gravity: 'center' 
            });
        }
    }

    // 2. Gabungkan gambar utama dengan SVG teks
    if (composites.length > 0) {
        finalSharp = finalSharp.composite(composites);
    }

    // 3. Konversi akhir ke format stiker (WebP)
    return await finalSharp.webp().toBuffer();
}

export default {
    name: 'stiker',
    description: 'Ubah gambar menjadi stiker WA, tambahkan teks setelah perintah.',
    execute: async (sock, from, msg, args) => {
        // Logika pengecekan media (sama seperti sebelumnya)
        const isImage = msg.message?.imageMessage;
        const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        const isQuotedImage = quotedMsg?.imageMessage;

        // Mendukung juga me-reply stiker untuk ditambahi teks
        const isSticker = msg.message?.stickerMessage;
        const isQuotedSticker = quotedMsg?.stickerMessage;

        const hasMedia = isImage || isQuotedImage || isSticker || isQuotedSticker;

        if (!hasMedia) {
            await sock.sendMessage(from, { 
                text: '⚠️ Kirim gambar/stiker dengan caption atau reply gambar/stiker yang sudah ada dengan perintah stiker!\n\n' +
                      '*Contoh:*\n' +
                      '• `_atri stiker Teks Bawah` (default)\n' +
                      '• `_atri stiker top: Teks Atas`\n' +
                      '• `_atri stiker top: Halo | bottom: Dunia`'
            }, { quoted: msg });
            return;
        }

        // Tampilkan loading lebih awal karena proses sharp lebih lama
        await sock.sendMessage(from, { text: '⏳ Sedang memproses stiker dengan teks...' }, { quoted: msg });

        let targetMsg = msg;
        if (isQuotedImage || isQuotedSticker) {
            targetMsg = { message: quotedMsg };
        }

        try {
            // Download buffer gambar/stiker
            const buffer = await downloadMediaMessage(targetMsg, 'buffer', {});
            
            // Konversi ke format stiker dengan teks (WebP)
            const stickerBuffer = await imageToStickerWithText(buffer, args);

            // Kirim stiker
            await sock.sendMessage(from, { sticker: stickerBuffer }, { quoted: msg });
        } catch (error) {
            console.error('Gagal membuat stiker teks:', error);
            await sock.sendMessage(from, { text: '❌ Terjadi kesalahan saat memproses stiker teks.' }, { quoted: msg });
        }
    }
};