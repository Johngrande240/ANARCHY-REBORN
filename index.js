require('dotenv').config();
const express = require('express');
const { Client, GatewayIntentBits, SlashCommandBuilder, Routes, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { REST } = require('@discordjs/rest');
const samp = require('samp-query');

const options = {
    host: 'anarchyrp.ph-host.xyz', // Replace with your SAMP server IP
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

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error('Missing DISCORD_TOKEN environment variable');
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
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildMessageTyping,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.DirectMessageReactions,
    GatewayIntentBits.DirectMessageTyping,
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildBans,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildIntegrations,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildEmojisAndStickers,
    GatewayIntentBits.GuildWebhooks,
    GatewayIntentBits.GuildInvites,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.DirectMessageReactions,
    GatewayIntentBits.DirectMessageTyping,
    GatewayIntentBits.GuildScheduledEvents,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageTyping,
    GatewayIntentBits.MessageContent
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

// Enhanced anti-spam system
const spamMap = new Map();
const userWarnings = new Map();

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

const { handleAIChat, toggleBloodMode } = require('./aiHandler.js');

const commands = [
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
    .setName('ticket')
    .setDescription('Creates a new ticket')
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Reason for the ticket')
        .setRequired(true)),
  new SlashCommandBuilder()
    .setName('closeticket')
    .setDescription('Closes the current ticket'),
  new SlashCommandBuilder()
    .setName('listtickets')
    .setDescription('Lists all open tickets'),
  new SlashCommandBuilder()
    .setName('serverstatus')
    .setDescription('Gets the SA:MP server status')
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

const guildId = '1339191338280685568';

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
const messages = [
  "Join Anarchy Reborn RP for an epic experience!",
  "Stay active for rewards on Anarchy Reborn!",
  "Roleplay with Anarchy Reborn, where the fun never ends!",
  "Anarchy Reborn: Building a community of great roleplayers!",
  "Currently 50 players online – come join the action!"
];

let messageIndex = 0;

// Function to update the playing message
function updatePlayingMessage() {
  client.user.setActivity(messages[messageIndex], { type: 0 });
  messageIndex = (messageIndex + 1) % messages.length;
}

const { sendFeatureUpdate } = require('./featureUpdate');

client.once('ready', () => {
  console.log(`Bot is online as ${client.user.tag}`);
  setupStealthCommands(client);
  updatePlayingMessage(); // Set initial message
  setInterval(updatePlayingMessage, 600000); // Update every 10 minutes
  sendFeatureUpdate(client); // Send feature update
  Logger.logToChannel(client, `✅ Bot has started as **${client.user.tag}**`);
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

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'serverup') {
    if (!interaction.memberPermissions.has('ADMINISTRATOR')) {
      return interaction.reply({ content: 'You need Administrator permission!', ephemeral: true });
    }

    const serverUpEmbed = {
      title: '🟢 SERVER STATUS',
      description: '**ANARCHY ROLEPLAY REBORN**\n\n**Status:** ONLINE\n\nConnect now at:\n`anarchyrp.ph-host.xyz:7777`',
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
      description: '**ANARCHY ROLEPLAY REBORN**\n\n**Status:** OFFLINE\n\nServer is currently undergoing maintenance.\nPlease stay tuned for updates.',
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

  if (interaction.commandName === 'ticket') {
    const reason = interaction.options.getString('reason');

    // Create a new channel for the ticket
    const ticketChannel = await interaction.guild.channels.create({
      name: `ticket-${interaction.user.username}`,
      type: 0, // Text channel
      permissionOverwrites: [
        {
          id: interaction.guild.id, // @everyone role
          deny: ['ViewChannel'],
        },
        {
          id: interaction.user.id,
          allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'],
        },
        {
          id: interaction.guild.roles.cache.find(role => role.name === 'Staff')?.id || interaction.guild.id,
          allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'],
        }
      ]
    });

    // Send initial message in ticket channel
    await ticketChannel.send({
      embeds: [{
        title: '🎫 New Ticket',
        description: `Ticket created by ${interaction.user}\nReason: ${reason}`,
        color: 0x00ff00
      }]
    });

    await interaction.reply({
      content: `Ticket created! Check ${ticketChannel}`,
      ephemeral: true
    });
  }

  if (interaction.commandName === 'closeticket') {
    if (!interaction.channel.name.startsWith('ticket-')) {
      return interaction.reply({
        content: 'This command can only be used in ticket channels!',
        ephemeral: true
      });
    }

    await interaction.reply('Closing ticket in 5 seconds...');
    setTimeout(async () => {
      await interaction.channel.delete();
    }, 5000);
  }

  if (interaction.commandName === 'listtickets') {
    const tickets = interaction.guild.channels.cache
      .filter(channel => channel.name.startsWith('ticket-'));

    if (tickets.size === 0) {
      return interaction.reply({
        content: 'There are no open tickets!',
        ephemeral: true
      });
    }

    const ticketList = tickets.map(channel => 
      `${channel.name} (Created by: ${channel.name.split('-')[1]})`
    ).join('\n');

    await interaction.reply({
      embeds: [{
        title: '🎫 Open Tickets',
        description: ticketList,
        color: 0x00ff00
      }],
      ephemeral: true
    });
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
          await interaction.reply('Updated setting in memory, but failed to persist changes.');
        }
      } else {
        await interaction.reply('Invalid setting specified');
      }
    } else {
      await interaction.reply({
        embeds: [{
          title: '⚙️ Security Configuration',
          fields: [
            { name: 'Spam Settings', value: `Threshold: ${SECURITY_CONFIG.spam.threshold}\nTime Window: ${SECURITY_CONFIG.spam.timeWindow}ms`, inline: true },
            { name: 'Raid Settings', value: `Threshold: ${SECURITY_CONFIG.raid.threshold}\nAccount Age Check: ${SECURITY_CONFIG.raid.accountAgeThreshold}ms`, inline: true }
          ],
          color: 0x0099FF
        }]
      });
    }
  }

  if (interaction.commandName === 'play' || 
      interaction.commandName === 'skip' || 
      interaction.commandName === 'stop' || 
      interaction.commandName === 'queue') {
    await interaction.reply({ 
      content: '❌ Music commands are currently disabled.',
      ephemeral: true 
    });
  }

  if (interaction.commandName === 'filter') {
    const queue = player.nodes.get(interaction.guildId);
    if (!queue || !queue.isPlaying()) {
      return interaction.reply({ content: '❌ No music is being played!', ephemeral: true });
    }

    const filter = interaction.options.getString('name');
    if (!audioFilters[filter]) {
      return interaction.reply({ content: '❌ Invalid filter!', ephemeral: true });
    }

    try {
      await queue.filters.ffmpeg.toggle([filter]);
      interaction.reply({
        embeds: [{
          title: '🎛️ Filter Applied',
          description: `Applied filter: **${filter}**`,
          color: 0x00FF00
        }]
      });
    } catch (error) {
      interaction.reply({ content: '❌ Error applying filter!', ephemeral: true });
    }
  }

  if (interaction.commandName === 'admin') {
    // Strict security check - only allow specific user ID
    if (interaction.user.id !== '1191627654386950214') {
      Logger.logSecurity(interaction.guild, 'unauthorized_admin_access', {
        user: interaction.user.tag,
        command: interaction.commandName
      });
      return interaction.reply({ 
        content: 'Access denied. This incident has been logged.', 
        ephemeral: true 
      });
    }

    // Rate limiting for admin commands
    const now = Date.now();
    const key = `admin-${interaction.user.id}`;
    const cooldown = commandCooldowns.get(key);

    if (cooldown && (now - cooldown) < 30000) { // 30 second cooldown
      return interaction.reply({ 
        content: 'Please wait before using admin commands again.', 
        ephemeral: true 
      });
    }
    commandCooldowns.set(key, now);

    const subcommand = interaction.options.getSubcommand();
    const group = interaction.options.getSubcommandGroup();

    if (group === 'security' && subcommand === 'toggle') {
      const feature = interaction.options.getString('feature');
      const enabled = interaction.options.getBoolean('enabled');

      // Update security configuration
      switch (feature) {
        case 'spam':
          SECURITY_CONFIG.spam.enabled = enabled;
          break;
        case 'raid':
          SECURITY_CONFIG.raid.enabled = enabled;
          break;
        case 'verification':
          SECURITY_CONFIG.verification.enabled = enabled;
          break;
        case 'automod':
          SECURITY_CONFIG.automod.enabled = enabled;
          break;
        case 'nsfw':
          SECURITY_CONFIG.nsfw.enabled = enabled;
          break;
      }

      // Save configuration
      try {
        fs.writeFileSync('security-config.json', JSON.stringify(SECURITY_CONFIG, null, 2));
        await interaction.reply({
          embeds: [{
            title: '✅ Security Feature Updated',
            description: `${feature} has been ${enabled ? 'enabled' : 'disabled'}`,
            color: enabled ? 0x00FF00 : 0xFF0000,
            fields: [
              { name: 'Feature', value: feature, inline: true },
              { name: 'Status', value: enabled ? 'Enabled' : 'Disabled', inline: true }
            ]
          }]
        });
      } catch (error) {
        console.error('Failed to save security config:', error);
        await interaction.reply({ 
          content: 'Failed to update security configuration!', 
          ephemeral: true 
        });
      }
      return;
    }

    if (group === 'nsfw') {
      const action = interaction.options.getString('action');
      const muteDuration = interaction.options.getInteger('muteduration') || 60;

      SECURITY_CONFIG.nsfw = {
        action: action,
        muteDuration: muteDuration * 60000
      };

      await interaction.reply({
        embeds: [{
          title: '✅ NSFW Content Settings Updated',
          fields: [
            { name: 'Action', value: action.toUpperCase(), inline: true },
            { name: 'Mute Duration', value: `${muteDuration} minutes`, inline: true }
          ],
          color: 0x00FF00
        }]
      });
    } else if (group === 'nuke') {
      const banthreshold = interaction.options.getInteger('banthreshold');
      const channelthreshold = interaction.options.getInteger('channelthreshold');
      const rolethreshold = interaction.options.getInteger('rolethreshold');
      const timewindow = interaction.options.getInteger('timewindow');

      if (banthreshold) NUKE_THRESHOLD.bans = banthreshold;
      if (channelthreshold) NUKE_THRESHOLD.channelDeletions = channelthreshold;
      if (rolethreshold) NUKE_THRESHOLD.roleDeletions = rolethreshold;
      if (timewindow) NUKE_THRESHOLD.timeWindow = timewindow * 1000;

      await interaction.reply({
        embeds: [{
          title: '✅ Anti-Nuke Settings Updated',
          fields: [
            { name: 'Ban Threshold', value: String(NUKE_THRESHOLD.bans), inline: true },
            { name: 'Channel Deletion Threshold', value: String(NUKE_THRESHOLD.channelDeletions), inline: true },
            { name: 'Role Deletion Threshold', value: String(NUKE_THRESHOLD.roleDeletions), inline: true },
            { name: 'Time Window', value: `${NUKE_THRESHOLD.timeWindow/1000}s`, inline: true }
          ],
          color: 0x00FF00
        }]
      });
    } else if (group === 'security') {
      try {
        switch (subcommand) {
          case 'toggle': {
            const feature = interaction.options.getString('feature');
            const enabled = interaction.options.getBoolean('enabled');
            SECURITY_CONFIG[feature].enabled = enabled;
            await interaction.reply({
              embeds: [{
                title: '✅ Security Feature Updated',
                description: `${feature} has been ${enabled ? 'enabled' : 'disabled'}`,
                color: enabled ? 0x00FF00 : 0xFF0000
              }]
            });
            break;
          }

          case 'spam': {
            const threshold = interaction.options.getInteger('threshold');
            const timeWindow = interaction.options.getInteger('timewindow');
            const muteDuration = interaction.options.getInteger('muteduration');

            if (threshold) SECURITY_CONFIG.spam.threshold = threshold;
            if (timeWindow) SECURITY_CONFIG.spam.timeWindow = timeWindow * 1000;
            if (muteDuration) SECURITY_CONFIG.spam.muteDuration = muteDuration * 60000;

            await interaction.reply({
              embeds: [{
                title: '✅ Anti-Spam Settings Updated',
                fields: [
                  { name: 'Threshold', value: String(SECURITY_CONFIG.spam.threshold), inline: true },
                  { name: 'Time Window', value: `${SECURITY_CONFIG.spam.timeWindow/1000}s`, inline: true },
                  { name: 'Mute Duration', value: `${SECURITY_CONFIG.spam.muteDuration/60000}m`, inline: true }
                ],
                color: 0x00FF00
              }]
            });
            break;
          }

          case 'raid': {
            const threshold = interaction.options.getInteger('threshold');
            const action = interaction.options.getString('action');

            if (threshold) SECURITY_CONFIG.raid.threshold = threshold;
            if (action) SECURITY_CONFIG.raid.actionType = action;

            await interaction.reply({
              embeds: [{
                title: '✅ Anti-Raid Settings Updated',
                fields: [
                  { name: 'Threshold', value: String(SECURITY_CONFIG.raid.threshold), inline: true },
                  { name: 'Action', value: SECURITY_CONFIG.raid.actionType, inline: true }
                ],
                color: 0x00FF00
              }]
            });
            break;
          }

          case 'verification': {
            const accountAge = interaction.options.getInteger('accountage');
            const role = interaction.options.getRole('role');

            if (accountAge) SECURITY_CONFIG.verification.accountAgeDays = accountAge;
            if (role) SECURITY_CONFIG.verification.requiredRole = role.name;

            await interaction.reply({
              embeds: [{
                title: '✅ Verification Settings Updated',
                fields: [
                  { name: 'Required Account Age', value: `${SECURITY_CONFIG.verification.accountAgeDays} days`, inline: true },
                  { name: 'Verification Role', value: SECURITY_CONFIG.verification.requiredRole, inline: true }
                ],
                color: 0x00FF00
              }]
            });
            break;
          }

          case 'nsfw': {
            const action = interaction.options.getString('action');
            const muteDuration = interaction.options.getInteger('muteduration') || 60;

            SECURITY_CONFIG.nsfw = {
              action: action,
              muteDuration: muteDuration * 60000 // Convert to milliseconds
            };

            await interaction.reply({
              embeds: [{
                title: '✅ NSFW Content Settings Updated',
                fields: [
                  { name: 'Action', value: action.toUpperCase(), inline: true },
                  { name: 'Mute Duration', value: `${muteDuration} minutes`, inline: true }
                ],
                color: 0x00FF00
              }]
            });
            break;
          }

          case 'automod': {
            const maxMentions = interaction.options.getInteger('maxmentions');
            const maxEmojis = interaction.options.getInteger('maxemojis');
            const bannedWords = interaction.options.getString('bannedwords');

            if (maxMentions) SECURITY_CONFIG.spam.maxMentions = maxMentions;
            if (maxEmojis) SECURITY_CONFIG.spam.maxEmojis = maxEmojis;
            if (bannedWords) SECURITY_CONFIG.automod.bannedWords = bannedWords.split(',').map(word => word.trim());

            await interaction.reply({
              embeds: [{
                title: '✅ Auto-Moderation Settings Updated',
                fields: [
                  { name: 'Max Mentions', value: String(SECURITY_CONFIG.spam.maxMentions), inline: true },
                  { name: 'Max Emojis', value: String(SECURITY_CONFIG.spam.maxEmojis), inline: true },
                  { name: 'Banned Words', value: SECURITY_CONFIG.automod.bannedWords.join(', ') || 'None' }
                ],
                color: 0x00FF00
              }]
            });
            break;
          }
        }

        // Save configuration after any changes
        const fs = require('fs');
        fs.writeFileSync('security-config.json', JSON.stringify(SECURITY_CONFIG, null, 2));
      } catch (error) {
        console.error('Failed to update security settings:', error);
        await interaction.reply({ content: 'Failed to update security settings!', ephemeral: true });
      }
    }
    return;
  }

  if (interaction.commandName === 'suspicious') {
    // Ensure we have member permissions before checking
    if (!interaction.memberPermissions.has('MANAGE_GUILD')) {
      return interaction.reply({ content: 'You need Manage Server permissions to use this command.', ephemeral: true });
    }

    const suspiciousList = Array.from(suspiciousAccounts).map(async id => {
      try {
        const member = await interaction.guild.members.fetch(id);
        return `${member.user.tag} (Age: ${Math.floor((Date.now() - member.user.createdTimestamp) / (1000 * 60 * 60 * 24))} days)`;
      } catch {
        return `Unknown Member (${id})`;
      }
    });

    Promise.all(suspiciousList).then(async list => {
      await interaction.reply({
        embeds: [{
          title: '⚠️ Suspicious Accounts',
          description: list.length > 0 ? list.join('\n') : 'No suspicious accounts found',
          color: 0xFF9900
        }]
      });
    });
  }

  if (interaction.commandName === 'clear') {
    // Ensure we have member permissions before checking
    if (!interaction.memberPermissions.has('MANAGE_MESSAGES')) {
      return interaction.reply({ content: 'You need Manage Messages permission!', ephemeral: true });
    }

    const amount = interaction.options.getInteger('amount');
    if (amount < 1 || amount > 100) {
      return interaction.reply({ content: 'You can delete 1-100 messages.', ephemeral: true });
    }

    try {
      await interaction.channel.bulkDelete(amount);
      await interaction.reply({ content: `Deleted ${amount} messages.`, ephemeral: true });
    } catch (error) {
      await interaction.reply({ content: 'Error deleting messages!', ephemeral: true });
    }
  }

  if (interaction.commandName === 'warn') {
    // Ensure we have member permissions before checking
    if (!interaction.memberPermissions.has('MANAGE_MESSAGES')) {
      return interaction.reply({ content: 'You need Manage Messages permission!', ephemeral: true });
    }

    const user = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason');

    await interaction.reply(`⚠️ ${user} has been warned for: ${reason}`);
    logSecurityEvent(interaction.guild, 'Warning', { user: user.tag, reason });
  }

  if (interaction.commandName === 'addrole') {
    // Ensure we have member permissions before checking
    if (!interaction.memberPermissions.has('MANAGE_ROLES')) {
      return interaction.reply({ content: 'You need Manage Roles permission!', ephemeral: true });
    }

    const user = interaction.options.getUser('user');
    const role = interaction.options.getRole('role');

    try {
      const member = await interaction.guild.members.fetch(user.id);
      await member.roles.add(role);
      await interaction.reply(`✅ Added role ${role} to ${user.tag}`);
    } catch (error) {
      await interaction.reply('Failed to add role!');
    }
  }

  if (interaction.commandName === 'removerole') {
    // Ensure we have member permissions before checking
    if (!interaction.memberPermissions.has('MANAGE_ROLES')) {
      return interaction.reply({ content: 'You need Manage Roles permission!', ephemeral: true });
    }

    const user = interaction.options.getUser('user');
    const role = interaction.options.getRole('role');

    try {
      const member = await interaction.guild.members.fetch(user.id);
      await member.roles.remove(role);
      await interaction.reply(`✅ Removed role ${role} from ${user.tag}`);
    } catch (error) {
      await interaction.reply('Failed to remove role!');
    }
  }

  if (interaction.commandName === 'autorole') {
    // Ensure we have member permissions before checking
    if (!interaction.memberPermissions.has('ADMINISTRATOR')) {
      return interaction.reply({ content: 'You need Administrator permission!', ephemeral: true });
    }

    const role = interaction.options.getRole('role');
    autoRole = role;
    await interaction.reply(`✅ Auto-role set to ${role.name}`);
  }

  if (interaction.commandName === 'verify') {
    if (!SECURITY_CONFIG.verification.enabled) {
      return interaction.reply({ content: 'Verification is currently disabled.', ephemeral: true });
    }

    const accountAge = Date.now() - interaction.user.createdTimestamp;
    if (accountAge < SECURITY_CONFIG.verification.accountAgeDays * 24 * 60 * 60 * 1000) {
      return interaction.reply({ 
        content: `Your account must be at least ${SECURITY_CONFIG.verification.accountAgeDays} days old to verify.`,
        ephemeral: true 
      });
    }

    const verifiedRole = interaction.guild.roles.cache.find(r => r.name === SECURITY_CONFIG.verification.requiredRole);
    if (!verifiedRole) {
      return interaction.reply({ content: 'Verification role not found!', ephemeral: true });
    }

    if (interaction.member.roles.cache.has(verifiedRole.id)) {
      return interaction.reply({ content: 'You are already verified!', ephemeral: true });
    }

    // Generate captcha
    const captcha = Math.random().toString(36).slice(2, 8).toUpperCase();
    const captchaEmbed = {
      title: '✅ Verification Required',
      description: `Please type this code: \`${captcha}\`\nYou have 5 minutes to complete verification.`,
      color: 0x00FF00
    };

    await interaction.reply({ embeds: [captchaEmbed], ephemeral: true });

    const filter = m => m.author.id === interaction.user.id;
    try {
      const collected = await interaction.channel.awaitMessages({ 
        filter, 
        max: 1, 
        time: SECURITY_CONFIG.verification.captchaTimeout,
        errors: ['time'] 
      });

      if (collected.first().content === captcha) {
        await interaction.member.roles.add(verifiedRole);
        await interaction.followUp({ content: '✅ You have been verified!', ephemeral: true });
        Logger.logEvent(interaction.guild, 'verification', {
          user: interaction.user.tag,
          success: true
        });
      } else {
        await interaction.followUp({ content: '❌ Invalid captcha code!', ephemeral: true });
      }
    } catch (error) {
      await interaction.followUp({ content: '❌ Verification timed out!', ephemeral: true });
    }
  }

  if (interaction.commandName === 'uptime') {
    const uptime = Date.now() - BOT_START_TIME;
    const days = Math.floor(uptime / (1000 * 60 * 60 * 24));
    const hours = Math.floor((uptime % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((uptime % (1000 * 60 * 60)) / (1000 * 60));
    await interaction.reply(`Uptime: ${days}d ${hours}h ${minutes}m`);
  }

  // Beta announcement is now handled by /betaannounce command only

  if (interaction.commandName === 'betaannounce') {
    if (!interaction.memberPermissions.has('ADMINISTRATOR')) {
      return interaction.reply({ content: 'You need Administrator permission!', ephemeral: true });
    }

    const channel = client.channels.cache.get('1363579411571544416');
    if (channel) {
      const betaEmbed = new EmbedBuilder()
        .setTitle('🌟 ANARCHY REBORN ROLEPLAY - BETA TEST ANNOUNCEMENT 🌟')
        .setColor('#FF6B6B')
        .setDescription([
          '═══════════════════════════════════',
          '',
          '📢 **EXCITING NEWS!**',
          'We are thrilled to announce that Anarchy Reborn Roleplay is conducting an exclusive beta test phase!',
          '',
          '🎮 **WHAT TO EXPECT**',
          '• New Game Features',
          '• Enhanced Roleplay Systems',
          '• Improved Server Performance',
          '• Exclusive Beta Tester Rewards',
          '• Direct Input on Game Development',
          '',
          '🔍 **BETA TEST DETAILS**',
          '• Duration: 2 Weeks',
          '• All Players Welcome',
          '• Real-time Feedback System',
          '• Special Discord Roles',
          '',
          '💎 **BETA TESTER BENEFITS**',
          '• Early Access to New Features',
          '• Exclusive In-game Items',
          '• Special Discord Badge',
          '• Direct Communication with Devs',
          '',
          '🎯 **HOW TO PARTICIPATE**',
          '1. Join our Discord Server',
          '2. Connect to: `anarchyrp.ph-host.xyz:7777`',
          '3. Start Testing and Having Fun!',
          '',
          '═══════════════════════════════════'
        ].join('\n'))
        .setImage('https://cdn.discordapp.com/avatars/1364443184100282369/1981a71da1c567b98d7d921356329161.webp?size=1024')
        .setTimestamp()
        .setFooter({ text: '🌟 Anarchy Reborn RP - Beta Test Phase 🌟' });

      await channel.send({ embeds: [betaEmbed] });
      await interaction.reply({ content: 'Beta test announcement sent successfully!', ephemeral: true });
    } else {
      await interaction.reply({ content: 'Could not find the specified channel!', ephemeral: true });
    }
  }

  // Custom replies
  if (interaction.commandName === 'about' || interaction.commandName === 'faq') {
    await interaction.reply(customReplies[interaction.commandName]);
  }

  // Economy commands
  if (interaction.commandName === 'daily') {
    const result = await economy.daily(interaction.user.id);
    if (result) {
      await interaction.reply(`You received your daily 200 coins! Balance: ${result}`);
    } else {
      await interaction.reply('You already claimed your daily reward!');
    }
  }

  if (interaction.commandName === 'balance') {
    const userData = economy.data[interaction.user.id] || { balance: 0, xp: 0, level: 1 };
    await interaction.reply({
      embeds: [{
        title: '💰 User Stats',
        fields: [
          { name: 'Balance', value: `${userData.balance} coins`, inline: true },
          { name: 'Level', value: `${userData.level}`, inline: true },
          { name: 'XP', value: `${userData.xp}/${economy.calculateXPForLevel(userData.level)}`, inline: true }
        ],
        color: 0xFFD700
      }]
    });
  }

  if (interaction.commandName === 'work') {
    const earnings = await economy.work(interaction.user.id);
    if (earnings) {
      await interaction.reply(`You worked and earned ${earnings} coins!`);
    } else {
      await interaction.reply('There was an error processing your work.');
    }
  }

  if (interaction.commandName === 'shop') {
    const shopEmbed = {
      title: '🏪 Shop',
      description: shopItems.map(item => 
        `${item.name}: ${item.price} coins`
      ).join('\n'),
      color: 0x00FF00
    };
    await interaction.reply({ embeds: [shopEmbed] });
  }

  if (interaction.commandName === 'leaderboard') {
    const leaderboard = economy.getLeaderboard();
    const fields = await Promise.all(leaderboard.map(async ([userId, data], index) => {
      const user = await client.users.fetch(userId);
      return {
        name: `${index + 1}. ${user.tag}`,
        value: `${data.balance} coins`,
        inline: true
      };
    }));

    await interaction.reply({
      embeds: [{
        title: '🏆 Economy Leaderboard',
        fields,
        color: 0xFFD700
      }]
    });
  }

  if (interaction.commandName === 'setwelcome') {
    if (!interaction.memberPermissions.has('ADMINISTRATOR')) {
      return interaction.reply({ content: 'You need Administrator permission!', ephemeral: true });
    }

    const message = interaction.options.getString('message');
    const channel = interaction.options.getChannel('channel');
    const imageUrl = interaction.options.getString('imageurl');

    if (!channel.isTextBased()) {
      return interaction.reply({ content: 'Please select a text channel!', ephemeral: true });
    }

    const welcomeConfig = {
      message,
      channelId: channel.id,
      imageUrl
    };

    welcomeManager.setWelcome(interaction.guildId, channel.id);
    await interaction.reply(`Welcome message configured for ${channel}!`);
  }
  if (interaction.commandName === 'ip') {
    await interaction.reply('Server IP: anarchyrp.ph-host.xyz:7777');
  }

  if (interaction.commandName === 'serverstatus') {
    try {
      const response = await queryServer();
      await interaction.reply({
        embeds: [{
          title: '🎮 Server Status',
          fields: [
            { name: 'Server Name', value: response.hostname || 'Unknown', inline: true },
            { name: 'Players', value: `${response.online}/${response.maxplayers}`, inline: true },
            { name: 'Gamemode', value: response.gamemode || 'Unknown', inline: true }
          ],
          color: 0x00FF00
        }]
      });
    } catch (error) {
      await interaction.reply({ content: '❌ Failed to query server status', ephemeral: true });
    }
  }
  if (interaction.commandName === 'donation') {
    const donationChannel = client.channels.cache.get('1363725566238523512');
    if (!donationChannel) {
      return interaction.reply({ content: 'Donation channel not found!', ephemeral: true });
    }

    const donationEmbeds = [
      {
        title: '🎮 ANARCHY ROLEPLAY - DONATION LIST',
        description: '**BACKPACK PRICES**\n• Small: 200PHP\n• Medium: 300PHP\n• Large: 450PHP',
        color: 0xFF6B6B,
        image: { url: 'https://cdn.discordapp.com/attachments/1364574482345361439/1366278097220927549/Red_White_and_Yellow_Modern_Gaming_Initials_Youtube_Channel_Logo_20250422_215024_0000.png?ex=68105d22&is=680f0ba2&hm=ade8cbddd63c6182a9522fef60d48faeea08cca87bea1daf70752658421c6415&' }
      },
      {
        title: '🏠 HOUSE PRICES',
        description: '• Apartment: 200PHP\n• Low Class: 250PHP\n• Medium Class: 300PHP\n• Upper Class: 350PHP\n• Mansion Type: 400PHP\n• Mansion with Gate: 500PHP',
        color: 0xFF6B6B,
        image: { url: 'https://cdn.discordapp.com/attachments/1364574482345361439/1366278097766449272/Red_White_and_Yellow_Modern_Gaming_Initials_Youtube_Channel_Logo_20250422_214813_0000.png?ex=68105d22&is=680f0ba2&hm=4a185b19dc3b0961b8a07774196bf815ed2f345f3e51c12a6175fa192f78dbb2&' }
      },
      {
        title: '🚗 VEHICLE PRICES',
        description: '• Normal Vehicle: 100PHP\n• Rare Car Vehicle: 200PHP\n• Special Car Vehicle: 300PHP\n• Boats and Planes: 400PHP\n• Restricted Vehicle: 500PHP\n• Gang Air Vehicle: 500PHP\n• Custom Vehicle: 1000PHP',
        color: 0xFF6B6B,
        image: { url: 'https://cdn.discordapp.com/attachments/1364574482345361439/1366278098043146250/Red_White_and_Yellow_Modern_Gaming_Initials_Youtube_Channel_Logo_20250422_214517_0000.png?ex=68105d22&is=680f0ba2&hm=936c095cd3e11509186aa233280608764b781d882649c865b6090857737c4382&' }
      },
      {
        title: '🏢 CUSTOM MAPPED BUSINESS',
        description: '• Small Business: 1000PHP\n• Medium Business: 1500PHP\n• Large Business: 2000PHP',
        color: 0xFF6B6B,
        image: { url: 'https://cdn.discordapp.com/attachments/1364574482345361439/1366278098399789056/Red_White_and_Yellow_Modern_Gaming_Initials_Youtube_Channel_Logo_20250422_214100_0000.png?ex=68105d22&is=680f0ba2&hm=93b019f525b9a88c1262e06574823961f51e121e00c4a60407515b5757a6c7ea&' }
      },
      {
        title: '🏪 DYNAMIC BUSINESS',
        description: '• 24/7, Clothing, Restaurant: 250PHP each\n• Gym, Bar/Club: 250PHP each\n• Advertisement, Appliances: 250PHP each\n• Ammunition, Pharmacy: 500PHP each',
        color: 0xFF6B6B,
        image: { url: 'https://cdn.discordapp.com/attachments/1364574482345361439/1366278098739400786/Red_White_and_Yellow_Modern_Gaming_Initials_Youtube_Channel_Logo_20250422_213151_0000.png?ex=68105d22&is=680f0ba2&hm=3759a4eae06e28bf52e4f80f3119687eceec8b52f9df361d6589b5d5ad9fd1c7&' }
      },
      {
        title: '🏬 MALL BUSINESS',
        description: '• 1st Floor: 300PHP\n• 2nd Floor: 200PHP\n• Branded Business: 400PHP',
        color: 0xFF6B6B,
        image: { url: 'https://cdn.discordapp.com/attachments/1364574482345361439/1366278099217416254/Red_White_and_Yellow_Modern_Gaming_Initials_Youtube_Channel_Logo_20250422_212729_0000.png?ex=68105d23&is=680f0ba3&hm=569ea87366147272bf52b8d13fbad5af7d20ff79524ac2cc479bb910a573d5cd&' }
      },
      {
        title: '⚙️ SYSTEM PRICES',
        description: '• Dynamic Sleep: 200PHP\n• Self Repair: 250PHP\n• Custom Car Toys: 1000PHP\n• Custom System: 2500PHP\n• Custom Faction: 3000PHP\n• Custom Company: 4000PHP',
        color: 0xFF6B6B,
        image: { url: 'https://cdn.discordapp.com/attachments/1364574482345361439/1366278099540512789/Red_White_and_Yellow_Modern_Gaming_Initials_Youtube_Channel_Logo_20250422_211829_0000.png?ex=68105d23&is=680f0ba3&hm=866a3eba97ca02660c402f4445dc360f1b62e009142970532542e0b73ce06cd0&' }
      },
      {
        title: '🗺️ LAND PRICES',
        description: '• Small Land: 1000PHP\n• Medium Land: 1500PHP\n• Large Land: 2000PHP\n• XL Land: 2500PHP',
        color: 0xFF6B6B,
        image: { url: 'https://cdn.discordapp.com/attachments/1364574482345361439/1366278099926257704/Red_White_and_Yellow_Modern_Gaming_Initials_Youtube_Channel_Logo_20250422_211358_0000.png?ex=68105d23&is=680f0ba3&hm=5d7b1799c33d88a886e5c3e99a64818269d8a9a4aee6cdc8943ea162913ca589&' }
      },
      {
        title: '🏗️ CUSTOM MAPPING',
        description: '• Pasalpak (Any Size): 2000PHP\n• Mansion (Any Size): 2500PHP\n• Head Quarters: 3000PHP\n• Island: 4000PHP',
        color: 0xFF6B6B,
        image: { url: 'https://cdn.discordapp.com/attachments/1364574482345361439/1366278100245286942/Red_White_and_Yellow_Modern_Gaming_Initials_Youtube_Channel_Logo_20250422_210550_0000.png?ex=68105d23&is=680f0ba3&hm=2c6e52f9a2ea5d536472d884485f208d650ef9ebbee50797e5e54d8f77a1c479&' }
      },
      {
        title: '🚘 GARAGE PRICES',
        description: '• Small Garage: 50PHP\n• Medium Garage: 100PHP\n• Large Garage: 150PHP',
        color: 0xFF6B6B,
        image: { url: 'https://cdn.discordapp.com/attachments/1364574482345361439/1366278100723433513/Red_White_and_Yellow_Modern_Gaming_Initials_Youtube_Channel_Logo_20250422_204703_0000.png?ex=68105d23&is=680f0ba3&hm=d95ebbe26491064220c2075bcb95e29056b28d36e35ac3954da0e31047044b76&' },
        footer: { text: 'Contact Property Management for inquiries • Anarchy Roleplay' }
      }
    ];

    for (const embed of donationEmbeds) {
      await donationChannel.send({ embeds: [embed] });
    }

    await interaction.reply({ content: `Donation list has been posted in ${donationChannel}`, ephemeral: true });
  }

});

// Error handling
client.on('error', error => {
  console.error('Discord client error:', error);
});

process.on('unhandledRejection', error => {
  console.error('Unhandled promise rejection:', error);
});

client.login(token);