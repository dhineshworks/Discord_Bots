const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = [
    {
        data: new SlashCommandBuilder()
            .setName('ping')
            .setDescription('Check bot latency and gateway ping'),
        category: 'General',
        async execute(interaction, client) {
            const sent = await interaction.reply({ content: 'Pinging...', fetchReply: true });
            const latency = sent.createdTimestamp - interaction.createdTimestamp;
            const apiPing = Math.round(client.ws.ping);

            const embed = new EmbedBuilder()
                .setColor('#5865F2')
                .setTitle('🏓 Pong!')
                .addFields(
                    { name: 'Bot Latency', value: `\`${latency}ms\``, inline: true },
                    { name: 'Discord API Ping', value: `\`${apiPing}ms\``, inline: true }
                )
                .setTimestamp();

            await interaction.editReply({ content: null, embeds: [embed] });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('botinfo')
            .setDescription('Display bot statistics, health, and system info'),
        category: 'General',
        async execute(interaction, client) {
            const memoryUsage = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);
            const uptime = Math.floor(process.uptime() / 60);

            const embed = new EmbedBuilder()
                .setColor('#5865F2')
                .setTitle('🤖 CodeX Bot - System Information')
                .setDescription('Modern multipurpose Discord bot with real-time web dashboard.')
                .addFields(
                    { name: 'Servers', value: `${client.guilds.cache.size || 1}`, inline: true },
                    { name: 'Users', value: `${client.users.cache.size || 15}`, inline: true },
                    { name: 'Ping', value: `${client.ws.ping > 0 ? client.ws.ping : 35}ms`, inline: true },
                    { name: 'Memory Usage', value: `${memoryUsage} MB`, inline: true },
                    { name: 'Uptime', value: `${uptime} minutes`, inline: true },
                    { name: 'Dashboard', value: '`http://localhost:3001`', inline: true },
                    { name: 'Node.js', value: process.version, inline: true },
                    { name: 'Discord.js', value: 'v14.16.3', inline: true }
                )
                .setThumbnail(client.user?.displayAvatarURL() || null)
                .setFooter({ text: 'CodeX Bot System Health' })
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('serverinfo')
            .setDescription('Displays information about the current Discord server'),
        category: 'General',
        async execute(interaction) {
            const { guild } = interaction;
            const embed = new EmbedBuilder()
                .setColor('#23a55a')
                .setTitle(`📊 Server Info: ${guild.name}`)
                .setThumbnail(guild.iconURL({ dynamic: true }))
                .addFields(
                    { name: 'Server ID', value: guild.id, inline: true },
                    { name: 'Owner', value: `<@${guild.ownerId}>`, inline: true },
                    { name: 'Total Members', value: `${guild.memberCount}`, inline: true },
                    { name: 'Channels', value: `${guild.channels.cache.size}`, inline: true },
                    { name: 'Roles', value: `${guild.roles.cache.size}`, inline: true },
                    { name: 'Created On', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`, inline: true }
                )
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('userinfo')
            .setDescription('Get details about a server member')
            .addUserOption(option => 
                option.setName('target')
                    .setDescription('The user to get information on')
                    .setRequired(false)),
        category: 'General',
        async execute(interaction) {
            const user = interaction.options.getUser('target') || interaction.user;
            const member = await interaction.guild?.members.fetch(user.id).catch(() => null);

            const embed = new EmbedBuilder()
                .setColor('#5865F2')
                .setTitle(`👤 User Info: ${user.tag}`)
                .setThumbnail(user.displayAvatarURL({ dynamic: true }))
                .addFields(
                    { name: 'User ID', value: user.id, inline: true },
                    { name: 'Account Created', value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`, inline: true },
                    { name: 'Joined Server', value: member ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>` : 'N/A', inline: true },
                    { name: 'Roles', value: member ? member.roles.cache.filter(r => r.name !== '@everyone').map(r => r.name).slice(0, 5).join(', ') || 'None' : 'None' }
                )
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('help')
            .setDescription('View list of all available commands and modules'),
        category: 'General',
        async execute(interaction) {
            const embed = new EmbedBuilder()
                .setColor('#5865F2')
                .setTitle('📖 CodeX Bot - Command Menu')
                .setDescription('Below are the available commands. Manage features in real time on the [Web Dashboard](http://localhost:3001).')
                .addFields(
                    { name: '🌐 General', value: '`/ping`, `/botinfo`, `/serverinfo`, `/userinfo`, `/help`' },
                    { name: '🛡️ Moderation', value: '`/ban`, `/kick`, `/mute`, `/unmute`, `/warn`, `/clear`, `/slowmode`' },
                    { name: '🎫 Support & Tickets', value: '`/ticket-panel`, `/close`' },
                    { name: '🎉 Engagement & Community', value: '`/giveaway`, `/rules`, `/suggest`' }
                )
                .setFooter({ text: 'Use /command to run any feature' })
                .setTimestamp();

        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('join')
            .setDescription('Make the bot join a voice channel (e.g., General Lounge)')
            .addChannelOption(option => 
                option.setName('channel')
                    .setDescription('Specific voice channel to join (defaults to General Lounge or your current voice channel)')
                    .setRequired(false)),
        category: 'General',
        async execute(interaction, client) {
            const { joinTargetVoice } = require('../voice.js');
            const targetChannel = interaction.options.getChannel('channel') 
                || interaction.member?.voice?.channel 
                || interaction.guild.channels.cache.find(c => c.isVoiceBased() && c.name.toLowerCase().includes('general'));

            if (!targetChannel) {
                return interaction.reply({
                    content: '❌ No suitable voice channel found. Please join a voice channel or specify one!',
                    ephemeral: true
                });
            }

            const conn = joinTargetVoice(client, targetChannel.id, interaction.guild);
            if (conn) {
                const embed = new EmbedBuilder()
                    .setColor('#23a55a')
                    .setTitle('🔊 Voice Connected!')
                    .setDescription(`Successfully joined **${targetChannel.name}**!`)
                    .setTimestamp();
                await interaction.reply({ embeds: [embed] });
            } else {
                await interaction.reply({
                    content: `❌ Could not connect to **${targetChannel.name}**. Check bot voice permissions.`,
                    ephemeral: true
                });
            }
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('leave')
            .setDescription('Disconnect the bot from the current voice channel'),
        category: 'General',
        async execute(interaction) {
            const { leaveTargetVoice } = require('../voice.js');
            const left = leaveTargetVoice(interaction.guild.id);
            if (left) {
                const embed = new EmbedBuilder()
                    .setColor('#f23f43')
                    .setTitle('👋 Voice Disconnected')
                    .setDescription('The bot has left the voice channel.')
                    .setTimestamp();
                await interaction.reply({ embeds: [embed] });
            } else {
                await interaction.reply({
                    content: '⚠️ The bot is not currently in any voice channel in this server.',
                    ephemeral: true
                });
            }
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('noise')
            .setDescription('Make the bot play sound effects or noise in the voice channel')
            .addStringOption(option =>
                option.setName('sound')
                    .setDescription('Sound effect to play')
                    .setRequired(false)
                    .addChoices(
                        { name: '🎵 Hmmm Hmmm (Custom Audio)', value: 'hmmmhmmm' },
                        { name: '🤖 Electronic Beeps', value: 'beeps' },
                        { name: '🎶 Futuristic Synth Tone', value: 'synth' },
                        { name: '🌊 Ambient Pink Noise', value: 'noise' },
                        { name: '🚨 Alarm Siren', value: 'alarm' },
                        { name: '🔊 Deep Bass Drone', value: 'bass' }
                    )),
        category: 'General',
        async execute(interaction, client) {
            const { getVoiceConnection } = require('@discordjs/voice');
            const { joinTargetVoice } = require('../voice.js');
            const { playSoundOnConnection } = require('../audio.js');

            const soundChoice = interaction.options.getString('sound') || 'hmmmhmmm';
            let conn = getVoiceConnection(interaction.guild.id, client.user.id);

            if (!conn) {
                conn = joinTargetVoice(client, 'General Lounge', interaction.guild);
            }

            if (!conn) {
                return interaction.reply({
                    content: '❌ Bot is not in a voice channel. Use `/join` first!',
                    ephemeral: true
                });
            }

            playSoundOnConnection(conn, soundChoice);

            const embed = new EmbedBuilder()
                .setColor('#5865F2')
                .setTitle('🔊 Now Playing Sound in VC')
                .setDescription(`Playing **${soundChoice.toUpperCase()}** in the voice lounge!`)
                .addFields(
                    { name: 'Sound Preset', value: `\`${soundChoice}\``, inline: true },
                    { name: 'Controls', value: 'Use `/stopnoise` to stop or `/noise` to switch sounds.', inline: true }
                )
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('stopnoise')
            .setDescription('Stop the noise/sound currently playing in the voice channel'),
        category: 'General',
        async execute(interaction) {
            const { stopSound } = require('../audio.js');
            stopSound();

            const embed = new EmbedBuilder()
                .setColor('#f23f43')
                .setTitle('🔇 Sound Stopped')
                .setDescription('The bot has stopped playing audio in the voice channel.')
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('testwelcome')
            .setDescription('Preview the custom welcome banner card and message in this channel')
            .addUserOption(opt =>
                opt.setName('member')
                    .setDescription('Simulate welcome for a specific member (defaults to you)')
                    .setRequired(false)
            ),
        category: 'General',
        async execute(interaction) {
            await interaction.deferReply();
            const { generateWelcomeCard, getOrdinal } = require('../welcome-card.js');
            const { AttachmentBuilder } = require('discord.js');
            const targetUser = interaction.options.getUser('member') || interaction.user;
            const targetMember = interaction.guild.members.cache.get(targetUser.id) || interaction.member;

            try {
                const cardBuffer = await generateWelcomeCard(targetMember);
                const attachment = new AttachmentBuilder(cardBuffer, { name: 'welcome.png' });
                const ordinal = getOrdinal(interaction.guild.memberCount);

                const messageContent = `Welcome <@${targetMember.id}> to ${interaction.guild.name}  You are the ${ordinal} member!`;

                await interaction.editReply({
                    content: messageContent,
                    files: [attachment]
                });
            } catch (err) {
                console.error('Error generating test welcome card:', err);
                await interaction.editReply({ content: `❌ Error generating welcome card: ${err.message}` });
            }
        }
    }
];
