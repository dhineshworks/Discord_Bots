const { 
    createAudioPlayer, 
    createAudioResource, 
    StreamType, 
    AudioPlayerStatus, 
    NoSubscriberBehavior 
} = require('@discordjs/voice');
const ffmpegPath = require('ffmpeg-static');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { getNextRandomSoundForBot, getUniqueSoundForBot } = require('./bot-sound-manager.js');

const SETTINGS_PATH = path.resolve(__dirname, '../settings.json');

function readSettings() {
    try {
        return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'));
    } catch (_) {
        return {};
    }
}

// Track players and processes per connection/group
const activeStreams = new Map();

const MP3_SOUNDS = {
    'comedy-punda-kaatriya': path.resolve(__dirname, '../comedy-punda-kaatriya.mp3'),
    'theriyum-mooditu-poriya': path.resolve(__dirname, '../theriyum-mooditu-poriya.mp3'),
    'hmmmhmmm': path.resolve(__dirname, '../hmmmhmmm.mp3'),
    'chicken-on-tree-screaming': path.resolve(__dirname, '../chicken-on-tree-screaming.mp3'),
    'core-sound-effect': path.resolve(__dirname, '../sounds/core-sound-effect.mp3')
};

const DEFAULT_MP3_PATH = MP3_SOUNDS['hmmmhmmm'];

const SOUND_PRESETS = {
    'comedy-punda-kaatriya': 'mp3_file',
    'theriyum-mooditu-poriya': 'mp3_file',
    'hmmmhmmm': 'mp3_file',
    'chicken-on-tree-screaming': 'mp3_file',
    'core-sound-effect': 'mp3_file',
    'beeps': 'sine=frequency=520:beep_factor=4:sample_rate=48000',
    'synth': 'sine=frequency=330:sample_rate=48000,volume=0.3',
    'noise': 'anoisesrc=d=0:c=pink:r=48000:a=0.25',
    'alarm': 'sine=frequency=880:beep_factor=8:sample_rate=48000,volume=0.35',
    'bass': 'sine=frequency=110:sample_rate=48000,volume=0.5'
};

const SOUNDS_DIR = path.resolve(__dirname, '../sounds');

function resolveAudioFile(soundType) {
    if (!soundType) return null;

    // 1. Check sounds folder first
    if (fs.existsSync(SOUNDS_DIR)) {
        const directInSounds = path.resolve(SOUNDS_DIR, soundType);
        if (fs.existsSync(directInSounds) && fs.statSync(directInSounds).isFile()) {
            return directInSounds;
        }

        for (const ext of ['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac']) {
            const withExt = path.resolve(SOUNDS_DIR, `${soundType}${ext}`);
            if (fs.existsSync(withExt)) return withExt;
        }

        try {
            const files = fs.readdirSync(SOUNDS_DIR);
            const matched = files.find(f => {
                const base = path.basename(f, path.extname(f)).toLowerCase();
                return base === soundType.toLowerCase() || f.toLowerCase() === soundType.toLowerCase();
            });
            if (matched) return path.resolve(SOUNDS_DIR, matched);
        } catch (_) {}
    }

    // 2. Check MP3_SOUNDS dictionary
    if (MP3_SOUNDS[soundType] && fs.existsSync(MP3_SOUNDS[soundType])) {
        return MP3_SOUNDS[soundType];
    }
    const cleanName = soundType.replace(/\.mp3$/, '');
    if (MP3_SOUNDS[cleanName] && fs.existsSync(MP3_SOUNDS[cleanName])) {
        return MP3_SOUNDS[cleanName];
    }

    // 3. Fallback to workspace root
    const directPath = path.resolve(__dirname, `../${soundType}`);
    if (fs.existsSync(directPath) && fs.statSync(directPath).isFile()) return directPath;
    const directMp3 = path.resolve(__dirname, `../${soundType}.mp3`);
    if (fs.existsSync(directMp3)) return directMp3;

    return null;
}

/**
 * Spawns an FFmpeg process that outputs pure OggOpus packets directly.
 * Plays through naturally so player emits Idle when complete to allow unique sound rotation.
 */
function spawnOggOpusStream(soundType, loop = false) {
    const mp3File = resolveAudioFile(soundType);
    const isMp3 = Boolean(mp3File);
    let ffmpegArgs = [];

    if (isMp3) {
        ffmpegArgs = [
            ...(loop ? ['-stream_loop', '-1'] : []),
            '-re',
            '-i', mp3File,
            '-c:a', 'libopus',
            '-b:a', '128k',
            '-ar', '48000',
            '-ac', '2',
            '-f', 'ogg',
            'pipe:1'
        ];
    } else {
        const lavfiFilter = SOUND_PRESETS[soundType] || SOUND_PRESETS.beeps;
        ffmpegArgs = [
            '-f', 'lavfi',
            '-i', lavfiFilter,
            '-c:a', 'libopus',
            '-b:a', '96k',
            '-ar', '48000',
            '-ac', '2',
            '-f', 'ogg',
            'pipe:1'
        ];
    }

    const p = spawn(ffmpegPath, ffmpegArgs, { 
        stdio: ['ignore', 'pipe', 'ignore'] 
    });

    const resource = createAudioResource(p.stdout, {
        inputType: StreamType.OggOpus
    });

    return { resource, process: p, isMp3, resolvedPath: mp3File };
}

/**
 * Get all sound types currently playing on active streams, optionally excluding one bot/key
 */
function getActivePlayingSounds(excludeKey = null) {
    const list = [];
    for (const [k, stream] of activeStreams.entries()) {
        if (excludeKey && k === excludeKey) continue;
        if (stream && stream.soundType) {
            list.push(stream.soundType);
        }
    }
    return list;
}

/**
 * Play sound on a voice connection with native OggOpus stream & unique auto-rotation
 * @param {import('@discordjs/voice').VoiceConnection} connection
 * @param {string} soundType
 * @param {object} options
 */
function playSoundOnConnection(connection, soundType = 'comedy-punda-kaatriya', options = {}) {
    if (!connection) {
        console.warn('[Audio] No connection provided.');
        return null;
    }

    const key = connection.joinConfig?.group || connection.joinConfig?.channelId || 'default';
    const botId = options.botId || key;

    // Stop existing stream for this connection if any
    stopSound(key);

    const player = createAudioPlayer({
        behaviors: {
            noSubscriber: NoSubscriberBehavior.Play,
            maxMissedFrames: 250
        }
    });

    const settings = readSettings();
    const isAutoRotate = settings.randomRotation !== false;

    // Play without infinite loop so Idle is fired when track ends
    const { resource, process: p, isMp3 } = spawnOggOpusStream(soundType, !isAutoRotate && !isMp3);

    player.play(resource);
    connection.subscribe(player);

    activeStreams.set(key, { 
        process: p, 
        player, 
        soundType, 
        connection,
        isMp3,
        botId,
        startedAt: Date.now()
    });

    player.on(AudioPlayerStatus.Playing, () => {
        console.log(`[Audio 24/7] 🔊 [${key}] Native Opus Playing: [${soundType}]`);
    });

    player.on(AudioPlayerStatus.AutoPaused, () => {
        console.log(`[Audio 24/7] ⚠️ [${key}] AutoPaused detected, forcing unpause...`);
        try { player.unpause(); } catch (_) {}
    });

    // When audio ends: select NEXT UNIQUE RANDOM SOUND that no other bot is playing!
    player.on(AudioPlayerStatus.Idle, () => {
        if (!activeStreams.has(key)) return;
        const currentRecord = activeStreams.get(key);
        if (!currentRecord) return;

        const currentSettings = readSettings();
        const shouldRotate = currentSettings.randomRotation !== false;

        let nextSound = currentRecord.soundType;

        if (shouldRotate) {
            // Find all sounds currently playing by all other bots
            const otherPlaying = getActivePlayingSounds(key);
            // Select next unique random uploaded sound
            nextSound = getNextRandomSoundForBot(key, currentRecord.soundType, otherPlaying);
            console.log(`[Audio Randomizer] 🎲 Bot [${key}] finished track. Next unique sound: [${nextSound}] (Others playing: ${otherPlaying.join(', ') || 'none'})`);
        }

        // Brief 400ms pause for seamless non-overlapping audio transition
        setTimeout(() => {
            if (!activeStreams.has(key)) return;
            try {
                if (currentRecord.process) {
                    try { currentRecord.process.kill(); } catch (_) {}
                }
                const next = spawnOggOpusStream(nextSound, !shouldRotate && !currentRecord.isMp3);
                currentRecord.process = next.process;
                currentRecord.soundType = nextSound;
                currentRecord.startedAt = Date.now();
                player.play(next.resource);
            } catch (err) {
                console.warn(`[Audio Loop Error (${key})]:`, err.message);
                setTimeout(() => {
                    if (activeStreams.has(key)) {
                        playSoundOnConnection(connection, nextSound, options);
                    }
                }, 1000);
            }
        }, 400);
    });

    player.on('error', (err) => {
        console.warn(`[Audio Player Error (${key})]:`, err.message);
        setTimeout(() => {
            if (activeStreams.has(key)) {
                const otherPlaying = getActivePlayingSounds(key);
                const next = getNextRandomSoundForBot(key, soundType, otherPlaying);
                playSoundOnConnection(connection, next, options);
            }
        }, 1500);
    });

    if (p) {
        p.on('error', (err) => {
            console.warn(`[FFmpeg Process Error (${key})]:`, err.message);
        });
    }

    return player;
}

/**
 * Stop audio on a specific connection or all connections
 * @param {string|null} key
 */
function stopSound(key = null) {
    if (key) {
        const stream = activeStreams.get(key);
        if (stream) {
            if (stream.process) {
                try { stream.process.kill(); } catch (_) {}
            }
            if (stream.player) {
                try { stream.player.stop(); } catch (_) {}
            }
            activeStreams.delete(key);
        }
    } else {
        for (const [k, stream] of activeStreams.entries()) {
            if (stream.process) {
                try { stream.process.kill(); } catch (_) {}
            }
            if (stream.player) {
                try { stream.player.stop(); } catch (_) {}
            }
        }
        activeStreams.clear();
    }
}

function getAudioStatus() {
    const streamSounds = {};
    for (const [k, stream] of activeStreams.entries()) {
        streamSounds[k] = stream.soundType;
    }

    return {
        isPlaying: activeStreams.size > 0,
        activeStreamsCount: activeStreams.size,
        presets: Object.keys(SOUND_PRESETS),
        activeKeys: Array.from(activeStreams.keys()),
        streamSounds
    };
}

module.exports = {
    playSoundOnConnection,
    stopSound,
    getAudioStatus,
    getActivePlayingSounds,
    SOUND_PRESETS,
    MP3_SOUNDS,
    DEFAULT_MP3_PATH,
    resolveAudioFile
};
