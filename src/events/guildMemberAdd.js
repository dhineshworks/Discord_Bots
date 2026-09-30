const fs = require('fs');
const path = require('path');
const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { generateWelcomeCard, getOrdinal } = require('../welcome-card.js');

function getSettings() {
    const p = path.join(__dirname, '../../settings.json');
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

module.exports = async (client, member) => {
    const settings = getSettings();

    // 1. Auto-Role Assignment
    if (settings.modules.autorole?.enabled && settings.modules.autorole.roleName) {
        const role = member.guild.roles.cache.find(r => r.name.toLowerCase() === settings.modules.autorole.roleName.toLowerCase());
        if (role) {
            await member.roles.add(role).catch(err => console.error('Failed to assign auto-role:', err));
        }
    }

    // 2. Member Join Logging
    if (settings.modules.logs?.enabled && settings.modules.logs.logJoins) {
        const logChannel = member.guild.channels.cache.find(c => c.name === settings.modules.logs.channel);
        if (logChannel) {
            const embed = new EmbedBuilder()
                .setColor('#23a55a')
                .setTitle('📥 Member Joined')
                .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
                .addFields(
                    { name: 'Member', value: `${member.user.tag} (${member.id})`, inline: true },
                    { name: 'Account Age', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true },
                    { name: 'Total Server Members', value: `${member.guild.memberCount}`, inline: true }
                )
                .setTimestamp();

            await logChannel.send({ embeds: [embed] }).catch(() => null);
        }
    }

    // 3. Custom Image Welcome Banner & Message
    const welcomeModule = settings.modules.welcome || { enabled: true, channel: 'welcome' };
    if (welcomeModule.enabled !== false) {
        const targetChannel = 
            member.guild.channels.cache.find(c => c.isTextBased() && c.name.toLowerCase() === (welcomeModule.channel || 'welcome').toLowerCase())
            || member.guild.channels.cache.find(c => c.isTextBased() && c.name.toLowerCase().includes('welcome'))
            || member.guild.systemChannel
            || member.guild.channels.cache.find(c => c.isTextBased() && c.name.toLowerCase().includes('general'))
            || member.guild.channels.cache.find(c => c.isTextBased());

        if (targetChannel) {
            try {
                const cardBuffer = await generateWelcomeCard(member);
                const attachment = new AttachmentBuilder(cardBuffer, { name: 'welcome.png' });
                const ordinal = getOrdinal(member.guild.memberCount);

                // Message format: Welcome @User to server name  You are the 179th member!
                const messageContent = `Welcome <@${member.id}> to ${member.guild.name}  You are the ${ordinal} member!`;

                await targetChannel.send({
                    content: messageContent,
                    files: [attachment]
                });
            } catch (err) {
                console.error('[Welcome Card Error]:', err.message);
            }
        }
    }
};
