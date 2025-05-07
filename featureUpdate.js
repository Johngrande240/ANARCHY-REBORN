
const { EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

const UPDATE_CHANNEL_ID = '1364947586687176704';
const flagFile = path.join(__dirname, 'feature-update-sent.json');

function sendFeatureUpdate(client) {
    if (fs.existsSync(flagFile)) {
        console.log('Feature update already sent. Skipping...');
        return;
    }

    const channel = client.channels.cache.get(UPDATE_CHANNEL_ID);
    if (!channel) {
        console.error('Update channel not found.');
        return;
    }

    const embed = new EmbedBuilder()
        .setTitle('🌟 NEWLIFE ROLEPLAY REVAMPED BOT - FEATURE UPDATE 🌟')
        .setColor('#FFA500')
        .setDescription([
            '═══════════════════════════════════',
            '',
            '🛡️ **Security Features**',
            '• Anti-Spam Protection',
            '• Anti-Raid System',
            '• Anti-Nuke Protection',
            '• NSFW Content Filter',
            '• Verification System',
            '• Auto-Moderation',
            '• IP Security',
            '',
            '🎮 **Economy System**',
            '• Daily Rewards',
            '• Work Commands',
            '• Balance Checking',
            '• Economy Leaderboard',
            '• Shop System',
            '• Custom Currency',
            '',
            '👮 **Moderation Tools**',
            '• Ban/Kick Commands',
            '• Mute/Unmute System',
            '• Warning System',
            '• Bulk Message Delete',
            '• Role Management',
            '• Temporary Roles',
            '',
            '🎵 **Music Features**',
            '• Play Music',
            '• Skip Tracks',
            '• Queue System',
            '• Stop Playback',
            '• Audio Filters (Bassboost, Nightcore, etc.)',
            '',
            '🎫 **Ticket System**',
            '• Create Tickets',
            '• Close Tickets',
            '• List Active Tickets',
            '• Ticket Management',
            '',
            '🎯 **Utility Commands**',
            '• Server Information',
            '• User Information',
            '• Avatar Display',
            '• Uptime Checking',
            '• Math Operations',
            '• Custom Poll Creation',
            '',
            '👋 **Welcome System**',
            '• Customizable Welcome Messages',
            '• Exit Messages',
            '• Image Support',
            '• Channel Configuration',
            '• Auto-Role Assignment',
            '',
            '🎲 **Fun Commands**',
            '• 8Ball',
            '• Random Memes',
            '• Jokes',
            '• Custom Say Command',
            '',
            '⚙️ **Administrative**',
            '• Security Configuration',
            '• Auto-Role Setup',
            '• Channel Management',
            '• Permission Controls',
            '• Logging System',
            '',
            '═══════════════════════════════════',
            '',
            '🔄 **24/7 Uptime Monitoring**',
            '• Constant Server Availability',
            '• Performance Tracking',
            '• Status Updates',
            '',
            '🆕 **Dynamic Playing Messages**',
            '• The bot now updates its playing status every few minutes!',
            '• Makes the bot feel more alive and up-to-date.',
            '',
            'Use `/help` in the server for a complete list of commands!'
        ].join('\n'))
        .setFooter({ text: 'NEWLIFE ROLEPLAY REVAMPED' })
        .setTimestamp();

    channel.send({ embeds: [embed] })
        .then(() => {
            fs.writeFileSync(flagFile, JSON.stringify({ sent: true }));
            console.log('Feature update sent and flag saved.');
        })
        .catch(console.error);
}

module.exports = { sendFeatureUpdate };
