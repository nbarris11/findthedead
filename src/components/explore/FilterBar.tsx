"use client";
import type { CategoryOption } from "@/types/database";

export type Filters = { categorySlug: string | null; notableOnly: boolean };

type FilterBarProps = {
  categories: readonly CategoryOption[];
  filters: Filters;
  onChange: (filters: Filters) => void;
};

/** Data-driven categories: nothing here is hardcoded, so a new category added
 *  in the database appears without a UI change. */
export function FilterBar({ categories, filters, onChange }: FilterBarProps) {
  return (
    <div className="explore-filterbar">
      <button
        type="button"
        className="filter-chip"
        aria-pressed={filters.notableOnly}
        onClick={() =>
          onChange({ ...filters, notableOnly: !filters.notableOnly })
        }
      >
        {filters.notableOnly ? "Notable only ✓" : "Notable only"}
      </button>
      <select
        className="filter-select"
        aria-label="Filter by category"
        value={filters.categorySlug ?? "all"}
        onChange={(e) =>
          onChange({
            ...filters,
            categorySlug: e.target.value === "all" ? null : e.target.value,
          })
        }
      >
        <option value="all">All categories</option>
        {categories.map((category) => (
          <option key={category.slug} value={category.slug}>
            {category.name}
          </option>
        ))}
      </select>
    </div>
  );
}
