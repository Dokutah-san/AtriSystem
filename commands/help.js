export default {
    name: 'help',
    description: 'Menampilkan daftar perintah',
    execute: async (sock, from, msg, args, commands) => {
        let menuText = `*AtriSystem Feature*\n\n`;
        commands.forEach((cmd) => {
            menuText += `• *_atri ${cmd.name}* : ${cmd.description}\n`;
        });

        await sock.sendMessage(from, { text: menuText }, { quoted: msg });
    }
};