import type { ReactNode } from 'react'
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

function Row({ id, render }: { id: string; render: (handle: object) => ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  return (
    <div
      ref={setNodeRef}
      className="sortable-row"
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.55 : 1,
        zIndex: isDragging ? 5 : undefined,
      }}
    >
      {render({ ...attributes, ...listeners })}
    </div>
  )
}

interface Props<T extends { id: string }> {
  items: T[]
  onReorder: (next: T[]) => void
  grid?: boolean
  children: (item: T, handle: object) => ReactNode
}

// Liste verticale réordonnable. `handle` est à étaler sur le bouton de poignée.
export default function Sortable<T extends { id: string }>({ items, onReorder, grid, children }: Props<T>) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
  )

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const from = items.findIndex((i) => i.id === active.id)
    const to = items.findIndex((i) => i.id === over.id)
    if (from < 0 || to < 0) return
    onReorder(arrayMove(items, from, to))
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={items.map((i) => i.id)} strategy={grid ? rectSortingStrategy : verticalListSortingStrategy}>
        <div className={grid ? 'grid' : undefined}>
          {items.map((it) => (
            <Row key={it.id} id={it.id} render={(handle) => children(it, handle)} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}
