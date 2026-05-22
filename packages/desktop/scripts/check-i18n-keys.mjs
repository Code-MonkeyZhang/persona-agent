/**
 * i18n 翻译文件 key 对齐校验脚本
 * 检查 zh-CN.json 和 en.json 的 key 是否完全一致，防止翻译遗漏
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const localesDir = join(__dirname, '..', 'src', 'renderer', 'i18n', 'locales')

const zhCN = JSON.parse(readFileSync(join(localesDir, 'zh-CN.json'), 'utf-8'))
const en = JSON.parse(readFileSync(join(localesDir, 'en.json'), 'utf-8'))

const zhKeys = new Set(Object.keys(zhCN))
const enKeys = new Set(Object.keys(en))

const onlyInZh = [...zhKeys].filter((k) => !enKeys.has(k))
const onlyInEn = [...enKeys].filter((k) => !zhKeys.has(k))

if (onlyInZh.length === 0 && onlyInEn.length === 0) {
  console.log(`✓ i18n keys aligned (${zhKeys.size} keys)`)
  process.exit(0)
}

if (onlyInZh.length > 0) {
  console.error('Only in zh-CN.json:')
  onlyInZh.forEach((k) => console.error(`  - ${k}`))
}
if (onlyInEn.length > 0) {
  console.error('Only in en.json:')
  onlyInEn.forEach((k) => console.error(`  - ${k}`))
}
process.exit(1)
