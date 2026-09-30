const { joinVoiceChannel, VoiceConnectionStatus, entersState, getVoiceConnection } = require('@discordjs/voice');
const { playSoundOnConnection, getActivePlayingSounds } = require('./audio.js');
const { getBotSound, getUniqueSoundForBot } = require('./bot-sound-manager.js');

// Registry of clients for 24/7 watchdog
const registeredClients = new Set();
let watchdogStarted = false;

/**
 * Connect a Discord Client to a Voice Channel by name or ID.
 */
function joinTargetVoice(client, target = 'General Lounge', specificGuild = null) {
    if (client && !registeredClients.has(client)) {
        registeredClients.add(client);
    }
    startWatchdog();

    const guilds = specificGuild ? [specificGuild] : Array.from(client.guilds.cache.values());

    for (const guild of guilds) {
        // Look for exact target/ID first, then General Lounge, then matched name, then any voice channel
        const voiceChannel = guild.channels.cache.get('1538570969503768609')
            || guild.channels.cache.find(c => c.isVoiceBased() && c.name.toLowerCase().includes('general lounge'))
            || guild.channels.cache.find(c => c.isVoiceBased() && c.name.toLowerCase().includes('general'))
            || guild.channels.cache.find(c =>
                c.isVoiceBased() && (c.id === target || c.name.toLowerCase().includes(target.toLowerCase()) || c.name.toLowerCase().includes('public'))
            )
            || guild.channels.cache.find(c => c.isVoiceBased());

        if (voiceChannel) {
            try {
                const groupId = client.user ? client.user.id : 'default';
                const existing = getVoiceConnection(guild.id, groupId);
                if (existing && existing.joinConfig.channelId === voiceChannel.id && existing.state.status !== VoiceConnectionStatus.Destroyed) {
                    return existing;
                }

                const connection = joinVoiceChannel({
                    channelId: voiceChannel.id,
                    guildId: guild.id,
                    adapterCreator: guild.voiceAdapterCreator,
                    group: groupId,
                    selfDeaf: false,
                    selfMute: false
                });

                connection.on(VoiceConnectionStatus.Ready, () => {
                    console.log(`[Voice 24/7] 🎙️ ${client.user?.tag || 'Bot'} connected to voice: "${voiceChannel.name}" (${guild.name})`);
                    // Ensure connection is fully ready before starting bot's assigned audio
                    setTimeout(() => {
                        const botId = client.user?.id;
                        const otherPlaying = getActivePlayingSounds(botId);
                        const botSound = getUniqueSoundForBot(botId, otherPlaying);
                        console.log(`[Voice 24/7] 🎵 Bot ${client.user?.tag} (${botId}) assigned unique sound: [${botSound}]`);
                        playSoundOnConnection(connection, botSound, { botId });
                    }, 500);
                });

                connection.on(VoiceConnectionStatus.Disconnected, async () => {
                    console.warn(`[Voice 24/7] ${client.user?.tag || 'Bot'} disconnected. Attempting auto-reconnect...`);
                    try {
                        await Promise.race([
                            entersState(connection, VoiceConnectionStatus.Signalling, 5000),
                            entersState(connection, VoiceConnectionStatus.Connecting, 5000),
                        ]);
                    } catch (e) {
                        try { connection.destroy(); } catch (_) { }
                        // Re-join after 2 seconds
                        setTimeout(() => joinTargetVoice(client, target, guild), 2000);
                    }
                });

                return connection;
            } catch (err) {
                console.error(`[Voice 24/7] Error joining channel "${voiceChannel.name}":`, err.message);
            }
        }
    }
    return null;
}

/**
 * 24/7 Watchdog: Runs every 15 seconds to monitor all bot voice connections
 */
function startWatchdog() {
    if (watchdogStarted) return;
    watchdogStarted = true;

    setInterval(() => {
        for (const client of registeredClients) {
            if (!client.user) continue;

            for (const guild of client.guilds.cache.values()) {
                const groupId = client.user.id;
                const conn = getVoiceConnection(guild.id, groupId);

                // If not connected or connection died, automatically reconnect
                if (!conn || conn.state.status === VoiceConnectionStatus.Destroyed || conn.state.status === VoiceConnectionStatus.Disconnected) {
                    joinTargetVoice(client, 'General Lounge', guild);
                }
            }
        }
    }, 15000);
}

/**
 * Disconnect bot from voice in a guild.
 */
function leaveTargetVoice(guildId, groupId = 'default') {
    const conn = getVoiceConnection(guildId, groupId);
    if (conn) {
        conn.destroy();
        return true;
    }
    return false;
}

module.exports = {
    joinTargetVoice,
    leaveTargetVoice,
    startWatchdog
};
