import { EmbedBuilder } from "discord.js";
import { Settlement } from "../../state/schema";
import { tierName } from "../tiers";

export function buildSettlementCard(settlement: Settlement) {
  const tierLabel = `${settlement.tier} - ${tierName(settlement.tier)}`;
  const mayor = settlement.mayorUserId ? `<@${settlement.mayorUserId}>` : "-";
  const termEnds =
    settlement.mayorUntilMs && settlement.mayorUserId ? `<t:${Math.floor(settlement.mayorUntilMs / 1000)}:R>` : "-";

  const embed = new EmbedBuilder()
    .setTitle(`Settlement: ${settlement.name}`)
    .setColor(0x2b90d9)
    .addFields(
      { name: "Tier", value: tierLabel, inline: true },
      { name: "Mayor", value: mayor, inline: true },
      { name: "Term Ends", value: termEnds, inline: true },
      { name: "Buildings", value: settlement.buildings?.trim() ? settlement.buildings : "-" },
      { name: "Buy Orders", value: settlement.buyOrders?.trim() ? settlement.buyOrders : "-" },
      { name: "Notes", value: settlement.notes?.trim() ? settlement.notes : "-" },
    )
    .setFooter({ text: "Last updated" })
    .setTimestamp(new Date(settlement.updatedAtMs));

  return embed;
}
