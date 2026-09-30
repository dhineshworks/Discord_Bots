const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');

function getOrdinal(n) {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/**
 * Generate a custom Welcome Banner matching the screenshot design:
 * Dark card, crisp white border, circular member avatar with white ring,
 * and custom welcome typography with member count.
 * 
 * @param {import('discord.js').GuildMember} member 
 * @returns {Promise<Buffer>}
 */
async function generateWelcomeCard(member) {
    const width = 800;
    const height = 240;

    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // 1. Transparent canvas base with dark card container
    const margin = 12;
    const cardX = margin;
    const cardY = margin;
    const cardWidth = width - margin * 2;
    const cardHeight = height - margin * 2;
    const cardRadius = 14;

    // Draw dark background card
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(cardX, cardY, cardWidth, cardHeight, cardRadius);
    ctx.fillStyle = '#232428';
    ctx.fill();

    // Crisp white border
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
    ctx.restore();

    // 2. Avatar Drawing (Left side)
    const avatarCenterX = 135;
    const avatarCenterY = height / 2;
    const avatarRadius = 65;

    // Load member avatar
    let avatarImg;
    try {
        const avatarUrl = member.user.displayAvatarURL({ extension: 'png', size: 256, forceStatic: true });
        avatarImg = await loadImage(avatarUrl);
    } catch (e) {
        // Fallback default avatar
        try {
            avatarImg = await loadImage(member.user.defaultAvatarURL);
        } catch (_) {}
    }

    if (avatarImg) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(avatarCenterX, avatarCenterY, avatarRadius, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(
            avatarImg, 
            avatarCenterX - avatarRadius, 
            avatarCenterY - avatarRadius, 
            avatarRadius * 2, 
            avatarRadius * 2
        );
        ctx.restore();
    }

    // Avatar outer white border ring
    ctx.save();
    ctx.beginPath();
    ctx.arc(avatarCenterX, avatarCenterY, avatarRadius, 0, Math.PI * 2);
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
    ctx.restore();

    // 3. Right-side Typography
    const textStartX = 230;
    const memberCount = member.guild.memberCount || 1;
    const ordinalText = getOrdinal(memberCount);
    const serverName = member.guild.name || 'COMMUNITY';
    const displayName = member.displayName || member.user.username;

    // Line 1: Welcome + Name
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText('Welcome  ', textStartX, avatarCenterY - 14);

    // Measure 'Welcome ' to place username
    const welcomeMeasure = ctx.measureText('Welcome  ').width;
    
    // Fit username if too long
    let nameFontSize = 24;
    ctx.font = `bold ${nameFontSize}px sans-serif`;
    while (ctx.measureText(displayName).width > 420 && nameFontSize > 16) {
        nameFontSize -= 2;
        ctx.font = `bold ${nameFontSize}px sans-serif`;
    }
    ctx.fillText(displayName, textStartX + welcomeMeasure, avatarCenterY - 14);
    ctx.restore();

    // Line 2: to Server Name  You are the 179th member!
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 20px sans-serif';

    const line2 = `to ${serverName}  You are the ${ordinalText} member!`;
    let line2FontSize = 20;
    while (ctx.measureText(line2).width > 520 && line2FontSize > 14) {
        line2FontSize -= 1;
        ctx.font = `bold ${line2FontSize}px sans-serif`;
    }
    ctx.fillText(line2, textStartX, avatarCenterY + 26);
    ctx.restore();

    return canvas.encode('png');
}

module.exports = {
    generateWelcomeCard,
    getOrdinal
};
