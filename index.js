require('dotenv').config();
const express = require('express');
const { Client, GatewayIntentBits, SlashCommandBuilder, Routes, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionsBitField } = require('discord.js');
const { REST } = require('@discordjs/rest');
const samp = require('samp-query');

const options = {
    host: 'newlife-rp.ph-host.xyz', // Replace with your SAMP server IP
    port: 7777                     // Replace with your SAMP server port
};

async function queryServer() {
  return new Promise((resolve, reject) => {
    samp(options, (error, response) => {
      if (error) {
        reject(error);
      } else {
        resolve(response);
      }
    });
  });
}

// Express server setup
const app = express();
app.get('/', (req, res) => {
  res.send('Bot is running!');
});
app.listen(3000, '0.0.0.0', () => {
  console.log('Express server is running!');
});

const token = process.env.NEWLIFE_TOKEN;
if (!token) {
  console.error('ERROR: Missing NEWLIFE_TOKEN environment variable');
  console.error('Please add your bot token in the Secrets tab (Environment variables)');
  process.exit(1);
}

// Validate token format
if (!token || !/^[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{27}$/.test(token)) {
  console.error('ERROR: Invalid Discord token format');
  console.error('Token length:', token ? token.length : 0);
  console.error('Please check your token in the Secrets tab');
  console.error('Make sure there are no spaces before or after the token');
  process.exit(1);
}

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

// Self-ping to keep bot alive
setInterval(() => {
    fetch('https://' + process.env.REPL_SLUG + '.' + process.env.REPL_OWNER + '.repl.co').then(() => {
        console.log('Pinging to keep alive');
    }).catch(console.error);
}, 240000); // every 4 minutes
const clientId = process.env.CLIENT_ID;
if (!clientId) {
  console.error('Missing CLIENT_ID environment variable');
  process.exit(1);
}

const client = new Client({ 
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildBans,
    GatewayIntentBits.GuildEmojisAndStickers,
    GatewayIntentBits.GuildIntegrations,
    GatewayIntentBits.GuildWebhooks,
    GatewayIntentBits.GuildInvites,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildMessageTyping,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.DirectMessageReactions,
    GatewayIntentBits.DirectMessageTyping,
    GatewayIntentBits.GuildScheduledEvents,
    GatewayIntentBits.GuildModeration
  ],
  partials: ['MESSAGE', 'CHANNEL', 'REACTION']
});

// Security Systems Configuration
const SPAM_TIME_WINDOW = 5000;
const SPAM_THRESHOLD = 5;
const RAID_THRESHOLD = 10;
const MUTE_DURATION = 300000;

const SECURITY_CONFIG = {
  verification: {
    enabled: true,
    requiredRole: 'Verified',
    accountAgeDays: 7,
    captchaTimeout: 300000, // 5 minutes to complete verification
    maxAttempts: 3,
    lockoutDuration: 3600000, // 1 hour
  },
  ipSecurity: {
    maxRequestsPerIP: 100,
    timeWindow: 300000, // 5 minutes
    blacklistThreshold: 5,
  },
  spam: {
    threshold: 5,
    timeWindow: 5000, // SPAM_TIME_WINDOW
    muteDuration: 300000, // MUTE_DURATION
    maxEmojis: 10,
    maxMentions: 5
  },
  raid: {
    threshold: 10, // RAID_THRESHOLD
    timeWindow: 10000,
    accountAgeThreshold: 7 * 24 * 60 * 60 * 1000, // 7 days
    actionType: 'kick' // or 'ban'
  },
  commands: {
    cooldown: 3000, // 3 seconds between commands
    maxPerMinute: 10
  },
  automod: {
    toxicityThreshold: 0.8,
    bannedWords: ['badword1', 'badword2'],
    maxNewlines: 10,
    maxLength: 2000
  }
};

// Command cooldown system
const commandCooldowns = new Map();
const userCommandCount = new Map();

// Cleanup old entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, time] of commandCooldowns) {
    if (now - time > 3600000) commandCooldowns.delete(key); // Remove after 1 hour
  }
  for (const [key, data] of userCommandCount) {
    if (now - data.timestamp > 3600000) userCommandCount.delete(key);
  }
}, 1800000); // Run every 30 minutes

// Enhanced anti-spam system with cleanup
const spamMap = new Map();
const userWarnings = new Map();

// Cleanup spam maps every hour
setInterval(() => {
  const now = Date.now();
  for (const [key, messages] of spamMap.entries()) {
    const oldMessages = messages.filter(msg => now - msg.timestamp <= SPAM_TIME_WINDOW);
    if (oldMessages.length === 0) {
      spamMap.delete(key);
    } else {
      spamMap.set(key, oldMessages);
    }
  }

  // Cleanup warnings older than 24 hours
  for (const [key, warning] of userWarnings.entries()) {
    if (now - warning.timestamp > 86400000) {
      userWarnings.delete(key);
    }
  }
}, 3600000);

// Enhanced anti-raid system
const joinedMembers = new Map();
const suspiciousAccounts = new Set();

// Logging system
function logSecurityEvent(guild, type, details) {
  const logChannel = guild.channels.cache.find(ch => ch.name === 'security-logs');
  if (!logChannel) {
    console.warn(`Security-logs channel not found in guild ${guild.name}`);
    return;
  }

  const embed = {
    title: `🛡️ Security Event: ${type}`,
    description: typeof details === 'string' ? details : JSON.stringify(details, null, 2),
    color: 0xFF0000,
    timestamp: new Date().toISOString()
  };

  logChannel.send({ embeds: [embed] }).catch(error => {
    console.error('Failed to log security event:', error);
  });
}

// Permission verification
function hasRequiredPermissions(member, permissions) {
  if (!member) return false;
  if (member.id === member.guild.ownerId) return true;
  return member.permissions.has(permissions);

}

client.on('guildMemberUpdate', async (oldMember, newMember) => {
  // Check if the member has boosted the server
  if (!oldMember.premiumSince && newMember.premiumSince) {
    // Define the booster channel ID
    const boosterChannelId = '1368586038796091493';

    // Fetch the channel
    const boosterChannel = newMember.guild.channels.cache.get(boosterChannelId);
    if (!boosterChannel) {
      console.error('Booster channel not found!');
      return;
    }

    // Create a stylish embed message for booster notification
    const boosterEmbed = {
      title: '✨ Server Boost Alert ✨',
      description: `${newMember.user} has boosted the server! Thank you for your support! 💖`,
      color: 0xFFD700, // Gold color
      thumbnail: {
        url: newMember.user.displayAvatarURL({ dynamic: true }),
      },
      fields: [
        { name: 'Total Boosts', value: `${newMember.guild.premiumSubscriptionCount} boosts`, inline: true },
        { name: 'Boost Tier', value: `Level ${newMember.guild.premiumTier}`, inline: true },
      ],
      footer: {
        text: 'Boost our server and help us grow!',
        icon_url: 'https://path/to/aesthetic/icon.png', // Replace with an actual URL icon if available
      },
      timestamp: new Date(),
    };

    // Send the embed message to the channel
    await boosterChannel.send({ embeds: [boosterEmbed] });
  }
});


// Command rate limiting
function isRateLimited(userId, commandName) {
  const now = Date.now();
  const key = `${userId}-${commandName}`;
  const userCooldown = commandCooldowns.get(key);

  // Command-specific cooldowns
  const cooldowns = {
    ban: 30000,
    kick: 30000,
    mute: 15000,
    clear: 10000,
    default: SECURITY_CONFIG.commands.cooldown
  };

  const commandCooldown = cooldowns[commandName] || cooldowns.default;

  if (userCooldown && (now - userCooldown) < commandCooldown) {
    const remainingTime = Math.ceil((commandCooldown - (now - userCooldown)) / 1000);
    return { limited: true, remainingTime };
  }

  const userCount = userCommandCount.get(userId) || { count: 0, timestamp: now, warnings: 0 };
  if (now - userCount.timestamp > 60000) {
    userCount.count = 0;
    userCount.timestamp = now;
  }

  if (userCount.count >= SECURITY_CONFIG.commands.maxPerMinute) {
    userCount.warnings++;
    if (userCount.warnings >= 3) {
      return { limited: true, blacklisted: true };
    }
    return { limited: true, warning: true };
  }

  userCount.count++;
  userCommandCount.set(userId, userCount);
  commandCooldowns.set(key, now);
  return { limited: false };
}

// Anti-nuke tracking
const actionLog = new Map();
const NUKE_THRESHOLD = {
  bans: 3,
  channelDeletions: 2,
  roleDeletions: 2,
  timeWindow: 10000 // 10 seconds
};

// Music system removed

const welcomeManager = require('./welcomeManager');
const roleManager = require('./roleManager');
const { setupStealthCommands } = require('./stealthCommands');
const { getWarnings, addWarning, handlePenalties } = require('./warningManager');

const {
  handleAIChat,
  toggleBloodMode,
  initializeTicketHandlers,
  handleTicketSetup,
  handleTicketCreate,
  handleTicketCategory,
  handleTicketClose,
  handleConfirmClose
} = require('./aiHandler.js');

const commands = [
// Register the /updates command
new SlashCommandBuilder()
  .setName('updates')
  .setDescription('Send bot updates to the channel'),
  new SlashCommandBuilder()
    .setName('serverrule')
    .setDescription('Display the SA:MP server rules'),
  new SlashCommandBuilder()
    .setName('discordrule')
    .setDescription('Display the Discord server rules'),
  new SlashCommandBuilder()
    .setName('staff')
    .setDescription('Shows the staff list'),
    new SlashCommandBuilder()
        .setName('betaannounce')
        .setDescription('Send beta test announcement to specific channel')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder()
        .setName('serverup')
        .setDescription('Announce that the server is online')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder()
        .setName('serverdown')
        .setDescription('Announce that the server is offline')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder()
        .setName('bloodmode')
        .setDescription('Toggle BloodMode intense penalty ON/OFF')
        .addStringOption(option =>
            option.setName('status')
                .setDescription('Choose ON or OFF')
                .setRequired(true)
                .addChoices(
                    { name: 'ON', value: 'on' },
                    { name: 'OFF', value: 'off' }
                ))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder()
        .setName('checkwarnings')
        .setDescription('Check how many warnings a user has.')
        .addUserOption(option =>
            option.setName('target')
                .setDescription('User to check')
                .setRequired(true)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder()
    .setName('setwelcome')
    .setDescription('Set welcome message configuration')
    .addStringOption(option =>
      option.setName('message')
        .setDescription('Welcome message to display')
        .setRequired(true))
    .addChannelOption(option =>
      option.setName('channel')
        .setDescription('Channel to send welcome messages')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('imageurl')
        .setDescription('URL of welcome image')
        .setRequired(false)),
  new SlashCommandBuilder()
    .setName('temprole')
    .setDescription('Add a temporary role to a user')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('User to add role to')
        .setRequired(true))
    .addRoleOption(option =>
      option.setName('role')
        .setDescription('Role to add')
        .setRequired(true))
    .addIntegerOption(option =>
      option.setName('duration')
        .setDescription('Duration in minutes')
        .setRequired(true)),
  new SlashCommandBuilder()
    .setName('donationrules')
    .setDescription('Shows the donation rules and terms'),
  new SlashCommandBuilder()
    .setName('donationformat')
    .setDescription('Shows the donation format and terms'),
  new SlashCommandBuilder()
    .setName('leave')
    .setDescription('Makes the bot leave the server'),
  new SlashCommandBuilder()
    .setName('admin')
    .setDescription('Manage security settings')
    .setDefaultMemberPermissions(0)
    .addSubcommandGroup(group =>
      group
        .setName('nsfw')
        .setDescription('Configure NSFW content moderation')
        .addSubcommand(subcommand =>
          subcommand
            .setName('config')
            .setDescription('Configure NSFW content settings')
            .addStringOption(option =>
              option.setName('action')
              .setDescription('Action to take on NSFW content')
              .setRequired(true)
              .addChoices(
                { name: 'Mute', value: 'mute' },
                { name: 'Kick', value: 'kick' }
              ))
            .addIntegerOption(option =>
              option.setName('muteduration')
              .setDescription('Mute duration in minutes (if mute action selected)')
              .setMinValue(1)
              .setMaxValue(1440))
        )
    )
    .addSubcommandGroup(group =>
      group
        .setName('nuke')
        .setDescription('Manage anti-nuke settings')
        .addSubcommand(subcommand =>
          subcommand
            .setName('config')
            .setDescription('Configure anti-nuke thresholds')
            .addIntegerOption(option =>
              option.setName('banthreshold')
              .setDescription('Number of bans before triggering')
              .setMinValue(1)
              .setMaxValue(20))
            .addIntegerOption(option =>
              option.setName('channelthreshold')
              .setDescription('Number of channel deletions before triggering')
              .setMinValue(1)
              .setMaxValue(10))
            .addIntegerOption(option =>
              option.setName('rolethreshold')
              .setDescription('Number of role deletions before triggering')
              .setMinValue(1)
              .setMaxValue(10))
            .addIntegerOption(option =>
              option.setName('timewindow')
              .setDescription('Time window in seconds')
              .setMinValue(5)
              .setMaxValue(60))
        )
    )
    .addSubcommandGroup(group =>
      group
        .setName('security')
        .setDescription('Manage security settings')
        .addSubcommand(subcommand =>
          subcommand
            .setName('toggle')
            .setDescription('Enable/disable security features')
            .addStringOption(option =>
              option.setName('feature')
              .setDescription('Security feature to modify')
              .setRequired(true)
              .addChoices(
                { name: 'Anti-Spam', value: 'spam' },
                { name: 'Anti-Raid', value: 'raid' },
                { name: 'Verification', value: 'verification' },
                { name: 'Auto-Moderation', value: 'automod' }
              ))
            .addBooleanOption(option =>
              option.setName('enabled')
              .setDescription('Enable or disable the feature')
              .setRequired(true))
        )
        .addSubcommand(subcommand =>
          subcommand
            .setName('spam')
            .setDescription('Configure anti-spam settings')
            .addIntegerOption(option =>
              option.setName('threshold')
              .setDescription('Number of messages before triggering')
              .setMinValue(1)
              .setMaxValue(20))
            .addIntegerOption(option =>
              option.setName('timewindow')
              .setDescription('Time window in seconds')
              .setMinValue(1)
              .setMaxValue(60))
            .addIntegerOption(option =>
              option.setName('muteduration')
              .setDescription('Mute duration in minutes')
              .setMinValue(1)
              .setMaxValue(60))
        )
        .addSubcommand(subcommand =>
          subcommand
            .setName('raid')
            .setDescription('Configure anti-raid settings')
            .addIntegerOption(option =>
              option.setName('threshold')
              .setDescription('Number of joins before triggering')
              .setMinValue(2)
              .setMaxValue(50))
            .addStringOption(option =>
              option.setName('action')
              .setDescription('Action to take on raid detection')
              .addChoices(
                { name: 'Kick', value: 'kick' },
                { name: 'Ban', value: 'ban' }
              ))
        )
        .addSubcommand(subcommand =>
          subcommand
            .setName('verification')
            .setDescription('Configure verification settings')
            .addIntegerOption(option =>
              option.setName('accountage')
              .setDescription('Required account age in days')
              .setMinValue(0)
              .setMaxValue(30))
            .addRoleOption(option =>
              option.setName('role')
              .setDescription('Role to give after verification'))
        )
        .addSubcommand(subcommand =>
          subcommand
            .setName('automod')
            .setDescription('Configure auto-moderation settings')
            .addIntegerOption(option =>
              option.setName('maxmentions')
              .setDescription('Maximum mentions per message')
              .setMinValue(1)
              .setMaxValue(20))
            .addIntegerOption(option =>
              option.setName('maxemojis')
              .setDescription('Maximum emojis per message')
              .setMinValue(1)
              .setMaxValue(50))
            .addStringOption(option =>
              option.setName('bannedwords')
              .setDescription('Comma-separated list of banned words'))
        )
    ),
  new SlashCommandBuilder()
    .setName('about')
    .setDescription('Shows information about the server'),
  new SlashCommandBuilder()
    .setName('faq')
    .setDescription('Shows frequently asked questions'),
  new SlashCommandBuilder()
    .setName('daily')
    .setDescription('Claim your daily reward'),
  new SlashCommandBuilder()
    .setName('balance')
    .setDescription('Check your coin balance'),
  new SlashCommandBuilder()
    .setName('work')
    .setDescription('Work to earn coins'),
  new SlashCommandBuilder()
    .setName('shop')
    .setDescription('View available items in the shop'),
  new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('View the economy leaderboard'),
  new SlashCommandBuilder()
    .setName('meme')
    .setDescription('Get a random meme'),
  new SlashCommandBuilder()
    .setName('8ball')
    .setDescription('Ask the magic 8-ball a question')
    .addStringOption(option =>
      option.setName('question')
        .setDescription('Your question')
        .setRequired(true)),
  new SlashCommandBuilder()
    .setName('joke')
    .setDescription('Get a random joke'),
  new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Bulk delete messages')
    .addIntegerOption(option =>
      option.setName('amount')
        .setDescription('Number of messages to delete')
        .setRequired(true)),
  new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Warn a user')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('User to warn')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Reason for warning')
        .setRequired(true)),
  new SlashCommandBuilder()
    .setName('addrole')
    .setDescription('Add a role to a user')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('User to add role to')
        .setRequired(true))
    .addRoleOption(option =>
      option.setName('role')
        .setDescription('Role to add')
        .setRequired(true)),
  new SlashCommandBuilder()
    .setName('removerole')
    .setDescription('Remove a role from a user')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('User to remove role from')
        .setRequired(true))
    .addRoleOption(option =>
      option.setName('role')
        .setDescription('Role to remove')
        .setRequired(true)),
  new SlashCommandBuilder()
    .setName('autorole')
    .setDescription('Set auto-role for new members')
    .addRoleOption(option =>
      option.setName('role')
        .setDescription('Role to automatically assign')
        .setRequired(true)),
  new SlashCommandBuilder()
    .setName('verify')
    .setDescription('Verify yourself in the server'),
  new SlashCommandBuilder()
    .setName('uptime')
    .setDescription('Show bot uptime'),
  new SlashCommandBuilder()
    .setName('ip')
    .setDescription('Shows the server IP address'),
  new SlashCommandBuilder()
    .setName('donation')
    .setDescription('Shows donation list for vehicles and houses'),
  new SlashCommandBuilder()
    .setName('poll')
    .setDescription('Create a poll')
    .addStringOption(option =>
      option.setName('question')
        .setDescription('Poll question')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('options')
        .setDescription('Poll options (comma separated)')
        .setRequired(true)),
  new SlashCommandBuilder()
    .setName('play')
    .setDescription('Play a song')
    .addStringOption(option =>
      option.setName('song')
        .setDescription('Song name or URL')
        .setRequired(true)),
  new SlashCommandBuilder()
    .setName('skip')
    .setDescription('Skip the current song'),
  new SlashCommandBuilder()
    .setName('stop')
    .setDescription('Stop playing music'),
  new SlashCommandBuilder()
    .setName('queue')
    .setDescription('Show current queue'),
  new SlashCommandBuilder()
    .setName('filter')
    .setDescription('Apply an audio filter to the music')
    .addStringOption(option =>
      option.setName('name')
        .setDescription('Filter to apply')
        .setRequired(true)
        .addChoices(
          { name: 'Bassboost', value: 'bassboost' },
          { name: 'Nightcore', value: 'nightcore' },
          { name: 'Vaporwave', value: 'vaporwave' },
          { name: '8D', value: '8D' },
          { name: 'Karaoke', value: 'karaoke' },
          { name: 'Pop', value: 'pop' }
        )),
  new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Bans a user from the server')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('The user to ban')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Reason for the ban')
        .setRequired(false)),
  new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Kicks a user from the server')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('The user to kick')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Reason for the kick')
        .setRequired(false)),
  new SlashCommandBuilder()
    .setName('rule')
    .setDescription('Shows server rules'),
  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Replies with Pong!'),
  new SlashCommandBuilder()
    .setName('say')
    .setDescription('Bot repeats your message')
    .addStringOption(option =>
      option.setName('message')
        .setDescription('The message to repeat')
        .setRequired(true)),
  new SlashCommandBuilder()
    .setName('math')
    .setDescription('Performs a basic math operation')
    .addNumberOption(option =>
      option.setName('a')
        .setDescription('First number')
        .setRequired(true))
    .addNumberOption(option =>
      option.setName('b')
        .setDescription('Second number')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('operation')
        .setDescription('Math operation (+, -, *, /)')
        .setRequired(true)),
  new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription('Shows your username and ID'),
  new SlashCommandBuilder()
    .setName('serverinfo')
    .setDescription('Displays server name and member count'),
  new SlashCommandBuilder()
    .setName('avatar')
    .setDescription('Get your Discord avatar')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('User to get avatar of')
        .setRequired(false)),
  new SlashCommandBuilder()
    .setName('mute')
    .setDescription('Mutes a user')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('The user to mute')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Reason for muting')
        .setRequired(false)),
  new SlashCommandBuilder()
    .setName('unmute')
    .setDescription('Unmutes a user')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('The user to unmute')
        .setRequired(true)),
  new SlashCommandBuilder()
    .setName('securitystatus')
    .setDescription('Shows current security system status'),
  new SlashCommandBuilder()
    .setName('securityconfig')
    .setDescription('View or update security configuration')
    .addStringOption(option =>
      option.setName('setting')
        .setDescription('Setting to update')
        .setRequired(false)
        .addChoices(
          { name: 'Spam Threshold', value: 'spam.threshold' },
          { name: 'Raid Threshold', value: 'raid.threshold' },
          { name: 'Account Age Check', value: 'raid.accountAgeThreshold' }
        ))
    .addNumberOption(option =>
      option.setName('value')
        .setDescription('New value for the setting')
        .setRequired(false)),
  new SlashCommandBuilder()
    .setName('suspicious')
    .setDescription('List suspicious accounts'),
  new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Setup the ticket system'),
  new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Ticket system commands')
    .addSubcommand(subcommand =>
      subcommand
        .setName('add')
        .setDescription('Add a user to the ticket')
        .addUserOption(option =>
          option.setName('user')
            .setDescription('User to add')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('remove')
        .setDescription('Remove a user from the ticket')
        .addUserOption(option =>
          option.setName('user')
            .setDescription('User to remove')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('close')
        .setDescription('Close the ticket'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('claim')
        .setDescription('Claim the ticket'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('priority')
        .setDescription('Set ticket priority')
        .addStringOption(option =>
          option.setName('level')
            .setDescription('Priority level')
            .setRequired(true)
            .addChoices(
              { name: 'Low', value: 'low' },
              { name: 'Medium', value: 'medium' },
              { name: 'High', value: 'high' }
            ))),
  new SlashCommandBuilder()
    .setName('serverstatus')
    .setDescription('Gets the SA:MP server status'),
  new SlashCommandBuilder()
    .setName('appreciation')
    .setDescription('Send a heartwarming thanks to a server donor')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('The user to appreciate')
        .setRequired(true))
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(token);

// Verify token and permissions before registering commands
if (!token) {
  console.error('Missing bot token!');
  process.exit(1);
}

if (!clientId) {
  console.error('Missing clientId!');
  process.exit(1);
}

const guildId = '1260925059477012511';

// Register slash commands globally
(async () => {
  try {
    console.log('Registering slash commands globally...');
    await rest.put(
      Routes.applicationCommands(clientId),
      { body: commands }
    );
    console.log('Slash commands registered globally!');
  } catch (err) {
    console.error('Error registering commands:', err);
  }
})();

// Status messages to cycle through
const { ActivityType } = require('discord.js');

const statuses = [
  { type: ActivityType.Playing, name: '✨ NEWLIFE ROLEPLAY REVAMPED' },
  { type: ActivityType.Playing, name: '🌟 Creating Unforgettable Stories' },
  { type: ActivityType.Watching, name: '👥 Building Connections' },
  { type: ActivityType.Playing, name: '🎭 Where Stories Come Alive' },
  { type: ActivityType.Watching, name: '🌆 Life in Los Santos' },
  { type: ActivityType.Listening, name: '🎮 Adventures Unfold' },
  { type: ActivityType.Playing, name: '💫 Crafting Memories' },
  { type: ActivityType.Watching, name: '🌙 Dreams Take Flight' },
  { type: ActivityType.Playing, name: '🎬 Your Story Awaits' },
  { type: ActivityType.Competing, name: '🏆 Excellence in Roleplay' }
];

let statusIndex = 0;

// Function to update the activity status
function updatePlayingMessage() {
  const status = statuses[statusIndex];
  client.user.setActivity(status.name, { type: status.type });
  statusIndex = (statusIndex + 1) % statuses.length;
}

const { sendFeatureUpdate } = require('./featureUpdate');

// Enhanced error handling
process.on('unhandledRejection', error => {
  console.error('Unhandled promise rejection:', error);
});

client.on('error', error => {
  console.error('Discord client error:', error);
});

client.on('disconnect', () => {
  console.warn('Bot disconnected from Discord! Attempting to reconnect...');
  client.login(token).catch(err => {
    console.error('Failed to reconnect:', err);
  });
});

client.once('ready', async () => {
  console.log(`Bot is online as ${client.user.tag}`);
  console.log('Connected to Discord gateway!');

  try {
    // Initialize ticket handlers first
    initializeTicketHandlers(client);
    setupStealthCommands(client);

    await client.user.setPresence({
      activities: [{ name: 'Chilling in NEWLIFE ROLEPLAY', type: ActivityType.Playing }],
      status: 'idle'
    });

    // Set up status rotation
    setInterval(updatePlayingMessage, 60000); // Change status every minute

    sendFeatureUpdate(client); // Send feature update
    Logger.logToChannel(client, `✅ Bot has started as **${client.user.tag}**`);
  } catch (error) {
    console.error('Error during bot initialization:', error);
  }
});

// Welcome message handler
client.on('guildMemberAdd', async member => {
  const welcomeChannel = client.channels.cache.get('1260925060047310928');
  if (welcomeChannel) {
    const welcomeEmbed = {
      title: '👋 Welcome to NEWLIFE ROLEPLAY REVAMPED!',
      description: `Welcome ${member} to our amazing community!\n\nMake sure to check out our rules and have a great time!`,
      color: 0x00FF00,
      thumbnail: {
        url: member.user.displayAvatarURL({ dynamic: true })
      },
      footer: {
        text: 'NEWLIFE ROLEPLAY REVAMPED',
        icon_url: member.guild.iconURL()
      },
      timestamp: new Date()
    };
    await welcomeChannel.send({ embeds: [welcomeEmbed] });
    }
});

// Leave message handler
client.on('guildMemberRemove', async member => {  const leaveChannel = client.channels.cache.get('1369636228147974144');
  if (leaveChannel) {
    const leaveEmbed = {
      title: '👋 Member Left',
      description: `${member.user.tag} has left the server.`,
      color: 0xFF0000,
      thumbnail: {
        url: member.user.displayAvatarURL({ dynamic: true })
      },
      footer: {
        text: 'NEWLIFE ROLEPLAY REVAMPED',
        icon_url: member.guild.iconURL()
      },
      timestamp: new Date()
    };
    await leaveChannel.send({ embeds: [leaveEmbed] });
  }
});

client.on('guildCreate', guild => {
  Logger.logEvent(guild, 'guildCreate', guild);
});

client.on('guildDelete', guild => {
  Logger.logEvent(guild, 'guildDelete', guild);
});

client.on('interactionCreate', interaction => {
  if (interaction.isChatInputCommand()) {
    Logger.logEvent(interaction.guild, 'command', {
      user: interaction.user,
      command: `/${interaction.commandName}`
    });
  }
});

// Enhanced penalty system
async function applyPenalty(member, action, reason) {
  if (!member || !member.manageable) return;

  const logChannel = member.guild.channels.cache.get(SECURITY_CONFIG.logChannelId);

  switch(action) {
    case 'badword':
      await member.timeout(60000, reason);
      logChannel?.send(`🔇 **Auto-muted:** ${member.user.tag} (1 min) - ${reason}`);
      break;
    case 'spam':
      await member.timeout(120000, reason);
      logChannel?.send(`🔇 **Auto-muted:** ${member.user.tag} (2 mins) - ${reason}`);
      break;
    case 'raid':
      await member.ban({ reason });
      logChannel?.send(`⛔ **Auto-banned:** ${member.user.tag} - ${reason}`);
      break;
  }
}

// Anti-spam handler
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  // Handle AI chat in designated channel
  try {
    const response = await handleAIChat(message, message.author.id);
    if (response) {
      await message.channel.send(response);
    }
  } catch (error) {
    console.error('AI Chat Error:', error);
  }

  const key = `${message.author.id}-${message.guild.id}`;

  // Check for bad words
  const hasBadWord = SECURITY_CONFIG.automod.bannedWords.some(word => 
    message.content.toLowerCase().includes(word.toLowerCase())
  );

  if (hasBadWord) {
    try {
      await message.delete();
      await applyPenalty(message.member, 'badword', 'Used inappropriate language');
      message.channel.send(message.author + ', please refrain from using inappropriate language.')
        .then(msg => setTimeout(() => msg.delete().catch(() => {}), 5000));
      return;
    } catch (error) {
      console.error('Failed to handle bad word:', error);
    }
  }

  // Check for suspicious content
  const containsSuspiciousContent = message.content.includes('discord.gg/') ||
    message.mentions.users.size > SECURITY_CONFIG.spam.maxMentions ||
    (message.content.match(/:[a-zA-Z0-9_]+:/g) || []).length > SECURITY_CONFIG.spam.maxEmojis ||
    message.content.split('\n').length > SECURITY_CONFIG.automod.maxNewlines ||
    message.content.length > SECURITY_CONFIG.automod.maxLength ||
    SECURITY_CONFIG.automod.bannedWords.some(word => 
      message.content.toLowerCase().includes(word.toLowerCase())
    );

  if (containsSuspiciousContent) {
    try {
      await message.delete();
      logSecurityEvent(message.guild, 'Suspicious Content', {
        user: message.author.tag,
        content: message.content
      });
      return;
    } catch (error) {
      console.error('Failed to delete suspicious message:', error);
    }
  }

  // Enhanced spam detection
  if (!spamMap.has(key)) {
    spamMap.set(key, [{
      timestamp: Date.now(),
      content: message.content
    }]);
  } else {
    const userMessages = spamMap.get(key);
    userMessages.push({
      timestamp: Date.now(),
      content: message.content
    });

    // Remove old messages outside the time window
    const now = Date.now();
    while (userMessages.length && userMessages[0].timestamp < now - SPAM_TIME_WINDOW) {
      userMessages.shift();
    }

    // Check for spam
    if (userMessages.length >= SPAM_THRESHOLD) {
      const member = message.member;
      if (member && member.moderatable) {
        try {
          await member.timeout(MUTE_DURATION, 'Spam detection');
          message.channel.send(message.author + ' has been muted for spamming.');
          spamMap.delete(key);
        } catch (error) {
          console.error('Failed to mute member:', error);
        }
      }
    }
  }
});

// Anti-raid handler
client.on('guildMemberAdd', async (member) => {
  const now = Date.now();
  joinedMembers.set(now, member.id);

  // Check account age
  const accountAge = now - member.user.createdTimestamp;
  if (accountAge < SECURITY_CONFIG.raid.accountAgeThreshold) {
    suspiciousAccounts.add(member.id);
    logSecurityEvent(member.guild, 'Suspicious Account', {
      user: member.user.tag,
      accountAge: Math.floor(accountAge / (1000 * 60 * 60 * 24))+ ' days'
    });

    // Clean up old suspicious accounts after 7 days
    setTimeout(() => {
      suspiciousAccounts.delete(member.id);
    }, 7 * 24 * 60 * 60 * 1000);
  }

  // Clean up old entries
  for (const [timestamp] of joinedMembers) {
    if (timestamp < now - SECURITY_CONFIG.raid.timeWindow) {
      joinedMembers.delete(timestamp);
    }
  }

  // Enhanced raid detection
  if (joinedMembers.size >= SECURITY_CONFIG.raid.threshold) {
    try {
      // Enable server lockdown
      await member.guild.setVerificationLevel('HIGHEST');

      // Take action against suspicious accounts
      for (const suspiciousId of suspiciousAccounts) {
        const suspiciousMember = await member.guild.members.fetch(suspiciousId);
        if (suspiciousMember) {
          if (SECURITY_CONFIG.raid.actionType === 'ban') {
            await suspiciousMember.ban({ reason: 'Raid protection - suspicious account' });
          } else {
            await suspiciousMember.kick('Raid protection - suspicious account');
          }
        }
      }

      logSecurityEvent(member.guild, 'Raid Detection', {
        membersJoined: joinedMembers.size,
        actionTaken: SECURITY_CONFIG.raid.actionType
      });
    } catch (error) {
      console.error('Failed to handle raid:', error);
    }
  }

  // Check for raid
  if (joinedMembers.size >= RAID_THRESHOLD) {
    try {
      // Enable server verification level
      await member.guild.setVerificationLevel('HIGH');
      // Notify admins
      const logChannel = member.guild.channels.cache.find(ch => ch.name === 'mod-logs');
      if (logChannel) {
        logChannel.send('⚠️ Possible raid detected! Verification level has been increased.');
      }
    } catch (error) {
      console.error('Failed to handle raid:', error);
    }
  }
});

// Anti-nuke handlers
client.on('guildBanAdd', trackNukeAction('bans'));
client.on('channelDelete', trackNukeAction('channelDeletions'));
client.on('roleDelete', trackNukeAction('roleDeletions'));

function trackNukeAction(actionType) {
  return async (target) => {
    const guild = target.guild;
    const key = guild.id + '-' + actionType;

    if (!actionLog.has(key)) {
      actionLog.set(key, {
        count: 1,
        timestamp: Date.now()
      });
    } else {
      const log = actionLog.get(key);
      const now = Date.now();

      if (now - log.timestamp < NUKE_THRESHOLD.timeWindow) {
        log.count++;
        if (log.count >= NUKE_THRESHOLD[actionType]) {
          try {
            const auditLogs = await guild.fetchAuditLogs({
              type: actionType === 'bans' ? 'MEMBER_BAN_ADD' : 
                    actionType === 'channelDeletions' ? 'CHANNEL_DELETE' : 'ROLE_DELETE'
            });

            const moderator = auditLogs.entries.first()?.executor;
            if (moderator && moderator.id !== guild.ownerId) {
              const member = await guild.members.fetch(moderator.id);
              if (member && member.moderatable) {
                await member.roles.remove(member.roles.cache.filter(role => role.name !== '@everyone'));
                const logChannel = guild.channels.cache.find(ch => ch.name === 'mod-logs');
                if (logChannel) {
                  logChannel.send('🚨 Potential nuke detected! ' + moderator.tag + ' has been stripped of roles.');
                }
              }
            }
          } catch (error) {
            console.error('Failed to handle nuke attempt:', error);
          }
        }
      } else {
        log.count = 1;
        log.timestamp = now;
      }
    }
  };
}

// Music system removed

// Store bot start time
const BOT_START_TIME = Date.now();

// Auto-role storage
let autoRole = null;

client.on('guildMemberAdd', async member => {
  if (autoRole) {
    try {
      await member.roles.add(autoRole);
    } catch (error) {
      console.error('Failed to add auto-role:', error);
    }
  }
});

// Custom replies
const customReplies = {
  about: "Welcome to our server! This is a roleplay community...",
  faq: "Frequently Asked Questions:\n1. How to start roleplaying?\n2. What are the rules?..."
};

// Shop items
const shopItems = [
  { id: 'role1', name: 'VIP Role', price: 1000 },
  { id: 'role2', name: 'Elite Role', price: 5000 }
];

const Logger = require('./logger.js');
const economy = require('./economy.js');

// Message logging
client.on('messageDelete', async message => {
  if (message.author?.bot) return;
  Logger.logEvent(message.guild, 'messageDelete', message);
});

client.on('messageUpdate', async (oldMessage, newMessage) => {
  if (oldMessage.author?.bot) return;
  Logger.logEvent(oldMessage.guild, 'messageEdit', {
    author: oldMessage.author,
    channel: oldMessage.channel,
    oldContent: oldMessage.content,
    newContent: newMessage.content
  });
});

client.on('guildMemberAdd', member => {
  Logger.logEvent(member.guild, 'memberJoin', member);
});

client.on('guildMemberRemove', member => {
  Logger.logEvent(member.guild, 'memberLeave', member);
});

// Moderation logging
client.on('guildBanAdd', async (guild, user) => {
  const auditLogs = await guild.fetchAuditLogs({ type: 'MEMBER_BAN_ADD', limit: 1 });
  const banLog = auditLogs.entries.first();

  if (banLog) {
    Logger.logModeration(guild, 'ban', {
      user: user,
      moderator: banLog.executor,
      reason: banLog.reason
    });
  }
});

client.on('guildMemberRemove', async (member) => {
  const auditLogs = await member.guild.fetchAuditLogs({ type: 'MEMBER_KICK', limit: 1 });
  const kickLog = auditLogs.entries.first();

  if (kickLog && kickLog.target.id === member.id && kickLog.createdTimestamp > (Date.now() - 5000)) {
    Logger.logModeration(member.guild, 'kick', {
      user: member.user,
      moderator: kickLog.executor,
      reason: kickLog.reason
    });
  }
});

client.on('guildMemberUpdate', async (oldMember, newMember) => {
  const timeoutChanged = oldMember.communicationDisabledUntil !== newMember.communicationDisabledUntil;

  if (timeoutChanged && newMember.communicationDisabledUntil) {
    const auditLogs = await newMember.guild.fetchAuditLogs({ type: 'MEMBER_UPDATE', limit: 1 });
    const muteLog = auditLogs.entries.first();

    if (muteLog) {
      Logger.logModeration(newMember.guild, 'mute', {
        user: newMember.user,
        moderator: muteLog.executor,
        reason: muteLog.reason,
        duration: newMember.communicationDisabledUntil
          ? 'Until ' + newMember.communicationDisabledUntil.toLocaleString()
          : 'Indefinite'
      });
    }
  }
});

// Message automod
client.on('messageCreate', async message => {
  if (message.author.bot) return;

  // Check for NSFW content
  const hasNSFWContent = (message.content.toLowerCase().match(/\b(nsfw|porn|hentai|xxx|sexnude|naked)\b/) !== null) ||
    message.attachments.some(attachment => attachment.nsfw) ||
    (message.embeds.length > 0 && message.embeds.some(embed => 
      embed.nsfw || 
      (embed.title && embed.title.toLowerCase().match(/\b(nsfw|porn|hentai|xxx|sex|nude|naked)\b/)) ||
      (embed.description && embed.description.toLowerCase().match(/\b(nsfw|porn|hentai|xxx|sex|nude|naked)\b/))
    ));

  if (hasNSFWContent && SECURITY_CONFIG.nsfw) {
    await message.delete();
    const member = message.member;

    if (SECURITY_CONFIG.nsfw.action === 'mute' && member.moderatable) {
      await member.timeout(SECURITY_CONFIG.nsfw.muteDuration, 'NSFW content');
      message.channel.send(message.author + ' has been muted for posting NSFW content.');
    } else if (SECURITY_CONFIG.nsfw.action === 'kick' && member.kickable) {
      await member.kick('NSFW content');
      message.channel.send(message.author + ' has been kicked for posting NSFW content.');
    }

    logSecurityEvent(message.guild, 'NSFW Content', {
      user: message.author.tag,
      action: SECURITY_CONFIG.nsfw.action
    });
    return;
  }

  // Spam check
  const key = `${message.author.id}-${message.guild.id}`;
  if (!spamMap.has(key)) {
    spamMap.set(key, [{
      timestamp: Date.now(),
      content: message.content
    }]);
  } else {
    const userMessages = spamMap.get(key);
    userMessages.push({
      timestamp: Date.now(),
      content: message.content
    });

    const now = Date.now();
    while (userMessages.length && userMessages[0].timestamp < now - SPAM_TIME_WINDOW) {
      userMessages.shift();
    }

    if (userMessages.length >= SPAM_THRESHOLD) {
      await message.member.timeout(300000, 'Spam detection');
      message.channel.send(message.author + ' has been muted for spamming.');
      spamMap.delete(key);
      return;
    }
  }

  // Link and banned word check
  const bannedWords = SECURITY_CONFIG.automod.bannedWords;
  const hasLink = message.content.match(/(https?:\/\/[^\s]+)/g);
  const hasBannedWord = bannedWords.some(word => 
    message.content.toLowerCase().includes(word.toLowerCase())
  );

  if (hasBannedWord || (hasLink && !message.member.permissions.has('MANAGE_MESSAGES'))) {
    await message.delete();
    message.channel.send(message.author + ', that type of content is not allowed!');
    return;
  }
});

// Set up interval to send boost message every 10 seconds
client.once('ready', () => {
  const boostChannel = client.channels.cache.get('1366338507555078154');
  if (boostChannel) {
    setInterval(async () => {
      const boostEmbed = {
        title: '🌟 SERVER BOOST STATUS',
        description: '**We are just 3 boosts away from Level 2!**\n\n' +
          '💎 **Benefits of Level 2:**\n' +
          '• 50 Extra Emoji Slots\n' +
          '• 256Kbps Audio Quality\n' +
          '• Custom Server Invite Background\n' +
          '• And More!\n\n' +
          '🚀 **Boost Now to Help Us Reach Level 2!**\n' +
          'Every boost brings us closer to unlocking amazing perks for everyone!',
        color: 0xFF73FA,
        thumbnail: {
          url: 'https://cdn.discordapp.com/avatars/1364443184100282369/1981a71da1c567b98d7d921356329161.webp?size=1024'
        },
        footer: {
          text: 'Anarchy Reborn RP • Together We Grow!'
        },
        timestamp: new Date()
      };

      await boostChannel.send({ embeds: [boostEmbed] });
    }, 10000); // 10000 milliseconds = 10 seconds
  }
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

// Handle the /updates command
if (interaction.commandName === 'updates') {
  const updatesChannel = client.channels.cache.get('1368569810220220518');
  if (!updatesChannel) {
    return interaction.reply({ content: 'Updates channel not found!', ephemeral: true });
  }

  const updatesEmbed = new EmbedBuilder()
    .setTitle('📢 Bot Features & Updates')
    .setColor(0xFFA500)
    .setDescription([
      'Here are all the awesome features of our bot:',
      '',
      '🛡️ **Security Features:**',
      '• Anti-Spam Protection',
      '• Anti-Raid System',
      '• IP Security',
      '',
      '🎮 **Economy System:**',
      '• Daily Rewards',
      '• Balance Checking',
      '',
      '👮 **Moderation Tools:**',
      '• Ban/Kick Commands',
      '• Mute/Unmute System',
      '',
      '🎫 **Ticket System:**',
      '• Create Tickets',
      '• Close Tickets',
      '',
      '🔄 **24/7 Uptime Monitoring**',
      '• Constant Server Availability',
      '',
      '🆕 **Dynamic Playing Messages**',
      '• The bot now updates its playing status every few minutes!',
    ].join('\n'))
    .setFooter({ text: 'NEWLIFE ROLEPLAY REVAMPED' })
    .setTimestamp();

  await updatesChannel.send({ embeds: [updatesEmbed] });
  await interaction.reply({ content: 'Updates have been sent!', ephemeral: true });
}

  if (interaction.commandName === 'serverup') {
    if (!interaction.memberPermissions.has('ADMINISTRATOR')) {
      return interaction.reply({ content: 'You need Administrator permission!', ephemeral: true });
    }
    if (!interaction.memberPermissions.has('ADMINISTRATOR')) {
      return interaction.reply({ content: 'You need Administrator permission!', ephemeral: true });
    }

    const serverUpEmbed = {
      title: '🟢 SERVER STATUS',
      description: '**NEWLIFE ROLEPLAY REVAMPED**\n\n**Status:** ONLINE\n\nConnect now at:\n`newlife-rp.ph-host.xyz:7777`',
      color: 0x00FF00,
      thumbnail: {
        url: 'https://cdn.discordapp.com/avatars/1364443184100282369/1981a71da1c567b98d7d921356329161.webp?size=1024'
      },
      footer: {
        text: 'Join us now for an epic roleplay experience!'
      },
      timestamp: new Date()
    };

    await interaction.reply({ embeds: [serverUpEmbed] });
  }

  if (interaction.commandName === 'serverdown') {
    if (!interaction.memberPermissions.has('ADMINISTRATOR')) {
      return interaction.reply({ content: 'You need Administrator permission!', ephemeral: true });
    }

    const serverDownEmbed = {
      title: '🔴 SERVER STATUS',
      description: '**NEWLIFE ROLEPLAY REVAMPED**\n\n**Status:** OFFLINE\n\nServer is currently undergoing maintenance.\nPlease stay tuned for updates.',
      color: 0xFF0000,
      thumbnail: {
        url: 'https://cdn.discordapp.com/avatars/1364443184100282369/1981a71da1c567b98d7d921356329161.webp?size=1024'
      },
      footer: {
        text: 'We apologize for the inconvenience.'
      },
      timestamp: new Date()
    };

    await interaction.reply({ embeds: [serverDownEmbed] });
  }

  if (interaction.commandName === 'bloodmode') {
    if (!interaction.memberPermissions.has('ADMINISTRATOR')) {
      return interaction.reply({ content: 'You need Administrator permission!', ephemeral: true });
    }
    const status = interaction.options.getString('status');
    const isEnabled = toggleBloodMode(status);
    await interaction.reply(`BloodMode is now **${isEnabled ? 'ENABLED' : 'DISABLED'}**!`);
    Logger.logEvent(interaction.guild, 'bloodmode', { status: isEnabled ? 'enabled' : 'disabled' });
    return;
  }

  if (interaction.commandName === 'checkwarnings') {
    const target = interaction.options.getUser('target');
    const warnings = getWarnings(target.id);
    await interaction.reply({ content: `${target.tag} has **${warnings}** warning(s).`, ephemeral: true });
  }

  if (interaction.commandName === 'ping') {
    await interaction.reply('Pong!');
  }

  if (interaction.commandName === 'say') {
    const msg = interaction.options.getString('message');
    await interaction.reply(msg);
  }

  if (interaction.commandName === 'math') {
    const a = interaction.options.getNumber('a');
    const b = interaction.options.getNumber('b');
    const op = interaction.options.getString('operation');
    let result;

    switch (op) {
      case '+': result = a + b; break;
      case '-': result = a - b; break;
      case '*': result = a * b; break;
      case '/': result = b !== 0 ? a / b : 'Cannot divide by 0'; break;
      default: result = 'Invalid operation'; break;
    }

    await interaction.reply(`Result: ${result}`);
  }

  if (interaction.commandName === 'userinfo') {
    await interaction.reply(`Username: ${interaction.user.tag}\nID: ${interaction.user.id}`);
  }

  if (interaction.commandName === 'serverinfo') {
    await interaction.reply(`Server name: ${interaction.guild.name}\nTotal members: ${interaction.guild.memberCount}`);
  }

  if (interaction.commandName === 'avatar') {
    const user = interaction.options.getUser('user') || interaction.user;
    await interaction.reply(user.displayAvatarURL({ dynamic: true, size: 1024 }));
  }

  if (interaction.commandName === 'ban') {
    // Ensure we have member permissions before checking
    if (!interaction.memberPermissions.has('BAN_MEMBERS')) {
      return interaction.reply('You do not have permission to ban members.');
    }

    const user = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') || 'No reason provided';

    try {
      const member = await interaction.guild.members.fetch(user.id);
      await member.ban({ reason });
      await interaction.reply(`${user.tag} has been banned. Reason: ${reason}`);
    } catch (error) {
      await interaction.reply('Failed to ban the user.');
    }
  }

  // Ticket system handlers
  if (interaction.commandName === 'setup') {
    try {
      await handleTicketSetup(interaction);
    } catch (error) {
      console.error('Error handling ticket setup:', error);
      await interaction.reply({ content: 'An error occurred while setting up the ticket system.', ephemeral: true });
    }
    return;
  }

  // Handle button interactions
  if (interaction.isButton()) {
    try {
      if (interaction.customId === 'create_ticket') {
        await handleTicketCreate(interaction);
      } else if (interaction.customId === 'close_ticket') {
        await handleTicketClose(interaction);
      } else if (interaction.customId === 'confirm_close') {
        await handleConfirmClose(interaction);
      } else if (interaction.customId === 'cancel_close') {
        await interaction.update({
          content: 'Ticket close cancelled.',
          components: [],
          embeds: []
        }).catch(error => {
          console.error('Error updating ticket close cancel:', error);
        });
      }
    } catch (error) {
      console.error('Error handling button interaction:', error);
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ 
            content: 'An error occurred while processing your request.', 
            ephemeral: true 
          }).catch(e => console.error('Error sending error message:', e));
        } else if (interaction.deferred) {
          await interaction.editReply({ 
            content: 'An error occurred while processing your request.' 
          }).catch(e => console.error('Error editing error message:', e));
        }
      } catch (followUpError) {
        console.error('Error handling button interaction followup:', followUpError);
      }
    }
    return;
  }

  // Handle select menu interactions
  if (interaction.isStringSelectMenu()) {
    try {
      if (interaction.customId === 'ticket_category') {
        // Acknowledge the interaction immediately to prevent timeout
        if (!interaction.deferred && !interaction.replied) {
          await interaction.deferReply({ ephemeral: true }).catch(error => {
            console.error('Error deferring reply:', error);
          });
        }

        // Process ticket creation
        await handleTicketCategory(interaction);
      }
    } catch (error) {
      console.error('Error handling select menu interaction:', error);
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: 'An error occurred while processing your request.', ephemeral: true });
        } else {
          await interaction.followUp({ content: 'An error occurred while processing your request.', ephemeral: true }).catch(console.error);
        }
      } catch (followUpError) {
        console.error('Error handling select menu followup:', followUpError);
      }
    }
    return;
  }

  if (interaction.commandName === 'kick') {
    // Ensure we have member permissions before checking
    if (!interaction.memberPermissions.has('KICK_MEMBERS')) {
      return interaction.reply('You do not have permission to kick members.');
    }

    const user = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') || 'No reason provided';

    try {
      const member = await interaction.guild.members.fetch(user.id);
      await member.kick(reason);
      await interaction.reply(`${user.tag} has been kicked. Reason: ${reason}`);
    } catch (error) {
      await interaction.reply('Failed to kick the user.');
    }
  }

  if (interaction.commandName === 'rule') {
    const rules = `
**📜 Server Rules and Guidelines 📜**

We abide by Discord's [terms of service](https://dis.gd/terms) and [guidelines](https://dis.gd/guidelines). Breaking Discord ToS will result in a permanent ban.

**Be Respectful:**  
> Treat all members with kindness and respect. Harassment, hate speech, and personal attacks will not be tolerated.

**Keep it Safe:** 
> Do not share personal information or any content that could compromise someone's safety or privacy.

**Stay on Topic:**
> Keep discussions relevant to the server's focus or channels. Off-topic conversations should be taken to appropriate channels.

**No Spamming:** 
> Avoid excessive self-promotion, advertisements, or repetitive messages. Quality over quantity.

**Use Appropriate Language:** 
> Keep the language clean and appropriate. Profanity, explicit content, and overly offensive language are not allowed.

**No NSFW Content:**
> Keep all content safe for work. NSFW discussions, images, and links are strictly prohibited.

**Respect Staff:** 
> Follow the instructions of the server staff. Disrespecting or arguing with them will result in consequences.

**Additional Guidelines:**
• No trolling or intentionally provoking others
• No discrimination of any kind
• No unauthorized or malicious links
• No impersonation of others
• Keep discussions civil
• Report issues to staff
• Use proper spoiler warnings

Breaking these rules may result in warnings, mutes, kicks, or bans depending on severity.`;
    await interaction.reply(rules);
  }

  if (interaction.commandName === 'mute') {
    // Ensure we have member permissions before checking
    if (!interaction.memberPermissions.has('MODERATE_MEMBERS')) {
      return interaction.reply('You do not have permission to mute members.');
    }

    const user = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') || 'No reason provided';

    try {
      const member = await interaction.guild.members.fetch(user.id);
      await member.timeout(300000, reason); // 5 minutes timeout
      await interaction.reply(`${user.tag} has been muted for 5 minutes. Reason: ${reason}`);
    } catch (error) {
      await interaction.reply('Failed to mute the user.');
    }
  }

  if (interaction.commandName === 'unmute') {
    // Ensure we have member permissions before checking
    if (!interaction.memberPermissions.has('MODERATE_MEMBERS')) {
      return interaction.reply('You do not have permission to unmute members.');
    }

    const user = interaction.options.getUser('user');

    try {
      const member = await interaction.guild.members.fetch(user.id);
      await member.timeout(null);
      await interaction.reply(`${user.tag} has been unmuted.`);
    } catch (error) {
      await interaction.reply('Failed to unmute the user.');
    }
  }

  if (interaction.commandName === 'securitystatus') {
    // Ensure we have member permissions before checking
    if (!interaction.memberPermissions.has('ADMINISTRATOR')) {
      return interaction.reply({ content: 'You need administrator permissions to use this command.', ephemeral: true });
    }

    const status = {
      activeSpamTracking: spamMap.size,
      suspiciousAccounts: suspiciousAccounts.size,
      recentJoins: joinedMembers.size,
      currentMode: joinedMembers.size >= SECURITY_CONFIG.raid.threshold ? 'RAID_PROTECTION' : 'NORMAL'
    };

    await interaction.reply({
      embeds: [{
        title: '🛡️ Security System Status',
        fields: [
          { name: 'Mode', value: status.currentMode, inline: true },
          { name: 'Spam Tracking', value: `${status.activeSpamTracking} users`, inline: true },
          { name: 'Suspicious Accounts', value: `${status.suspiciousAccounts}`, inline: true },
          { name: 'Recent Joins', value: `${status.recentJoins}`, inline: true }
        ],
        color: 0x00FF00
      }]
    });
  }

  if (interaction.commandName === 'securityconfig') {
    // Ensure we have member permissions before checking
    if (!interaction.memberPermissions.has('ADMINISTRATOR')) {
      return interaction.reply({ content: 'You need administrator permissions to use this command.', ephemeral: true });
    }

    const setting = interaction.options.getString('setting');
    const value = interaction.options.getNumber('value');

    if (setting && value) {
      const [category, key] = setting.split('.');
      if (SECURITY_CONFIG[category] && SECURITY_CONFIG[category][key] !== undefined) {
        SECURITY_CONFIG[category][key] = value;
        // Save to persistent storage
        try {
          const fs = require('fs');
          fs.writeFileSync('security-config.json', JSON.stringify(SECURITY_CONFIG, null, 2));
          await interaction.reply(`Updated ${setting} to ${value}`);
        } catch (error) {
          console.error('Failed to save security config:', error);
          await interaction.reply({ 
            embeds: [{
              title: 'Error',
              description: 'Failed to save security configuration',
              color: 0xFF0000
            }]
          });
        }
      } else {
        await interaction.reply({
          embeds: [{
            title: 'Security Configuration',
            description: '```json\n' + JSON.stringify(SECURITY_CONFIG, null, 2) + '\n```',
            color: 0x00FF00
          }]
        });
      }
    }
    }

    if (interaction.commandName === 'serverrule') {
      const rulesChannel = client.channels.cache.get('1260925060248768614');
      if (!rulesChannel) {
        return interaction.reply({ content: 'Rules channel not found!', ephemeral: true });
      }

      const serverRulesEmbeds = [
        {
          title: '📜 SERVER RULES - PART 1',
          color: 0xFF6B6B,
          description: '═══════════════════════════════════\n\n' +
            '**COMBAT LOGGING**\n```\nWhen you got shot, you are not allowed to /q or disconnect for 10 minutes in a middle of RP situation(pvp).\n```\n\n' +
            '**SAFEZONE VIOLATION**\n```\nRobbery, Kidnapping, holding someone hostage or killing in safezone is strictly prohibited.\n```\n\n' +
            '**NON RP KILL OF VEHICLE DRIVER WHILE MOVING**\n```\nKilling the vehicle while moving is not allowed.\nException: When the vehicle is in a car chase with police.\n```\n\n' +
            '**META GAMING**\n```\nUsing Out-of-Character information in an In-Character context is prohibited.\n```\n\n' +
            '**POWER GAMING**\n```\nAbusing unrealistic RP abilities or forcing others into RP situations unfairly is prohibited.\n```\n\n' +
            '**BLACK MAILING INJURED PLAYER**\n```\nForcing the medic to not heal the injured player is considered as force rp and finishing the player will be considered a non rp finish.\n```\n\n' +
            '**TRASHTALKING THE INJURED PLAYER**\n```\nNo toxic policy\nTrashtalking the injured player or using animation on the injured player is strictly not allowed.\n```\n\n' +
            '**ABUSE NEWB SYSTEM**\n```\nAbusing the newbie system is not allowed. Players are only allowed to roleplay or join gun fights when you are level 2.\n```\n\n' +
            '**NON RP KILLING MEDIC**\n```\nYou are not allowed to kill a medic while they are saving the injured player.\n```\n\n' +
            '**TRASHTALKING IN GLOBAL**\n```\nNo toxic policy\nTrashtalking or ooc insult in global or vip chat is not allowed and will be marked as toxicity\n```\n\n' +
            '**BAN EVADING**\n```\nUsing any account to access our server whilst any of your other accounts have an active ban is not allowed without admin permission.\n```\n\n' +
            '**HACKING**\n```\nUsing any kind 3rd party software to gain an advantage over other players is prohibited.\n```\n\n' +
            '**MONEY FARMING**\n```\nCreating new accounts and transferring money between accounts is not allowed.\n```\n\n' +
            '**REAL WORLD TRADING**\n```\nSelling in-game items/currency for real money is prohibited. Account sales require owner permission.\n```\n\n' +
            '**SERVER ADVERTISING**\n```\nAdvertising other SAMP servers will result in account ban.\n```\n\n' +
            '═══════════════════════════════════',
          footer: { text: 'NEWLIFE ROLEPLAY REVAMPED • Server Rules Part 1' }
        },
        {
          title: '📜 SERVER RULES - PART 2',
          color: 0xFF6B6B,
          description: '═══════════════════════════════════\n\n' +
            '**MULTIPLE ACCOUNTS**\n```\nUsing alternative accounts to avoid punishments is not allowed.\n```\n\n' +
            '**RUSH TAZING**\n```\nTazing a player while they are aiming/shooting at you is not allowed.\nOther LEOs may taze suspects from behind.\n```\n\n' +
            '**AVOIDING ADMIN CONFRONTATION**\n```\nLogging off to avoid punishment is not permitted.\n```\n\n' +
            '**AVOIDING ROLEPLAY**\n```\nYou must comply with roleplay situations. Do not avoid or act unrealistically.\n```\n\n' +
            '**VEHICLE DEATHMATCH**\n```\nIntentionally using vehicles as weapons is not permitted.\n```\n\n' +
            '**DEATHMATCHING**\n```\nAttacking/killing players without IC reason is not permitted.\n```\n\n' +
            '═══════════════════════════════════',
          footer: { text: 'NEWLIFE ROLEPLAY REVAMPED • Server Rules Part 2' }
        },
        {
          title: '📜 SERVER RULES - PART 3',
          color: 0xFF6B6B,
          description: '═══════════════════════════════════\n\n' +
            '**EXPLOITING**\n```\nAbusing game/script bugs for your advantage is not allowed.\n```\n\n' +
            '**LOGGING TO AVOID**\n```\nExiting game to avoid death, arrest, or RP situations is prohibited.\n```\n\n' +
            '**NON RP GUN PULL OUT**\n```\nPulling heavy weapons in public places or abusing RP gun commands is not allowed.\n```\n\n' +
            '**ABUSE GREENZONE**\n```\nGreenzone rules apply even without system indicators.\n```\n\n' +
            '**OOC INSULT**\n```\nZero tolerance for toxic behavior and out-of-character insults.\n```\n\n' +
            '═══════════════════════════════════',
          footer: { text: 'NEWLIFE ROLEPLAY REVAMPED • Server Rules Part 3' }
        },
        {
          title: '📜 SERVER RULES - PART 4',
          color: 0xFF6B6B,
          description: '═══════════════════════════════════\n\n' +
            '**NON RP MASK/ABUSE**\n```\nMask usage only allowed during illegal RP/robberies.\n```\n\n' +
            '**HOLDUP IN GREENZONE**\n```\nRobbing players in greenzone is prohibited.\n```\n\n' +
            '**ILLEGAL MODIFICATIONS**\n```\nModifications giving advantages are not allowed, including bullet tracers.\n```\n\n' +
            '**LYING TO ADMINISTRATORS**\n```\nHonest responses required for admin inquiries.\n```\n\n' +
            '**TROLLING**\n```\nExcessive deliberate disruption is not allowed.\n```\n\n' +
            '**REVENGE KILLING**\n```\nReturning to previous death situations is prohibited.\n```\n\n' +
            '**RANDOM SHOOTING**\n```\nRandom shooting and heavy weapon use in public places is not allowed.\n```\n\n' +
            '**RAIDING FACTION/FAMILY HQs**\n```\nRaiding official locations requires admin permission and supervision.\n```\n\n' +
            '═══════════════════════════════════',
          footer: { text: 'NEWLIFE ROLEPLAY REVAMPED • Server Rules Part 4' }
        }
      ];

      for (const embed of serverRulesEmbeds) {
        await rulesChannel.send({ embeds: [embed] });
      }

      await interaction.reply({ content: `Server rules have been posted in <#${rulesChannel.id}>`, ephemeral: true });
      return;
    }

    if (interaction.commandName === 'discordrule') {
      const rulesChannel = client.channels.cache.get('1260925060248768614');
      if (!rulesChannel) {
        return interaction.reply({ content: 'Rules channel not found!', ephemeral: true });
      }

      const generalRulesEmbed = {
        title: '📜 GENERAL SERVER RULES',
        color: 0x7289DA,
        description: '═══════════════════════════════════\n\n' +
          '**1️⃣ Be Respectful**\n```\nTreat all members with respect and kindness. Avoid any form of harassment, discrimination, or hate speech. Encourage a positive and inclusive environment for everyone.\n```\n\n' +
          '**2️⃣ No Spamming or Flooding**\n```\nAvoid excessive or repetitive messaging, sending large amounts of unsolicited content, or flooding the chat with unnecessary messages. Keep discussions relevant and focused.\n```\n\n' +
          '**3️⃣ Use Appropriate Language**\n```\nKeep the language used in the Discord server appropriate and avoid excessive swearing or offensive language. Be mindful of the diverse audience and maintain a respectful tone.\n```\n\n' +
          '**4️⃣ No Advertising or Self-Promotion**\n```\nAvoid promoting personal or external content without permission. Respect the server\'s guidelines regarding advertising and self-promotion.\n```\n\n' +
          '**5️⃣ Respect Privacy**\n```\nDo not share personal information about yourself or others without their consent. Respect the privacy and boundaries of fellow members.\n```\n\n' +
          '**6️⃣ Follow Channel Guidelines**\n```\nAdhere to the guidelines set for each channel within the Discord server. Stay on topic and use the appropriate channels for specific discussions or content.\n```\n\n' +
          '**7️⃣ No NSFW Content**\n```\nAvoid sharing or discussing explicit or Not Safe for Work (NSFW) content. Keep the server safe and appropriate for all ages.\n```\n\n' +
          '**8️⃣ No Trolling or Flame Wars**\n```\nDo not engage in trolling, flame wars, or intentionally provoking arguments. Keep discussions civil and constructive.\n```\n\n' +
          '**9️⃣ Report Issues**\n```\nIf you encounter any issues or witness a violation of the rules, report it to the server moderators or administrators. Provide necessary details and evidence to assist in resolving the situation.\n```\n\n' +
          '═══════════════════════════════════',
        footer: {
          text: 'NEWLIFE ROLEPLAY REVAMPED • General Guidelines'
        },
        timestamp: new Date()
      };

      const specificRulesEmbed = {
        title: '🛡️ SPECIFIC SERVER RULES',
        color: 0xFF6B6B,
        description: '═══════════════════════════════════\n\n' +
          '__**RESPECT**__\n```\nALWAYS Be respectful of others in the community. Any forms of toxicity, racism, misogyny etc. will not be tolerated and may result in a ban.\n```\n\n' +
          '__**INDECENT PROFILE**__\n```\nIt is strictly prohibited to upload any profile and/or server profile photo in our server that is malicious and/or offensive.\n```\n\n' +
          '__**HACKS**__\n```\nAny user that will be caught using any tools for hacks, bugs, spamming, and glitches will be banned IMMEDIATELY.\n```\n\n' +
          '__**NSFW CONTENT**__\n```\nNo sharing any pornographic content, especially in #city-gallery and #video-clips.\n```\n\n' +
          '__**IMPERSONATION**__\n```\nAnyone is not allowed to impersonate any staff members. Any forms of this act will result into permanent ban in discord and in-game.\n```\n\n' +
          '__**SERVER ADS**__\n```\nAny forms of advertisement to any different discord servers that are not authorized by the Administration is strictly prohibited.\n```\n\n' +
          '__**MENTION SPAM**__\n```\nWe will be allowing mentions from the Citizens but ONLY if NECESSARY.\n```\n\n' +
          '__**DISCORD POLICY**__\n```\nBreaking our or Discord\'s ToS or Community Guidelines will result in an immediate irrevocable ban.\n```'
      };

      await rulesChannel.send({ embeds: [generalRulesEmbed, specificRulesEmbed] });
      await interaction.reply({ content: `Discord rules have been posted in <#${rulesChannel.id}>`, ephemeral: true });
    }
});
