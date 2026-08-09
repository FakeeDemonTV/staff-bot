const {
    Client,
    GatewayIntentBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    PermissionFlagsBits,
    Events
} = require("discord.js");

// =========================
// CONFIG
// =========================
// ⚠️ IMPORTANTE: non lasciare mai il token scritto qui in chiaro.
// Usa una variabile d'ambiente (file .env + pacchetto dotenv):
//   require("dotenv").config();
//   const TOKEN = process.env.DISCORD_TOKEN;
// Se questo token è mai stato pubblicato (es. su GitHub o in chat),
// vai subito su Discord Developer Portal -> Bot -> Reset Token.
require("dotenv").config();
const TOKEN = process.env.DISCORD_TOKEN;

const STAFF_CHANNEL = "1534258073923879012";
const VERIFIED_ROLE = "1534258033549508829";

const BRAND_NAME = ".ɢɢ/ʟᴜx";
const BRAND_ICON = "https://cdn.discordapp.com/attachments/1534258066630119685/1535270022480400454/lux.gif?ex=6a792161&is=6a77cfe1&hm=3996db3247dd6f1f4540ca020b76e423a4759a17521955b18b336c7006e7290b&"; // sostituisci con il tuo logo
const EMBED_COLOR = "#ffffff";

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const pending = new Set();
const giveaways = new Map(); // messageId -> giveaway data

// =========================
// UTILS
// =========================

function parseDuration(str) {
    const match = str.match(/^(\d+)(s|m|h|d)$/);
    if (!match) return null;
    const value = parseInt(match[1]);
    const unit = match[2];
    const multipliers = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
    return value * multipliers[unit];
}

function pickWinners(participants, count) {
    const pool = Array.from(participants);
    const winners = [];
    const n = Math.min(count, pool.length);
    for (let i = 0; i < n; i++) {
        const idx = Math.floor(Math.random() * pool.length);
        winners.push(pool.splice(idx, 1)[0]);
    }
    return winners;
}

function buildGiveawayEmbed(giveaway, ended = false) {
    const endTimestamp = Math.floor(giveaway.endTime / 1000);

    const embed = new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setAuthor({ name: `${BRAND_NAME} – Giveaway`, iconURL: BRAND_ICON })
        .setDescription(
            `● **Prize:** ${giveaway.prize}\n` +
            `● **Entries:** ${giveaway.participants.size}\n` +
            `● **Winners:** ${giveaway.winnersCount}\n` +
            `● **Ends:** ${ended ? "Terminato" : `<t:${endTimestamp}:R>`}\n` +
            `● **Host:** <@${giveaway.hostId}>`
        )
        .setTimestamp();

    return embed;
}

function buildGiveawayRow(disabled = false) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("giveaway_join")
            .setLabel("Join")
            .setEmoji("🎁")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled),
        new ButtonBuilder()
            .setCustomId("giveaway_list")
            .setLabel("List")
            .setEmoji("📋")
            .setStyle(ButtonStyle.Secondary)
    );
}

async function refreshGiveawayMessage(client, messageId) {
    const giveaway = giveaways.get(messageId);
    if (!giveaway) return;

    const channel = await client.channels.fetch(giveaway.channelId).catch(() => null);
    if (!channel) return;

    const message = await channel.messages.fetch(messageId).catch(() => null);
    if (!message) return;

    await message.edit({
        embeds: [buildGiveawayEmbed(giveaway)],
        components: [buildGiveawayRow()]
    }).catch(() => {});
}

async function endGiveaway(client, messageId) {
    const giveaway = giveaways.get(messageId);
    if (!giveaway || giveaway.ended) return;

    giveaway.ended = true;

    const channel = await client.channels.fetch(giveaway.channelId).catch(() => null);
    if (!channel) return;

    const message = await channel.messages.fetch(messageId).catch(() => null);
    if (!message) return;

    const winners = pickWinners(giveaway.participants, giveaway.winnersCount);
    giveaway.lastWinners = winners;

    await message.edit({
        embeds: [buildGiveawayEmbed(giveaway, true)],
        components: [buildGiveawayRow(true)]
    }).catch(() => {});

    if (winners.length) {
        await channel.send(
            `🎉 Congratulazioni ${winners.map(id => `<@${id}>`).join(", ")}! Hai vinto **${giveaway.prize}**!`
        );
    } else {
        await channel.send(`❌ Nessun partecipante per il giveaway **${giveaway.prize}**, nessun vincitore.`);
    }
}

// =========================
// MESSAGE COMMANDS
// =========================

client.once("ready", () => {
    console.clear();
    console.log(`${client.user.tag} è online!`);
});

client.on("messageCreate", async (message) => {

    if (message.author.bot) return;

    // =========================
    // VERIFY PANEL
    // =========================

    if (message.content === "!verifypanel") {

        if (!message.member.permissions.has(PermissionFlagsBits.Administrator))
            return message.reply("❌ Non hai il permesso.");

        const embed = new EmbedBuilder()
            .setColor("#5865F2")
            .setTitle("🔒 Verification")
            .setDescription("Premi il pulsante qui sotto per iniziare la verifica.")
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("verify")
                .setLabel("Verify")
                .setEmoji("✅")
                .setStyle(ButtonStyle.Primary)
        );

        return message.channel.send({
            embeds: [embed],
            components: [row]
        });

    }

    // =========================
    // DM ROLE
    // =========================

    if (message.content.startsWith("/dms ")) {

        if (!message.member.permissions.has(PermissionFlagsBits.Administrator))
            return message.reply("❌ Non hai il permesso.");

        const role = message.mentions.roles.first();

        if (!role)
            return message.reply("Uso: /dms @ruolo messaggio");

        const text = message.content
            .replace("/dms", "")
            .replace(role.toString(), "")
            .trim();

        if (!text)
            return message.reply("Scrivi anche un messaggio.");

        await message.guild.members.fetch();

        const members = message.guild.members.cache.filter(member =>
            !member.user.bot &&
            member.roles.cache.has(role.id)
        );

        let success = 0;
        let failed = 0;

        await message.reply(`📨 Invio messaggio a **${members.size}** utenti...`);

        for (const member of members.values()) {

            try {

                const embed = new EmbedBuilder()
                    .setColor("#5865F2")
                    .setTitle(message.guild.name)
                    .setDescription(text)
                    .setFooter({
                        text: `Inviato da ${message.author.tag}`
                    })
                    .setTimestamp();

                await member.send({
                    embeds: [embed]
                });

                success++;

            } catch {

                failed++;

            }

            // Evita Rate Limit
            await new Promise(r => setTimeout(r, 1000));

        }

        return message.channel.send(
`✅ Invio completato!

👥 Ruolo: ${role}
📨 Inviati: ${success}
❌ Falliti: ${failed}`
        );

    }

    // =========================
    // GIVEAWAY START
    // =========================

    if (message.content.startsWith("!gstart ")) {

        if (!message.member.permissions.has(PermissionFlagsBits.Administrator))
            return message.reply("❌ Non hai il permesso.");

        const args = message.content.split(" ").slice(1);
        const durationStr = args[0];
        const winnersCount = parseInt(args[1]);
        const prize = args.slice(2).join(" ");

        const duration = parseDuration(durationStr);

        if (!duration)
            return message.reply("Uso: `!gstart <durata> <vincitori> <premio>`\nEsempi durata: `30s`, `10m`, `2h`, `1d`");

        if (!winnersCount || winnersCount < 1)
            return message.reply("Numero di vincitori non valido.");

        if (!prize)
            return message.reply("Devi specificare un premio.");

        const giveaway = {
            prize,
            winnersCount,
            endTime: Date.now() + duration,
            participants: new Set(),
            channelId: message.channel.id,
            ended: false,
            hostId: message.author.id,
            lastWinners: []
        };

        const sent = await message.channel.send({
            embeds: [buildGiveawayEmbed(giveaway)],
            components: [buildGiveawayRow()]
        });

        giveaways.set(sent.id, giveaway);

        setTimeout(() => endGiveaway(client, sent.id), duration);

        return message.delete().catch(() => {});
    }

    // =========================
    // GIVEAWAY END (manuale)
    // =========================

    if (message.content.startsWith("!gend ")) {

        if (!message.member.permissions.has(PermissionFlagsBits.Administrator))
            return message.reply("❌ Non hai il permesso.");

        const messageId = message.content.split(" ")[1];

        if (!messageId || !giveaways.has(messageId))
            return message.reply("❌ Giveaway non trovato. Uso: `!gend <messageId>`");

        await endGiveaway(client, messageId);

        return message.reply("✅ Giveaway terminato manualmente.");
    }

    // =========================
    // GIVEAWAY REROLL
    // =========================

    if (message.content.startsWith("!greroll ")) {

        if (!message.member.permissions.has(PermissionFlagsBits.Administrator))
            return message.reply("❌ Non hai il permesso.");

        const messageId = message.content.split(" ")[1];
        const giveaway = giveaways.get(messageId);

        if (!giveaway)
            return message.reply("❌ Giveaway non trovato. Uso: `!greroll <messageId>`");

        if (!giveaway.participants.size)
            return message.reply("❌ Nessun partecipante da estrarre.");

        const [newWinner] = pickWinners(giveaway.participants, 1);

        return message.channel.send(`🎉 Nuovo vincitore: <@${newWinner}>! Hai vinto **${giveaway.prize}**!`);
    }

    // =========================
    // GIVEAWAY LIST (comando testuale)
    // =========================

    if (message.content === "!glist") {

        const active = Array.from(giveaways.entries()).filter(([, g]) => !g.ended);

        if (!active.length)
            return message.reply("📋 Nessun giveaway attivo al momento.");

        const embed = new EmbedBuilder()
            .setColor(EMBED_COLOR)
            .setAuthor({ name: `${BRAND_NAME} – Giveaway attivi`, iconURL: BRAND_ICON })
            .setDescription(
                active.map(([id, g]) =>
                    `● **${g.prize}** — ${g.participants.size} iscritti — <t:${Math.floor(g.endTime / 1000)}:R>\n\`ID: ${id}\``
                ).join("\n\n")
            );

        return message.channel.send({ embeds: [embed] });
    }

});

// =========================
// INTERACTIONS
// =========================

client.on(Events.InteractionCreate, async interaction => {

    try {

        // Bottone Giveaway Join
        if (interaction.isButton() && interaction.customId === "giveaway_join") {

            const giveaway = giveaways.get(interaction.message.id);

            if (!giveaway || giveaway.ended) {
                return interaction.reply({
                    content: "❌ Questo giveaway non è più attivo.",
                    ephemeral: true
                });
            }

            if (giveaway.participants.has(interaction.user.id)) {
                giveaway.participants.delete(interaction.user.id);
                await refreshGiveawayMessage(client, interaction.message.id);
                return interaction.reply({
                    content: "✅ Non partecipi più al giveaway.",
                    ephemeral: true
                });
            }

            giveaway.participants.add(interaction.user.id);
            await refreshGiveawayMessage(client, interaction.message.id);

            return interaction.reply({
                content: "🎉 Partecipazione registrata! Buona fortuna!",
                ephemeral: true
            });
        }

        // Bottone Giveaway List
        if (interaction.isButton() && interaction.customId === "giveaway_list") {

            const giveaway = giveaways.get(interaction.message.id);

            if (!giveaway) {
                return interaction.reply({
                    content: "❌ Dati del giveaway non trovati.",
                    ephemeral: true
                });
            }

            if (!giveaway.participants.size) {
                return interaction.reply({
                    content: "📋 Nessun partecipante ancora.",
                    ephemeral: true
                });
            }

            const list = Array.from(giveaway.participants)
                .map((id, i) => `${i + 1}. <@${id}>`)
                .join("\n");

            const embed = new EmbedBuilder()
                .setColor(EMBED_COLOR)
                .setAuthor({ name: `${BRAND_NAME} – Partecipanti`, iconURL: BRAND_ICON })
                .setDescription(list.length > 4000 ? list.slice(0, 4000) + "\n..." : list)
                .setFooter({ text: `${giveaway.participants.size} partecipanti totali` });

            return interaction.reply({
                embeds: [embed],
                ephemeral: true
            });
        }

        // Bottone Verify
        if (interaction.isButton() && interaction.customId === "verify") {

            if (pending.has(interaction.user.id)) {
                return interaction.reply({
                    content: "❌ Hai già una richiesta in attesa.",
                    ephemeral: true
                });
            }

            const modal = new ModalBuilder()
                .setCustomId("verify_modal")
                .setTitle("Verification");

            const name = new TextInputBuilder()
                .setCustomId("name")
                .setLabel("Name")
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            const age = new TextInputBuilder()
                .setCustomId("age")
                .setLabel("Age")
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            const invite = new TextInputBuilder()
                .setCustomId("invite")
                .setLabel("Who invited you?")
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            modal.addComponents(
                new ActionRowBuilder().addComponents(name),
                new ActionRowBuilder().addComponents(age),
                new ActionRowBuilder().addComponents(invite)
            );

            return interaction.showModal(modal);
        }

        // Invio Modal
        if (interaction.isModalSubmit() && interaction.customId === "verify_modal") {

            pending.add(interaction.user.id);

            const channel = await client.channels.fetch(STAFF_CHANNEL);

            const embed = new EmbedBuilder()
                .setColor("#2B2D31")
                .setTitle("📋 New Verification")
                .setThumbnail(interaction.user.displayAvatarURL())
                .addFields(
                    {
                        name: "User",
                        value: `${interaction.user}\n\`${interaction.user.id}\``
                    },
                    {
                        name: "Name",
                        value: interaction.fields.getTextInputValue("name"),
                        inline: true
                    },
                    {
                        name: "Age",
                        value: interaction.fields.getTextInputValue("age"),
                        inline: true
                    },
                    {
                        name: "Invited By",
                        value: interaction.fields.getTextInputValue("invite")
                    }
                )
                .setTimestamp();

            const buttons = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`accept_${interaction.user.id}`)
                    .setLabel("Accept")
                    .setEmoji("✅")
                    .setStyle(ButtonStyle.Success),

                new ButtonBuilder()
                    .setCustomId(`reject_${interaction.user.id}`)
                    .setLabel("Reject")
                    .setEmoji("❌")
                    .setStyle(ButtonStyle.Danger)
            );

            await channel.send({
                embeds: [embed],
                components: [buttons]
            });

            return interaction.reply({
                content: "✅ Richiesta inviata allo staff.",
                ephemeral: true
            });

        }

        // Accetta
        if (interaction.isButton() && interaction.customId.startsWith("accept_")) {

            const userId = interaction.customId.split("_")[1];

            const member = await interaction.guild.members.fetch(userId);

            await member.roles.add(VERIFIED_ROLE);

            pending.delete(userId);

            try {
                await member.send("✅ Your approval request has been approved.");
            } catch {}

            return interaction.update({
                content: `✅ Approvato da ${interaction.user}`,
                embeds: interaction.message.embeds,
                components: []
            });

        }

        // Rifiuta
        if (interaction.isButton() && interaction.customId.startsWith("reject_")) {

            const userId = interaction.customId.split("_")[1];

            pending.delete(userId);

            try {
                const member = await interaction.guild.members.fetch(userId);
                await member.send("❌ Your approval request has been rejected.");
            } catch {}

            return interaction.update({
                content: `❌ Rifiutato da ${interaction.user}`,
                embeds: interaction.message.embeds,
                components: []
            });

        }

    } catch (err) {
        console.error(err);

        if (!interaction.replied && !interaction.deferred) {
            interaction.reply({
                content: "❌ Si è verificato un errore.",
                ephemeral: true
            }).catch(() => {});
        }
    }

});

client.login(TOKEN);
