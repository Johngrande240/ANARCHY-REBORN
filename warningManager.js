
const fs = require('fs');

const warningFile = './warnings.json';

function getWarnings(userId) {
    if (!fs.existsSync(warningFile)) fs.writeFileSync(warningFile, '{}');
    const data = JSON.parse(fs.readFileSync(warningFile));
    return data[userId] || 0;
}

function addWarning(userId) {
    if (!fs.existsSync(warningFile)) fs.writeFileSync(warningFile, '{}');
    const data = JSON.parse(fs.readFileSync(warningFile));
    data[userId] = (data[userId] || 0) + 1;
    fs.writeFileSync(warningFile, JSON.stringify(data, null, 2));
    return data[userId];
}

async function handlePenalties(member, warnings, logChannel) {
    if (!member || !member.manageable) return;

    if (warnings === 3) {
        try {
            await member.timeout(10 * 60 * 1000, 'Reached 3 warnings (Auto Mute)');
            logChannel?.send(`🔇 **Auto-muted:** ${member.user.tag} (10 mins) - Reached 3 warnings.`);
        } catch (error) {
            console.error('Failed to mute:', error);
        }
    } else if (warnings === 5) {
        try {
            await member.kick('Reached 5 warnings (Auto Kick)');
            logChannel?.send(`👢 **Auto-kicked:** ${member.user.tag} - Reached 5 warnings.`);
        } catch (error) {
            console.error('Failed to kick:', error);
        }
    } else if (warnings === 7) {
        try {
            await member.ban({ reason: 'Reached 7 warnings (Auto Ban)' });
            logChannel?.send(`⛔ **Auto-banned:** ${member.user.tag} - Reached 7 warnings.`);
        } catch (error) {
            console.error('Failed to ban:', error);
        }
    }
}

module.exports = { getWarnings, addWarning, handlePenalties };
