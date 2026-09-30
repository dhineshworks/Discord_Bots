const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');

function getSettings() {
    const p = path.join(__dirname, '../../settings.json');
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

const BAD_WORDS = ['badword1', 'scam', 'nitro-gift', 'free-nitro', 'hack'];

module.exports = async (client, message) => {
    if (message.author.bot || !message.guild) return;

    const settings = getSettings();
    const protection = settings.modules.protection;

    // Protection Modules Check
    if (protection && protection.enabled) {
        // 1. Anti-Discord Invites
        if (protection.antiInvites) {
            const inviteRegex = /(discord\.(gg|io|me|li)\/.+|discordapp\.com\/invite\/.+)/i;
            if (inviteRegex.test(message.content) && !message.member.permissions.has('ManageMessages')) {
                await message.delete().catch(() => null);
                const warnMsg = await message.channel.send(`⚠️ ${message.author}, invite links are not permitted here.`);
                setTimeout(() => warnMsg.delete().catch(() => null), 4000);
                return;
            }
        }

        // 2. Anti-Mass Mention
        if (protection.antiMassMention) {
            const mentionsCount = message.mentions.users.size;
            if (mentionsCount > (protection.maxMentions || 5) && !message.member.permissions.has('MentionEveryone')) {
                await message.delete().catch(() => null);
                const warnMsg = await message.channel.send(`⚠️ ${message.author}, mass mentions are prohibited.`);
                setTimeout(() => warnMsg.delete().catch(() => null), 4000);
                return;
            }
        }

        // 3. Bad Words / Scams Filter
        if (protection.badWordsFilter) {
            const lower = message.content.toLowerCase();
            const foundBadWord = BAD_WORDS.some(w => lower.includes(w));
            if (foundBadWord && !message.member.permissions.has('ManageMessages')) {
                await message.delete().catch(() => null);
                const warnMsg = await message.channel.send(`⚠️ ${message.author}, your message contained restricted phrases.`);
                setTimeout(() => warnMsg.delete().catch(() => null), 4000);
                return;
            }
        }
    }

    // Prefix Commands Fallback (e.g., !ping, !help)
    const prefix = settings.prefix || '!';
    if (!message.content.startsWith(prefix)) return;

    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const cmd = args.shift().toLowerCase();

    if (cmd === 'ping') {
        message.reply(`🏓 Pong! Latency is ${Date.now() - message.createdTimestamp}ms. API: ${Math.round(client.ws.ping)}ms.`);
    } else if (cmd === 'help') {
        message.reply(`📖 CodeX Bot prefix is \`${prefix}\`. For modern interaction, use Slash Commands (\`/help\`) or manage everything via Dashboard on \`http://localhost:3001\`.`);
    }
};
