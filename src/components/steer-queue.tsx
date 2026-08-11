"use client";

import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  CornerDownRight,
  GripVertical,
  Paperclip,
  Pencil,
  Trash2,
} from "lucide-react";
import { DragEvent, useState } from "react";

export type PendingSteer = {
  id: string;
  message: PromptInputMessage;
};

type SteerQueueProps = {
  items: PendingSteer[];
  onDelete: (id: string) => void;
  onEdit: (id: string) => void;
  onReorder: (sourceId: string, targetId: string) => void;
  onSteer: (id: string) => void;
};

export function SteerQueue({ items, onDelete, onEdit, onReorder, onSteer }: SteerQueueProps) {
  const [draggingId, setDraggingId] = useState<string | null>(null);

  if (items.length === 0) return null;

  const drop = (event: DragEvent, targetId: string) => {
    event.preventDefault();
    const sourceId = event.dataTransfer.getData("text/plain") || draggingId;
    if (sourceId && sourceId !== targetId) onReorder(sourceId, targetId);
    setDraggingId(null);
  };

  return (
    <div className="relative z-0 mx-4 -mb-4 overflow-hidden rounded-t-[21px] border border-b-0 border-border/75 bg-background pb-4 shadow-[0_-2px_16px_rgba(0,0,0,0.035)]">
      {items.map((item, index) => (
        <div
          className={cn(
            "chat-steer-row group/steer flex min-h-11 items-center gap-1.5 px-3",
            index > 0 && "border-t border-border/65",
            draggingId === item.id && "opacity-50",
          )}
          key={item.id}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => drop(event, item.id)}
        >
          <button
            aria-label="Drag steer to reorder"
            className="-ml-1 shrink-0 cursor-grab touch-none text-muted-foreground/65 active:cursor-grabbing"
            draggable
            onDragEnd={() => setDraggingId(null)}
            onDragStart={(event) => {
              setDraggingId(item.id);
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", item.id);
            }}
            type="button"
          >
            <GripVertical className="size-4" />
          </button>
          <span className="min-w-0 flex-1 truncate text-foreground/90">{item.message.text || "Attached files"}</span>
          {item.message.files.length > 0 && (
            <span className="chat-meta-text flex items-center gap-1 text-muted-foreground">
              <Paperclip className="size-3.5" /> {item.message.files.length}
            </span>
          )}
          <Button className="font-normal text-muted-foreground" onClick={() => onSteer(item.id)} size="sm" type="button" variant="ghost">
            <CornerDownRight className="size-3.5" /> Steer
          </Button>
          <Button aria-label="Delete steer" className="size-7 text-muted-foreground" onClick={() => onDelete(item.id)} size="icon-sm" type="button" variant="ghost"><Trash2 className="size-3.5" /></Button>
          <Button aria-label="Edit steer" className="size-7 text-muted-foreground" onClick={() => onEdit(item.id)} size="icon-sm" type="button" variant="ghost"><Pencil className="size-3.5" /></Button>
        </div>
      ))}
    </div>
  );
}
