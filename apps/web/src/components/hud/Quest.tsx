import {
  QUESTS,
  getMferGptDailyQuestAssignmentFromFlags,
  getQuestObjectives,
  getQuestRepeatLabel,
  type QuestId,
  type QuestSnapshot,
} from "@mferland/shared";

type QuestProps = {
  quest: QuestSnapshot;
  full?: boolean;
  active?: boolean;
  onActivate?: (questId: QuestId) => void;
};

export function Quest({ quest, full = false, active = false, onActivate }: QuestProps) {
  const definition = QUESTS[quest.id];
  const dailyAssignment = quest.id === "mfergpt-daily-signal"
    ? getMferGptDailyQuestAssignmentFromFlags(quest.flags)
    : null;
  const objectives = getQuestObjectives(quest.id);
  const repeatLabel = getQuestRepeatLabel(quest.id);
  const title = dailyAssignment ? dailyAssignment.title : definition.title;
  const description = dailyAssignment ? `${definition.description} ${dailyAssignment.summary}` : definition.description;
  const objectiveLabel = dailyAssignment ? dailyAssignment.objectiveLabel : definition.objectiveLabel;
  const statusText = quest.status === "completed"
    ? "handled"
    : quest.status === "ready"
      ? definition.turnInLabel
      : objectiveLabel;
  const progress = quest.status === "completed" ? "handled" : `${Math.min(quest.progress, quest.required)}/${quest.required}`;

  const isSelectable = quest.status !== "completed" && Boolean(onActivate);
  const className = [
    "quest-row",
    quest.status,
    full ? "full" : "",
    active ? "active" : "",
    isSelectable ? "selectable" : "",
  ].filter(Boolean).join(" ");
  const content = (
    <>
      <div>
        <strong>
          {title}
          {repeatLabel && <i>{repeatLabel}</i>}
        </strong>
        {full && <small>{description}</small>}
        {objectives.length > 0 && quest.status !== "completed" ? (
          <QuestObjectiveList quest={quest} objectives={objectives} />
        ) : (
          <span>{statusText}</span>
        )}
      </div>
      <span className="quest-row-progress">
        <em>{progress}</em>
        {active && <b>active</b>}
      </span>
    </>
  );

  if (isSelectable) {
    return (
      <button
        type="button"
        className={className}
        aria-pressed={active}
        data-testid={`quest-row-${quest.id}`}
        onClick={() => onActivate?.(quest.id)}
      >
        {content}
      </button>
    );
  }

  return (
    <div className={className} data-testid={`quest-row-${quest.id}`}>
      {content}
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
