const { joinVoiceChannel, VoiceConnectionStatus, entersState, getVoiceConnection } = require('@discordjs/voice');
const { getAudioStatus, stopSound } = require('./audio.js');
const { setClientsProvider, startTurnCycle, stopTurnCycle, checkTurnHealth } = require('./turn-manager.js');
const fs = require('fs');
const path = require('path');

const SETTINGS_PATH = path.resolve(__dirname, '../settings.json');

function readSettings() {
    try {
        return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'));
    } catch (_) {
        return {};
    }
}

// Registry of clients for 24/7 watchdog
const registeredClients = new Set();
const manuallyDisconnectedBots = new Set();
let globalVoiceActive = true;
let watchdogStarted = false;
let startCycleDebounce = null;

function isBotManuallyDisconnected(botId) {
    return manuallyDisconnectedBots.has(botId) || !globalVoiceActive;
}

function isGlobalVoiceActive() {
    return globalVoiceActive;
}

/**
 * Connect a Discord Client to a Voice Channel by name or ID.
 */
function joinTargetVoice(client, target = 'General Lounge', specificGuild = null) {
    if (!client) return null;

    if (!registeredClients.has(client)) {
        registeredClients.add(client);
        setClientsProvider(() => Array.from(registeredClients));
    }
    startWatchdog();

    const botId = client.user?.id;
    if (botId && manuallyDisconnectedBots.has(botId)) {
        // If user manually disconnected this bot and globalVoiceActive is true, remove it if explicitly connecting
        manuallyDisconnectedBots.delete(botId);
    }

    const guilds = specificGuild ? [specificGuild] : Array.from(client.guilds.cache.values());

    for (const guild of guilds) {
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
                    
                    const settings = readSettings();
                    if (settings.soundEnabled === false) {
                        return;
                    }

                    // Debounce starting the turn cycle so all bots have a moment to connect
                    if (startCycleDebounce) clearTimeout(startCycleDebounce);
                    startCycleDebounce = setTimeout(() => {
                        startCycleDebounce = null;
                        startTurnCycle();
                    }, 1200);
                });

                connection.on(VoiceConnectionStatus.Disconnected, async () => {
                    const currentBotId = client.user?.id;
                    // IF MANUALLY DISCONNECTED, NEVER AUTO-RECONNECT!
                    if (!globalVoiceActive || (currentBotId && manuallyDisconnectedBots.has(currentBotId))) {
                        console.log(`[Voice 24/7] 🛑 ${client.user?.tag || 'Bot'} was manually disconnected. Staying disconnected.`);
                        try { connection.destroy(); } catch (_) { }
                        return;
                    }

                    console.warn(`[Voice 24/7] ${client.user?.tag || 'Bot'} disconnected unexpectedly. Attempting auto-reconnect...`);
                    try {
                        await Promise.race([
                            entersState(connection, VoiceConnectionStatus.Signalling, 5000),
                            entersState(connection, VoiceConnectionStatus.Connecting, 5000),
                        ]);
                    } catch (e) {
                        try { connection.destroy(); } catch (_) { }
                        setTimeout(() => {
                            if (globalVoiceActive && (!currentBotId || !manuallyDisconnectedBots.has(currentBotId))) {
                                joinTargetVoice(client, target, guild);
                            }
                        }, 2500);
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
 * 24/7 Watchdog: Runs every 15 seconds to monitor all bot voice connections and audio playback health.
 * CRITICAL: Respects user manual disconnects!
 */
function startWatchdog() {
    if (watchdogStarted) return;
    watchdogStarted = true;

    setInterval(() => {
        // If user clicked "Disconnect All", watchdog leaves all bots alone!
        if (!globalVoiceActive) {
            checkTurnHealth();
            return;
        }

        for (const client of registeredClients) {
            if (!client.user) continue;
            const groupId = client.user.id;

            // If user explicitly disconnected THIS bot, never reconnect it!
            if (manuallyDisconnectedBots.has(groupId)) {
                continue;
            }

            for (const guild of client.guilds.cache.values()) {
                const conn = getVoiceConnection(guild.id, groupId);

                if (!conn || conn.state.status === VoiceConnectionStatus.Destroyed || conn.state.status === VoiceConnectionStatus.Disconnected) {
                    joinTargetVoice(client, 'General Lounge', guild);
                }
            }
        }

        // Keep turn-based audio cycle active and healthy for connected bots
        checkTurnHealth();
    }, 15000);
}

/**
 * Disconnect bot from voice in a guild.
 */
function leaveTargetVoice(guildId, groupId = 'default') {
    const conn = getVoiceConnection(guildId, groupId);
    if (conn) {
        try { conn.destroy(); } catch (_) {}
        return true;
    }
    return false;
}

/**
 * Connect ALL bots to voice channel
 */
function connectAll(channelName = 'General Lounge') {
    globalVoiceActive = true;
    manuallyDisconnectedBots.clear();
    console.log(`[Voice 24/7] 🔌 Connecting ALL bots to "${channelName}"...`);

    let delay = 0;
    for (const client of registeredClients) {
        if (!client.user) continue;
        const currentDelay = delay;
        delay += 600;
        setTimeout(() => {
            joinTargetVoice(client, channelName);
        }, currentDelay);
    }
}

/**
 * Disconnect ALL bots from voice and PREVENT them from auto-reconnecting
 */
function disconnectAll() {
    globalVoiceActive = false;
    console.log(`[Voice 24/7] 🛑 Disconnecting ALL bots manually. Auto-reconnect paused.`);

    for (const client of registeredClients) {
        if (!client.user) continue;
        manuallyDisconnectedBots.add(client.user.id);
        for (const guild of client.guilds.cache.values()) {
            leaveTargetVoice(guild.id, client.user.id);
        }
    }
    stopTurnCycle();
    stopSound();
}

/**
 * Connect a specific bot to voice
 */
function connectBot(botId, channelName = 'General Lounge') {
    manuallyDisconnectedBots.delete(botId);
    console.log(`[Voice 24/7] 🔌 Manually connecting bot [${botId}] to "${channelName}"...`);

    const targetBot = Array.from(registeredClients).find(c => c.user && c.user.id === botId);
    if (targetBot) {
        joinTargetVoice(targetBot, channelName);
        return true;
    }
    return false;
}

/**
 * Disconnect a specific bot and PREVENT it from auto-reconnecting
 */
function disconnectBot(botId) {
    manuallyDisconnectedBots.add(botId);
    console.log(`[Voice 24/7] 🛑 Manually disconnected bot [${botId}]. It will stay disconnected.`);

    const targetBot = Array.from(registeredClients).find(c => c.user && c.user.id === botId);
    if (targetBot) {
        for (const guild of targetBot.guilds.cache.values()) {
            leaveTargetVoice(guild.id, targetBot.user.id);
        }
        stopSound(targetBot.user.id);
        return true;
    }
    return false;
}

module.exports = {
    joinTargetVoice,
    leaveTargetVoice,
    connectAll,
    disconnectAll,
    connectBot,
    disconnectBot,
    startWatchdog,
    isBotManuallyDisconnected,
    isGlobalVoiceActive
};
