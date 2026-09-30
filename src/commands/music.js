const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const musicManager = require('../music-manager.js');

module.exports = [
    {
        data: new SlashCommandBuilder()
            .setName('play')
            .setDescription('Play a song or playlist in your voice channel')
            .addStringOption(option =>
                option.setName('query')
                    .setDescription('Song title, artist, or direct audio link')
                    .setRequired(true)
            ),
        category: 'Music',
        async execute(interaction, client) {
            const member = interaction.member;
            const voiceChannel = member.voice.channel;

            if (!voiceChannel) {
                return interaction.reply({ 
                    content: '❌ You must join a voice channel first to play music!', 
                    ephemeral: true 
                });
            }

            const query = interaction.options.getString('query');
            await interaction.deferReply();

            try {
                const res = await musicManager.addTrack(
                    interaction.guild,
                    voiceChannel,
                    interaction.channel,
                    query,
                    interaction.user
                );

                const embed = new EmbedBuilder()
                    .setColor(res.startedNow ? '#00E676' : '#5865F2')
                    .setTitle(res.startedNow ? '🎶 Playing Track' : '➕ Added to Queue')
                    .setDescription(`**[${res.song.title}](${res.song.url})**\nby **${res.song.artist}**`)
                    .addFields(
                        { name: '⏱️ Duration', value: `\`${res.song.duration}\``, inline: true },
                        { name: '📜 Position', value: res.startedNow ? '`Now Playing`' : `\`#${res.queueLength}\``, inline: true },
                        { name: '🔊 Channel', value: `\`${voiceChannel.name}\``, inline: true }
                    )
                    .setThumbnail(res.song.thumbnail)
                    .setFooter({ text: `Requested by ${interaction.user.tag}` });

                await interaction.editReply({ embeds: [embed] });
            } catch (err) {
                console.error('[Command /play Error]:', err);
                await interaction.editReply({ content: `❌ Error playing track: ${err.message}` });
            }
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('pause')
            .setDescription('Pause current music playback'),
        category: 'Music',
        async execute(interaction) {
            const queue = musicManager.getQueue(interaction.guildId);
            if (!queue || !queue.playing) {
                return interaction.reply({ content: '❌ No music is currently playing in this server.', ephemeral: true });
            }
            if (queue.paused) {
                return interaction.reply({ content: '⏸️ Music is already paused! Use `/resume` to continue.', ephemeral: true });
            }

            musicManager.pause(interaction.guildId);
            await interaction.reply({ content: '⏸️ Playback has been paused. Use `/resume` or the button to continue.' });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('resume')
            .setDescription('Resume paused music playback'),
        category: 'Music',
        async execute(interaction) {
            const queue = musicManager.getQueue(interaction.guildId);
            if (!queue || !queue.playing) {
                return interaction.reply({ content: '❌ No music is currently playing.', ephemeral: true });
            }
            if (!queue.paused) {
                return interaction.reply({ content: '▶️ Music is already playing!', ephemeral: true });
            }

            musicManager.resume(interaction.guildId);
            await interaction.reply({ content: '▶️ Resumed music playback.' });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('skip')
            .setDescription('Skip to the next song in queue'),
        category: 'Music',
        async execute(interaction) {
            const queue = musicManager.getQueue(interaction.guildId);
            if (!queue || !queue.currentSong) {
                return interaction.reply({ content: '❌ Nothing is playing to skip.', ephemeral: true });
            }

            const skippedTitle = queue.currentSong.title;
            musicManager.skip(interaction.guildId);
            await interaction.reply({ content: `⏭️ Skipped **${skippedTitle}**!` });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('stop')
            .setDescription('Stop music, clear the queue, and leave voice channel'),
        category: 'Music',
        async execute(interaction) {
            const queue = musicManager.getQueue(interaction.guildId);
            if (!queue) {
                return interaction.reply({ content: '❌ No music queue is active.', ephemeral: true });
            }

            musicManager.stop(interaction.guildId);
            await interaction.reply({ content: '⏹️ Stopped music playback and cleared the queue.' });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('queue')
            .setDescription('View the current music queue and upcoming tracks'),
        category: 'Music',
        async execute(interaction) {
            const queue = musicManager.getQueue(interaction.guildId);
            if (!queue || (!queue.currentSong && queue.songs.length === 0)) {
                return interaction.reply({ content: '📭 The music queue is currently empty.', ephemeral: true });
            }

            const embed = new EmbedBuilder()
                .setColor('#5865F2')
                .setTitle(`🎵 Music Queue - ${interaction.guild.name}`)
                .setDescription(
                    `**Now Playing:**\n[${queue.currentSong?.title || 'None'}](${queue.currentSong?.url || '#'}) \`[${queue.currentSong?.duration || '--'}]\` - Requested by <@${queue.currentSong?.requester.id}>\n\n` +
                    `**Up Next (${queue.songs.length} tracks):**\n` +
                    (queue.songs.length === 0 
                        ? '_No upcoming songs. Use `/play` to add more!_' 
                        : queue.songs.slice(0, 10).map((s, idx) => `\`${idx + 1}.\` [${s.title}](${s.url}) \`[${s.duration}]\` - <@${s.requester.id}>`).join('\n')
                    )
                )
                .setFooter({ text: `Loop: ${queue.loopMode.toUpperCase()} | Volume: ${queue.volume}%` });

            if (queue.songs.length > 10) {
                embed.addFields({ name: '... and more', value: `+${queue.songs.length - 10} additional songs in queue` });
            }

            await interaction.reply({ embeds: [embed] });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('nowplaying')
            .setDescription('Show details and progress of the currently playing track'),
        category: 'Music',
        async execute(interaction) {
            const info = musicManager.getNowPlayingInfo(interaction.guildId);
            if (!info) {
                return interaction.reply({ content: '❌ Nothing is currently playing.', ephemeral: true });
            }

            const queue = musicManager.getQueue(interaction.guildId);

            const embed = new EmbedBuilder()
                .setColor('#00E676')
                .setTitle('🎵 Now Playing')
                .setDescription(`**[${info.song.title}](${info.song.url})**\nby **${info.song.artist}**`)
                .addFields(
                    { name: 'Progress', value: `\`${info.currentTime}\` ${info.progressBar} \`${info.totalTime}\``, inline: false },
                    { name: '🔊 Volume', value: `\`${info.volume}%\``, inline: true },
                    { name: '🔁 Loop Mode', value: `\`${info.loop.toUpperCase()}\``, inline: true },
                    { name: '👤 Requested By', value: `<@${info.song.requester.id}>`, inline: true }
                )
                .setThumbnail(info.song.thumbnail)
                .setFooter({ text: info.paused ? '⏸️ Currently Paused' : '▶️ Currently Playing' });

            await interaction.reply({ 
                embeds: [embed],
                components: queue ? [queue.createControlsRow()] : []
            });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('volume')
            .setDescription('Adjust music playback volume (1% - 150%)')
            .addIntegerOption(opt =>
                opt.setName('level')
                    .setDescription('Volume level between 1 and 150')
                    .setRequired(true)
                    .setMinValue(1)
                    .setMaxValue(150)
            ),
        category: 'Music',
        async execute(interaction) {
            const queue = musicManager.getQueue(interaction.guildId);
            if (!queue || !queue.playing) {
                return interaction.reply({ content: '❌ No music is currently playing.', ephemeral: true });
            }

            const level = interaction.options.getInteger('level');
            musicManager.setVolume(interaction.guildId, level);
            await interaction.reply({ content: `🔊 Volume set to **${level}%**!` });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('loop')
            .setDescription('Toggle track or queue repeating mode'),
        category: 'Music',
        async execute(interaction) {
            const queue = musicManager.getQueue(interaction.guildId);
            if (!queue) {
                return interaction.reply({ content: '❌ No music queue is active.', ephemeral: true });
            }

            const newMode = musicManager.toggleLoop(interaction.guildId);
            const emoji = newMode === 'track' ? '🔂' : newMode === 'queue' ? '🔁' : '➡️';
            await interaction.reply({ content: `${emoji} Loop mode set to **${newMode.toUpperCase()}**.` });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('shuffle')
            .setDescription('Shuffle the current music queue'),
        category: 'Music',
        async execute(interaction) {
            const queue = musicManager.getQueue(interaction.guildId);
            if (!queue || queue.songs.length < 2) {
                return interaction.reply({ content: '❌ Need at least 2 upcoming songs in queue to shuffle.', ephemeral: true });
            }

            musicManager.shuffle(interaction.guildId);
            await interaction.reply({ content: `🔀 Shuffled **${queue.songs.length}** upcoming tracks in the queue!` });
        }
    }
];
