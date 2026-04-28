import {
  QUESTS,
  getQuestObjectives,
  getQuestRepeatLabel,
  type QuestSnapshot,
} from "@mferland/shared";

export function Quest({ quest, full = false }: { quest: QuestSnapshot; full?: boolean }) {
  const definition = QUESTS[quest.id];
  const objectives = getQuestObjectives(quest.id);
  const repeatLabel = getQuestRepeatLabel(quest.id);
  const statusText = quest.status === "completed"
    ? "Complete"
    : quest.status === "ready"
      ? definition.turnInLabel
      : definition.objectiveLabel;
  const progress = quest.status === "completed" ? "Done" : `${Math.min(quest.progress, quest.required)}/${quest.required}`;

  return (
    <div className={`quest-row ${quest.status} ${full ? "full" : ""}`}>
      <div>
        <strong>
          {definition.title}
          {repeatLabel && <i>{repeatLabel}</i>}
        </strong>
        {full && <small>{definition.description}</small>}
        {objectives.length > 0 && quest.status !== "completed" ? (
          <QuestObjectiveList quest={quest} objectives={objectives} />
        ) : (
          <span>{statusText}</span>
        )}
      </div>
      <em>{progress}</em>
    </div>
  );
}

function QuestObjectiveList({
  quest,
  objectives,
}: {
  quest: QuestSnapshot;
  objectives: ReadonlyArray<{ id: string; label: string }>;
}) {
  const completed = new Set(quest.flags.split(",").filter(Boolean));
  return (
    <span className="quest-objectives">
      {objectives.map((objective) => (
        <span key={objective.id} className={completed.has(objective.id) ? "done" : ""}>
          {objective.label}
        </span>
      ))}
    </span>
  );
}
