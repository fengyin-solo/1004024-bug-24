import type { EntryRow } from './types'

// 缺陷领域的唯一判定来源：缺陷列表、缺陷详情、确认/修复/忽略动作都走这里，
// 不再允许各入口各写一遍等级判定。

export const DEFECT_KEY = 'defect'
export const SEVERITY_FIELD = '严重等级'
export const TYPE_FIELD = '缺陷类型'

// 严重等级只有这三档，判定结果与页面展示共用同一组常量。
export const SEVERITY_SERIOUS = '严重'
export const SEVERITY_MEDIUM = '中等'
export const SEVERITY_MINOR = '轻微'
export const SEVERITY_LEVELS = [SEVERITY_SERIOUS, SEVERITY_MEDIUM, SEVERITY_MINOR]

// 缺陷类型 -> 严重等级的唯一判定表（参考 CJJ 181 排水管道缺陷分类）。
// 新增缺陷类型时只需要在这里登记，页面和动作无需改动。
export const DEFECT_TYPE_SEVERITY: Record<string, string> = {
  破裂: SEVERITY_SERIOUS,
  变形: SEVERITY_SERIOUS,
  错口: SEVERITY_SERIOUS,
  脱节: SEVERITY_SERIOUS,
  起伏: SEVERITY_SERIOUS,
  渗漏: SEVERITY_MEDIUM,
  腐蚀: SEVERITY_MEDIUM,
  接口材料脱落: SEVERITY_MEDIUM,
  支管暗接: SEVERITY_MEDIUM,
  异物穿入: SEVERITY_MEDIUM,
  沉积: SEVERITY_MINOR,
  结垢: SEVERITY_MINOR,
  树根: SEVERITY_MINOR,
  浮渣: SEVERITY_MINOR,
  障碍: SEVERITY_MINOR,
  残墙坝根: SEVERITY_MINOR,
}

export const DEFECT_STATUS_PENDING = '待确认'
export const DEFECT_STATUS_CONFIRMED = '已确认'
export const DEFECT_STATUS_REPAIRED = '已修复'
export const DEFECT_STATUS_IGNORED = '已忽略'

// 已修复与已忽略都是终态：终态记录不能再被确认/修复/忽略动作改回去。
export const DEFECT_TERMINAL_STATUSES = [DEFECT_STATUS_REPAIRED, DEFECT_STATUS_IGNORED]

function normalize(value: unknown): string {
  return String(value ?? '').trim()
}

// 只依据缺陷类型推导等级；类型不在登记表里就返回空，由调用方保留原值。
export function severityFromType(type: unknown): string {
  return DEFECT_TYPE_SEVERITY[normalize(type)] ?? ''
}

// 统一的严重等级判定：
// 1. 记录里已经有等级（含历史数据的原始值）一律原样返回，不重算；
// 2. 等级缺失时按缺陷类型补判定；
// 3. 类型也判不出来就返回空字符串（旧数据缺等级时保留原值，不凭空生成）。
export function resolveSeverity(row: Partial<EntryRow>): string {
  const stored = normalize(row[SEVERITY_FIELD])
  if (stored) {
    return stored
  }
  return severityFromType(row[TYPE_FIELD])
}

// 「严重缺陷」统计也只认这一个判定结果，避免看板与列表口径不一。
export function isSeriousDefect(row: Partial<EntryRow>): boolean {
  return resolveSeverity(row) === SEVERITY_SERIOUS
}

// 是否仍待处理：由状态判定，不依赖可能过期的 pending 标记，
// 已修复的历史记录永远不会再被算成待处理。
export function isDefectPending(row: Partial<EntryRow>): boolean {
  return !DEFECT_TERMINAL_STATUSES.includes(normalize(row.status))
}

export type DefectActionPlan = {
  ok: boolean
  // written=false 表示这是一次幂等的重复操作，不落库，记录保持原样。
  written: boolean
  message: string
  changes?: Partial<EntryRow>
}

// 确认 / 修复 / 忽略共用的动作判定（纯函数，不碰存储）：
// - 与目标状态相同：幂等返回，只提示、不重复写；
// - 当前已是终态（已修复/已忽略）：拒绝并说明原因，保留原状态；
// - 其余情况：给出统一的落库变更，等级在缺失时按同一判定补一次。
export function planDefectAction(row: EntryRow, action: string, target: string): DefectActionPlan {
  const current = normalize(row.status)

  if (current === target) {
    return {
      ok: true,
      written: false,
      message: `缺陷记录当前已是「${target}」，无需重复操作，本次未重复写入`,
    }
  }

  if (DEFECT_TERMINAL_STATUSES.includes(current)) {
    return {
      ok: false,
      written: false,
      message: `缺陷记录已处于终态「${current}」，不能再执行「${action}」，原状态保持不变`,
    }
  }

  const changes: Partial<EntryRow> = {
    status: target,
    pending: isDefectPending({ status: target }),
    abnormal: action.startsWith('忽略'),
  }

  // 只有旧记录本身缺等级时才补判定；已有等级（哪怕是历史原始值）绝不覆盖。
  if (!normalize(row[SEVERITY_FIELD])) {
    const derived = severityFromType(row[TYPE_FIELD])
    if (derived) {
      changes[SEVERITY_FIELD] = derived
    }
  }

  return {
    ok: true,
    written: true,
    changes,
    message: `缺陷记录已${action}，当前状态「${target}」`,
  }
}
