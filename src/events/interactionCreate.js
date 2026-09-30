const { ChannelType, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fs = require('fs');
const path = require('path');

function getSettings() {
    const p = path.join(__dirname, '../../settings.json');
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

module.exports = async (client, interaction) => {
    // 1. Slash Commands Execution
    if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) return;

        try {
            // Track command execution stats
            const settingsPath = path.join(__dirname, '../../settings.json');
            const currentSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
            currentSettings.stats.commandsExecuted = (currentSettings.stats.commandsExecuted || 0) + 1;
            fs.writeFileSync(settingsPath, JSON.stringify(currentSettings, null, 2), 'utf-8');

            await command.execute(interaction, client);
        } catch (error) {
            console.error(`Error executing command ${interaction.commandName}:`, error);
            const replyContent = { content: '❌ An error occurred while executing this command.', ephemeral: true };
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(replyContent);
            } else {
                await interaction.reply(replyContent);
            }
        }
        return;
    }

    // 2. Button Interactions (Tickets, Suggestions)
    if (interaction.isButton()) {
        const { customId, guild, user } = interaction;

        // Support Ticket Creation
        if (customId === 'create_ticket_btn') {
            const ticketChannelName = `ticket-${user.username.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
            
            // Check if user already has an open ticket
            const existing = guild.channels.cache.find(c => c.name === ticketChannelName);
            if (existing) {
                return interaction.reply({ content: `❌ You already have an open ticket: ${existing}`, ephemeral: true });
            }

            try {
                const channel = await guild.channels.create({
                    name: ticketChannelName,
                    type: ChannelType.GuildText,
                    permissionOverwrites: [
                        {
                            id: guild.id,
                            deny: [PermissionFlagsBits.ViewChannel]
                        },
                        {
                            id: user.id,
                            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.ReadMessageHistory]
                        },
                        {
                            id: client.user.id,
                            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels]
                        }
                    ]
                });

                const welcomeEmbed = new EmbedBuilder()
                    .setColor('#5865F2')
                    .setTitle(`🎫 Ticket Created: #${ticketChannelName}`)
                    .setDescription(`Welcome ${user}! A member of staff will assist you shortly.\nPlease describe your inquiry in detail.`)
                    .setFooter({ text: 'Use /close to close this ticket at any time.' });

                const closeRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('close_ticket_btn')
                        .setLabel('Close Ticket')
                        .setEmoji('🔒')
                        .setStyle(ButtonStyle.Danger)
                );

                await channel.send({ content: `${user}`, embeds: [welcomeEmbed], components: [closeRow] });
                await interaction.reply({ content: `✅ Your ticket has been created: ${channel}`, ephemeral: true });
            } catch (err) {
                console.error('Error creating ticket channel:', err);
                await interaction.reply({ content: '❌ Failed to create ticket channel. Ensure bot has Manage Channels permission.', ephemeral: true });
            }
            return;
        }

        // Close Ticket Button
        if (customId === 'close_ticket_btn') {
            await interaction.reply('🔒 Closing ticket in 5 seconds...');
            setTimeout(async () => {
                await interaction.channel.delete().catch(() => null);
            }, 5000);
            return;
        }

        // Suggestion Voting Buttons
        if (customId === 'suggest_upvote' || customId === 'suggest_downvote') {
            await interaction.reply({ content: '✅ Your reaction vote has been recorded!', ephemeral: true });
            return;
        }

        // Music Controls
        if (customId.startsWith('music_')) {
            const musicManager = require('../music-manager.js');
            const queue = musicManager.getQueue(guild.id);

            if (!queue || !queue.playing) {
                return interaction.reply({ content: '❌ No music is currently playing in this server.', ephemeral: true });
            }

            if (customId === 'music_toggle_pause') {
                if (queue.paused) {
                    musicManager.resume(guild.id);
                    await interaction.reply({ content: '▶️ Resumed music playback.', ephemeral: true });
                } else {
                    musicManager.pause(guild.id);
                    await interaction.reply({ content: '⏸️ Paused music playback.', ephemeral: true });
                }
                return;
            }

            if (customId === 'music_skip') {
                const title = queue.currentSong?.title || 'current song';
                musicManager.skip(guild.id);
                await interaction.reply({ content: `⏭️ Skipped **${title}**!`, ephemeral: true });
                return;
            }

            if (customId === 'music_stop') {
                musicManager.stop(guild.id);
                await interaction.reply({ content: '⏹️ Stopped music playback and cleared the queue.' });
                return;
            }

            if (customId === 'music_shuffle') {
                const success = musicManager.shuffle(guild.id);
                if (success) {
                    await interaction.reply({ content: `🔀 Shuffled **${queue.songs.length}** upcoming tracks in queue!`, ephemeral: true });
                } else {
                    await interaction.reply({ content: '❌ Need at least 2 upcoming tracks in queue to shuffle.', ephemeral: true });
                }
                return;
            }

            if (customId === 'music_queue') {
                const embed = new EmbedBuilder()
                    .setColor('#5865F2')
                    .setTitle(`🎵 Music Queue - ${guild.name}`)
                    .setDescription(
                        `**Now Playing:**\n[${queue.currentSong?.title || 'None'}](${queue.currentSong?.url || '#'}) \`[${queue.currentSong?.duration || '--'}]\`\n\n` +
                        `**Upcoming (${queue.songs.length} tracks):**\n` +
                        (queue.songs.length === 0 
                            ? '_Queue is empty!_' 
                            : queue.songs.slice(0, 8).map((s, i) => `\`${i + 1}.\` [${s.title}](${s.url}) \`[${s.duration}]\``).join('\n')
                        )
                    );
                await interaction.reply({ embeds: [embed], ephemeral: true });
                return;
            }
        }
    }
};
