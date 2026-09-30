export default {
    name: 'ping',
    description: 'Cek status aktif System',
    execute: async (sock, from, msg, args) => {
        await sock.sendMessage(from, { text: 'Pong! AtriSystem aktif dan siap digunakan.' }, { quoted: msg });
    }
};