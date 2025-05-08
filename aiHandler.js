
const { 
  Client,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  PermissionsBitField,
  EmbedBuilder,
  ChannelType,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
  ModalBuilder
} = require('discord.js');

// New ticket categories configuration
const TICKET_CATEGORIES = {
  general: {
    label: 'General Support',
    description: 'Get help with general inquiries',
    emoji: '❓',
    color: 0x5865F2,
    supportRole: 'Support',
    transcriptChannel: '1260925060047310928'
  },
  bug: {
    label: 'Bug Report',
    description: 'Report bugs or technical issues',
    emoji: '🐛',
    color: 0xED4245,
    supportRole: 'Support',
    transcriptChannel: '1260925060047310928'
  },
  complaint: {
    label: 'Player Report',
    description: 'Report a player or file a complaint',
    emoji: '⚠️',
    color: 0xFEE75C,
    supportRole: 'Support',
    transcriptChannel: '1260925060047310928'
  },
  donation: {
    label: 'Donation Support',
    description: 'Get help with donations',
    emoji: '💰',
    color: 0x57F287,
    supportRole: 'Support',
    transcriptChannel: '1260925060047310928'
  },
  application: {
    label: 'Staff Application',
    description: 'Apply for staff position',
    emoji: '📝',
    color: 0xEB459E,
    supportRole: 'Admin',
    transcriptChannel: '1260925060047310928'
  }
};

// Storage for active tickets
const activeTickets = new Map();

// Storage for ticket claims
const claimedTickets = new Map();

// Storage for ticket transcripts
const ticketTranscripts = new Map();

async function handleMessage(message) {
  try {
    if (!message || !message.content) {
      throw new Error('Invalid message object');
    }

    if (message.author?.bot) return null;

    return null;
  } catch (error) {
    console.error('Error in handleMessage:', error);
    return null;
  }
}

function toggleBloodMode(status) {
  try {
    if (typeof status !== 'string') {
      throw new Error('Status must be a string');
    }

    const validStatuses = ['on', 'off'];
    if (!validStatuses.includes(status.toLowerCase())) {
      throw new Error('Status must be "on" or "off"');
    }

    return status.toLowerCase() === 'on';
  } catch (error) {
    console.error('Error in toggleBloodMode:', error);
    return false;
  }
}

// New Ticket System Implementation

// Setup the ticket panel
async function handleTicketSetup(interaction) {
  try {
    // Verify permissions
    if (!interaction.memberPermissions.has(PermissionsBitField.Flags.ManageChannels)) {
      return interaction.reply({
        content: '❌ You need Manage Channels permission to setup the ticket system.',
        ephemeral: true
      });
    }

    // Create ticket panel
    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('create_ticket')
          .setLabel('Create Ticket')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('🎫')
      );

    const embed = new EmbedBuilder()
      .setTitle('🎫 Support Ticket System')
      .setDescription('Click the button below to create a support ticket')
      .setColor(0x5865F2)
      .setTimestamp()
      .setFooter({ text: 'NEWLIFE ROLEPLAY REVAMPED • Support System' });

    await interaction.channel.send({
      embeds: [embed],
      components: [row]
    });

    await interaction.reply({
      content: '✅ Ticket system has been set up successfully!',
      ephemeral: true
    });
  } catch (error) {
    console.error('Error in handleTicketSetup:', error);
    await interaction.reply({
      content: '❌ An error occurred while setting up the ticket system.',
      ephemeral: true
    });
  }
}

// Handle ticket creation button click
async function handleTicketCreate(interaction) {
  try {
    // Check for existing tickets by this user
    const existingTicketChannel = interaction.guild.channels.cache.find(
      channel => channel.name.toLowerCase().includes(`ticket-`) && 
                channel.name.toLowerCase().includes(interaction.user.username.toLowerCase())
    );

    if (existingTicketChannel) {
      return interaction.reply({
        content: `You already have an open ticket at ${existingTicketChannel}`,
        ephemeral: true
      });
    }

    // Create category selection menu
    const row = new ActionRowBuilder()
      .addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('ticket_category')
          .setPlaceholder('Select ticket category')
          .addOptions(Object.entries(TICKET_CATEGORIES).map(([id, category]) => ({
            label: category.label,
            description: category.description,
            value: id,
            emoji: category.emoji
          })))
      );

    await interaction.reply({
      content: 'Please select a ticket category:',
      components: [row],
      ephemeral: true
    });
  } catch (error) {
    console.error('Error in handleTicketCreate:', error);
    await interaction.reply({
      content: '❌ An error occurred while creating the ticket.',
      ephemeral: true
    });
  }
}

// Process ticket category selection
async function handleTicketCategory(interaction) {
  try {
    // Acknowledge the interaction to prevent timeout
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ ephemeral: true });
    }
    
    const category = TICKET_CATEGORIES[interaction.values[0]];

    // Create ticket channel
    const ticketChannel = await interaction.guild.channels.create({
      name: `ticket-${category.emoji}-${interaction.user.username}`,
      type: ChannelType.GuildText,
      permissionOverwrites: [
        {
          id: interaction.guild.id,
          deny: [PermissionsBitField.Flags.ViewChannel],
        },
        {
          id: interaction.user.id,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ReadMessageHistory,
          ],
        }
      ]
    });

    // Store ticket in our tracking system
    if (!activeTickets.has(interaction.user.id)) {
      activeTickets.set(interaction.user.id, []);
    }

    activeTickets.get(interaction.user.id).push({
      channelId: ticketChannel.id,
      categoryId: interaction.values[0],
      timestamp: Date.now()
    });

    // Add support role permissions if it exists
    const supportRole = interaction.guild.roles.cache.find(r => r.name === category.supportRole);
    if (supportRole) {
      await ticketChannel.permissionOverwrites.create(supportRole, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
        ManageMessages: true
      });
    }

    // Create ticket management buttons
    const buttonRow = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('close_ticket')
          .setLabel('Close Ticket')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId('add_user')
          .setLabel('Add User')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('claim_ticket')
          .setLabel('Claim Ticket')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('save_transcript')
          .setLabel('Save Transcript')
          .setStyle(ButtonStyle.Secondary)
      );

    // Create ticket embed
    const embed = new EmbedBuilder()
      .setTitle(`${category.emoji} ${category.label} Ticket`)
      .setDescription(`Ticket created by ${interaction.user}\n\nPlease describe your ${category.label.toLowerCase()} request and wait for a staff member to assist you.`)
      .setColor(category.color)
      .setTimestamp()
      .setFooter({ text: 'NEWLIFE ROLEPLAY REVAMPED • Support System' });

    // Send initial message to the ticket channel
    await ticketChannel.send({
      content: `${interaction.user} Welcome to your ticket!`,
      embeds: [embed],
      components: [buttonRow]
    });

    // Notify staff about the new ticket
    await notifyStaff(ticketChannel, category.label, interaction.user);

    // Update the original interaction
    await interaction.editReply({
      content: `✅ Ticket created! Check ${ticketChannel}`,
      components: [],
    });
  } catch (error) {
    console.error('Error handling ticket category:', error);
    try {
      if (interaction.deferred) {
        await interaction.editReply({
          content: '❌ An error occurred while creating the ticket.',
        });
      } else if (!interaction.replied) {
        await interaction.reply({
          content: '❌ An error occurred while creating the ticket.',
          ephemeral: true
        });
      }
    } catch (followUpError) {
      console.error('Error sending error message:', followUpError);
    }
  }
}

// Notify staff about new ticket
async function notifyStaff(channel, type, user) {
  const staffRole = channel.guild.roles.cache.find(r => r.name === 'Staff');
  if (staffRole) {
    await channel.send(`${staffRole} A new ${type} ticket has been created by ${user}`);
  }
}

// Handle ticket close request
async function handleTicketClose(interaction) {
  if (!interaction.channel.name.startsWith('ticket-')) {
    return interaction.reply({
      content: '❌ This command can only be used in ticket channels!',
      ephemeral: true
    });
  }

  const row = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('confirm_close')
        .setLabel('Confirm Close')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId('cancel_close')
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Secondary)
    );

  await interaction.reply({
    content: '❗ Are you sure you want to close this ticket?',
    components: [row]
  });
}

// Handle ticket close confirmation
async function handleConfirmClose(interaction) {
  const embed = new EmbedBuilder()
    .setTitle('🎫 Ticket Closing')
    .setDescription('This ticket will be closed in 5 seconds...')
    .setColor(0xFF0000);

  await interaction.update({
    content: '',
    embeds: [embed],
    components: []
  });

  setTimeout(async () => {
    try {
      // Save transcript before deleting if needed
      await saveTicketTranscript(interaction.channel);
      
      // Delete the channel
      await interaction.channel.delete();
    } catch (error) {
      console.error('Error deleting ticket channel:', error);
    }
  }, 5000);
}

// Save transcript
async function saveTranscript(channel) {
  try {
    const messages = await channel.messages.fetch({ limit: 100 });
    const transcript = Array.from(messages.values())
      .reverse()
      .map(m => `${m.author.tag} (${m.createdAt.toISOString()}): ${m.content}`)
      .join('\n');

    return transcript;
  } catch (error) {
    console.error('Error saving transcript:', error);
    return 'Failed to save transcript.';
  }
}

// Save ticket transcript to designated channel
async function saveTicketTranscript(channel) {
  try {
    const transcript = await saveTranscript(channel);
    
    // Find ticket category from channel name
    let categoryId = null;
    for (const [userId, tickets] of activeTickets.entries()) {
      const ticket = tickets.find(t => t.channelId === channel.id);
      if (ticket) {
        categoryId = ticket.categoryId;
        break;
      }
    }

    if (!categoryId) return;

    const category = TICKET_CATEGORIES[categoryId];
    if (!category) return;

    const transcriptChannel = channel.guild.channels.cache.get(category.transcriptChannel);
    if (!transcriptChannel) return;

    const transcriptEmbed = new EmbedBuilder()
      .setTitle('Ticket Transcript')
      .setDescription(`Ticket: ${channel.name}`)
      .setColor(0x00FF00)
      .setTimestamp();

    await transcriptChannel.send({ 
      embeds: [transcriptEmbed],
      files: [{
        attachment: Buffer.from(transcript),
        name: `transcript-${channel.name}.txt`
      }]
    });
  } catch (error) {
    console.error('Error saving ticket transcript:', error);
  }
}

// Handle claim ticket
async function handleTicketClaim(interaction) {
  if (!interaction.channel.name.startsWith('ticket-')) {
    return interaction.reply({ 
      content: 'This command can only be used in ticket channels!', 
      ephemeral: true 
    });
  }

  if (!interaction.member.roles.cache.some(role => role.name === 'Staff')) {
    return interaction.reply({ 
      content: 'Only staff members can claim tickets!', 
      ephemeral: true 
    });
  }

  if (claimedTickets.has(interaction.channel.id)) {
    const claimedBy = interaction.guild.members.cache.get(claimedTickets.get(interaction.channel.id));
    return interaction.reply({ 
      content: `This ticket is already claimed by ${claimedBy || 'a staff member'}!`, 
      ephemeral: true 
    });
  }

  claimedTickets.set(interaction.channel.id, interaction.user.id);

  const embed = new EmbedBuilder()
    .setTitle('Ticket Claimed')
    .setDescription(`This ticket has been claimed by ${interaction.user}`)
    .setColor(0x00FF00)
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

// Add user to ticket modal
async function handleAddUser(interaction) {
  if (!interaction.channel.name.startsWith('ticket-')) {
    return interaction.reply({ 
      content: 'This command can only be used in ticket channels!', 
      ephemeral: true 
    });
  }

  const modal = new ModalBuilder()
    .setCustomId('add_user_modal')
    .setTitle('Add User to Ticket');

  const userInput = new TextInputBuilder()
    .setCustomId('user_id')
    .setLabel('Enter the user ID')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setPlaceholder('User ID (right-click user → Copy ID)');

  const firstActionRow = new ActionRowBuilder().addComponents(userInput);
  modal.addComponents(firstActionRow);

  await interaction.showModal(modal);
}

// Process add user from modal
async function handleAddUserSubmit(interaction) {
  const userId = interaction.fields.getTextInputValue('user_id');
  
  try {
    const user = await interaction.client.users.fetch(userId);
    
    await interaction.channel.permissionOverwrites.create(user, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true
    });
    
    await interaction.reply(`✅ Added ${user} to the ticket!`);
  } catch (error) {
    console.error('Error adding user to ticket:', error);
    await interaction.reply({ 
      content: 'Failed to add user. Make sure you provided a valid user ID.',
      ephemeral: true
    });
  }
}

// Set ticket priority
async function handleTicketPriority(interaction) {
  if (!interaction.channel.name.startsWith('ticket-')) {
    return interaction.reply({ 
      content: 'This command can only be used in ticket channels!', 
      ephemeral: true 
    });
  }

  if (!interaction.member.roles.cache.some(role => role.name === 'Staff')) {
    return interaction.reply({ 
      content: 'Only staff members can set ticket priority!', 
      ephemeral: true 
    });
  }

  const priority = interaction.options.getString('level');
  
  let color;
  switch(priority) {
    case 'low':
      color = 0x00FF00; // Green
      break;
    case 'medium':
      color = 0xFFA500; // Orange
      break;
    case 'high':
      color = 0xFF0000; // Red
      break;
    default:
      color = 0x00FF00;
  }

  const embed = new EmbedBuilder()
    .setTitle('Ticket Priority Updated')
    .setDescription(`Priority set to: ${priority.toUpperCase()}`)
    .setColor(color);

  await interaction.reply({ embeds: [embed] });

  // Update channel name to show priority
  try {
    const currentName = interaction.channel.name;
    if (currentName.includes('-low-') || currentName.includes('-medium-') || currentName.includes('-high-')) {
      // Replace existing priority
      const newName = currentName.replace(/-low-|-medium-|-high-/, `-${priority}-`);
      await interaction.channel.setName(newName);
    } else {
      // Add priority after 'ticket-'
      const newName = currentName.replace('ticket-', `ticket-${priority}-`);
      await interaction.channel.setName(newName);
    }
  } catch (error) {
    console.error('Error updating channel name with priority:', error);
  }
}

// Register all interactions
function initializeTicketHandlers(client) {
  client.on('interactionCreate', async interaction => {
    try {
      // Handle command interactions
      if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'ticket') {
          const subcommand = interaction.options.getSubcommand();
          
          switch(subcommand) {
            case 'add':
              const userToAdd = interaction.options.getUser('user');
              if (!interaction.channel.name.startsWith('ticket-')) {
                return interaction.reply({ content: 'This command can only be used in ticket channels!', ephemeral: true });
              }
              await interaction.channel.permissionOverwrites.create(userToAdd, {
                ViewChannel: true,
                SendMessages: true,
                ReadMessageHistory: true
              });
              await interaction.reply(`✅ Added ${userToAdd} to the ticket!`);
              break;
              
            case 'remove':
              const userToRemove = interaction.options.getUser('user');
              if (!interaction.channel.name.startsWith('ticket-')) {
                return interaction.reply({ content: 'This command can only be used in ticket channels!', ephemeral: true });
              }
              await interaction.channel.permissionOverwrites.delete(userToRemove);
              await interaction.reply(`✅ Removed ${userToRemove} from the ticket!`);
              break;
              
            case 'close':
              await handleTicketClose(interaction);
              break;
              
            case 'claim':
              await handleTicketClaim(interaction);
              break;
              
            case 'priority':
              await handleTicketPriority(interaction);
              break;
          }
        } else if (interaction.commandName === 'setup') {
          await handleTicketSetup(interaction);
        }
      }
      
      // Handle button interactions
      else if (interaction.isButton()) {
        switch (interaction.customId) {
          case 'create_ticket':
            await handleTicketCreate(interaction);
            break;
          case 'close_ticket':
            await handleTicketClose(interaction);
            break;
          case 'confirm_close':
            await handleConfirmClose(interaction);
            break;
          case 'cancel_close':
            await interaction.update({
              content: 'Ticket close cancelled.',
              components: [],
              embeds: []
            });
            break;
          case 'add_user':
            await handleAddUser(interaction);
            break;
          case 'claim_ticket':
            await handleTicketClaim(interaction);
            break;
          case 'save_transcript':
            await saveTicketTranscript(interaction.channel);
            await interaction.reply({
              content: 'Transcript saved!',
              ephemeral: true
            });
            break;
        }
      }
      
      // Handle modal submissions
      else if (interaction.isModalSubmit()) {
        if (interaction.customId === 'add_user_modal') {
          await handleAddUserSubmit(interaction);
        }
      }
      
      // Handle select menu interactions
      else if (interaction.isStringSelectMenu()) {
        if (interaction.customId === 'ticket_category') {
          await handleTicketCategory(interaction);
        }
      }
    } catch (error) {
      console.error('Error in interaction handler:', error);
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ 
            content: 'An error occurred while processing your request.', 
            ephemeral: true 
          });
        } else if (interaction.deferred) {
          await interaction.editReply({ 
            content: 'An error occurred while processing your request.' 
          });
        }
      } catch (followUpError) {
        console.error('Error sending error response:', followUpError);
      }
    }
  });
}

module.exports = {
  handleMessage,
  toggleBloodMode,
  TICKET_CATEGORIES,
  handleTicketSetup,
  handleTicketCreate,
  handleTicketCategory,
  handleTicketClose,
  handleConfirmClose,
  handleTicketClaim,
  saveTranscript,
  handleAddUser,
  initializeTicketHandlers
};
