<template>
  <section class="page" data-module="defect">
    <header class="page-head">
      <div>
        <h2>缺陷记录管理</h2>
        <p class="page-desc">维护缺陷记录，围绕缺陷编号、所属管线、缺陷类型、发现位置做登记、筛选与状态流转。</p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="openCreate">登记缺陷记录</button>
        <button class="btn" type="button" @click="exportRows">导出缺陷记录清单</button>
      </div>
    </header>

    <div class="stat-row">
      <article v-for="item in statCards" :key="item.label" class="stat-card">
        <span class="stat-label">{{ item.label }}</span>
        <strong class="stat-value">{{ item.value }}</strong>
      </article>
    </div>

    <p class="status-legend">
      <span v-for="item in statusSummary" :key="item.status" class="legend-item">
        {{ item.status }}：{{ item.count }}
      </span>
    </p>

    <form class="filter-bar" @submit.prevent="reload">
      <label v-for="field in filterFields" :key="field" class="filter-item">
        <span>{{ field }}</span>
        <input v-model="filters[field]" :placeholder="`按${field}检索`" />
      </label>
      <button class="btn" type="submit">查询</button>
      <button class="btn ghost" type="button" @click="resetFilters">重置条件</button>
    </form>

    <table class="data-table">
      <thead>
        <tr>
          <th v-for="column in columns" :key="column">{{ column }}</th>
          <th>当前状态</th>
          <th>可执行动作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="String(row.id)">
          <td v-for="column in columns" :key="column">
            <span v-if="column === SEVERITY_FIELD" :class="{ 'severity-serious': isSerious(row) }">
              {{ severityText(row) }}
            </span>
            <template v-else>{{ row[column] ?? '—' }}</template>
          </td>
          <td>{{ row.status }}</td>
          <td class="row-actions">
            <button class="link" type="button" @click="openDetail(row)">查看详情</button>
            <button
              v-for="action in actions"
              :key="action"
              class="link"
              type="button"
              @click="runAction(action, row)"
            >
              {{ action }}
            </button>
          </td>
        </tr>
        <tr v-if="!rows.length">
          <td :colspan="columns.length + 2" class="empty-state">暂无缺陷记录数据，可先登记缺陷记录</td>
        </tr>
      </tbody>
    </table>

    <footer class="page-foot">
      <span>共 {{ total }} 条缺陷记录记录</span>
      <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
    </footer>

    <div v-if="detailRow" class="modal-mask" @click.self="closeDetail">
      <div class="modal-panel">
        <header class="modal-head">
          <h3>缺陷详情 · {{ detailRow['缺陷编号'] }}</h3>
          <button class="link" type="button" @click="closeDetail">关闭</button>
        </header>
        <dl class="detail-grid">
          <template v-for="field in detailFields" :key="field">
            <dt>{{ field }}</dt>
            <dd v-if="field === SEVERITY_FIELD" :class="{ 'severity-serious': isSerious(detailRow) }">
              {{ severityText(detailRow) }}
            </dd>
            <dd v-else>{{ detailRow[field] ?? '—' }}</dd>
          </template>
          <dt>当前状态</dt>
          <dd>{{ detailRow.status }}</dd>
        </dl>
        <footer class="modal-foot">
          <span v-if="detailMessage" :class="detailOk ? 'success-text' : 'error-text'">{{ detailMessage }}</span>
          <div class="row-actions">
            <button
              v-for="action in actions"
              :key="action"
              class="btn"
              type="button"
              @click="runAction(action, detailRow)"
            >
              {{ action }}
            </button>
          </div>
        </footer>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import {
  downloadEntries,
  listEntries,
  moduleMeta,
  runAction as applyAction,
} from '@/api/local-service'
import {
  isSeriousDefect,
  resolveSeverity,
  SEVERITY_FIELD,
} from '@/data/defect-domain'
import type { ActionResult, EntryRow } from '@/data/types'

const meta = moduleMeta('defect')
const columns = ["缺陷编号", "所属管线", "缺陷类型", "发现位置", "严重等级", "发现日期", "缺陷描述", "记录状态"]
// 详情与列表共用同一组字段，严重等级同样走统一判定，不另写一遍。
const detailFields = columns
const actions = ["确认缺陷", "标记修复", "忽略缺陷"]
const statuses = ["待确认", "已确认", "已修复", "已忽略"]

const rows = ref<EntryRow[]>([])
const total = ref(0)
const errorMessage = ref('')
const filters = ref<Record<string, string>>({})
const filterFields = columns.slice(0, 3)

// 列表、详情、确认动作展示严重等级都走 resolveSeverity 这一份判定：
// 旧记录已有等级时原样展示；缺失时按缺陷类型补判定；判不出来就留空。
function severityText(row: EntryRow): string {
  return resolveSeverity(row) || '—'
}
function isSerious(row: EntryRow): boolean {
  return isSeriousDefect(row)
}

// 统计与修复进度都按状态和统一等级判定实时计算，口径与运营工作台一致。
const statCards = computed(() => [
  { label: '待确认缺陷', value: rows.value.filter((row) => String(row.status) === '待确认').length },
  { label: '已修复缺陷', value: rows.value.filter((row) => String(row.status) === '已修复').length },
  { label: '严重缺陷', value: rows.value.filter((row) => isSeriousDefect(row)).length },
])

const statusSummary = computed(() =>
  statuses.map((status: string) => ({
    status,
    count: rows.value.filter((row) => String(row.status) === status).length,
  })),
)

// 详情弹窗：列表入口和详情入口共用同一组动作与判定。
const detailRow = ref<EntryRow | null>(null)
const detailMessage = ref('')
const detailOk = ref(true)

function openDetail(row: EntryRow) {
  detailMessage.value = ''
  detailOk.value = true
  detailRow.value = row
}

function closeDetail() {
  detailRow.value = null
  detailMessage.value = ''
}

function resetFilters() {
  filters.value = {}
  reload()
}

function exportRows() {
  downloadEntries(meta.key)
}

function openCreate() {
  errorMessage.value = '缺陷记录登记入口尚未接入审批流'
}

// 动作结果统一处理：
// - 成功且重复操作（未重复写入）只提示，无需刷新；
// - 成功且有落库才刷新列表/详情；
// - 失败要说明原因，记录保留原状态，页面上的行与详情都不改。
function handleResult(result: ActionResult, row: EntryRow) {
  if (!result.ok) {
    errorMessage.value = result.message
    detailMessage.value = result.message
    detailOk.value = false
    return
  }
  errorMessage.value = ''
  if (detailRow.value && Number(detailRow.value.id) === Number(row.id)) {
    detailMessage.value = result.message
    detailOk.value = true
  }
  reload()
  if (detailRow.value && Number(detailRow.value.id) === Number(row.id)) {
    const fresh = rows.value.find((item) => Number(item.id) === Number(row.id))
    detailRow.value = fresh ?? null
  }
}

function runAction(action: string, row: EntryRow) {
  errorMessage.value = ''
  detailMessage.value = ''
  const result = applyAction(meta.key, Number(row.id), action)
  handleResult(result, row)
}

function reload() {
  errorMessage.value = ''
  try {
    const payload = listEntries(meta.key, filters.value)
    rows.value = payload.items
    total.value = payload.total
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '缺陷记录列表读取失败'
  }
}

onMounted(reload)
</script>
