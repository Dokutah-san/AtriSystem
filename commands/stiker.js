import { downloadMediaMessage } from '@whiskeysockets/baileys';
import sharp from 'sharp';

async function imageToSticker(imageBuffer) {
    return await sharp(imageBuffer)
        .resize(512, 512, {
            fit: 'contain',
            background: { r: 0, g: 0, b: 0, alpha: 0 }
        })
        .webp()
        .toBuffer();
}

export default {
    name: 'stiker',
    description: 'Ubah gambar menjadi stiker WA',
    execute: async (sock, from, msg, args) => {
        const isImage = msg.message?.imageMessage;
        const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        const isQuotedImage = quotedMsg?.imageMessage;

        if (!isImage && !isQuotedImage) {
            await sock.sendMessage(from, { 
                text: '⚠️ Kirim gambar dengan caption *_atri stiker* atau reply gambar dengan *_atri stiker*!' 
            }, { quoted: msg });
            return;
        }

        await sock.sendMessage(from, { text: '⏳ Sedang memproses stiker...' }, { quoted: msg });

        let targetMsg = msg;
        if (isQuotedImage) {
            targetMsg = { message: quotedMsg };
        }

        const buffer = await downloadMediaMessage(targetMsg, 'buffer', {});
        const stickerBuffer = await imageToSticker(buffer);

        await sock.sendMessage(from, { sticker: stickerBuffer }, { quoted: msg });
    }
};