'use client'

import { isDepartmentPassive, type DepartmentOption } from './stock'

/** Departman <select> seçenekleri: pasif departmanlar görünür ama seçilemez. */
export function DepartmentOptions({ departments }: { departments: DepartmentOption[] }) {
  return (
    <>
      {departments.map(d => {
        const passive = isDepartmentPassive(d)
        return (
          <option key={d.id} value={d.id} disabled={passive}>
            {d.name}{passive ? ' (pasif)' : ''}
          </option>
        )
      })}
    </>
  )
}
