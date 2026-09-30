const { 
    createAudioPlayer, 
    createAudioResource, 
    AudioPlayerStatus, 
    VoiceConnectionStatus, 
    joinVoiceChannel, 
    getVoiceConnection,
    NoSubscriberBehavior
} = require('@discordjs/voice');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const play = require('play-dl');
const { stopSound } = require('./audio.js');

// Global music queues by guildId
const queues = new Map();
let soundCloudInitialized = false;

async function ensureSoundCloud() {
    if (soundCloudInitialized) return;
    try {
        const clientId = await play.getFreeClientID();
        if (clientId) {
            play.setToken({ soundcloud: { client_id: clientId } });
            soundCloudInitialized = true;
        }
    } catch (e) {
        console.warn('[Music] SoundCloud client initialization warning:', e.message);
    }
}

class GuildQueue {
    constructor(guildId, textChannel, voiceChannel) {
        this.guildId = guildId;
        this.textChannel = textChannel;
        this.voiceChannel = voiceChannel;
        this.connection = null;
        this.player = null;
        this.songs = [];
        this.currentSong = null;
        this.volume = 100;
        this.loopMode = 'off'; // 'off' | 'track' | 'queue'
        this.paused = false;
        this.playbackStartTime = 0;
        this.pauseStartTime = 0;
        this.totalPausedDuration = 0;
    }

    createControlsRow() {
        return new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('music_toggle_pause')
                .setLabel(this.paused ? 'Resume' : 'Pause')
                .setEmoji(this.paused ? '▶️' : '⏸️')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('music_skip')
                .setLabel('Skip')
                .setEmoji('⏭️')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('music_stop')
                .setLabel('Stop')
                .setEmoji('⏹️')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId('music_shuffle')
                .setLabel('Shuffle')
                .setEmoji('🔀')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('music_queue')
                .setLabel('Queue')
                .setEmoji('📜')
                .setStyle(ButtonStyle.Secondary)
        );
    }
}

function createProgressBar(currentSec, totalSec, barSize = 14) {
    if (!totalSec || totalSec <= 0) return '🔴 LIVE STREAM';
    const percent = Math.min(Math.max(currentSec / totalSec, 0), 1);
    const progress = Math.round(barSize * percent);
    const empty = barSize - progress;
    const progressText = '▬'.repeat(progress) + '🔘' + '▬'.repeat(Math.max(0, empty - 1));
    return progressText;
}

function formatDuration(sec) {
    if (!sec || isNaN(sec)) return '00:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

async function searchTrack(query, requester) {
    await ensureSoundCloud();

    let title = 'Unknown Track';
    let url = query;
    let duration = '03:30';
    let durationSec = 210;
    let thumbnail = 'https://assets.stickpng.com/images/580b57fcd9996e24bc43c537.png';
    let artist = 'Various Artists';

    try {
        // 1. Spotify URL parsing
        if (query.includes('spotify.com')) {
            if (play.is_expired()) {
                await play.refreshToken();
            }
            const spData = await play.spotify(query);
            if (spData && spData.type === 'track') {
                query = `${spData.name} ${spData.artists?.[0]?.name || ''}`;
                thumbnail = spData.thumbnail?.url || thumbnail;
            }
        }

        // 2. Direct HTTP MP3 / Audio Stream
        if (query.match(/\.(mp3|wav|ogg|m4a|aac)(\?.*)?$/i)) {
            return {
                title: query.split('/').pop().split('?')[0],
                url: query,
                duration: 'Live/Audio',
                durationSec: 0,
                thumbnail: 'https://cdn-icons-png.flaticon.com/512/3844/3844724.png',
                artist: 'Direct Stream',
                requester
            };
        }

        // 3. Search SoundCloud
        const scResults = await play.search(query, {
            source: { soundcloud: 'tracks' },
            limit: 1
        });

        if (scResults && scResults.length > 0) {
            const track = scResults[0];
            return {
                title: track.name || track.title || query,
                url: track.url,
                duration: formatDuration(track.durationInSec || (track.durationInMs ? track.durationInMs / 1000 : 210)),
                durationSec: track.durationInSec || 210,
                thumbnail: track.thumbnail || thumbnail,
                artist: track.publisher?.artist || track.user?.name || 'SoundCloud Artist',
                requester
            };
        }
    } catch (err) {
        console.warn('[Music Search Error]:', err.message);
    }

    return {
        title: query,
        url: query,
        duration,
        durationSec,
        thumbnail,
        artist,
        requester
    };
}

class MusicManager {
    constructor() {
        this.queues = queues;
    }

    getQueue(guildId) {
        return this.queues.get(guildId);
    }

    async joinVoice(guild, voiceChannel, textChannel) {
        let queue = this.queues.get(guild.id);
        if (!queue) {
            queue = new GuildQueue(guild.id, textChannel, voiceChannel);
            this.queues.set(guild.id, queue);
        }

        const existing = getVoiceConnection(guild.id, 'music');
        if (existing && existing.state.status !== VoiceConnectionStatus.Destroyed) {
            queue.connection = existing;
            return queue;
        }

        // Stop any background bot speech on this guild to allow clean music playback
        stopSound(guild.id);

        const connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: guild.id,
            adapterCreator: guild.voiceAdapterCreator,
            group: 'music',
            selfDeaf: false,
            selfMute: false
        });

        queue.connection = connection;
        return queue;
    }

    async playNext(guildId) {
        const queue = this.queues.get(guildId);
        if (!queue) return;

        if (queue.songs.length === 0) {
            queue.currentSong = null;
            queue.playing = false;
            if (queue.textChannel) {
                const emptyEmbed = new EmbedBuilder()
                    .setColor('#5865F2')
                    .setTitle('🎶 Music Queue Finished')
                    .setDescription('Queue is now empty! Add more songs using `/play <song name>`.')
                    .setFooter({ text: 'CodeX Music Player' });
                queue.textChannel.send({ embeds: [emptyEmbed] }).catch(() => null);
            }
            return;
        }

        const song = queue.songs.shift();
        queue.currentSong = song;
        queue.playing = true;
        queue.paused = false;
        queue.playbackStartTime = Date.now();
        queue.totalPausedDuration = 0;

        try {
            await ensureSoundCloud();
            const stream = await play.stream(song.url);
            const resource = createAudioResource(stream.stream, {
                inputType: stream.type,
                inlineVolume: true
            });

            if (resource.volume) {
                resource.volume.setVolume(queue.volume / 100);
            }

            if (!queue.player) {
                queue.player = createAudioPlayer({
                    behaviors: {
                        noSubscriber: NoSubscriberBehavior.Play,
                        maxMissedFrames: 250
                    }
                });

                queue.player.on(AudioPlayerStatus.Idle, () => {
                    if (queue.loopMode === 'track' && queue.currentSong) {
                        queue.songs.unshift(queue.currentSong);
                    } else if (queue.loopMode === 'queue' && queue.currentSong) {
                        queue.songs.push(queue.currentSong);
                    }
                    this.playNext(guildId);
                });

                queue.player.on('error', (err) => {
                    console.warn(`[Music Player Error (${guildId})]:`, err.message);
                    this.playNext(guildId);
                });
            }

            queue.player.play(resource);
            if (queue.connection) {
                queue.connection.subscribe(queue.player);
            }

            // Send Now Playing Message with interactive buttons
            if (queue.textChannel) {
                const nowEmbed = new EmbedBuilder()
                    .setColor('#00E676')
                    .setTitle('🎵 Now Playing')
                    .setDescription(`**[${song.title}](${song.url})**\nby **${song.artist}**`)
                    .addFields(
                        { name: '⏱️ Duration', value: `\`${song.duration}\``, inline: true },
                        { name: '🔊 Volume', value: `\`${queue.volume}%\``, inline: true },
                        { name: '🔁 Loop', value: `\`${queue.loopMode.toUpperCase()}\``, inline: true },
                        { name: '👤 Requested By', value: `<@${song.requester.id}>`, inline: true }
                    )
                    .setThumbnail(song.thumbnail)
                    .setFooter({ text: 'CodeX Modern Music Engine • Use buttons below to control' })
                    .setTimestamp();

                queue.textChannel.send({
                    embeds: [nowEmbed],
                    components: [queue.createControlsRow()]
                }).catch(() => null);
            }
        } catch (err) {
            console.error(`[Play Error in ${guildId}]:`, err.message);
            if (queue.textChannel) {
                queue.textChannel.send(`⚠️ Error playing **${song.title}**: ${err.message}`).catch(() => null);
            }
            this.playNext(guildId);
        }
    }

    async addTrack(guild, voiceChannel, textChannel, query, user) {
        const queue = await this.joinVoice(guild, voiceChannel, textChannel);
        const requester = {
            id: user.id,
            tag: user.tag || user.username,
            avatar: user.displayAvatarURL ? user.displayAvatarURL() : null
        };

        const song = await searchTrack(query, requester);
        queue.songs.push(song);

        if (!queue.playing) {
            await this.playNext(guild.id);
            return { song, startedNow: true, queueLength: queue.songs.length };
        } else {
            return { song, startedNow: false, queueLength: queue.songs.length };
        }
    }

    pause(guildId) {
        const queue = this.queues.get(guildId);
        if (queue && queue.player && !queue.paused) {
            queue.player.pause();
            queue.paused = true;
            queue.pauseStartTime = Date.now();
            return true;
        }
        return false;
    }

    resume(guildId) {
        const queue = this.queues.get(guildId);
        if (queue && queue.player && queue.paused) {
            queue.player.unpause();
            queue.paused = false;
            queue.totalPausedDuration += Date.now() - queue.pauseStartTime;
            return true;
        }
        return false;
    }

    skip(guildId) {
        const queue = this.queues.get(guildId);
        if (queue && queue.player) {
            queue.player.stop();
            return true;
        }
        return false;
    }

    stop(guildId) {
        const queue = this.queues.get(guildId);
        if (queue) {
            queue.songs = [];
            queue.currentSong = null;
            queue.playing = false;
            if (queue.player) {
                try { queue.player.stop(); } catch (_) {}
            }
            if (queue.connection) {
                try { queue.connection.destroy(); } catch (_) {}
            }
            this.queues.delete(guildId);
            return true;
        }
        return false;
    }

    shuffle(guildId) {
        const queue = this.queues.get(guildId);
        if (queue && queue.songs.length > 1) {
            for (let i = queue.songs.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [queue.songs[i], queue.songs[j]] = [queue.songs[j], queue.songs[i]];
            }
            return true;
        }
        return false;
    }

    setVolume(guildId, vol) {
        const queue = this.queues.get(guildId);
        if (queue) {
            queue.volume = Math.max(1, Math.min(vol, 150));
            return queue.volume;
        }
        return null;
    }

    toggleLoop(guildId) {
        const queue = this.queues.get(guildId);
        if (!queue) return 'off';
        const modes = ['off', 'track', 'queue'];
        const next = modes[(modes.indexOf(queue.loopMode) + 1) % modes.length];
        queue.loopMode = next;
        return next;
    }

    getNowPlayingInfo(guildId) {
        const queue = this.queues.get(guildId);
        if (!queue || !queue.currentSong) return null;

        const elapsedMs = queue.paused 
            ? (queue.pauseStartTime - queue.playbackStartTime - queue.totalPausedDuration)
            : (Date.now() - queue.playbackStartTime - queue.totalPausedDuration);
        const currentSec = Math.max(0, Math.floor(elapsedMs / 1000));
        const totalSec = queue.currentSong.durationSec || 210;

        return {
            song: queue.currentSong,
            currentSec,
            totalSec,
            progressBar: createProgressBar(currentSec, totalSec),
            currentTime: formatDuration(currentSec),
            totalTime: queue.currentSong.duration,
            volume: queue.volume,
            loop: queue.loopMode,
            paused: queue.paused,
            queueCount: queue.songs.length
        };
    }
}

const musicManager = new MusicManager();
module.exports = musicManager;
