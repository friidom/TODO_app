import i18n from "@/components/i18n";
import type { BoardMember } from "@/services/members/membersApi";

export function memberInitial(member: BoardMember) {
  const source = member.full_name || member.username;

  return source ? source.charAt(0).toUpperCase() : "?";
}

export function memberName(member: BoardMember) {
  return member.full_name || member.username || i18n.t("members.unnamed");
}
