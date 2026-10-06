import type { EntryRow } from './types'

// 缺陷记录的唯一判定口径：列表、详情、确认/修复/忽略都从这里取结果，
// 不再各自按缺陷类型重算，避免同一条记录在不同入口显示不同的严重等级。

export const DEFECT_MODULE_KEY = 'defect'
export const SEVERITY_FIELD = '严重等级'

/**
 * 取一条缺陷记录的严重等级。
 * 只认记录里已登记的等级并原样返回；旧数据缺等级时保留原值（空），
 * 不按缺陷类型重算、也不把判定结果写回记录，已有记录的展示保持不变。
 */
export function resolveDefectSeverity(row: EntryRow): string {
  return String(row[SEVERITY_FIELD] ?? '').trim()
}

/** 严重缺陷口径：等级恰为「严重」的记录，列表统计卡与详情共用。 */
export function isSevereDefect(row: EntryRow): boolean {
  return resolveDefectSeverity(row) === '严重'
}

// 缺陷记录的终态：走到这两个状态就不算待处理，也不能再被动作改回待处理。
export const DEFECT_TERMINAL_STATUSES = ['已修复', '已忽略']

export function isDefectTerminal(status: string): boolean {
  return DEFECT_TERMINAL_STATUSES.includes(status)
}

/** 待处理判定：运营概览与缺陷列表共用，终态记录永远不算待处理。 */
export function isDefectPending(row: EntryRow): boolean {
  return !isDefectTerminal(String(row.status))
}

// 每个动作允许发起的当前状态；不在列出的状态里就拒绝并说明原因，原状态保持不变。
export const DEFECT_ACTION_SOURCES: Record<string, string[]> = {
  确认缺陷: ['待确认'],
  标记修复: ['待确认', '已确认'],
  忽略缺陷: ['待确认', '已确认'],
}
