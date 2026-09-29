import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { Jimp, loadFont, measureText, ResizeStrategy } from 'jimp';
import { SANS_32_WHITE, SANS_32_BLACK } from '@jimp/plugin-print/fonts';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import webp from 'node-webpmux';

const execPromise = promisify(exec);

/**
 * Menyuntikkan Metadata Exif (Pack Name & Author) ke file WebP
 */
async function addExifMetadata(webpBuffer, packname, author) {
    const img = new webp.Image();
    await img.load(webpBuffer);

    const json = {
        'sticker-pack-id': 'AtriAssisten',
        'sticker-pack-name': packname,
        'sticker-pack-publisher': author,
        'emojis': ['🤖']
    };

    const exifHeader = Buffer.from([0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00]);
    const jsonBuffer = Buffer.from(JSON.stringify(json), 'utf-8');
    const exif = Buffer.concat([exifHeader, jsonBuffer]);
    exif.writeUIntLE(jsonBuffer.length, 14, 4);

    img.exif = exif;
    return await img.save(null);
}

/**
 * Memproses gambar + teks meme bergaya Stroke Hitam & Tulisan Besar
 */
async function processMemeImage(imageBuffer, textArgs) {
    const stickerSize = 512;
    const image = await Jimp.read(imageBuffer);
    image.contain({ w: stickerSize, h: stickerSize });

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
            bottomText = textStr;
        }

        // Muat font putih & hitam dari Jimp
        const fontWhite = await loadFont(SANS_32_WHITE);
        const fontBlack = await loadFont(SANS_32_BLACK);

        // Lay out classic meme captions on a small transparent layer, then scale
        // the bitmap font to fill the sticker. This avoids tiny fixed 32px text
        // and keeps rendering lightweight on Android phones such as the A01.
        const printMemeCaption = (text, position) => {
            const formatted = text.toLocaleUpperCase();
            const maxTextWidth = stickerSize - 32;
            const maxLines = 3;
            const words = formatted.split(/\s+/).filter(Boolean);
            const lines = [];
            let line = '';

            for (const word of words) {
                const candidate = line ? `${line} ${word}` : word;
                if (line && measureText(fontWhite, candidate) > maxTextWidth) {
                    lines.push(line);
                    line = word;
                } else {
                    line = candidate;
                }
            }
            if (line) lines.push(line);

            // Split an unusually long single word so it stays inside the canvas.
            for (let i = 0; i < lines.length; i++) {
                while (measureText(fontWhite, lines[i]) > maxTextWidth) {
                    const current = lines[i];
                    let cut = current.length - 1;
                    while (cut > 1 && measureText(fontWhite, current.slice(0, cut)) > maxTextWidth) cut--;
                    lines[i] = current.slice(0, cut);
                    lines.splice(i + 1, 0, current.slice(cut));
                }
            }

            // Keep the caption compact and readable when the user enters a lot of text.
            if (lines.length > maxLines) {
                const joined = lines.slice(maxLines - 1).join(' ');
                lines.length = maxLines;
                lines[maxLines - 1] = joined;
            }

            const padding = 10;
            const lineHeight = fontWhite.common.lineHeight;
            const sourceWidth = Math.max(...lines.map((item) => measureText(fontWhite, item)));
            const sourceHeight = lines.length * lineHeight;
            const desiredWidth = Math.min(maxTextWidth, sourceWidth * 1.65);
            const desiredHeight = Math.min(150, sourceHeight * 1.65);
            const scale = Math.min(desiredWidth / sourceWidth, desiredHeight / sourceHeight);
            const layer = new Jimp({
                width: Math.ceil(sourceWidth + padding * 2),
                height: Math.ceil(sourceHeight + padding * 2),
                color: 0x00000000
            });
            const outline = [[-2, 0], [2, 0], [0, -2], [0, 2], [-2, -2], [2, -2], [-2, 2], [2, 2]];

            lines.forEach((captionLine, index) => {
                const y = padding + index * lineHeight;
                for (const [dx, dy] of outline) {
                    layer.print({ font: fontBlack, x: padding + dx, y: y + dy, text: captionLine });
                }
                layer.print({ font: fontWhite, x: padding, y, text: captionLine });
            });

            const resizedWidth = Math.max(1, Math.round((sourceWidth + padding * 2) * scale));
            const resizedHeight = Math.max(1, Math.round((sourceHeight + padding * 2) * scale));
            layer.resize({ w: resizedWidth, h: resizedHeight, mode: ResizeStrategy.NEAREST_NEIGHBOR });
            const x = Math.round((stickerSize - resizedWidth) / 2);
            const y = position === 'top' ? 8 : stickerSize - resizedHeight - 8;
            image.composite(layer, x, y);
        };

        if (topText) printMemeCaption(topText, 'top');
        if (bottomText) printMemeCaption(bottomText, 'bottom');
    }

    return await image.getBuffer('image/png');
}

/**
 * Konversi PNG ke WebP menggunakan FFmpeg
 */
async function convertToWebp(inputBuffer) {
    const tmpDir = path.join(process.cwd(), 'tmp');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

    const inputPath = path.join(tmpDir, `input_${Date.now()}.png`);
    const outputPath = path.join(tmpDir, `output_${Date.now()}.webp`);

    try {
        fs.writeFileSync(inputPath, inputBuffer);
        await execPromise(`ffmpeg -i "${inputPath}" -vf "scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000" -vcodec libwebp -preset default -loop 0 -vsync 0 "${outputPath}"`);
        return fs.readFileSync(outputPath);
    } finally {
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

            // 2. Process Meme Image
            const pngBuffer = await processMemeImage(rawBuffer, args);

            // 3. Convert to WebP via FFmpeg
            const webpBuffer = await convertToWebp(pngBuffer);

            // 4. Inject Exif Packname & Author Metadata
            const finalStickerWithExif = await addExifMetadata(
                webpBuffer, 
                'AtriAssisten Sticker', 
                'AtriAssisten'
            );

            // 5. Send Sticker
            await sock.sendMessage(from, { 
                sticker: finalStickerWithExif 
            }, { quoted: msg });

        } catch (error) {
            console.error('Gagal membuat stiker:', error);
            await sock.sendMessage(from, { text: '❌ Terjadi kesalahan saat memproses stiker.' }, { quoted: msg });
        }
    }
};
