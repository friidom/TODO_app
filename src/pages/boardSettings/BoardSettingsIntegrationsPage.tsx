import { useTranslation } from "react-i18next";

import BoardSettingsShell, {
  Section,
} from "@/components/boardSettings/BoardSettingsShell";
import BoardGitLabStatus from "@/components/gitlab/BoardGitLabStatus";
import { useBoardId } from "@/hooks/useBoardId";
import { useBoard } from "@/services/boards/useBoard";
import type { IBoard } from "@/types/data";

export default function BoardSettingsIntegrationsPage() {
  const boardId = useBoardId();
  const { data: board } = useBoard(boardId);

  return (
    <BoardSettingsShell>
      {board ? <Integrations board={board} /> : null}
    </BoardSettingsShell>
  );
}

function Integrations({ board }: { board: IBoard }) {
  const { t } = useTranslation();

  return (
    <Section
      title={t("gitlab.title")}
      hint={t("gitlab.hint", { example: `${board.key_prefix}-12` })}
    >
      <BoardGitLabStatus board={board} />
    </Section>
  );
}
