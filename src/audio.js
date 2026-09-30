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
 * Spawns an optimized FFmpeg process delivering pristine 20ms Opus frames into an Ogg stream.
 * - NO '-re': prevents artificial stream starvation and buffer underruns in Discord.js audio player
 * - '-page_duration 20000': emits 20ms pages matching Discord's packet clock perfectly
 * - '-application audio -frame_duration 20': ensures clean Opus packets without jitter
 */
function spawnOggOpusStream(soundType, loop = false, volume = 1.0) {
    const mp3File = resolveAudioFile(soundType);
    const isMp3 = Boolean(mp3File);
    let ffmpegArgs = [];
    const vol = Math.max(0, Math.min(2.0, typeof volume === 'number' ? volume : 1.0));
    const volumeArgs = (vol !== 1.0) ? ['-af', `volume=${vol}`] : [];

    if (isMp3) {
        ffmpegArgs = [
            ...(loop ? ['-stream_loop', '-1'] : []),
            '-i', mp3File,
            '-vn',
            '-sn',
            '-dn',
            ...volumeArgs,
            '-c:a', 'libopus',
            '-b:a', '128k',
            '-ar', '48000',
            '-ac', '2',
            '-application', 'audio',
            '-frame_duration', '20',
            '-page_duration', '20000',
            '-f', 'ogg',
            'pipe:1'
        ];
    } else {
        const lavfiFilter = SOUND_PRESETS[soundType] || SOUND_PRESETS.beeps;
        ffmpegArgs = [
            '-f', 'lavfi',
            '-i', lavfiFilter,
            '-vn',
            '-sn',
            ...volumeArgs,
            '-c:a', 'libopus',
            '-b:a', '96k',
            '-ar', '48000',
            '-ac', '2',
            '-application', 'audio',
            '-frame_duration', '20',
            '-page_duration', '20000',
            '-f', 'ogg',
            'pipe:1'
        ];
    }

    const p = spawn(ffmpegPath, ffmpegArgs, { 
        stdio: ['ignore', 'pipe', 'ignore'] 
    });

    p.on('error', (err) => {
        // Prevent unhandled error events if process terminates early
    });

    if (p.stdout) {
        p.stdout.on('error', () => {});
    }

    const resource = createAudioResource(p.stdout, {
        inputType: StreamType.OggOpus,
        silencePaddingFrames: 5
    });

    if (resource.playStream) {
        resource.playStream.on('error', (err) => {
            // Prevent unhandled stream error
        });
    }

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
    const onEndCallback = typeof options.onEnd === 'function' ? options.onEnd : null;

    // Stop existing stream for this connection if any
    stopSound(key);

    const player = createAudioPlayer({
        behaviors: {
            noSubscriber: NoSubscriberBehavior.Play,
            maxMissedFrames: 500
        }
    });

    const settings = readSettings();
    const isAutoRotate = settings.randomRotation !== false;

    // Check individual bot volume & mute status
    const botMuted = settings.botMuted?.[botId] === true;
    let botVolume = 1.0;
    if (botMuted) {
        botVolume = 0.0;
    } else if (typeof settings.botVolumes?.[botId] === 'number') {
        botVolume = settings.botVolumes[botId] / 100;
    } else if (typeof options.volume === 'number') {
        botVolume = options.volume;
    }

    // If auto-rotate is on: play once so Idle naturally triggers next unique sound
    // If auto-rotate is off: loop the chosen sound continuously
    const { resource, process: p, isMp3 } = spawnOggOpusStream(soundType, !isAutoRotate && !onEndCallback, botVolume);

    player.play(resource);
    connection.subscribe(player);

    const record = { 
        process: p, 
        player, 
        soundType, 
        connection,
        isMp3,
        botId,
        volume: botVolume,
        startedAt: Date.now(),
        isTransitioning: false,
        timeout: null,
        stopped: false,
        onEnd: onEndCallback
    };

    activeStreams.set(key, record);

    player.on(AudioPlayerStatus.Playing, () => {
        console.log(`[Audio 24/7] 🔊 [${key}] Native Opus Playing: [${record.soundType}]`);
    });

    player.on(AudioPlayerStatus.AutoPaused, () => {
        console.log(`[Audio 24/7] ⚠️ [${key}] AutoPaused detected, forcing unpause...`);
        try { player.unpause(); } catch (_) {}
    });

    // When audio track ends:
    player.on(AudioPlayerStatus.Idle, () => {
        if (record.stopped || !activeStreams.has(key)) return;
        if (record.isTransitioning) return;
        record.isTransitioning = true;

        if (onEndCallback) {
            stopSound(key);
            try { onEndCallback(key, record.soundType); } catch (e) { console.error('[Audio onEnd error]:', e); }
            return;
        }

        const currentSettings = readSettings();
        const shouldRotate = currentSettings.randomRotation !== false;

        let nextSound = record.soundType;

        if (shouldRotate) {
            // Find all sounds currently playing by all other bots
            const otherPlaying = getActivePlayingSounds(key);
            // Select next unique random uploaded sound
            nextSound = getNextRandomSoundForBot(key, record.soundType, otherPlaying);
            console.log(`[Audio Randomizer] 🎲 Bot [${key}] finished track. Next unique sound: [${nextSound}] (Others playing: ${otherPlaying.join(', ') || 'none'})`);
        }

        // Clean, quick 200ms transition between sounds
        if (record.timeout) clearTimeout(record.timeout);
        record.timeout = setTimeout(() => {
            record.timeout = null;
            if (record.stopped || !activeStreams.has(key)) return;

            try {
                if (record.process) {
                    try { record.process.kill(); } catch (_) {}
                }
                const next = spawnOggOpusStream(nextSound, !shouldRotate, record.volume);
                record.process = next.process;
                record.soundType = nextSound;
                record.startedAt = Date.now();
                record.isTransitioning = false;
                player.play(next.resource);
            } catch (err) {
                console.warn(`[Audio Loop Error (${key})]:`, err.message);
                record.isTransitioning = false;
                if (!record.stopped && activeStreams.has(key)) {
                    record.timeout = setTimeout(() => {
                        record.timeout = null;
                        if (!record.stopped && activeStreams.has(key)) {
                            playSoundOnConnection(connection, nextSound, options);
                        }
                    }, 1000);
                }
            }
        }, 200);
    });

    player.on('error', (err) => {
        console.warn(`[Audio Player Error (${key})]:`, err.message);
        if (record.stopped) return;
        if (record.timeout) clearTimeout(record.timeout);
        record.timeout = setTimeout(() => {
            record.timeout = null;
            if (!record.stopped && activeStreams.has(key)) {
                const otherPlaying = getActivePlayingSounds(key);
                const next = getNextRandomSoundForBot(key, record.soundType, otherPlaying);
                playSoundOnConnection(connection, next, options);
            }
        }, 1200);
    });

    return player;
}

/**
 * Stop audio on a specific connection or all connections cleanly
 * @param {string|null} key
 */
function stopSound(key = null) {
    if (key) {
        const stream = activeStreams.get(key);
        if (stream) {
            stream.stopped = true;
            if (stream.timeout) {
                clearTimeout(stream.timeout);
                stream.timeout = null;
            }
            if (stream.process) {
                try { stream.process.kill(); } catch (_) {}
            }
            if (stream.player) {
                try { stream.player.stop(true); } catch (_) {}
            }
            activeStreams.delete(key);
        }
    } else {
        for (const [k, stream] of activeStreams.entries()) {
            stream.stopped = true;
            if (stream.timeout) {
                clearTimeout(stream.timeout);
                stream.timeout = null;
            }
            if (stream.process) {
                try { stream.process.kill(); } catch (_) {}
            }
            if (stream.player) {
                try { stream.player.stop(true); } catch (_) {}
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
