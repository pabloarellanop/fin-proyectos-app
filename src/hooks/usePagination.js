import { useMemo } from "react";

export function usePagination(items, page, pageSize = 10) {
  return useMemo(() => {
    const total = items.length;
    const totalPages = total === 0 ? 1 : Math.ceil(total / pageSize);
    const currentPage = Math.min(Math.max(page, 1), totalPages);
    const startIndex = total === 0 ? 0 : (currentPage - 1) * pageSize;
    const endIndex = total === 0 ? 0 : Math.min(startIndex + pageSize, total);
    const pageItems = total === 0 ? [] : items.slice(startIndex, endIndex);
    return { pageItems, total, totalPages, currentPage, startIndex, endIndex, pageSize };
  }, [items, page, pageSize]);
}
